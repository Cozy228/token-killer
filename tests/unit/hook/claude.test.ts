import { existsSync, readFileSync } from "node:fs";
import { PassThrough } from "node:stream";

import { describe, expect, test } from "vitest";

import { decide, decideFromStdin, CLAUDE_REWRITE_REASON } from "../../../src/hook/claude.js";
import { errorLogPath } from "../../../src/hook/debug.js";

function readErrorLog(): string {
  const path = errorLogPath();
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// Ground-truth payload shape captured from Claude Code's PreToolUse (Bash).
function pre(command: string) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  };
}

describe("decide — Claude PreToolUse Bash rewrite", () => {
  test("rewritable command → exact hookSpecificOutput JSON", () => {
    const out = decide(pre("git status"));
    expect(out).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecisionReason: CLAUDE_REWRITE_REASON,
        updatedInput: { command: "tk git status" },
      },
    });
  });

  test("reason string is exactly 'tk auto-rewrite'", () => {
    expect(CLAUDE_REWRITE_REASON).toBe("tk auto-rewrite");
  });

  test("serialized output matches the acceptance-criteria byte string", () => {
    const out = decide(pre("git status"));
    expect(JSON.stringify(out)).toBe(
      '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecisionReason":"tk auto-rewrite","updatedInput":{"command":"tk git status"}}}',
    );
  });

  test("non-rewritable command (echo hi) → null (emit nothing)", () => {
    expect(decide(pre("echo hi"))).toBeNull();
  });

  test("already-tk command → null", () => {
    expect(decide(pre("tk git status"))).toBeNull();
  });

  test("mutating git commit → null (never rewritten)", () => {
    expect(decide(pre("git commit -m x"))).toBeNull();
  });

  test("non-Bash tool → null", () => {
    expect(decide({ tool_name: "Read", tool_input: { command: "git status" } })).toBeNull();
  });

  test("missing/empty command → null", () => {
    expect(decide({ tool_name: "Bash", tool_input: {} })).toBeNull();
    expect(decide({ tool_name: "Bash", tool_input: { command: "" } })).toBeNull();
  });

  test("non-object input → null", () => {
    expect(decide(null)).toBeNull();
    expect(decide("nope")).toBeNull();
  });
});

describe("decideFromStdin — fail-open (CONTEXT.md → Fail-open)", () => {
  test("empty input → null", () => {
    expect(decideFromStdin("")).toBeNull();
    expect(decideFromStdin("   ")).toBeNull();
  });

  test("malformed JSON → null (never throws)", () => {
    expect(decideFromStdin("}{")).toBeNull();
    expect(decideFromStdin("{ partial")).toBeNull();
  });

  // Regression: a malformed/TRUNCATED payload (the long-command-truncation case)
  // must NOT write to stderr — Claude Code surfaces a fail-open hook's stderr as a
  // spurious "hook error" even though exit is 0 and the command ran fine — BUT the
  // reason must still be reconstructable after the fact. So it lands UNCONDITIONALLY
  // in errors.log (not gated on TK_DEBUG, which can't be set retroactively).
  test("truncated payload: SILENT stderr, but errors.log gets the breadcrumb", () => {
    const original = process.stderr.write.bind(process.stderr);
    const written: string[] = [];
    process.stderr.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    const hadDebug = process.env.TK_DEBUG;
    delete process.env.TK_DEBUG; // prove it is NOT gated on TK_DEBUG
    const before = readErrorLog().length;
    try {
      // A long command whose JSON was cut off mid-string.
      expect(
        decideFromStdin(`{"tool_name":"Bash","tool_input":{"command":"rg ${"x".repeat(500)}`),
      ).toBeNull();
    } finally {
      process.stderr.write = original;
      if (hadDebug !== undefined) process.env.TK_DEBUG = hadDebug;
    }
    // Nothing on stderr (no spurious host "hook error")…
    expect(written.join("")).toBe("");
    // …but the durable breadcrumb is there, even with TK_DEBUG unset.
    const appended = readErrorLog().slice(before);
    expect(appended).toContain("tk hook-error: claude: stdin parse");
  });

  test("valid rewrite payload from a JSON string", () => {
    const raw = JSON.stringify(pre("git status"));
    expect(decideFromStdin(raw)?.hookSpecificOutput.updatedInput.command).toBe("tk git status");
  });
});

// The runtime entry binds readStreamWithTimeout (shared with copilot.ts); the
// stream-level fail-fast behavior is covered in copilot.test.ts. Here we only
// assert the protocol-shaping seam stays total — a malformed stream payload that
// arrives in full still fails open.
describe("readStreamWithTimeout integration — total decode", () => {
  test("a full malformed payload still yields null (no throw)", async () => {
    const { readStreamWithTimeout } = await import("../../../src/hook/copilot.js");
    const stream = new PassThrough();
    const read = readStreamWithTimeout(stream, 2000);
    stream.write("not json");
    stream.end();
    expect(decideFromStdin(await read)).toBeNull();
  });
});
