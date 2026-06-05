import { describe, expect, test } from "vitest";

import { shouldCompress } from "../../../src/shim/gate.js";
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
