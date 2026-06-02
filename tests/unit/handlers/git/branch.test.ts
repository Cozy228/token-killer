import { describe, expect, test } from "vitest";

import { expectCompactPassthrough } from "../../../helpers/assertions.js";
import { gitBranchHandler } from "../../../../src/handlers/git/branch.js";
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

async function filterBranch(stdout: string) {
  return gitBranchHandler.filter(
    {
      command: "git branch",
      stdout,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    },
    {
      program: "git",
      args: ["branch"],
      original: ["git", "branch"],
      displayCommand: "git branch",
    },
    options,
  );
}

// ============================================================================
// Existing test: many branches → high savings
// ============================================================================

describe("git branch handler", () => {
  test("keeps current and nearby branches while dropping long list noise", async () => {
    const branches = [
      "  codex/old",
      "* codex/token-proxy",
      "  main",
      "  release/2026-06",
      ...Array.from({ length: 220 }, (_, index) => `  stale/branch-${index}`),
    ].join("\n");
    const raw: RawResult = {
      command: "git branch",
      stdout: branches,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gitBranchHandler.filter(
      raw,
      {
        program: "git",
        args: ["branch"],
        original: ["git", "branch"],
        displayCommand: "git branch",
      },
      options,
    );

    expect(result.handler).toBe("git-branch");
    expect(result.output).toContain("Current: codex/token-proxy");
    expect(result.output).toContain("main");
    expect(result.output).toContain("release/2026-06");
    expect(result.output).toContain("Hidden:");
    expect(result.output).not.toContain("stale/branch-219");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

// ============================================================================
// P1: passthrough behavior for few branches — the bug from the report
// ============================================================================

describe("git branch passthrough for small output", () => {
  // --------------------------------------------------------------------------
  // Few branches: should NOT add header overhead
  // Report bug: "Current: ...\nBranches: 2, showing 2" inflates 36→96 chars
  // RTK approach: pass through unchanged when already compact
  // --------------------------------------------------------------------------

  test("passes through small branch list without header overhead", async () => {
    const stdout = ["* codex/token-guard-node-cli", "  main"].join("\n");

    const result = await filterBranch(stdout);

    expectCompactPassthrough(result);
    expect(result.output).toContain("codex/token-guard-node-cli");
    expect(result.output).toContain("main");
  });

  test("preserves asterisk marker for current branch", async () => {
    const stdout = ["* codex/feature-login", "  main"].join("\n");

    const result = await filterBranch(stdout);

    expect(result.output).toContain("* codex/feature-login");
    expect(result.output).toContain("main");
    expectCompactPassthrough(result);
  });

  // --------------------------------------------------------------------------
  // Single branch (detached HEAD or fresh repo)
  // --------------------------------------------------------------------------

  test("handles single branch without inflating output", async () => {
    const stdout = "* main";
    const result = await filterBranch(stdout);

    expect(result.output).toContain("main");
    expectCompactPassthrough(result);
  });
});

describe("git branch small-output boundaries", () => {
  test("keeps all branch names when five or fewer nearby branches", async () => {
    const stdout = [
      "* codex/active",
      "  main",
      "  codex/support",
      "  release/2026-06",
      "  codex/docs",
    ].join("\n");

    const result = await filterBranch(stdout);

    expect(result.output).toContain("codex/active");
    expect(result.output).toContain("main");
    expect(result.output).toContain("codex/support");
    expect(result.output).toContain("release/2026-06");
    expect(result.output).toContain("codex/docs");
    expect(result.output).not.toContain("Hidden:");
  });

  test("truncates when many branches exceed the nearby summary window", async () => {
    const branches = [
      "* main",
      "  develop",
      "  codex/active",
      "  release/v1",
      ...Array.from({ length: 50 }, (_, i) => `  feature/ticket-${1000 + i}`),
    ].join("\n");

    const result = await filterBranch(branches);

    expect(result.output).toContain("main");
    expect(result.output).toContain("codex/active");
    expect(result.output).toContain("Hidden:");
    expect(result.output).not.toContain("feature/ticket-1049");
  });

  // --------------------------------------------------------------------------
  // Many branches: headers and truncation are justified (existing behavior)
  // --------------------------------------------------------------------------

  test("adds headers and truncation for many branches", async () => {
    const branches = [
      "* main",
      "  develop",
      "  codex/active",
      "  release/v1",
      ...Array.from({ length: 50 }, (_, i) => `  feature/ticket-${1000 + i}`),
    ].join("\n");

    const result = await filterBranch(branches);

    expect(result.output).toContain("main");
    expect(result.output).toContain("codex/active");
    // For many branches, truncation is expected
    expect(result.savingsPct).toBeGreaterThanOrEqual(50);
  });
});
