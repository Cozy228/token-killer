import { describe, expect, test } from "vitest";

import { isInteractive } from "../../../src/shim/interactive.js";
import type { ParsedCommand } from "../../../src/types.js";

function cmd(parts: string[]): ParsedCommand {
  return {
    program: parts[0] ?? "",
    args: parts.slice(1),
    original: parts,
    displayCommand: parts.join(" "),
  };
}

describe("isInteractive", () => {
  test.each([
    [["git", "commit"], true],
    [["git", "commit", "-m", "x"], false],
    [["git", "commit", "-am", "x"], false],
    [["git", "commit", "--message=x"], false],
    [["git", "commit", "-F", "msg.txt"], false],
    [["git", "rebase", "-i"], true],
    [["git", "rebase", "--interactive"], true],
    [["git", "rebase", "--onto", "main", "topic"], false],
    [["git", "add", "-p"], true],
    [["git", "add", "--patch"], true],
    [["git", "add", "-i"], true],
    [["git", "add", "."], false],
    [["git", "mergetool"], true],
    [["git", "difftool"], true],
    [["git", "difftool", "--no-prompt"], false],
    [["npm", "login"], true],
    [["npm", "test"], false],
    [["gh", "auth", "login"], true],
    [["docker", "login"], true],
    [["aws", "sso", "login"], true],
    [["git", "status"], false],
    // F3: `login` only counts as interactive for auth CLIs, not as a stray
    // positional on unrelated tools (these must still compress).
    [["grep", "login", "file.txt"], false],
    [["git", "checkout", "login"], false],
    [["ls", "login"], false],
    [["rg", "login"], false],
  ])("%s → %s", (parts, expected) => {
    expect(isInteractive(cmd(parts as string[]))).toBe(expected);
  });
});
