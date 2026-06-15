// Host-protocol acceptance matrix (issue #21).
//
// WHY THIS FILE EXISTS — green unit tests proved nothing for RTK: its
// `detect_format()` rejects `run_in_terminal`/`powershell`, yet its hook tests
// reported "76 passed". Those tests asserted on the formatter in isolation, never
// on the REAL host wire shapes. This suite is keyed to the exact bytes/objects a
// host sends and drives them through tk's REAL entry points end-to-end at the
// protocol layer:
//
//     raw stdin string ──normalizeStdin──▶ ToolEvent ──decide──▶ Decision
//                                                       │
//                                          toHostOutput ▼ ──▶ host-conformant JSON
//
// plus `decideFromStdin` and `runHookCopilot` for the fail-open contract. We do
// NOT call into the formatter with a hand-built ToolEvent (that is what
// copilot.test.ts does for unit coverage); we start from the wire string so the
// dialect detection, BOM stripping, and JSON parsing are all under test too.
//
// THE "DID IT ACTUALLY EXECUTE?" PROXY — the issue asks that we assert the
// rewritten command actually executes, not merely that the hook succeeded. True
// end-to-end execution is a live-host concern (the host applies the JSON and runs
// the tool) and is OUT OF UNIT SCOPE. The faithful unit-layer proxy is: the
// emitted JSON must place the rewritten command in the exact field the host
// APPLIES (`hookSpecificOutput.updatedInput.command` for VS Code,
// `modifiedArgs.command` for Copilot CLI) AND preserve every other field the host
// sent, because both `updatedInput` and `modifiedArgs` REPLACE the tool input
// wholesale and VS Code validates it against run_in_terminal's schema — an
// incomplete `updatedInput` is silently DROPPED (issue #19, the bug this suite
// locks). So full-field preservation == the rewrite is actually applied.
//
// Determinism note: rows 1–5 use `git status` (or a `git` subcommand). The rewrite
// engine's presence-gate defaults to the real PATH; `git` is universally present
// (and present on this box / CI), so these rewrites are deterministic without
// injecting a fake presence check — matching the approach in copilot.test.ts.

import { Readable } from "node:stream";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  COPILOT_REWRITE_REASON,
  decide,
  decideFromStdin,
  runHookCopilot,
  toHostOutput,
} from "../../../src/hook/copilot.js";
import { normalizeStdin } from "../../../src/hook/normalize.js";

// ---------------------------------------------------------------------------
// Wire-payload builders — produce the RAW JSON STRING a host writes to the
// hook's stdin, exactly as that host shapes it. No tk-internal types involved.
// ---------------------------------------------------------------------------

// VS Code Copilot Chat dialect: snake_case `tool_name` / object `tool_input`,
// `hook_event_name: "PreToolUse"`.
function vscodeWire(toolName: string, toolInput: Record<string, unknown>): string {
  return JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
  });
}

// Copilot CLI dialect: camelCase `toolName` / `toolArgs`, `eventName:
// "preToolUse"`. `toolArgs` may be a JSON STRING (the common CLI form) or an
// object — both are real shapes the normalizer must accept.
function cliWire(toolName: string, toolArgs: Record<string, unknown> | string): string {
  return JSON.stringify({
    eventName: "preToolUse",
    toolName,
    toolArgs,
  });
}

// Drive a raw wire string through the TRUE protocol path and return the emitted
// host JSON (or null when nothing is emitted).
function pipe(raw: string): Record<string, unknown> | null {
  const ev = normalizeStdin(raw);
  return toHostOutput(ev, decide(ev));
}

// ---------------------------------------------------------------------------
// Row 1 — VS Code / run_in_terminal / object tool_input with realistic fields.
// Locks #19: updatedInput must preserve ALL fields; command → `tk <cmd>`.
// ---------------------------------------------------------------------------

