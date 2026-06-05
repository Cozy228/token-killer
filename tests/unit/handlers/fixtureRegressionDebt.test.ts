import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { routeCommand } from "../../../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const options: TkOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: repoRoot,
};

function parsed(command: string[]): ParsedCommand {
  return {
    program: command[0] ?? "",
    args: command.slice(1),
    original: command,
    displayCommand: command.join(" "),
  };
}

function raw(command: string[], stdout: string, exitCode = 0): RawResult {
  return {
    command: command.join(" "),
    stdout,
    stderr: "",
    exitCode,
    durationMs: 1,
  };
}

async function filterFixture(fixture: string, command: string[], exitCode = 0) {
  const parsedCommand = parsed(command);
  const handler = routeCommand(parsedCommand);
  const stdout = await readFile(path.join(repoRoot, fixture), "utf8");

  return handler.filter(raw(command, stdout, exitCode), parsedCommand, options);
}

describe("fixture-backed regression debt", () => {
  test("git status --short keeps modified and untracked paths", async () => {
    const result = await filterFixture("tests/fixtures/git/status_short_current.txt", [
      "git",
      "status",
      "--short",
    ]);

    expect(result.output).toContain("docs/testing-and-migration-audit.md");
    expect(result.output).toContain("tests/unit/handlers/fixtureWiring.test.ts");
    expect(result.output).not.toContain("Status: 0 modified, 0 staged, 0 untracked");
  });

  test("git status --porcelain -b keeps branch and changed paths", async () => {
    const result = await filterFixture("tests/fixtures/git/status_porcelain_branch_current.txt", [
      "git",
      "status",
      "--porcelain",
      "-b",
    ]);

    expect(result.output).toContain("codex/token-killer-node-cli");
    expect(result.output).toContain("tests/helpers/fixtureCases.ts");
    expect(result.output).not.toContain("Branch: unknown");
  });

  test("git diff --stat keeps file counts instead of zero summary", async () => {
    const result = await filterFixture("tests/fixtures/git/diff_stat_current.txt", [
      "git",
      "diff",
      "--stat",
    ]);

    expect(result.output).toContain("8 files changed");
    expect(result.output).toContain("290 insertions");
    expect(result.output).not.toContain("Files changed: 0, +0 -0");
  });
});
