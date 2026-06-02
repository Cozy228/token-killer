import { describe, expect, test } from "vitest";

import { expectCompactPassthrough } from "../../../helpers/assertions.js";
import { gitLogHandler } from "../../../../src/handlers/git/log.js";
import type { RawResult, TgOptions } from "../../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

async function filterLog(stdout: string, args: string[] = ["log"]) {
  return gitLogHandler.filter(
    {
      command: `git ${args.join(" ")}`,
      stdout,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    },
    {
      program: "git",
      args,
      original: ["git", ...args],
      displayCommand: `git ${args.join(" ")}`,
    },
    options,
  );
}

// ============================================================================
// Existing test: large noisy log → high savings
// ============================================================================

describe("git log handler", () => {
  test("keeps compact commit list and drops stat noise", async () => {
    const commits = Array.from({ length: 45 }, (_, index) =>
      [
        `commit ${String(index).padStart(40, "a")}`,
        `Author: Test User ${index} <test${index}@example.com>`,
        `Date:   Tue Jun ${String((index % 28) + 1).padStart(2, "0")} 10:00:00 2026 +0800`,
        "",
        `    retained subject ${index}`,
        "",
        ` src/file-${index}.ts | ${index + 1} ++++++++++----------`,
        " 1 file changed, 10 insertions(+), 8 deletions(-)",
        "",
      ].join("\n"),
    ).join("\n");
    const raw: RawResult = {
      command: "git log --stat",
      stdout: commits,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gitLogHandler.filter(
      raw,
      {
        program: "git",
        args: ["log", "--stat"],
        original: ["git", "log", "--stat"],
        displayCommand: "git log --stat",
      },
      options,
    );

    expect(result.handler).toBe("git-log");
    expect(result.output).toContain("Git Log");
    expect(result.output).toContain("retained subject 0");
    expect(result.output).toContain("Test User 0");
    expect(result.output).toContain("2026");
    expect(result.output).not.toContain("++++++++++----------");
    expect(result.output).toContain("showing 20");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

// ============================================================================
// P1: passthrough behavior for short logs — the bug from the report
// ============================================================================

describe("git log passthrough and format variants", () => {
  // --------------------------------------------------------------------------
  // --oneline with few commits: should NOT add header overhead
  // Report bug: "Git Log\nCommits: 2" header inflates 75→94 chars
  // RTK approach: pass through unchanged when already compact
  // --------------------------------------------------------------------------

  test("passes through short --oneline output without header overhead", async () => {
    const stdout = [
      "0a15557 docs: add token guard product documentation",
      "368d1aa Initial commit",
    ].join("\n");

    const result = await filterLog(stdout, ["log", "--oneline", "-5"]);

    expectCompactPassthrough(result);
    expect(result.output).toContain("0a15557");
    expect(result.output).toContain("368d1aa");
  });

  test("preserves ref information in --oneline format", async () => {
    const stdout = [
      "0a15557 (HEAD -> main, origin/main) feat: add login",
      "368d1aa (tag: v0.1.0) Initial commit",
    ].join("\n");

    const result = await filterLog(stdout, ["log", "--oneline", "-2"]);

    expect(result.output).toContain("0a15557");
    expect(result.output).toContain("368d1aa");
    expectCompactPassthrough(result, 30);
  });

  // --------------------------------------------------------------------------
  // Single commit: even more likely to trigger header overhead
  // --------------------------------------------------------------------------

  test("handles single commit without inflating output", async () => {
    const stdout = "0a15557 feat: add login";
    const result = await filterLog(stdout, ["log", "--oneline", "-1"]);

    expect(result.output).toContain("0a15557");
    expectCompactPassthrough(result);
  });

  test("passes through five --oneline commits without header overhead", async () => {
    const stdout = Array.from(
      { length: 5 },
      (_, index) => `${String(index + 1).padStart(7, "a")} retained subject ${index}`,
    ).join("\n");

    const result = await filterLog(stdout, ["log", "--oneline", "-5"]);

    expectCompactPassthrough(result);
    for (let index = 0; index < 5; index += 1) {
      expect(result.output).toContain(`retained subject ${index}`);
    }
    expect(result.output).not.toContain("Git Log:");
  });

  test("adds structure once six --oneline commits exceed the passthrough limit", async () => {
    const stdout = Array.from(
      { length: 6 },
      (_, index) => `${String(index + 1).padStart(7, "b")} retained subject ${index}`,
    ).join("\n");

    const result = await filterLog(stdout, ["log", "--oneline", "-6"]);

    expect(result.output).toContain("retained subject 0");
    expect(result.output).toMatch(/Git Log|Commits: 6/);
  });

  // --------------------------------------------------------------------------
  // Large log: headers are justified (existing behavior preserved)
  // --------------------------------------------------------------------------

  test("adds headers for large log output where structure is helpful", async () => {
    const commits = Array.from({ length: 30 }, (_, i) =>
      [
        `commit ${String(i).padStart(40, "a")}`,
        `Author: User ${i} <user${i}@test.com>`,
        `Date:   Mon Jan ${String(i + 1).padStart(2, "0")} 10:00:00 2026 +0800`,
        "",
        `    feat: change ${i}`,
        "",
        ` file-${i}.ts | 5 +++++`,
        " 1 file changed, 5 insertions(+)",
        "",
      ].join("\n"),
    ).join("\n");

    const result = await filterLog(commits, ["log", "--stat"]);

    // For large logs, headers and truncation are appropriate
    expect(result.savingsPct).toBeGreaterThanOrEqual(60);
    expect(result.output).toContain("feat: change");
  });

  // --------------------------------------------------------------------------
  // Empty log output (no commits)
  // --------------------------------------------------------------------------

  test("handles empty git log output gracefully", async () => {
    const result = await filterLog("", ["log"]);

    expect(result.handler).toBe("git-log");
    expect(result.output).toBeTypeOf("string");
  });
});
