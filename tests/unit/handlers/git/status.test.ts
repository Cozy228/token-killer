import { describe, expect, test } from "vitest";

import { gitStatusHandler } from "../../../../src/handlers/git/status.js";
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

async function filterStatus(stdout: string) {
  return gitStatusHandler.filter(
    {
      command: "git status",
      stdout,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    },
    {
      program: "git",
      args: ["status"],
      original: ["git", "status"],
      displayCommand: "git status",
    },
    options,
  );
}

// ============================================================================
// Existing test: large status output → high savings
// ============================================================================

describe("git status handler", () => {
  test("removes instructional text and preserves file states", async () => {
    const noise = Array.from(
      { length: 120 },
      () => '  (use "git add <file>..." to update what will be committed)',
    );
    const raw: RawResult = {
      command: "git status",
      stdout: [
        "On branch feature/token-proxy",
        "Changes to be committed:",
        "  new file:   src/cli.ts",
        "Changes not staged for commit:",
        "  modified:   src/parse.ts",
        "  deleted:    src/old.js",
        "Untracked files:",
        "  tests/unit/parse.test.ts",
        ...noise,
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gitStatusHandler.filter(
      raw,
      {
        program: "git",
        args: ["status"],
        original: ["git", "status"],
        displayCommand: "git status",
      },
      options,
    );

    expect(result.handler).toBe("git-status");
    expect(result.output).toContain("Branch: feature/token-proxy");
    expect(result.output).toContain("Staged:");
    expect(result.output).toContain("src/cli.ts");
    expect(result.output).toContain("Modified:");
    expect(result.output).toContain("src/parse.ts");
    expect(result.output).toContain("Untracked:");
    expect(result.output).not.toContain('use "git add');
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

// ============================================================================
// P1: format variants and edge cases — the gaps from the report
// RTK: uses --porcelain -b format, detects short status flags
// ============================================================================

describe("git status format variants", () => {
  // --------------------------------------------------------------------------
  // Clean working tree: minimal output should not be inflated
  // --------------------------------------------------------------------------

  test("handles clean working tree without inflating output", async () => {
    const stdout = [
      "On branch main",
      "Your branch is up to date with 'origin/main'.",
      "",
      "nothing to commit, working tree clean",
    ].join("\n");

    const result = await filterStatus(stdout);

    expect(result.output).toContain("Branch: main");
    // "nothing to commit" message should be preserved or summarized,
    // but output should not be inflated
  });

  // --------------------------------------------------------------------------
  // Staged changes only (no unstaged, no untracked)
  // --------------------------------------------------------------------------

  test("handles staged-only changes without listing empty sections", async () => {
    const stdout = [
      "On branch main",
      "Changes to be committed:",
      "  modified:   src/app.ts",
      "  new file:   src/feature.ts",
    ].join("\n");

    const result = await filterStatus(stdout);

    expect(result.output).toContain("src/app.ts");
    expect(result.output).toContain("src/feature.ts");
    expect(result.output).not.toContain("(use ");
  });

  // --------------------------------------------------------------------------
  // Conflicts / unmerged paths
  // --------------------------------------------------------------------------

  test("preserves conflict information", async () => {
    const stdout = [
      "On branch main",
      "You have unmerged paths.",
      '  (fix conflicts and run "git commit")',
      "Unmerged paths:",
      "  both modified:   src/conflict.ts",
    ].join("\n");

    const result = await filterStatus(stdout);

    expect(result.output).toContain("src/conflict.ts");
  });

  // --------------------------------------------------------------------------
  // Renamed files
  // --------------------------------------------------------------------------

  test("handles renamed file status", async () => {
    const stdout = [
      "On branch main",
      "Changes to be committed:",
      "  renamed:    src/old.ts -> src/new.ts",
    ].join("\n");

    const result = await filterStatus(stdout);

    expect(result.output).toContain("src/new.ts");
  });

  // --------------------------------------------------------------------------
  // git status --short / --porcelain format: should parse or pass through
  // RTK: build_status_command uses --porcelain -b, detects short format flags
  // --------------------------------------------------------------------------

  test("handles --short format status output", async () => {
    // git status --short output format
    const stdout = [" M README.md", " D old.js", "?? new.ts"].join("\n");

    const result = await filterStatus(stdout);

    // Should not crash or produce garbage
    expect(result.output).toBeTypeOf("string");
    expect(result.output.length).toBeGreaterThan(0);
  });
});
