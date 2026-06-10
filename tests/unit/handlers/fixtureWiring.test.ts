import { describe, expect, test } from "vitest";

import { fixtureCases } from "../../helpers/fixtureCases.js";

function fixtureCaseKey(fixture: string, command: string[]): string {
  return `${fixture}::${command.join(" ")}`;
}

const fixtureCasesIndex = () =>
  new Set(fixtureCases.map((testCase) => fixtureCaseKey(testCase.fixture, testCase.command)));

const fixtureCommandIndex = () =>
  new Set(fixtureCases.map((testCase) => testCase.command.join(" ")));

/** Fixture files on disk that are not yet exercised by fixtureCases. */
const orphanedFixtures = [
  "tests/fixtures/common/rg_default_format.txt",
  "tests/fixtures/git/log_standard.txt",
  "tests/fixtures/git/show_large.txt",
  "tests/fixtures/git/status_dirty_extended.txt",
  "tests/fixtures/python/pytest_passed.txt",
  "tests/fixtures/js/jest_failed.txt",
] as const;

/**
 * Handler commands that must keep fixture-backed coverage. Coverage is keyed by
 * the command (any fixture), not by a specific fixture filename: which fixture a
 * command reads is an implementation detail, and on-disk fixture rot is already
 * guarded separately by `orphanedFixtures` above.
 */
const requiredFixtureCommands = [
  { name: "tree listing", command: ["tree", "."] },
  { name: "ls listing", command: ["ls", "-la"] },
  { name: "pnpm list", command: ["pnpm", "list", "--depth=0"] },
  { name: "rg default format", command: ["rg", "pattern", "src"] },
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
    ({ command, name }) => {
      expect(
        fixtureCommandIndex().has([...command].join(" ")),
        `Add fixtureCases row for ${name}`,
      ).toBe(true);
    },
  );
});
