import { describe, expect, test } from "vitest";

import { gitShowHandler } from "../../../../src/handlers/git/show.js";
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

describe("git show handler", () => {
  test("preserves commit metadata and changed files while truncating patch", async () => {
    const repeatedPatch = Array.from(
      { length: 180 },
      (_, index) => `+const generatedNoise${index} = ${index};`,
    );
    const raw: RawResult = {
      command: "git show abc123",
      stdout: [
        "commit abc123def4567890",
        "Author: Test User <test@example.com>",
        "Date:   Tue Jun 02 10:00:00 2026 +0800",
        "",
        "    retained commit subject",
        "",
        "diff --git a/src/order/submit.ts b/src/order/submit.ts",
        "--- a/src/order/submit.ts",
        "+++ b/src/order/submit.ts",
        "@@ -10,6 +10,8 @@ export function submitOrder(payload) {",
        "-  return api.submit(payload)",
        "+  return api.submit(payload, { retry: false })",
        ...repeatedPatch,
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gitShowHandler.filter(
      raw,
      {
        program: "git",
        args: ["show", "abc123"],
        original: ["git", "show", "abc123"],
        displayCommand: "git show abc123",
      },
      options,
    );

    expect(result.handler).toBe("git-show");
    expect(result.output).toContain("abc123def4567890");
    expect(result.output).toContain("Test User");
    expect(result.output).toContain("retained commit subject");
    expect(result.output).toContain("src/order/submit.ts");
    expect(result.output).toContain(
      "@@ -10,6 +10,8 @@ export function submitOrder(payload) {",
    );
    expect(result.output).not.toContain("generatedNoise179");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("git show format variants", () => {
  test("handles commit show with diff content", async () => {
    const raw: RawResult = {
      command: "git show abc123",
      stdout: [
        "commit abc123def456",
        "Author: Alice <alice@example.com>",
        "Date:   Mon Jun 01 12:00:00 2026 +0000",
        "",
        "    feat: add submit endpoint",
        "",
        "diff --git a/src/api.ts b/src/api.ts",
        "--- a/src/api.ts",
        "+++ b/src/api.ts",
        "@@ -1,3 +1,5 @@",
        "+import { submit } from './submit'; // new import",
        "-const old = 1;",
        "+const updated = 2;",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gitShowHandler.filter(
      raw,
      {
        program: "git",
        args: ["show", "abc123"],
        original: ["git", "show", "abc123"],
        displayCommand: "git show abc123",
      },
      options,
    );

    expect(result.handler).toBe("git-show");
    expect(result.output).toContain("abc123def456");
    expect(result.output).toContain("Alice");
    expect(result.output).toContain("src/api.ts");
    expect(result.output).toContain("Files changed:");
  });

  test("preserves subject line", async () => {
    const raw: RawResult = {
      command: "git show HEAD",
      stdout: [
        "commit def789abc",
        "Author: Bob <bob@example.com>",
        "Date:   Sun May 31 09:00:00 2026 +0000",
        "",
        "    fix: prevent race condition in submit handler",
        "",
        "diff --git a/src/submit.ts b/src/submit.ts",
        "--- a/src/submit.ts",
        "+++ b/src/submit.ts",
        "@@ -10,6 +10,7 @@",
        "+  await lock.acquire();",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gitShowHandler.filter(
      raw,
      {
        program: "git",
        args: ["show", "HEAD"],
        original: ["git", "show", "HEAD"],
        displayCommand: "git show HEAD",
      },
      options,
    );

    expect(result.handler).toBe("git-show");
    expect(result.output).toContain(
      "fix: prevent race condition in submit handler",
    );
  });

  test("handles empty show output", async () => {
    const raw: RawResult = {
      command: "git show nonexistent",
      stdout: "",
      stderr: "",
      exitCode: 128,
      durationMs: 1,
    };

    const result = await gitShowHandler.filter(
      raw,
      {
        program: "git",
        args: ["show", "nonexistent"],
        original: ["git", "show", "nonexistent"],
        displayCommand: "git show nonexistent",
      },
      options,
    );

    expect(result.handler).toBe("git-show");
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("Git Show");
  });

  test("handles stderr-only output", async () => {
    const raw: RawResult = {
      command: "git show bad-ref",
      stdout: "",
      stderr: "fatal: bad revision 'bad-ref'",
      exitCode: 128,
      durationMs: 1,
    };

    const result = await gitShowHandler.filter(
      raw,
      {
        program: "git",
        args: ["show", "bad-ref"],
        original: ["git", "show", "bad-ref"],
        displayCommand: "git show bad-ref",
      },
      options,
    );

    expect(result.handler).toBe("git-show");
    expect(typeof result.output).toBe("string");
    expect(result.exitCode).toBe(128);
  });
});
