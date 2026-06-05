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
  /**
   * Set for tg-only handlers (e.g. terraform) that rtk has no filter for. The
   * three-way report represents rtk as a raw passthrough (0% savings) for these
   * cases instead of skipping them, surfacing the tg-only win in the main table.
   */
  rtkUnsupported?: boolean;
  /**
   * For the three-way report: how to feed this fixture to a native rtk *wrapper*
   * command that reads a command/file/dir rather than stdin (err/summary/deps/smart).
   * - "exec-cat": `rtk <sub…> "cat <fixture>"` (rtk runs cat, sees the fixture as stdout)
   * - "file-arg": `rtk <sub…> <fixture>` (rtk reads the file directly)
   * - "dir-package": copy the fixture to a temp `package.json`, `rtk <sub…> <dir>`
   */
  rtkWrapper?: { mode: "exec-cat" | "file-arg" | "dir-package"; sub: string[] };
};

export const fixtureCases: FixtureCase[] = [
  {
    name: "search-like keeps rg matches from real output",
    fixture: "tests/fixtures/common/rg_many_matches.txt",
    command: ["rg", "submitOrder", "src"],
    critical: ["src/order/submit.ts", "submitOrder(payload)"],
    forbidden: [/0 across 0 files/],
  },
  {
    name: "search-like keeps rg default format matches",
    fixture: "tests/fixtures/common/rg_default_format.txt",
    command: ["rg", "pattern", "src"],
    critical: [
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
    critical: ["src/core/history.ts", "recordHistory"],
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
    critical: ["5F 3D:", "./ README.md package.json", "src/ cli.ts parse.ts", "tests/unit/ parse.test.ts"],
  },
  {
    name: "find groups matches by directory like RTK",
    fixture: "tests/fixtures/common/find_src_ts.txt",
    command: ["find", "src", "-name", "*.ts"],
    critical: ["4F 2D:", "./ cli.ts parse.ts", "core/ history.ts report.ts"],
    forbidden: [/src\/core\/history\.ts\nsrc\/core\/report\.ts/],
  },
  {
    name: "find small output keeps root files without excessive growth",
    fixture: "tests/fixtures/common/find_small_root_files.txt",
    command: ["find", ".", "-maxdepth", "1", "-type", "f"],
    critical: ["README.md", "package.json", "vitest.migration.config.ts"],
    forbidden: [/^├─/m],
    maxOutputGrowth: 0,
  },
  {
    // RTK: system/tree.rs::filter_tree_output — preserve the ├──/└──/│ hierarchy,
    // strip only the trailing "N directories, M files" summary line.
    name: "tree preserves hierarchy and strips the summary line (RTK tree.rs)",
    fixture: "tests/fixtures/system/tree_project.txt",
    command: ["tree", "."],
    critical: [
      "├── src",
      "│   ├── cli.ts",
      "│   └── core",
      "│       ├── history.ts",
      "└── tests",
      "        └── parse.test.ts",
    ],
    forbidden: [/directories,/, /\d+ files?$/m],
  },
  {
    // RTK: system/ls.rs::compact_ls — `ls -la` long format → dirs-first (name + "/"),
    // files (name + human size), octal perms prefix (because -la implies -l).
    name: "ls compacts ls -la long format with octal perms and sizes (RTK ls.rs)",
    fixture: "tests/fixtures/system/ls_la_long.txt",
    command: ["ls", "-la"],
    critical: [
      "755  src/",
      "644  README.md  5.5K",
      "755  build.sh  500B",
      "644  package.json  20.0K",
    ],
    forbidden: [/drwx/, /staff/, /^total/m, /Jan  1/],
  },
  {
    // RTK: system/read.rs — level "none" (default) returns full content; tg keeps
    // every source symbol so downstream parsing stays valid.
    name: "read keeps source symbols at the default filter level (RTK read.rs)",
    fixture: "tests/fixtures/common/cat_large_ts.txt",
    command: ["cat", "src/order/submit.ts"],
    critical: ["OrderPayload", "submitOrder", "api.submit"],
  },
  {
    name: "read-like keeps concatenated multi-file content",
    fixture: "tests/fixtures/common/cat_multi_file.txt",
    command: ["cat", "one.txt", "two.txt"],
    critical: ["alpha", "bravo", "charlie", "delta"],
    maxOutputGrowth: 10,
  },
  {
    name: "git-status keeps staged modified and untracked paths",
    fixture: "tests/fixtures/git/status_dirty.txt",
    command: ["git", "status"],
    critical: [
      "* feature/token-proxy",
      "A  src/cli.ts",
      " M src/parse.ts",
      "?? tests/unit/parse.test.ts",
    ],
    forbidden: [/^Branch:/m, /^Modified:/m, /^Untracked:/m],
  },
  {
    name: "git-status keeps extended dirty status paths",
    fixture: "tests/fixtures/git/status_dirty_extended.txt",
    command: ["git", "status"],
    critical: [
      "* codex/token-guard-node-cli",
      " D DESIGN.md",
      " M README.md",
      " M package.json",
      "?? src/",
      "?? vitest.config.ts",
    ],
    forbidden: [/^Branch:/m, /^Modified:/m, /^Untracked:/m],
  },
  {
    name: "git-status keeps porcelain branch context",
    fixture: "tests/fixtures/git/status_porcelain_branch_current.txt",
    command: ["git", "status", "--short", "--branch"],
    critical: [
      "* codex/token-guard-node-cli",
      "docs/testing-and-migration-audit.md",
      "tests/helpers/fixtureCases.ts",
      "tests/unit/handlers/fixtureWiring.test.ts",
    ],
    forbidden: [/^Branch:/m, /^Modified:/m, /^Untracked:/m],
  },
  {
    name: "git-diff keeps changed lines from real diff",
    fixture: "tests/fixtures/git/diff_large.txt",
    command: ["git", "diff"],
    critical: [
      "src/order/submit.ts",
      "-  return api.submit(payload)",
      "+  return api.submit({ ...payload, idempotencyKey })",
    ],
  },
  {
    name: "diff keeps file metadata and aligned LCS insertion",
    fixture: "tests/fixtures/common/diff_lcs_insert.txt",
    command: ["diff", "old.ts", "new.ts"],
    critical: [
      "old.ts -> new.ts (+1 -0)",
      "+   const timeoutMs = 5000;",
    ],
    forbidden: [/-  const unchanged/, /\+  const unchanged/],
  },
  {
    name: "diff stdin condenses unified diff by file",
    fixture: "tests/fixtures/common/diff_unified_stdin.txt",
    command: ["diff", "-"],
    critical: [
      "[file] src/main.ts (+1 -0)",
      '  +  console.log("hello");',
      "[file] src/config.ts (+0 -1)",
      "  -export const retries = 3;",
    ],
    forbidden: [/^diff --git/m, /^@@/m],
  },
  {
    name: "diff stdin keeps all unified diff changes",
    fixture: "tests/fixtures/common/diff_unified_large.txt",
    command: ["diff", "-"],
    critical: ["[file] config.yaml (+6 -6)", "  -old_value_0", "  +new_value_3", "  +new_value_5"],
    forbidden: [/\+5 more/, /Hidden:/],
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
      "commit abc123def4567890",
      "retained commit subject",
      "src/order/submit.ts",
      "-  return api.submit(payload)",
    ],
    forbidden: [/Files changed: 0/, /Large patch hidden/],
  },
  {
    name: "git-branch keeps current and nearby branch names",
    fixture: "tests/fixtures/git/branch_many.txt",
    command: ["git", "branch"],
    critical: ["* codex/token-proxy", "main", "release/2026-06"],
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
      "fatal: pathspec '__tg_missing_fixture_file__'",
    ],
  },
  {
    name: "git-commit preserves dry-run dirty tree details",
    fixture: "tests/fixtures/git/commit_dry_run_dirty.txt",
    command: ["git", "commit", "--dry-run"],
    exitCode: 1,
    critical: [
      "Changes not staged for commit:",
      "docs/testing-and-migration-audit.md",
      "tests/unit/handlers/fixtureWiring.test.ts",
    ],
  },
  {
    name: "git-push keeps dry-run pushed ref target",
    fixture: "tests/fixtures/git/push_dry_run_local.txt",
    command: ["git", "push", "--dry-run", ".", "HEAD:refs/heads/__tg_fixture_branch__"],
    critical: ["To .", "HEAD -> __tg_fixture_branch__"],
  },
  {
    name: "git-pull preserves unstaged-change failure",
    fixture: "tests/fixtures/git/pull_unstaged_changes.txt",
    command: ["git", "pull", "--ff-only", ".", "HEAD"],
    exitCode: 128,
    critical: [
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
      "stash@{999999} is not a valid reference",
    ],
  },
  {
    name: "git-worktree keeps worktree path and branch",
    fixture: "tests/fixtures/git/worktree_list.txt",
    command: ["git", "worktree", "list"],
    // RTK: git/git.rs::filter_worktree_list compacts $HOME to ~ (see rtkGitWorktreeBehavior).
    critical: ["~/Workspace/token-guard", "codex/token-guard-node-cli"],
  },
  {
    name: "gh repo view keeps repository identity and URL",
    fixture: "tests/fixtures/git/gh_repo_view.json",
    command: ["gh", "repo", "view"],
    // RTK: gh_cmd.rs::format_repo_view — "owner/name", "[public]", stars/forks, url
    // (no default-branch line; shares the contract with rtkGhBehavior).
    critical: ["Cozy228/token-guard", "[public]", "https://github.com/Cozy228/token-guard"],
  },
  {
    name: "glab mr list keeps merge request identity and branches",
    fixture: "tests/fixtures/git/glab_mr_list_raw.json",
    command: ["glab", "mr", "list"],
    // RTK: glab_cmd.rs::format_mr_list — "  [open] !iid title (author)"; source_branch
    // is not part of the compact listing (shares the contract with rtkGlabBehavior).
    critical: [
      "!314 feat(glab): add GitLab CLI (glab) command support",
      "(alice_dev)",
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
    // RTK: pytest_cmd.rs::build_pytest_summary — an all-pass run collapses to
    // "Pytest: N passed" (the raw "in 3.50s" timing is dropped). Product aligns to
    // the RTK contract (see rtk-migration-format-conflicts decision, 2026-06-05).
    name: "pytest keeps passing summary from fixture",
    fixture: "tests/fixtures/python/pytest_passed.txt",
    command: ["pytest"],
    critical: ["Pytest: 118 passed"],
  },
  {
    name: "ruff keeps rule codes and file locations from fixture",
    fixture: "tests/fixtures/python/ruff_many.txt",
    command: ["ruff", "check", "."],
    exitCode: 1,
    critical: ["src/order/submit.py:42:5", "F401", "B008"],
  },
  {
    // RTK: mypy_cmd.rs::filter_mypy_output — errors regrouped by file with "L{line}: [code]";
    // shares the same contract as rtkMypyBehavior.
    name: "mypy keeps error codes and file locations from fixture",
    fixture: "tests/fixtures/python/mypy_many.txt",
    command: ["mypy", "src"],
    exitCode: 1,
    critical: ["mypy: 2 errors in 2 files", "src/order/submit.py", "L82:", "arg-type", "union-attr"],
    forbidden: [/Found 2 errors/],
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
    critical: ["src/components/UserForm.tsx", "42:7", "no-unused-vars", "react-hooks/exhaustive-deps"],
  },
  {
    // RTK: tsc_cmd.rs::filter_tsc_output — diagnostics are regrouped by file with a
    // compact "Top codes" summary; the raw "Found N errors" line is dropped. Product
    // and migration share this fixture so both tracks assert the same compressed shape.
    name: "tsc keeps TypeScript diagnostic codes from fixture",
    fixture: "tests/fixtures/js/tsc_many.txt",
    command: ["tsc", "--noEmit"],
    exitCode: 2,
    critical: [
      "TypeScript: 12 errors in 6 files",
      "src/order/submit.ts (2 errors)",
      "L42: TS2322",
      "TS2339",
    ],
    forbidden: [/Found 12 errors/],
    maxOutputGrowth: 0,
  },
  {
    name: "js-test keeps failed test and assertion from Vitest fixture",
    fixture: "tests/fixtures/js/vitest_failed.txt",
    command: ["vitest", "run"],
    exitCode: 1,
    critical: ["prevents duplicate submit", "AssertionError", "src/order/submit.test.ts:42:15"],
  },
  {
    name: "js-test formats passing Vitest output like RTK",
    fixture: "tests/fixtures/js/vitest_passed.txt",
    command: ["vitest", "run"],
    critical: ["PASS (4) FAIL (0)"],
    forbidden: [/JS tests passed/, /Summary:/],
  },
  {
    // RTK: vitest_cmd.rs + parser/formatter.rs::format_compact — Jest output is
    // normalized to the same "PASS (p) FAIL (f)" + numbered-failure contract as the
    // JSON path, so product and migration assert one shared output shape.
    name: "js-test keeps failed Jest test name from fixture",
    fixture: "tests/fixtures/js/jest_failed.txt",
    command: ["jest"],
    exitCode: 1,
    critical: [
      "PASS (215) FAIL (3)",
      "src/order/submit.test.ts",
      "prevents duplicate submit",
    ],
    forbidden: [/JS tests failed/, /Summary:/],
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
    // RTK: pnpm_cmd.rs::format_dependency_listing — grouped [prod]/[dev] sections with a
    // "N packages (X prod / Y dev)" header. Shares the same contract as rtkPnpmBehavior.
    name: "package-list formats pnpm depth zero like RTK deps",
    fixture: "tests/fixtures/js/pnpm_list_depth0.txt",
    command: ["pnpm", "list", "--depth=0"],
    critical: [
      "packages (2 prod / 5 dev)",
      "[prod]",
      "  strip-ansi 7.2.0",
      "[dev]",
      "  @types/node 25.9.1",
      "  vitest 4.1.8",
    ],
    forbidden: [/Node\.js \(package\.json\):/, /Dependencies \(\d+\):/, /[├└│]/],
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
  {
    // RTK: cloud/curl_cmd.rs — top-level JSON bodies pass through untruncated so
    // downstream parsers stay valid; the body is preserved verbatim.
    name: "curl preserves a large JSON body without truncation",
    fixture: "tests/fixtures/cloud/curl_large_json.json",
    command: ["curl", "https://example.com/data"],
    critical: ['"status":"ok"', '"data":"aaaaaaaa'],
    forbidden: [/bytes total/, /\.\.\./],
  },
  {
    // RTK: common/readLike — `read`/`type`/`less` are routed to readLikeHandler
    // (distinct from the new readHandler that owns `cat`). With no read-only flags
    // this is a verbatim passthrough that keeps every source symbol intact.
    name: "read-like keeps source symbols for less",
    fixture: "tests/fixtures/system/read_less_source.ts.txt",
    command: ["less", "src/order.ts"],
    critical: ["import { api }", "submitOrder", "cancelOrder"],
    maxOutputGrowth: 0,
  },
  {
    // RTK: git/gt_cmd.rs::filter_gt_log_entries — the stack graph is kept; only
    // author emails are stripped (see rtkGtBehavior). Small stack stays under the
    // 15-entry cap so no "+N more entries" marker appears.
    name: "gt log keeps the stack graph but strips author emails",
    fixture: "tests/fixtures/git/gt_log_stack.txt",
    command: ["gt", "log"],
    critical: ["feat/add-auth", "feat(auth): add login endpoint", "main"],
    forbidden: [/user@example\.com/, /admin@corp\.io/],
  },
  {
    // RTK: system/format_cmd.rs — the `format` dispatcher defaults to prettier and
    // emits the summary + separator + numbered list (see rtkFormatBehavior).
    name: "format summarizes prettier files needing formatting",
    fixture: "tests/fixtures/system/format_prettier_check.txt",
    command: ["format", "--check"],
    exitCode: 1,
    critical: [
      "Prettier: 5 files need formatting",
      "1. src/components/button.tsx",
      "2. src/state/session.ts",
    ],
    forbidden: [/Checking formatting/, /Code style issues/],
  },
  {
    // RTK: js/next_cmd.rs::filter_next_build — verbose build chatter collapses to a
    // route/bundle summary (see rtkNextBehavior). Fixture mirrors the RTK oracle.
    name: "next build summarizes routes and bundles",
    fixture: "tests/fixtures/js/next_build.txt",
    command: ["next", "build"],
    critical: [
      "Next.js Build",
      "6 routes (3 static, 2 dynamic)",
      "/dashboard",
      "Time: 34.2s | Errors: 0 | Warnings: 0",
    ],
    forbidden: [/Creating an optimized/, /Compiled successfully/],
  },
  {
    // RTK: js/npm_cmd.rs::filter_npm_output — strips npm WARN / npm notice noise,
    // keeps real install output (see rtkNpmBehavior). `npm install` routes to
    // npmHandler (npm list/ls defer to packageList).
    name: "npm install strips WARN and notice noise",
    fixture: "tests/fixtures/js/npm_install.txt",
    command: ["npm", "install", "express"],
    critical: ["added 1357 packages", "found 0 vulnerabilities"],
    forbidden: [/npm WARN/, /npm notice/],
  },
  {
    // RTK: js/prisma_cmd.rs::filter_migrate_deploy — counts applied migrations and
    // strips schema-load chatter (see rtkPrismaBehavior).
    name: "prisma migrate deploy counts applied migrations",
    fixture: "tests/fixtures/js/prisma_migrate_deploy.txt",
    command: ["prisma", "migrate", "deploy"],
    critical: ["5 migration(s) deployed"],
    forbidden: [/Prisma schema loaded/, /Datasource/],
  },
  {
    // RTK: js/prettier_cmd.rs::filter_prettier_output — check mode lists files that
    // need formatting under a summary + separator (see rtkPrettierBehavior). Six
    // files stays under the 10-file cap so no overflow marker appears.
    name: "prettier check lists files needing formatting",
    fixture: "tests/fixtures/js/prettier_check.txt",
    command: ["prettier", "--check", "src"],
    exitCode: 1,
    critical: [
      "Prettier: 6 files need formatting",
      "1. src/components/ui/button.tsx",
      "6. src/lib/api/routes.ts",
    ],
    forbidden: [/Checking formatting/, /Forgot to run Prettier/],
  },
  {
    // RTK: js/playwright_cmd.rs — Tier 1 JSON reporter collapses to the shared
    // compact "PASS (p) FAIL (f)" + "Time: {ms}ms" shape (see rtkPlaywrightBehavior).
    name: "playwright JSON reporter collapses to compact pass summary",
    fixture: "tests/fixtures/js/playwright_json.txt",
    command: ["playwright", "test"],
    critical: ["PASS (7) FAIL (0)", "Time: 7300ms"],
    forbidden: [/"stats"/, /startTime/],
  },
  {
    // RTK: cloud/aws_cmd.rs::filter_cfn_describe_stacks — verbose CloudFormation
    // JSON compacts to "name status date" + "  key=value" outputs (see
    // rtkAwsBehavior). truncate_iso_date prefers LastUpdatedTime.
    name: "aws cloudformation describe-stacks compacts to name/status/outputs",
    fixture: "tests/fixtures/cloud/aws_cfn_describe_stacks.json",
    command: ["aws", "cloudformation", "describe-stacks"],
    critical: [
      "api-prod UPDATE_COMPLETE 2024-02-20",
      "  ApiUrl=https://api.example.com",
      "  BucketName=my-bucket",
    ],
    forbidden: [/ResponseMetadata/, /RequestId/],
  },
  {
    // RTK: cloud/psql_cmd.rs::filter_table — aligned table is detected by its "-+-"
    // separator; borders + (N rows) footer are stripped, columns tab-joined (see
    // rtkPsqlBehavior). Three rows stays under the 20-row cap.
    name: "psql table format emits tab-separated rows",
    fixture: "tests/fixtures/cloud/psql_table_users.txt",
    command: ["psql", "-c", "select * from users"],
    critical: ["id\tname\temail", "1\talice\talice@b.com", "2\tbob\tbob@b.com"],
    forbidden: [/----\+----/, /\(3 rows\)/],
  },
  {
    // RTK: cloud/wget_cmd.rs::run success branch — progress/resolve chatter reduces
    // to "{compact_url} ok | {filename} | {size}" (see rtkWgetBehavior). The byte
    // count is recovered from the terminal "saved [N/total]" line.
    name: "wget reduces a download transcript to one result line",
    fixture: "tests/fixtures/cloud/wget_download.txt",
    command: ["wget", "-S", "https://example.com/file.tar.gz"],
    critical: ["example.com/file.tar.gz ok | file.tar.gz | 2.0MB"],
    forbidden: [/Resolving example\.com/, /HTTP request sent/],
  },
  {
    // RTK: cloud/container.rs::format_compose_ps — tab-separated --format rows
    // compact to "[compose] N services:" with shortened images (see
    // rtkDockerBehavior). Three services stays under CAP_LIST.
    name: "docker compose ps compacts services and shortens images",
    fixture: "tests/fixtures/cloud/docker_compose_ps.txt",
    command: ["docker", "compose", "ps"],
    critical: [
      "[compose] 3 services:",
      "  web (web:latest) Up 2 hours [8080]",
      "  db (postgres:16) Exited (0)",
    ],
    forbidden: [/ghcr\.io\/example\/very\/long/],
  },
  {
    // RTK: cloud/container.rs::format_kubectl_pods — `kubectl get pods -o json`
    // collapses to readiness counts + a "[warn] Issues:" list (see
    // rtkKubectlBehavior).
    name: "kubectl get pods summarizes readiness and crashloop issues",
    fixture: "tests/fixtures/cloud/kubectl_get_pods.json",
    command: ["kubectl", "get", "pods"],
    critical: [
      "3 pods: 1, 1 pending, 1 [x], 3 restarts",
      "[warn] Issues:",
      "  default/api-123 CrashLoopBackOff",
    ],
    forbidden: [/containerStatuses/, /metadata/],
  },
  {
    // RTK: system/pipe_cmd.rs::grep_wrapper — the named `grep` filter groups
    // file:line:content matches by file under an "N matches in MF:" header (see
    // rtkPipeBehavior). Two matches per file stays under the 10-match cap.
    name: "pipe grep groups matches by file",
    fixture: "tests/fixtures/system/pipe_grep_matches.txt",
    command: ["pipe", "grep"],
    critical: [
      "4 matches in 2F:",
      "[file] src/cmds/git/handler.rs (2):",
      "[file] src/cmds/system/handler.rs (2):",
    ],
  },
  {
    // RTK: system/wc_cmd.rs::format_single_line — `wc <file>` strips the path and
    // alignment padding to "{lines}L {words}W {bytes}B" (see rtkWcBehavior).
    name: "wc single file compacts to L/W/B counts",
    fixture: "tests/fixtures/system/wc_single_file.txt",
    command: ["wc", "src/main.ts"],
    critical: ["30L 96W 978B"],
    forbidden: [/src\/main\.ts/],
  },
  {
    // RTK: system/env_cmd.rs — groups interesting env vars, masks secrets, and
    // collapses PATH into a count + preview (see rtkEnvBehavior).
    name: "env groups variables and masks secrets",
    fixture: "tests/fixtures/system/env_full.txt",
    command: ["env"],
    critical: [
      "PATH Variables:",
      "Cloud/Services:",
      "AWS_REGION=us-east-1",
      "Total: 25 vars",
    ],
    forbidden: [/fixture_api_secret_supersecretvalue/, /wJalrXUtnFEMIbKbanana/],
  },
  {
    // RTK: system/json_cmd.rs::filter_json_compact — sorts object keys, truncates
    // long strings, and summarizes arrays (see rtkJsonBehavior).
    name: "json compacts a package response with sorted keys",
    fixture: "tests/fixtures/system/json_package_response.json",
    command: ["json", "package.json"],
    critical: ['name: "token-guard"', 'version: "0.1.0"', 'test: "vitest run"'],
  },
  {
    // RTK: system/log_cmd.rs::analyze_logs — deduplicates repeated log lines into a
    // "Log Summary" with error/warn/info counts and "[×N]" markers (see
    // rtkLogBehavior).
    name: "log deduplicates repeated lines into a summary",
    fixture: "tests/fixtures/system/app_repeated.log",
    command: ["log", "app.log"],
    critical: [
      "Log Summary",
      "[ERRORS]",
      "[×3] 2024-01-01 10:00:00 ERROR: Connection failed to /api/server",
    ],
  },
  {
    // tg-only handler: rtk has no terraform support. Strips state lock / refresh /
    // data-source read progress, the symbol legend, and the trailing -out note;
    // keeps the full resource action body and the plan summary line.
    name: "terraform plan keeps resource changes and plan summary",
    fixture: "tests/fixtures/terraform/plan_changes.txt",
    command: ["terraform", "plan"],
    critical: [
      "Plan: 1 to add, 1 to change, 1 to destroy.",
      "aws_instance.web will be created",
      "aws_s3_bucket.data will be updated in-place",
      "random_pet.name will be destroyed",
    ],
    forbidden: [
      /Refreshing state/,
      /Read complete after/,
      /Acquiring state lock/,
      /Resource actions are indicated/,
    ],
    rtkUnsupported: true,
  },
  {
    // tg-only handler: drops per-run progress and box borders, keeps failed runs,
    // the error diagnostic, and the final Failure! summary.
    name: "terraform test keeps failed run and assertion",
    fixture: "tests/fixtures/terraform/test_failed.txt",
    command: ["terraform", "test"],
    exitCode: 1,
    critical: [
      "Failure! 1 passed, 1 failed.",
      'run "rejects_invalid_cidr"',
      "Error: Invalid value for variable",
      "The cidr_block value must be valid CIDR notation",
    ],
    forbidden: [/in progress/, /tearing down/, /uses_default_cidr/],
    rtkUnsupported: true,
  },
  {
    // RTK: rust/runner.rs::run_err / ErrorStreamFilter — `err <cmd>` keeps error/
    // warning lines and their indented continuation blocks, dropping info noise.
    name: "err keeps error blocks and drops info noise",
    fixture: "tests/fixtures/system/err_build.txt",
    command: ["err", "npm", "run", "build"],
    exitCode: 1,
    critical: ["warning: deprecated option", "error: build failed", "src/app.ts:10"],
    forbidden: [/info: starting build/, /info: done/],
    rtkWrapper: { mode: "exec-cat", sub: ["err"] },
  },
  {
    // RTK: system/summary.rs — `summary <cmd>` emits a "[FAIL] Command:" header plus
    // a detected test digest, dropping the raw replay (e.g. Snapshots noise).
    name: "summary digests a test run instead of replaying lines",
    fixture: "tests/fixtures/system/summary_test_run.txt",
    command: ["summary", "npm", "test"],
    exitCode: 1,
    critical: ["[FAIL] Command: npm test", "Test Results:", "[ok] 12 passed", "FAIL src/b.test.ts"],
    forbidden: [/Snapshots: 0 total/],
    rtkWrapper: { mode: "exec-cat", sub: ["summary"] },
  },
  {
    // RTK: rust/runner.rs::run_test / extract_test_summary — `test <cmd>` extracts
    // failures + summary lines, dropping per-test "... ok" chatter.
    name: "test extracts cargo failures and summary",
    fixture: "tests/fixtures/system/test_cargo.txt",
    command: ["test", "cargo", "test"],
    exitCode: 1,
    critical: ["[FAIL] FAILURES:", "foo::test_b", "SUMMARY:", "test result: FAILED"],
    forbidden: [/running 3 tests/, /test foo::test_a \.\.\. ok/],
  },
  {
    // RTK: system/deps.rs — `deps` summarizes a package manifest by ecosystem,
    // dropping raw JSON keys like "scripts".
    name: "deps summarizes a package.json manifest",
    fixture: "tests/fixtures/system/deps_package.json",
    command: ["deps"],
    critical: ["Node.js (package.json):", "Dependencies (2):", "react (19.0.0)", "Dev (1):", "vitest (4.1.8)"],
    forbidden: [/"scripts"/],
    rtkWrapper: { mode: "dir-package", sub: ["deps"] },
  },
  {
    // RTK: system/local_llm.rs — `smart <file>` keeps the Summary payload and strips
    // the "System prompt:" framing.
    name: "smart keeps the summary payload without prompt boilerplate",
    fixture: "tests/fixtures/system/smart_summary.txt",
    command: ["smart", "src/main.rs"],
    critical: ["parser routes commands to handlers"],
    forbidden: [/System prompt/],
    // rtk `smart` is a code-structure analyzer (not a Summary passthrough), so the
    // numbers are not comparable — kept here to surface that by-design divergence.
    rtkWrapper: { mode: "file-arg", sub: ["smart"] },
  },
  {
    // RTK: main.rs Npx dispatch — `npx tsc` re-dispatches through the TypeScript
    // filter (the inner handler shapes the output).
    name: "npx tsc routes through the TypeScript filter",
    fixture: "tests/fixtures/js/tsc_many.txt",
    command: ["npx", "tsc", "--noEmit"],
    exitCode: 2,
    critical: ["TypeScript: 12 errors in 6 files", "L42: TS2322", "TS2339"],
    forbidden: [/Found 12 errors/],
  },
  {
    // RTK: cmds/dotnet/dotnet_cmd.rs — `dotnet test` keeps the failure summary and
    // strips restore/build boilerplate.
    name: "dotnet test keeps failures and strips restore boilerplate",
    fixture: "tests/fixtures/dotnet/dotnet_test.txt",
    command: ["dotnet", "test"],
    exitCode: 1,
    critical: ["PreventsDuplicateSubmit", "Failed: 1", "Expected false"],
    forbidden: [/Determining projects to restore/],
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
