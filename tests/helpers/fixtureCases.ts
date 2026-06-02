import { routeCommand } from "../../src/router.js";
import type { ParsedCommand } from "../../src/types.js";

export type FixtureCase = {
  name: string;
  fixture: string;
  command: string[];
  exitCode?: number;
  critical: string[];
  forbidden?: RegExp[];
};

export const fixtureCases: FixtureCase[] = [
  {
    name: "search-like keeps rg matches from real output",
    fixture: "tests/fixtures/common/rg_many_matches.txt",
    command: ["rg", "submitOrder", "src"],
    critical: ["Search: submitOrder", "src/order/submit.ts", "submitOrder(payload)"],
    forbidden: [/0 across 0 files/],
  },
  {
    name: "search-like keeps grep matches without line numbers",
    fixture: "tests/fixtures/common/grep_no_line_numbers.txt",
    command: ["grep", "-r", "export", "src"],
    critical: ["Search: export", "src/core/history.ts", "recordHistory"],
    forbidden: [/0 across 0 files/],
  },
  {
    name: "list-like keeps useful paths from real project listing",
    fixture: "tests/fixtures/common/ls_large_project.txt",
    command: ["find", "."],
    critical: ["src/", "tests/", "README.md", "package.json"],
  },
  {
    name: "read-like keeps source symbols from large TypeScript fixture",
    fixture: "tests/fixtures/common/cat_large_ts.txt",
    command: ["cat", "src/order/submit.ts"],
    critical: ["OrderPayload", "submitOrder", "api.submit"],
  },
  {
    name: "git-status keeps staged modified and untracked paths",
    fixture: "tests/fixtures/git/status_dirty.txt",
    command: ["git", "status"],
    critical: [
      "Branch: feature/token-proxy",
      "src/cli.ts",
      "src/parse.ts",
      "tests/unit/parse.test.ts",
    ],
  },
  {
    name: "git-diff keeps changed lines from real diff",
    fixture: "tests/fixtures/git/diff_large.txt",
    command: ["git", "diff"],
    critical: [
      "Git Diff Summary",
      "src/order/submit.ts",
      "-  return api.submit(payload)",
      "+  return api.submit({ ...payload, idempotencyKey })",
    ],
  },
  {
    name: "git-log keeps commit subject from real log",
    fixture: "tests/fixtures/git/log_many.txt",
    command: ["git", "log"],
    critical: ["abcdef123456", "retained subject"],
  },
  {
    name: "git-branch keeps current and nearby branch names",
    fixture: "tests/fixtures/git/branch_many.txt",
    command: ["git", "branch"],
    critical: ["Current: codex/token-proxy", "main", "release/2026-06"],
  },
  {
    name: "pytest keeps failing test and assertion from fixture",
    fixture: "tests/fixtures/python/pytest_failed.txt",
    command: ["pytest"],
    exitCode: 1,
    critical: [
      "tests/order/test_submit.py::test_duplicate_submit",
      "AssertionError",
      "1 failed",
    ],
  },
  {
    name: "ruff keeps rule codes and file locations from fixture",
    fixture: "tests/fixtures/python/ruff_many.txt",
    command: ["ruff", "check", "."],
    exitCode: 1,
    critical: ["src/order/submit.py:42:5", "F401", "B008"],
  },
  {
    name: "mypy keeps error codes and file locations from fixture",
    fixture: "tests/fixtures/python/mypy_many.txt",
    command: ["mypy", "src"],
    exitCode: 1,
    critical: ["src/order/submit.py:82", "arg-type", "union-attr"],
  },
  {
    name: "pip keeps package problems from fixture",
    fixture: "tests/fixtures/python/pip_list_large.txt",
    command: ["pip", "list"],
    critical: ["requests", "broken-package", "conflict", "missing-lib"],
  },
  {
    name: "eslint keeps rule names and source locations from fixture",
    fixture: "tests/fixtures/js/eslint_many.txt",
    command: ["eslint", "src"],
    exitCode: 1,
    critical: ["src/components/UserForm.tsx:42:7", "no-unused-vars", "react-hooks/exhaustive-deps"],
  },
  {
    name: "tsc keeps TypeScript diagnostic codes from fixture",
    fixture: "tests/fixtures/js/tsc_many.txt",
    command: ["tsc", "--noEmit"],
    exitCode: 2,
    critical: ["src/order/submit.ts:42:7", "TS2322", "TS2339"],
  },
  {
    name: "js-test keeps failed test and assertion from Vitest fixture",
    fixture: "tests/fixtures/js/vitest_failed.txt",
    command: ["vitest", "run"],
    exitCode: 1,
    critical: ["prevents duplicate submit", "AssertionError", "src/order/submit.test.ts:42:15"],
  },
  {
    name: "package-list keeps invalid missing and peer dependency problems",
    fixture: "tests/fixtures/js/npm_list_large.txt",
    command: ["npm", "list", "--depth=0"],
    exitCode: 1,
    critical: ["broken-package@1.0.0", "invalid", "peer-tool@2.0.0", "missing-lib@0.0.0"],
  },
  {
    name: "maven keeps failing test and summary from fixture",
    fixture: "tests/fixtures/java/maven_test_failed.txt",
    command: ["mvn", "test"],
    exitCode: 1,
    critical: ["OrderServiceTest.preventsDuplicateSubmit", "expected:<1>", "Failures: 1"],
  },
  {
    name: "gradle keeps failed task test and user frame from fixture",
    fixture: "tests/fixtures/java/gradle_test_failed.txt",
    command: ["./gradlew", "test"],
    exitCode: 1,
    critical: [
      ":order-service:test FAILED",
      "OrderServiceTest > preventsDuplicateSubmit FAILED",
      "OrderServiceTest.java:82",
    ],
  },
  {
    name: "javac keeps compiler diagnostics from fixture",
    fixture: "tests/fixtures/java/javac_errors.txt",
    command: ["javac", "src/order/App.java"],
    exitCode: 1,
    critical: ["src/order/App.java:42", "cannot find symbol", "src/order/Api.java:88"],
  },
];

export function fixtureBackedHandlers(): Set<string> {
  const handlers = new Set<string>();
  for (const testCase of fixtureCases) {
    handlers.add(routeCommand(toParsedCommand(testCase.command)).name);
  }
  return handlers;
}

export function toParsedCommand(command: string[]): ParsedCommand {
  return {
    program: command[0] ?? "",
    args: command.slice(1),
    original: command,
    displayCommand: command.join(" "),
  };
}
