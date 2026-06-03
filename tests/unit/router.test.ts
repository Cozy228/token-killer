import { describe, expect, test } from "vitest";

import { routeCommand } from "../../src/router.js";
import type { ParsedCommand } from "../../src/types.js";

function command(original: string[]): ParsedCommand {
  return {
    program: original[0] ?? "",
    args: original.slice(1),
    original,
    displayCommand: original.join(" "),
  };
}

describe("routeCommand", () => {
  test.each([
    [["cat", "package.json"], "read-like"],
    [["type", "package.json"], "read-like"],
    [["ls", "."], "list-like"],
    [["dir", "."], "list-like"],
    [["find", "."], "list-like"],
    [["tree", "."], "list-like"],
    [["rg", "TODO", "."], "search-like"],
    [["grep", "TODO", "."], "search-like"],
    [["diff", "old.txt", "new.txt"], "diff"],
    [["git", "status"], "git-status"],
    [["git", "diff"], "git-diff"],
    [["git", "log", "-1"], "git-log"],
    [["git", "show", "HEAD"], "git-show"],
    [["git", "branch"], "git-branch"],
    [["pytest", "--maxfail=1"], "pytest"],
    [["python", "-m", "pytest"], "pytest"],
    [["python3", "-m", "pytest"], "pytest"],
    [["ruff", "check", "."], "ruff"],
    [["mypy", "."], "mypy"],
    [["pip", "list"], "pip"],
    [["python", "-m", "pip", "freeze"], "pip"],
    [["npm", "test"], "js-test"],
    [["pnpm", "run", "test"], "js-test"],
    [["vitest"], "js-test"],
    [["jest"], "js-test"],
    [["eslint", "."], "eslint"],
    [["tsc", "--noEmit"], "tsc"],
    [["npm", "list"], "package-list"],
    [["mvn", "-q", "test"], "maven"],
    [["gradle", "test"], "gradle"],
    [["./gradlew", "test"], "gradle"],
    [["javac", "App.java"], "javac"],
    [["custom-tool"], "generic"],
  ])("%s routes to %s", (argv, handlerName) => {
    expect(routeCommand(command(argv)).name).toBe(handlerName);
  });
});
