import { afterEach, describe, expect, test } from "vitest";

import { gateDecision, shouldCompress } from "../../../src/shim/gate.js";
import type { ParsedCommand } from "../../../src/types.js";

function cmd(parts: string[]): ParsedCommand {
  return {
    program: parts[0] ?? "",
    args: parts.slice(1),
    original: parts,
    displayCommand: parts.join(" "),
  };
}

describe("shouldCompress gate", () => {
  test("specific match + non-TTY → compress", () => {
    expect(shouldCompress(cmd(["git", "status"]), false)).toBe(true);
  });

  test("specific match + TTY (human watching) → passthrough", () => {
    expect(shouldCompress(cmd(["git", "status"]), true)).toBe(false);
  });

  test("generic command (no specific handler) → passthrough even when non-TTY", () => {
    expect(shouldCompress(cmd(["some-unknown-tool", "--flag"]), false)).toBe(false);
  });

  test("interactive command → passthrough regardless of TTY", () => {
    expect(shouldCompress(cmd(["git", "commit"]), false)).toBe(false);
    expect(shouldCompress(cmd(["git", "commit"]), true)).toBe(false);
  });
});

// R1: TK_COMPRESS_TTY opts a terminal in to compressing even under a TTY (VS Code
// Copilot's agent runs in a ConPTY where isTTY=true). The !isInteractive guard
// stays UNCONDITIONAL — the flag must never force a pager/interactive command to
// compress.
describe("shouldCompress gate — TK_COMPRESS_TTY opt-in (R1)", () => {
  afterEach(() => {
    delete process.env.TK_COMPRESS_TTY;
  });

  test("isTTY + TK_COMPRESS_TTY set → compress", () => {
    process.env.TK_COMPRESS_TTY = "1";
    expect(shouldCompress(cmd(["git", "status"]), true)).toBe(true);
  });

  test("isTTY + flag unset → passthrough (unchanged)", () => {
    delete process.env.TK_COMPRESS_TTY;
    expect(shouldCompress(cmd(["git", "status"]), true)).toBe(false);
  });

  test("interactive command + flag set → still passthrough (unconditional guard)", () => {
    process.env.TK_COMPRESS_TTY = "1";
    expect(shouldCompress(cmd(["git", "commit"]), true)).toBe(false);
  });

  test("non-TTY is unchanged regardless of the flag", () => {
    process.env.TK_COMPRESS_TTY = "1";
    expect(shouldCompress(cmd(["git", "status"]), false)).toBe(true);
  });
});

describe("gateDecision — reason codes (D1 trace)", () => {
  afterEach(() => {
    delete process.env.TK_COMPRESS_TTY;
  });

  test("no specific handler → reason no-handler", () => {
    expect(gateDecision(cmd(["some-unknown-tool"]), false)).toEqual({
      willCompress: false,
      reason: "no-handler",
    });
  });

  test("interactive command → reason interactive", () => {
    expect(gateDecision(cmd(["git", "commit"]), false).reason).toBe("interactive");
  });

  test("TTY without the flag → reason tty-no-flag", () => {
    expect(gateDecision(cmd(["git", "status"]), true)).toEqual({
      willCompress: false,
      reason: "tty-no-flag",
    });
  });

  test("eligible → reason compress", () => {
    expect(gateDecision(cmd(["git", "status"]), false)).toEqual({
      willCompress: true,
      reason: "compress",
    });
  });

  test("TTY with the flag → reason compress", () => {
    process.env.TK_COMPRESS_TTY = "1";
    expect(gateDecision(cmd(["git", "status"]), true)).toEqual({
      willCompress: true,
      reason: "compress",
    });
  });
});