describe("Row 1 — VS Code run_in_terminal: updatedInput preserves all fields (#19)", () => {
  test("object tool_input with command/explanation/goal/mode → full updatedInput", () => {
    const raw = vscodeWire("run_in_terminal", {
      command: "git status",
      explanation: "Check the working tree",
      goal: "Inspect repository state",
      mode: "sync",
    });

    // Sanity: this raw string really is the VS Code dialect with the command parsed.
    const ev = normalizeStdin(raw);
    expect(ev.dialect).toBe("vscode");
    expect(ev.event).toBe("preToolUse");
    expect(ev.toolName).toBe("run_in_terminal");
    expect(ev.command).toBe("git status");

    const out = pipe(raw);
    // The host reads hookSpecificOutput.{permissionDecision, …, updatedInput}.
    // updatedInput is applied wholesale, so it must carry EVERY original field with
    // only `command` rewritten — an incomplete updatedInput is silently dropped (#19).
    expect(out).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: COPILOT_REWRITE_REASON,
        updatedInput: {
          command: "tk git status",
          explanation: "Check the working tree",
          goal: "Inspect repository state",
          mode: "sync",
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Row 2 — Copilot CLI (Windows) / powershell / string toolArgs (JSON string).
// Flat modifiedArgs preserves all fields; command → `tk <cmd>`.
// ---------------------------------------------------------------------------

describe("Row 2 — Copilot CLI powershell, string toolArgs: full modifiedArgs", () => {
  test("JSON-string toolArgs with extra fields → flat modifiedArgs preserves all", () => {
    const raw = cliWire(
      "powershell",
      JSON.stringify({
        command: "git status",
        description: "check repo status",
        initial_wait: 30,
        mode: "sync",
      }),
    );

    const ev = normalizeStdin(raw);
    expect(ev.dialect).toBe("cli");
    expect(ev.toolName).toBe("powershell");
    expect(ev.category).toBe("execute_adjacent");
    expect(ev.command).toBe("git status");

    const out = pipe(raw);
    // Copilot CLI reads a FLAT shape (no hookSpecificOutput wrapper). modifiedArgs
    // replaces the tool args wholesale → every host field preserved, command rewritten.
    expect(out).toEqual({
      permissionDecision: "allow",
      permissionDecisionReason: COPILOT_REWRITE_REASON,
      modifiedArgs: {
        command: "tk git status",
        description: "check repo status",
        initial_wait: 30,
        mode: "sync",
      },
    });
    expect(out && "hookSpecificOutput" in out).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 3 — Copilot CLI (Windows) / powershell / OBJECT toolArgs.
// Flat modifiedArgs, full preservation (toolArgs may arrive as an object too).
// ---------------------------------------------------------------------------

describe("Row 3 — Copilot CLI powershell, object toolArgs: full modifiedArgs", () => {
  test("object toolArgs with extra fields → flat modifiedArgs preserves all", () => {
    const raw = cliWire("powershell", {
      command: "git status",
      description: "check repo status",
      initial_wait: 30,
      mode: "sync",
    });

    const ev = normalizeStdin(raw);
    expect(ev.dialect).toBe("cli");
    expect(ev.command).toBe("git status");

    const out = pipe(raw);
    expect(out).toEqual({
      permissionDecision: "allow",
      permissionDecisionReason: COPILOT_REWRITE_REASON,
      modifiedArgs: {
        command: "tk git status",
        description: "check repo status",
        initial_wait: 30,
        mode: "sync",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Row 4 — Copilot CLI (Unix) / bash / BOTH string and object toolArgs.
// Flat modifiedArgs, full preservation, regardless of the toolArgs encoding.
// ---------------------------------------------------------------------------

describe("Row 4 — Copilot CLI bash (Unix): string AND object toolArgs are equivalent", () => {
  const expected = {
    permissionDecision: "allow",
    permissionDecisionReason: COPILOT_REWRITE_REASON,
    modifiedArgs: {
      command: "tk git status",
      description: "inspect tree",
      mode: "sync",
    },
  };

  test("string toolArgs → full modifiedArgs", () => {
    const raw = cliWire(
      "bash",
      JSON.stringify({ command: "git status", description: "inspect tree", mode: "sync" }),
    );
    expect(normalizeStdin(raw).command).toBe("git status");
    expect(pipe(raw)).toEqual(expected);
  });

  test("object toolArgs → full modifiedArgs", () => {
    const raw = cliWire("bash", {
      command: "git status",
      description: "inspect tree",
      mode: "sync",
    });
    expect(normalizeStdin(raw).command).toBe("git status");
    expect(pipe(raw)).toEqual(expected);
  });

  test("string and object encodings emit byte-identical wire output", () => {
    const strRaw = cliWire(
      "bash",
      JSON.stringify({ command: "git status", description: "inspect tree", mode: "sync" }),
    );
    const objRaw = cliWire("bash", {
      command: "git status",
      description: "inspect tree",
      mode: "sync",
    });
    expect(JSON.stringify(pipe(strRaw))).toBe(JSON.stringify(pipe(objRaw)));
  });
});

// ---------------------------------------------------------------------------
// Row 5 — Both dialects / 1 and 2 leading UTF-8 BOMs on a VALID rewrite payload.
// The BOM must be stripped → a NORMAL rewrite decision (not fail-open-to-nothing).
// Windows hosts prepend 1–2 U+FEFF to hook stdin; JSON.parse rejects a leading
// BOM, so an unstripped BOM would make the rewrite silently never fire.
// ---------------------------------------------------------------------------

describe("Row 5 — leading UTF-8 BOM is stripped → normal rewrite (not fail-open)", () => {
  const BOM = "﻿";

  const cases: Array<[string, string, Record<string, unknown> | null]> = [
    [
      "VS Code run_in_terminal",
      vscodeWire("run_in_terminal", { command: "git status", explanation: "x", mode: "sync" }),
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: COPILOT_REWRITE_REASON,
          updatedInput: { command: "tk git status", explanation: "x", mode: "sync" },
        },
      },
    ],
    [
      "Copilot CLI powershell",
      cliWire("powershell", JSON.stringify({ command: "git status", mode: "sync" })),
      {
        permissionDecision: "allow",
        permissionDecisionReason: COPILOT_REWRITE_REASON,
        modifiedArgs: { command: "tk git status", mode: "sync" },
      },
    ],
  ];

  for (const [label, raw, expectedWire] of cases) {
    test(`${label}: no-BOM, 1 BOM, 2 BOMs all produce the SAME event + rewrite`, () => {
      const base = normalizeStdin(raw);
      const one = normalizeStdin(BOM + raw);
      const two = normalizeStdin(BOM + BOM + raw);

      // The BOM(s) must vanish before parse: the event is recognized (NOT "unknown"),
      // the dialect/tool/command match the no-BOM payload exactly.
      for (const ev of [base, one, two]) {
        expect(ev.event).toBe("preToolUse");
        expect(ev.event).not.toBe("unknown");
        expect(ev.dialect).toBe(base.dialect);
        expect(ev.toolName).toBe(base.toolName);
        expect(ev.command).toBe("git status");
      }

      // And the rewrite still fires identically through the full pipeline.
      expect(toHostOutput(one, decide(one))).toEqual(expectedWire);
      expect(toHostOutput(two, decide(two))).toEqual(expectedWire);
      // The BOM'd output is byte-identical to the no-BOM output.
      expect(JSON.stringify(pipe(BOM + raw))).toBe(JSON.stringify(pipe(raw)));
    });
  }
});

// ---------------------------------------------------------------------------
// Row 6 — malformed / empty / truncated payload → FAIL-OPEN.
// decideFromStdin → allow (never throws); toHostOutput → null (nothing emitted);
// runHookCopilot resolves to exit code 0 (the host then runs the tool unchanged).
// Copilot CLI's preToolUse is fail-CLOSED on a crashing hook, so runHookCopilot
// must never throw and must exit 0.
// ---------------------------------------------------------------------------

describe("Row 6 — malformed / empty / truncated stdin: fail-open (exit 0, emit nothing)", () => {
  const malformed: Array<[string, string]> = [
    ["empty string", ""],
    ["whitespace only", "   \n  "],
    ["not JSON", "{ not json"],
    ["truncated object", '{"eventName":"preToolUse","toolName":"bash","toolArgs":"{co'],
    ["bare garbage", "garbage"],
    ["array, not object", "[1,2,3]"],
    ["JSON null", "null"],
  ];

  test("decideFromStdin returns the ALLOW decision and never throws", () => {
    for (const [label, raw] of malformed) {
      let decision;
      expect(() => {
        decision = decideFromStdin(raw);
      }, label).not.toThrow();
      expect(decision, label).toEqual({ decision: "allow" });
    }
  });

  test("toHostOutput on a fail-open event → null (nothing emitted)", () => {
    for (const [label, raw] of malformed) {
      const ev = normalizeStdin(raw);
      expect(ev.event, label).toBe("unknown");
      expect(toHostOutput(ev, decideFromStdin(raw)), label).toBeNull();
    }
  });

  // runHookCopilot reads process.stdin directly, so we substitute a Readable that
  // emits the malformed bytes then ends, and restore the real stdin afterward. The
  // contract: it RESOLVES to 0 (never throws/rejects) and writes NOTHING to stdout.
  describe("runHookCopilot() resolves to exit 0 on malformed stdin (never throws)", () => {
    const realStdin = process.stdin;

    afterEach(() => {
      Object.defineProperty(process, "stdin", {
        value: realStdin,
        configurable: true,
      });
      vi.restoreAllMocks();
    });

    function mockStdin(bytes: string): void {
      const stream = Readable.from([Buffer.from(bytes, "utf8")]) as NodeJS.ReadStream;
      // The runtime checks `stream.isTTY` to skip reading a terminal; a piped hook
      // payload is not a TTY.
      (stream as unknown as { isTTY: boolean }).isTTY = false;
      Object.defineProperty(process, "stdin", {
        value: stream,
        configurable: true,
      });
    }

    for (const [label, raw] of malformed) {
      test(label, async () => {
        // Silence the fail-open stderr breadcrumb (recordHookError surfaceStderr) so
        // the suite output stays clean and the test stays non-flaky.
        const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
        const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        mockStdin(raw);

        const code = await runHookCopilot();

        expect(code, label).toBe(0);
        // Fail-open emits NOTHING on stdout (the host then runs the tool unchanged).
        expect(stdout, label).not.toHaveBeenCalled();
        stderr.mockRestore();
        stdout.mockRestore();
      });
    }
  });

  // A VALID rewrite payload, driven through the SAME process.stdin path, must
  // still exit 0 AND write the rewritten host JSON to stdout — proving the exit-0
  // contract is not achieved by silently dropping every rewrite.
  test("runHookCopilot() on a VALID rewrite payload: exit 0 + emits the rewrite", async () => {
    const realStdin = process.stdin;
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const writes: string[] = [];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
      });
    try {
      const raw = cliWire("bash", JSON.stringify({ command: "git status", mode: "sync" }));
      const stream = Readable.from([Buffer.from(raw, "utf8")]) as NodeJS.ReadStream;
      (stream as unknown as { isTTY: boolean }).isTTY = false;
      Object.defineProperty(process, "stdin", { value: stream, configurable: true });

      const code = await runHookCopilot();

      expect(code).toBe(0);
      expect(writes.length).toBe(1);
      expect(JSON.parse(writes[0])).toEqual({
        permissionDecision: "allow",
        permissionDecisionReason: COPILOT_REWRITE_REASON,
        modifiedArgs: { command: "tk git status", mode: "sync" },
      });
    } finally {
      Object.defineProperty(process, "stdin", { value: realStdin, configurable: true });
      stderr.mockRestore();
      stdout.mockRestore();
    }
  });
});
