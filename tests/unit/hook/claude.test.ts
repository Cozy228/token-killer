import { PassThrough } from "node:stream";

import { describe, expect, test } from "vitest";

import { decide, decideFromStdin, CLAUDE_REWRITE_REASON } from "../../../src/hook/claude.js";

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
