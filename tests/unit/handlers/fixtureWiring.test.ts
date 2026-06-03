import { describe, expect, test } from "vitest";

import { fixtureCases } from "../../helpers/fixtureCases.js";

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

describe("fixtureCases wiring debt", () => {
  test.each(orphanedFixtures)("%s is wired into fixtureCases", (fixturePath) => {
    expect(
      [...fixtureCasesIndex()].some((key) => key.startsWith(`${fixturePath}::`)),
      `Add a fixtureCases row that reads ${fixturePath}`,
    ).toBe(true);
  });

  test.each(requiredFixtureCommands)(
    "$name has a fixtureCases row",
    ({ fixture, command, name }) => {
      expect(
        fixtureCasesIndex().has(fixtureCaseKey(fixture, [...command])),
        `Add fixtureCases row for ${name}`,
      ).toBe(true);
    },
  );
});
