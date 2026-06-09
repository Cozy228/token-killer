import { describe, expect, test } from "vitest";

import { isReadOnlyCommand } from "../../../src/core/readonly.js";
import type { ParsedCommand } from "../../../src/types.js";

function cmd(program: string, args: string[]): ParsedCommand {
  return {
    program,
    args,
    original: [program, ...args],
    displayCommand: [program, ...args].join(" "),
  };
}

describe("isReadOnlyCommand — the dedup read-only gate (ADR 0009)", () => {
  test("git read subcommands are read-only", () => {
    expect(isReadOnlyCommand(cmd("git", ["status"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("git", ["log", "--oneline"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("git", ["diff", "--stat"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("git", ["show", "HEAD"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("git", ["branch"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("git", ["branch", "--list"]))).toBe(true);
  });

  test("git mutating subcommands are NOT read-only", () => {
    for (const sub of [
      "commit",
      "push",
      "pull",
      "checkout",
      "switch",
      "reset",
      "add",
      "rm",
      "merge",
      "rebase",
      "stash",
      "clean",
      "tag",
    ]) {
      expect(isReadOnlyCommand(cmd("git", [sub]))).toBe(false);
    }
  });

  test("git branch with a mutating flag is NOT read-only", () => {
    expect(isReadOnlyCommand(cmd("git", ["branch", "-d", "feature"]))).toBe(false);
    expect(isReadOnlyCommand(cmd("git", ["branch", "-D", "feature"]))).toBe(false);
    expect(isReadOnlyCommand(cmd("git", ["branch", "-m", "old", "new"]))).toBe(false);
    expect(isReadOnlyCommand(cmd("git", ["branch", "--delete", "feature"]))).toBe(false);
  });

  test("an absolute program path is normalized for the gate", () => {
    expect(isReadOnlyCommand(cmd("/usr/bin/git", ["commit"]))).toBe(false);
    expect(isReadOnlyCommand(cmd("/usr/bin/git", ["status"]))).toBe(true);
  });

  test("docker read vs write subcommands", () => {
    expect(isReadOnlyCommand(cmd("docker", ["ps"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("docker", ["images"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("docker", ["compose", "ps"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("docker", ["rm", "c1"]))).toBe(false);
    expect(isReadOnlyCommand(cmd("docker", ["run", "img"]))).toBe(false);
    expect(isReadOnlyCommand(cmd("docker", ["build", "."]))).toBe(false);
  });

  test("kubectl read vs write subcommands", () => {
    expect(isReadOnlyCommand(cmd("kubectl", ["get", "pods"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("kubectl", ["describe", "pod", "x"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("kubectl", ["delete", "pod", "x"]))).toBe(false);
    expect(isReadOnlyCommand(cmd("kubectl", ["apply", "-f", "x.yaml"]))).toBe(false);
  });

  test("pure-read tools default to read-only", () => {
    expect(isReadOnlyCommand(cmd("ls", ["-la"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("rg", ["TODO", "src"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("wc", ["-l", "file"]))).toBe(true);
    expect(isReadOnlyCommand(cmd("tsc", ["--noEmit"]))).toBe(true);
  });
});
