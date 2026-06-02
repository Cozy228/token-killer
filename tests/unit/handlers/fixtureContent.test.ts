import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { expectMeaningfulBody } from "../../helpers/assertions.js";
import { fixtureCases, toParsedCommand } from "../../helpers/fixtureCases.js";
import { routeCommand } from "../../../src/router.js";
import type { RawResult, TgOptions } from "../../../src/types.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: repoRoot,
};

function raw(command: string[], stdout: string, exitCode = 0): RawResult {
  return {
    command: command.join(" "),
    stdout,
    stderr: "",
    exitCode,
    durationMs: 1,
  };
}

async function filterFixture(testCase: (typeof fixtureCases)[number]) {
  const command = toParsedCommand(testCase.command);
  const handler = routeCommand(command);
  const fixture = await readFile(path.join(repoRoot, testCase.fixture), "utf8");

  return handler.filter(
    raw(testCase.command, fixture, testCase.exitCode ?? 0),
    command,
    options,
  );
}

describe("handler fixture content correctness", () => {
  test.each(fixtureCases)("$name", async (testCase) => {
    const result = await filterFixture(testCase);

    for (const expected of testCase.critical) {
      expect(result.output).toContain(expected);
    }

    for (const pattern of testCase.forbidden ?? []) {
      expect(result.output).not.toMatch(pattern);
    }

    expectMeaningfulBody(result.output);
    expect(result.handler).not.toBe("generic");
  });
});

function fixtureCaseKey(fixture: string, command: string[]): string {
  return `${fixture}::${command.join(" ")}`;
}

const fixtureCasesIndex = () =>
  new Set(fixtureCases.map((testCase) => fixtureCaseKey(testCase.fixture, testCase.command)));

/** Fixture files on disk that are not yet exercised by fixtureCases. */
const orphanedFixtures = [
  "tests/fixtures/common/rg_default_format.txt",
  "tests/fixtures/git/log_standard.txt",
  "tests/fixtures/git/show_large.txt",
  "tests/fixtures/git/status_dirty_extended.txt",
  "tests/fixtures/python/pytest_passed.txt",
  "tests/fixtures/js/jest_failed.txt",
] as const;

/** Handler commands that still need fixtureCases rows. */
const requiredFixtureCommands = [
  {
    name: "tree listing",
    fixture: "tests/fixtures/common/ls_large_project.txt",
    command: ["tree", "."],
  },
  {
    name: "ls listing",
    fixture: "tests/fixtures/common/ls_large_project.txt",
    command: ["ls", "-la"],
  },
  {
    name: "pnpm list",
    fixture: "tests/fixtures/js/npm_list_large.txt",
    command: ["pnpm", "list", "--depth=0"],
  },
  {
    name: "rg default format",
    fixture: "tests/fixtures/common/rg_default_format.txt",
    command: ["rg", "pattern", "src"],
  },
] as const;

describe("fixtureCases wiring", () => {
  test.each(orphanedFixtures)("%s is wired into fixtureCases", (fixturePath) => {
    expect(
      [...fixtureCasesIndex()].some((key) => key.startsWith(`${fixturePath}::`)),
      `Add a fixtureCases row that reads ${fixturePath}`,
    ).toBe(true);
  });

  test.each(requiredFixtureCommands)("$name has a fixtureCases row", ({ fixture, command, name }) => {
    expect(
      fixtureCasesIndex().has(fixtureCaseKey(fixture, [...command])),
      `Add fixtureCases row for ${name}`,
    ).toBe(true);
  });
});
