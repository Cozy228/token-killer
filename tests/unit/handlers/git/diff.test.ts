import { describe, expect, test } from "vitest";

import { gitDiffHandler } from "../../../../src/handlers/git/diff.js";
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

async function filterDiff(stdout: string) {
  return gitDiffHandler.filter(
    {
      command: "git diff",
      stdout,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    },
    {
      program: "git",
      args: ["diff"],
      original: ["git", "diff"],
      displayCommand: "git diff",
    },
    options,
  );
}

// ============================================================================
// Existing test: large diff → high savings
// ============================================================================

describe("git diff handler", () => {
  test("summarizes files, insertions, deletions, and hunks", async () => {
    const repeated = Array.from(
      { length: 220 },
      (_, index) => `+  const noise${index} = ${index};`,
    );
    const raw: RawResult = {
      command: "git diff",
      stdout: [
        "diff --git a/src/order/submit.ts b/src/order/submit.ts",
        "index 1111111..2222222 100644",
        "--- a/src/order/submit.ts",
        "+++ b/src/order/submit.ts",
        "@@ -40,7 +40,9 @@ export async function submitOrder(payload) {",
        "-  return api.submit(payload)",
        "+  return api.submit({ ...payload, idempotencyKey })",
        ...repeated,
        "diff --git a/src/order/api.ts b/src/order/api.ts",
        "--- a/src/order/api.ts",
        "+++ b/src/order/api.ts",
        "@@ -10,6 +10,8 @@ export function postOrder(payload) {",
        "-  return post('/orders', payload)",
        "+  return post('/orders', payload, { retry: false })",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gitDiffHandler.filter(
      raw,
      {
        program: "git",
        args: ["diff"],
        original: ["git", "diff"],
        displayCommand: "git diff",
      },
      options,
    );

    expect(result.handler).toBe("git-diff");
    expect(result.output).toContain("Git Diff Summary");
    expect(result.output).toContain("src/order/submit.ts");
    expect(result.output).toContain("src/order/api.ts");
    expect(result.output).toContain("+");
    expect(result.output).toContain("-");
    expect(result.output).toContain(
      "@@ -40,7 +40,9 @@ export async function submitOrder(payload) {",
    );
    expect(result.output).not.toContain("noise219");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

// ============================================================================
// P2: changed line content preservation — the gap from the report
// RTK: compact_diff preserves changed lines within hunks
// ============================================================================

describe("git diff content preservation", () => {
  // --------------------------------------------------------------------------
  // Changed lines should be visible in output (not just hunk headers)
  // Report: tg only shows hunk @@ headers, discarding all line content
  // RTK: includes actual changed lines
  // --------------------------------------------------------------------------

  test("preserves actual changed lines within hunk context", async () => {
    const diff = [
      "diff --git a/src/order/submit.ts b/src/order/submit.ts",
      "index 1111111..2222222 100644",
      "--- a/src/order/submit.ts",
      "+++ b/src/order/submit.ts",
      "@@ -40,7 +40,9 @@ export async function submitOrder(payload) {",
      "-  return api.submit(payload)",
      "+  return api.submit({ ...payload, idempotencyKey })",
      "+  console.log('order submitted');",
    ].join("\n");

    const result = await filterDiff(diff);

    expect(result.output).toContain("Git Diff Summary");
    expect(result.output).toContain("src/order/submit.ts");
    expect(result.output).toContain("-  return api.submit(payload)");
    expect(result.output).toContain("+  return api.submit({ ...payload, idempotencyKey })");
    expect(result.output).toContain("+  console.log('order submitted');");
  });

  // --------------------------------------------------------------------------
  // Hunk headers should include function context (not just line numbers)
  // RTK: test_compact_diff_preserves_full_hunk_header_context
  // --------------------------------------------------------------------------

  test("preserves function context in hunk headers", async () => {
    const diff = [
      "diff --git a/src/login.ts b/src/login.ts",
      "--- a/src/login.ts",
      "+++ b/src/login.ts",
      "@@ -10,3 +10,4 @@ function authenticate(user: User): boolean {",
      " function authenticate(user: User): boolean {",
      "+  if (!user) return false;",
      "   return user.token !== undefined;",
      " }",
    ].join("\n");

    const result = await filterDiff(diff);

    // Hunk header with function context should appear
    expect(result.output).toContain("@@ -10,3 +10,4 @@ function authenticate");
  });

  // --------------------------------------------------------------------------
  // Multi-file diff: each file should be summarized
  // --------------------------------------------------------------------------

  test("summarizes each file in a multi-file diff", async () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,1 +1,2 @@",
      "+added line",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -5,3 +5,1 @@",
      "-removed line 1",
      "-removed line 2",
    ].join("\n");

    const result = await filterDiff(diff);

    expect(result.output).toContain("src/a.ts");
    expect(result.output).toContain("src/b.ts");
    expect(result.output).toContain("Files changed: 2");
  });

  // --------------------------------------------------------------------------
  // Empty diff (no changes)
  // --------------------------------------------------------------------------

  test("handles empty diff output gracefully", async () => {
    const result = await filterDiff("");

    expect(result.handler).toBe("git-diff");
    expect(result.output).toBeTypeOf("string");
  });

  test("reports true hidden change count for large hunks", async () => {
    const diff = [
      "diff --git a/src/large.ts b/src/large.ts",
      "--- a/src/large.ts",
      "+++ b/src/large.ts",
      "@@ -1,100 +1,100 @@",
      ...Array.from({ length: 100 }, (_, index) => `-old_value_${index}`),
      ...Array.from({ length: 100 }, (_, index) => `+new_value_${index}`),
    ].join("\n");

    const result = await filterDiff(diff);

    expect(result.output).toContain("src/large.ts");
    expect(result.output).toContain("+190 more");
    expect(result.output).not.toContain("+5 more");
  });

  test("does not truncate long changed lines", async () => {
    const longLine = "x".repeat(500);
    const diff = [
      "diff --git a/src/long.ts b/src/long.ts",
      "--- a/src/long.ts",
      "+++ b/src/long.ts",
      "@@ -1,1 +1,1 @@",
      `-${longLine}`,
      "+short",
    ].join("\n");

    const result = await filterDiff(diff);

    expect(result.output).toContain(longLine);
    expect(result.output).toContain("+short");
  });

  test("keeps changed lines from each file in a multi-file diff", async () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,1 +1,1 @@",
      "-export const a = 1;",
      "+export const a = 2;",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1,1 +1,1 @@",
      "-export const b = 1;",
      "+export const b = 2;",
    ].join("\n");

    const result = await filterDiff(diff);

    expect(result.output).toContain("-export const a = 1;");
    expect(result.output).toContain("+export const a = 2;");
    expect(result.output).toContain("-export const b = 1;");
    expect(result.output).toContain("+export const b = 2;");
  });
});
