import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { formatStats } from "../../../src/core/stats.js";
import { handlers } from "../../../src/handlers/index.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../../src/types.js";

type Case = {
  command: ParsedCommand;
  raw: RawResult;
  critical: string[];
};

type EdgeCase = {
  raw: RawResult;
  critical: string[];
};

function baseOptions(cwd: string, saveRaw: TgOptions["saveRaw"]): TgOptions {
  return {
    raw: false,
    stats: false,
    verbose: false,
    maxLines: 120,
    maxChars: 12000,
    saveRaw,
    cwd,
  };
}

const cases: Record<string, Case> = {
  "read-like": {
    command: { program: "cat", args: ["src/a.ts"], original: ["cat", "src/a.ts"], displayCommand: "cat src/a.ts" },
    raw: { command: "cat src/a.ts", stdout: "export function kept() {}\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["export function kept"],
  },
  "list-like": {
    command: { program: "find", args: ["."], original: ["find", "."], displayCommand: "find ." },
    raw: { command: "find .", stdout: "./src/a.ts\n./node_modules/pkg/index.js\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["src/"],
  },
  "search-like": {
    command: { program: "rg", args: ["kept", "src"], original: ["rg", "kept", "src"], displayCommand: "rg kept src" },
    raw: { command: "rg kept src", stdout: "src/a.ts:1:const kept = true;\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["Search: kept", "src/a.ts", "const kept = true"],
  },
  "git-status": {
    command: { program: "git", args: ["status"], original: ["git", "status"], displayCommand: "git status" },
    raw: { command: "git status", stdout: "On branch main\nUntracked files:\n  src/a.ts\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["Branch: main", "src/a.ts"],
  },
  "git-diff": {
    command: { program: "git", args: ["diff"], original: ["git", "diff"], displayCommand: "git diff" },
    raw: { command: "git diff", stdout: "diff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["Git Diff Summary", "src/a.ts", "@@ -1 +1 @@"],
  },
  "git-log": {
    command: { program: "git", args: ["log"], original: ["git", "log"], displayCommand: "git log" },
    raw: { command: "git log", stdout: "commit abcdef123456\nAuthor: A <a@example.com>\nDate: Tue Jun 02 2026\n\n    kept subject\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["abcdef123456", "kept subject"],
  },
  "git-show": {
    command: { program: "git", args: ["show"], original: ["git", "show"], displayCommand: "git show" },
    raw: { command: "git show", stdout: "commit abcdef\nAuthor: A <a@example.com>\nDate: Tue Jun 02 2026\n\n    kept subject\n\ndiff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["abcdef", "kept subject", "src/a.ts"],
  },
  "git-branch": {
    command: { program: "git", args: ["branch"], original: ["git", "branch"], displayCommand: "git branch" },
    raw: { command: "git branch", stdout: "* main\n  codex/test\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["* main", "codex/test"],
  },
  "git-add": {
    command: { program: "git", args: ["add", "."], original: ["git", "add", "."], displayCommand: "git add ." },
    raw: { command: "git add .", stdout: " 1 file changed, 5 insertions(+)\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["ok 1 file changed"],
  },
  "git-commit": {
    command: { program: "git", args: ["commit", "-m", "kept subject"], original: ["git", "commit", "-m", "kept subject"], displayCommand: "git commit -m kept subject" },
    raw: { command: "git commit -m kept subject", stdout: "[main abc1234] kept subject\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["ok abc1234", "kept subject"],
  },
  "git-push": {
    command: { program: "git", args: ["push"], original: ["git", "push"], displayCommand: "git push" },
    raw: { command: "git push", stdout: "To https://github.com/foo/bar.git\n   abc1234..def5678  feat/a -> feat/a\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["feat/a", "ok feat/a"],
  },
  "git-pull": {
    command: { program: "git", args: ["pull"], original: ["git", "pull"], displayCommand: "git pull" },
    raw: { command: "git pull", stdout: "Already up to date.\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["ok (up-to-date)"],
  },
  "git-fetch": {
    command: { program: "git", args: ["fetch"], original: ["git", "fetch"], displayCommand: "git fetch" },
    raw: { command: "git fetch", stdout: "From github.com:foo/bar\n * [new branch] feature -> origin/feature\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["ok fetched", "feature"],
  },
  "git-stash": {
    command: { program: "git", args: ["stash"], original: ["git", "stash"], displayCommand: "git stash" },
    raw: { command: "git stash", stdout: "Saved working directory and index state WIP on main: abc1234 fix\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["ok stashed", "abc1234 fix"],
  },
  "git-worktree": {
    command: { program: "git", args: ["worktree", "list"], original: ["git", "worktree", "list"], displayCommand: "git worktree list" },
    raw: { command: "git worktree list", stdout: "/repo abc1234 [main]\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["abc1234", "[main]"],
  },
  gh: {
    command: { program: "gh", args: ["pr", "list"], original: ["gh", "pr", "list"], displayCommand: "gh pr list" },
    raw: { command: "gh pr list", stdout: '[{"number":42,"title":"kept pr","state":"OPEN","headRefName":"codex/test"}]\n', stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["#42", "kept pr", "codex/test"],
  },
  glab: {
    command: { program: "glab", args: ["mr", "list"], original: ["glab", "mr", "list"], displayCommand: "glab mr list" },
    raw: { command: "glab mr list", stdout: '[{"iid":42,"title":"kept mr","state":"opened","source_branch":"codex/test"}]\n', stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["!42", "kept mr", "codex/test"],
  },
  pytest: {
    command: { program: "pytest", args: [], original: ["pytest"], displayCommand: "pytest" },
    raw: { command: "pytest", stdout: "FAILED tests/a.py::test_kept - AssertionError\n1 failed in 1s\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["tests/a.py::test_kept", "AssertionError"],
  },
  ruff: {
    command: { program: "ruff", args: ["check", "."], original: ["ruff", "check", "."], displayCommand: "ruff check ." },
    raw: { command: "ruff check .", stdout: "src/a.py:1:1: F401 unused import\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["F401", "src/a.py:1:1"],
  },
  mypy: {
    command: { program: "mypy", args: ["."], original: ["mypy", "."], displayCommand: "mypy ." },
    raw: { command: "mypy .", stdout: "src/a.py:1: error: kept message  [arg-type]\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["arg-type", "src/a.py:1", "kept message"],
  },
  pip: {
    command: { program: "pip", args: ["list"], original: ["pip", "list"], displayCommand: "pip list" },
    raw: { command: "pip list", stdout: "Package Version\nkept 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
    critical: ["Packages:", "kept"],
  },
  "js-test": {
    command: { program: "npm", args: ["test"], original: ["npm", "test"], displayCommand: "npm test" },
    raw: { command: "npm test", stdout: "FAIL src/a.test.ts > kept\nAssertionError: expected 1\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["src/a.test.ts > kept", "AssertionError"],
  },
  eslint: {
    command: { program: "eslint", args: ["."], original: ["eslint", "."], displayCommand: "eslint ." },
    raw: { command: "eslint .", stdout: "src/a.ts\n  1:1  error  kept message  no-unused-vars\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["src/a.ts:1:1", "no-unused-vars", "kept message"],
  },
  tsc: {
    command: { program: "tsc", args: ["--noEmit"], original: ["tsc", "--noEmit"], displayCommand: "tsc --noEmit" },
    raw: { command: "tsc --noEmit", stdout: "src/a.ts(1,1): error TS2322: kept message\n", stderr: "", exitCode: 2, durationMs: 1 },
    critical: ["TS2322", "src/a.ts:1:1", "kept message"],
  },
  "package-list": {
    command: { program: "npm", args: ["list"], original: ["npm", "list"], displayCommand: "npm list" },
    raw: { command: "npm list", stdout: "project@1.0.0\n├── kept@1.0.0 invalid\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["Dependencies:", "kept@1.0.0", "invalid"],
  },
  maven: {
    command: { program: "mvn", args: ["test"], original: ["mvn", "test"], displayCommand: "mvn test" },
    raw: { command: "mvn test", stdout: "[ERROR] kept failure\n[ERROR] Tests run: 1, Failures: 1\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["kept failure", "Tests run: 1"],
  },
  gradle: {
    command: { program: "./gradlew", args: ["test"], original: ["./gradlew", "test"], displayCommand: "./gradlew test" },
    raw: { command: "./gradlew test", stdout: "> Task :test FAILED\nkept assertion expected 1\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: [":test FAILED", "kept assertion"],
  },
  javac: {
    command: { program: "javac", args: ["App.java"], original: ["javac", "App.java"], displayCommand: "javac App.java" },
    raw: { command: "javac App.java", stdout: "", stderr: "src/App.java:1: error: kept message\n  symbol: keptSymbol\n", exitCode: 1, durationMs: 1 },
    critical: ["src/App.java:1", "kept message", "keptSymbol"],
  },
  generic: {
    command: { program: "custom", args: [], original: ["custom"], displayCommand: "custom" },
    raw: { command: "custom", stdout: "ERROR kept generic\n", stderr: "", exitCode: 1, durationMs: 1 },
    critical: ["ERROR kept generic"],
  },
};

const edgeCases: Record<string, EdgeCase> = Object.fromEntries(
  Object.entries(cases).map(([name, fixture]) => [
    name,
    {
      raw: {
        command: fixture.raw.command,
        stdout: "",
        stderr: "",
        exitCode: fixture.raw.exitCode === 0 ? 0 : 1,
        durationMs: 1,
      },
      critical:
        name === "search-like"
          ? ["0 matches"]
          : name === "git-status"
            ? ["Branch:"]
            : name === "git-log"
              ? ["Git Log"]
              : name === "git-show"
                ? ["Git Show"]
                : name === "git-branch"
                  ? ["Current:"]
                  : name === "pytest"
                    ? ["Pytest"]
                    : name === "tsc"
                      ? ["TypeScript"]
                      : name === "mypy"
                        ? ["Mypy"]
                        : name === "ruff"
                          ? ["Ruff"]
                          : name === "pip"
                            ? ["Packages:"]
                            : name === "js-test"
                              ? ["JS tests"]
                              : name === "eslint"
                                ? ["ESLint"]
                                : name === "package-list"
                                  ? ["Dependencies:"]
                                  : name === "maven"
                                    ? ["Maven"]
                                    : name === "gradle"
                                      ? ["Gradle"]
                                      : name === "javac"
                                        ? ["Javac"]
                                        : [""],
    },
  ]),
) as Record<string, EdgeCase>;

describe("handler contracts", () => {
  test("every registered handler has a contract fixture", () => {
    expect(Object.keys(cases).sort()).toEqual(handlers.map((handler) => handler.name).sort());
  });

  test.each(handlers.map((handler) => [handler.name, handler] as const))(
    "%s preserves critical content from small concise output",
    async (name: string, handler: CommandHandler) => {
      const fixture = cases[name];
      const dir = await mkdtemp(path.join(tmpdir(), `tg-small-${name}-`));
      try {
        const result = await handler.filter(fixture.raw, fixture.command, baseOptions(dir, false));

        expect(result.rawChars).toBeLessThan(2000);
        for (const value of fixture.critical) {
          expect(result.output).toContain(value);
        }
        expect(result.output).not.toContain("## Token Savings");
        expect(formatStats(result)).toContain("## Token Savings");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test.each(handlers.map((handler) => [handler.name, handler] as const))(
    "%s preserves exit code and can force-save raw output",
    async (name: string, handler: CommandHandler) => {
      const fixture = cases[name];
      expect(fixture, `missing fixture for ${name}`).toBeDefined();
      const dir = await mkdtemp(path.join(tmpdir(), `tg-${name}-`));
      try {
        const result = await handler.filter(fixture.raw, fixture.command, baseOptions(dir, true));

        expect(result.handler).toBe(name);
        expect(result.exitCode).toBe(fixture.raw.exitCode);
        expect(result.rawChars).toBe(`${fixture.raw.stdout}${fixture.raw.stderr}`.length);
        expect(result.rawTokens).toBeGreaterThanOrEqual(0);
        expect(result.outputTokens).toBeGreaterThanOrEqual(0);
        expect(result.savedTokens).toBeGreaterThanOrEqual(0);
        expect(result.rawOutputPath).toBeDefined();

        const rawPath = path.join(dir, result.rawOutputPath!);
        const rawLog = await readFile(rawPath, "utf8");
        expect(rawLog).toContain(`Command: ${fixture.raw.command}`);
        expect(rawLog).toContain(`Exit Code: ${fixture.raw.exitCode}`);
        expect(rawLog).toContain("--- STDOUT ---");
        expect(rawLog).toContain("--- STDERR ---");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test.each(handlers.map((handler) => [handler.name, handler] as const))(
    "%s respects --no-save-raw",
    async (name: string, handler: CommandHandler) => {
      const fixture = cases[name];
      const dir = await mkdtemp(path.join(tmpdir(), `tg-nosave-${name}-`));
      try {
        const result = await handler.filter(fixture.raw, fixture.command, baseOptions(dir, false));

        expect(result.rawOutputPath).toBeUndefined();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test.each(handlers.map((handler) => [handler.name, handler] as const))(
    "%s handles empty edge output without throwing",
    async (name: string, handler: CommandHandler) => {
      const fixture = cases[name];
      const edge = edgeCases[name];
      const dir = await mkdtemp(path.join(tmpdir(), `tg-edge-${name}-`));
      try {
        const result = await handler.filter(edge.raw, fixture.command, baseOptions(dir, false));

        expect(result.handler).toBe(name);
        expect(result.exitCode).toBe(edge.raw.exitCode);
        expect(result.output).toBeTypeOf("string");
        for (const value of edge.critical) {
          expect(result.output).toContain(value);
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
