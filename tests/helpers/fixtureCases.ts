import { routeCommand } from "../../src/router.js";
import type { ParsedCommand } from "../../src/types.js";

export type FixtureCase = {
  name: string;
  fixture: string;
  command: string[];
  exitCode?: number;
  critical: string[];
  forbidden?: RegExp[];
  maxOutputGrowth?: number;
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
    name: "search-like keeps rg default format matches",
    fixture: "tests/fixtures/common/rg_default_format.txt",
    command: ["rg", "pattern", "src"],
    critical: [
      "Search: pattern",
      "src/core/history.ts",
      "HistoryRecord",
      "src/core/report.ts",
      "buildReport",
    ],
    forbidden: [/0 across 0 files/],
  },
  {
    name: "rg --json respects explicit machine-readable output",
    fixture: "tests/fixtures/common/rg_json_imports.txt",
    command: ["rg", "--json", "import", "src/cli.ts"],
    critical: ['"type":"match"', '"line_number":2', '"matched_lines":9'],
    forbidden: [/^Search:/m, /^Matches:/m],
    maxOutputGrowth: 10,
  },
  {
    name: "search-like keeps grep matches without line numbers",
    fixture: "tests/fixtures/common/grep_no_line_numbers.txt",
    command: ["grep", "-r", "export", "src"],
    critical: ["Search: export", "src/core/history.ts", "recordHistory"],
    forbidden: [/0 across 0 files/],
  },
  {
    name: "grep -c respects explicit count format output",
    fixture: "tests/fixtures/common/grep_count_imports.txt",
    command: ["grep", "-c", "import", "src/*.ts"],
    critical: ["src/cli.ts:9", "src/types.ts:0"],
    forbidden: [/Search:/, /Matches:/],
    maxOutputGrowth: 10,
  },
  {
    name: "grep -l respects explicit file-list format output",
    fixture: "tests/fixtures/common/grep_file_list_imports.txt",
    command: ["grep", "-l", "import", "src/*.ts"],
    critical: ["src/cli.ts", "src/router.ts"],
    forbidden: [/Search:/, /Matches:/],
    maxOutputGrowth: 10,
  },
  {
    name: "list-like keeps useful paths from real project listing",
    fixture: "tests/fixtures/common/ls_large_project.txt",
    command: ["find", "."],
    critical: ["src/", "tests/", "README.md", "package.json"],
  },
  {
    name: "find small output keeps root files without excessive growth",
    fixture: "tests/fixtures/common/find_small_root_files.txt",
    command: ["find", ".", "-maxdepth", "1", "-type", "f"],
    critical: ["README.md", "package.json", "vitest.migration.config.ts"],
    maxOutputGrowth: 80,
  },
  {
    name: "tree keeps useful paths from real project listing",
    fixture: "tests/fixtures/common/ls_large_project.txt",
    command: ["tree", "."],
    critical: ["./src/cli.ts", "./tests/unit/parse.test.ts", "./README.md", "./package.json"],
  },
  {
    name: "ls keeps useful paths and explicit skip hints from real project listing",
    fixture: "tests/fixtures/common/ls_large_project.txt",
    command: ["ls", "-la"],
    critical: ["README.md", "package.json", "src/cli.ts", "Skipped:", "node_modules/"],
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
    name: "git-status keeps extended dirty status paths",
    fixture: "tests/fixtures/git/status_dirty_extended.txt",
    command: ["git", "status"],
    critical: [
      "Branch: codex/token-guard-node-cli",
      "README.md",
      "package.json",
      "src/",
      "vitest.config.ts",
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
    name: "diff condenses unified diff while preserving changed lines",
    fixture: "tests/fixtures/common/diff_unified_changes.txt",
    command: ["diff", "src/main.old.ts", "src/main.ts"],
    critical: [
      "[file] src/main.ts (+2 -1)",
      "-const retries = 1;",
      "+const retries = 3;",
      "+const timeoutMs = 5000;",
    ],
    forbidden: [/^@@/m, /^diff --git/m],
  },
  {
    name: "git-log keeps commit subject from real log",
    fixture: "tests/fixtures/git/log_many.txt",
    command: ["git", "log"],
    critical: ["abcdef123456", "retained subject"],
  },
  {
    name: "git-log keeps standard commit subjects",
    fixture: "tests/fixtures/git/log_standard.txt",
    command: ["git", "log"],
    critical: [
      "a1b2c3d4e5f6",
      "feat: add token guard command proxy",
      "fix: handle edge case in parser",
      "Initial commit",
    ],
  },
  {
    name: "git-show keeps commit metadata and recovery hint",
    fixture: "tests/fixtures/git/show_large.txt",
    command: ["git", "show"],
    critical: [
      "Commit: abc123def4567890",
      "Subject: retained commit subject",
      "src/order/submit.ts (+1 -1)",
      "Large patch hidden.",
      "Use tg --raw git show if full patch is required.",
    ],
  },
  {
    name: "git-branch keeps current and nearby branch names",
    fixture: "tests/fixtures/git/branch_many.txt",
    command: ["git", "branch"],
    critical: ["Current: codex/token-proxy", "main", "release/2026-06"],
  },
  {
    name: "git-branch small output passes through branch names",
    fixture: "tests/fixtures/git/branch_small_current.txt",
    command: ["git", "branch"],
    critical: ["* codex/token-guard-node-cli", "main"],
    forbidden: [/Branches:/, /Hidden:/],
    maxOutputGrowth: 10,
  },
  {
    name: "git-add preserves missing path failures",
    fixture: "tests/fixtures/git/add_missing_path.txt",
    command: ["git", "add", "__tg_missing_fixture_file__"],
    exitCode: 128,
    critical: [
      "FAILED: git add __tg_missing_fixture_file__",
      "fatal: pathspec '__tg_missing_fixture_file__'",
    ],
  },
  {
    name: "git-commit preserves dry-run dirty tree details",
    fixture: "tests/fixtures/git/commit_dry_run_dirty.txt",
    command: ["git", "commit", "--dry-run"],
    exitCode: 1,
    critical: [
      "FAILED: git commit --dry-run",
      "Changes not staged for commit:",
      "docs/testing-and-migration-audit.md",
      "tests/unit/handlers/fixtureWiring.test.ts",
    ],
  },
  {
    name: "git-push keeps dry-run pushed ref target",
    fixture: "tests/fixtures/git/push_dry_run_local.txt",
    command: ["git", "push", "--dry-run", ".", "HEAD:refs/heads/__tg_fixture_branch__"],
    critical: ["To .", "HEAD -> __tg_fixture_branch__", "ok pushed"],
  },
  {
    name: "git-pull preserves unstaged-change failure",
    fixture: "tests/fixtures/git/pull_unstaged_changes.txt",
    command: ["git", "pull", "--ff-only", ".", "HEAD"],
    exitCode: 128,
    critical: [
      "FAILED: git pull --ff-only . HEAD",
      "cannot pull with rebase",
      "You have unstaged changes",
    ],
  },
  {
    name: "git-fetch preserves missing remote failure",
    fixture: "tests/fixtures/git/fetch_missing_remote.txt",
    command: ["git", "fetch", "/tmp/__tg_missing_remote__", "main"],
    exitCode: 128,
    critical: [
      "FAILED: git fetch /tmp/__tg_missing_remote__ main",
      "does not appear to be a git repository",
      "Could not read from remote repository",
    ],
  },
  {
    name: "git-stash preserves invalid ref failure",
    fixture: "tests/fixtures/git/stash_invalid_ref.txt",
    command: ["git", "stash", "show", "stash@{999999}"],
    exitCode: 1,
    critical: [
      "FAILED: git stash show stash@{999999}",
      "stash@{999999} is not a valid reference",
    ],
  },
  {
    name: "git-worktree keeps worktree path and branch",
    fixture: "tests/fixtures/git/worktree_list.txt",
    command: ["git", "worktree", "list"],
    critical: ["/Users/ziyu/Workspace/token-guard", "codex/token-guard-node-cli"],
  },
  {
    name: "gh repo view keeps repository identity and URL",
    fixture: "tests/fixtures/git/gh_repo_view.json",
    command: ["gh", "repo", "view"],
    critical: ["Cozy228/token-guard", "default: main", "public", "https://github.com/Cozy228/token-guard"],
  },
  {
    name: "glab mr list keeps merge request identity and branches",
    fixture: "tests/fixtures/git/glab_mr_list_raw.json",
    command: ["glab", "mr", "list"],
    critical: [
      "!314 feat(glab): add GitLab CLI (glab) command support",
      "@alice_dev",
      "feat/glab-support",
      "!310 fix(git): handle merge commits in compact diff",
    ],
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
    name: "pytest keeps passing summary from fixture",
    fixture: "tests/fixtures/python/pytest_passed.txt",
    command: ["pytest"],
    critical: ["Pytest passed", "118 passed in 3.50s"],
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
    name: "js-test keeps failed Jest test name from fixture",
    fixture: "tests/fixtures/js/jest_failed.txt",
    command: ["jest"],
    exitCode: 1,
    critical: [
      "JS tests failed",
      "Tests: 3 failed, 215 passed, 218 total",
      "FAIL src/order/submit.test.ts",
    ],
  },
  {
    name: "package-list keeps invalid missing and peer dependency problems",
    fixture: "tests/fixtures/js/npm_list_large.txt",
    command: ["npm", "list", "--depth=0"],
    exitCode: 1,
    critical: ["broken-package@1.0.0", "invalid", "peer-tool@2.0.0", "missing-lib@0.0.0"],
  },
  {
    name: "package-list keeps pnpm invalid missing and peer dependency problems",
    fixture: "tests/fixtures/js/npm_list_large.txt",
    command: ["pnpm", "list", "--depth=0"],
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
