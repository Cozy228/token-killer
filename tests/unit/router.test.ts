import { describe, expect, test } from "vitest";

import { routeCommand, routeSpecific } from "../../src/router.js";
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
    // cat/ls/tree route to dedicated RTK ports (system/read.rs, ls.rs, tree.rs);
    // read/type/less/dir/find stay on the generic read-like/list-like handlers.
    [["cat", "package.json"], "read"],
    [["read", "package.json"], "read-like"],
    [["type", "package.json"], "read-like"],
    [["ls", "."], "ls"],
    [["dir", "."], "list-like"],
    [["find", "."], "list-like"],
    [["tree", "."], "tree"],
    [["rg", "TODO", "."], "search-like"],
    [["grep", "TODO", "."], "search-like"],
    [["diff", "old.ts", "new.ts"], "diff"],
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
    // Formatters under package runners: `pnpm exec <tool>` makes the program
    // `pnpm`, so prettier/eslint must match on the wrapped argv, not just argv[0].
    [["prettier", "--check", "package.json"], "prettier"],
    [["pnpm", "exec", "prettier", "--check", "package.json"], "prettier"],
    [["pnpm", "exec", "eslint", "package.json"], "eslint"],
    // "prettier" only as a flag VALUE (not a wrapped binary) must not misroute.
    [["git", "commit", "-m", "fix prettier config"], "git-commit"],
    [["tsc", "--noEmit"], "tsc"],
    [["npm", "list"], "package-list"],
    // `npm ls` is the `list` alias; `pnpm -r list` keeps a flag before the subcommand.
    [["npm", "ls", "--depth=0"], "package-list"],
    [["pnpm", "-r", "list"], "package-list"],
    // "list"/"ls" as a VALUE (package or script name) must NOT route to package-list.
    [["npm", "install", "ls"], "npm"],
    [["npm", "run", "ls"], "npm"],
    [["npm", "install", "list"], "npm"],
    [["mvn", "-q", "test"], "maven"],
    [["gradle", "test"], "gradle"],
    [["./gradlew", "test"], "gradle"],
    [["javac", "App.java"], "javac"],
    [["custom-tool"], "generic"],
  ])("%s routes to %s", (argv, handlerName) => {
    expect(routeCommand(command(argv)).name).toBe(handlerName);
  });
});

describe("routeSpecific probe guard", () => {
  // A pure --version/--help probe must skip compression (→ null = passthrough) so
  // a name-only handler like eslint can't hijack `eslint --version` into a bogus
  // "0 problems" reformat that the inflation gate then reverts and logs as inflated.
  test.each([
    [["eslint", "--version"]],
    [["vitest", "--version"]],
    [["tsc", "--version"]],
    [["javac", "-version"]],
    [["pnpm", "--help"]],
    [["git", "--help"]],
  ])("%s is a passthrough probe", (argv) => {
    expect(routeSpecific(command(argv))).toBeNull();
  });

  // Overloaded short flags are NOT probes: grep -v inverts, ls -h is human-readable.
  test.each([
    [["grep", "-v", "pattern", "."], "search-like"],
    [["ls", "-h"], "ls"],
    [["eslint", ".", "--version"], "eslint"],
  ])("%s still routes to a real handler", (argv, handlerName) => {
    expect(routeSpecific(command(argv))?.name).toBe(handlerName);
  });
});
