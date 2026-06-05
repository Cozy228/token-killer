import { describe, expect, test } from "vitest";

import { decide, decideFromStdin, toProtocol } from "../../../src/hook/copilot.js";
import { normalize } from "../../../src/hook/normalize.js";

function pre(payload: Record<string, unknown>) {
  return decide(normalize({ event: "preToolUse", ...payload }));
}

describe("decide — preToolUse terminal rewrite", () => {
  test("CLI bash git status → rewrite tk git status", () => {
    const d = pre({ toolName: "bash", toolArgs: JSON.stringify({ command: "git status" }) });
    expect(d.decision).toBe("rewrite");
    expect(d.rewritten_command).toBe("tk git status");
  });

  test("VS Code run_in_terminal npm test → rewrite", () => {
    const d = pre({ tool_name: "run_in_terminal", tool_input: { command: "npm test" } });
    expect(d.decision).toBe("rewrite");
    expect(d.rewritten_command).toBe("tk npm test");
  });

  test("already-tk command → allow (pass)", () => {
    const d = pre({ toolName: "bash", toolArgs: JSON.stringify({ command: "tk git status" }) });
    expect(d.decision).toBe("allow");
  });

  test("mutating git commit → allow (never rewritten)", () => {
    const d = pre({ toolName: "bash", toolArgs: JSON.stringify({ command: "git commit -m x" }) });
    expect(d.decision).toBe("allow");
  });
});

describe("decide — preToolUse direct-tool governance", () => {
  test("read node_modules → deny", () => {
    const d = pre({ tool_name: "read_file", tool_input: { filePath: "node_modules/x/i.js" } });
    expect(d.decision).toBe("deny");
    expect(d.reason).toBeTruthy();
  });

  test("repo-wide grep → suggest", () => {
    const d = pre({ tool_name: "grep_search", tool_input: { query: "TODO" } });
    expect(d.decision).toBe("suggest");
  });

  test("source read → allow", () => {
    const d = pre({ tool_name: "read_file", tool_input: { filePath: "src/cli.ts" } });
    expect(d.decision).toBe("allow");
  });
});

describe("decide — non-preToolUse events allow (Slice 2 adds prompt/error)", () => {
  test("postToolUse → allow", () => {
    expect(decide(normalize({ event: "postToolUse", toolName: "bash", toolResult: "x" })).decision).toBe("allow");
  });
  test("userPromptSubmitted → allow", () => {
    expect(decide(normalize({ event: "userPromptSubmitted", prompt: "hi" })).decision).toBe("allow");
  });
});

describe("toProtocol — internal ledger fields never reach the host wire JSON", () => {
  test("strips governance_kind and estimated_tokens from a deny decision", () => {
    const d = decide(
      normalize({ event: "preToolUse", tool_name: "read_file", tool_input: { filePath: "node_modules/x/i.js" } }),
    );
    expect(d.governance_kind).toBeDefined();
    const wire = toProtocol(d);
    expect("governance_kind" in wire).toBe(false);
    expect("estimated_tokens" in wire).toBe(false);
    expect(wire.decision).toBe("deny");
    expect(typeof wire.reason).toBe("string");
  });

  test("rewrite decision: toProtocol includes rewritten_command, no extras", () => {
    const d = decide(normalize({ event: "preToolUse", toolName: "bash", toolArgs: JSON.stringify({ command: "git status" }) }));
    const wire = toProtocol(d);
    expect(wire.decision).toBe("rewrite");
    expect(typeof wire.rewritten_command).toBe("string");
    expect("governance_kind" in wire).toBe(false);
    expect("estimated_tokens" in wire).toBe(false);
  });
});

describe("decideFromStdin — fail-open (DESIGN §3.6)", () => {
  test("empty input → allow", () => {
    expect(decideFromStdin("")).toEqual({ decision: "allow" });
  });
  test("invalid JSON → allow", () => {
    expect(decideFromStdin("}{")).toEqual({ decision: "allow" });
  });
  test("unknown tool event → allow", () => {
    expect(decideFromStdin(JSON.stringify({ event: "preToolUse", tool_name: "mystery" }))).toEqual({
      decision: "allow",
    });
  });
});
