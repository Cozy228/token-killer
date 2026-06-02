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
    const repeatedPatch = Array.from({ length: 180 }, (_, index) => `+const generatedNoise${index} = ${index};`);
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
      { program: "git", args: ["show", "abc123"], original: ["git", "show", "abc123"], displayCommand: "git show abc123" },
      options,
    );

    expect(result.handler).toBe("git-show");
    expect(result.output).toContain("abc123def4567890");
    expect(result.output).toContain("Test User");
    expect(result.output).toContain("retained commit subject");
    expect(result.output).toContain("src/order/submit.ts");
    expect(result.output).toContain("@@ -10,6 +10,8 @@ export function submitOrder(payload) {");
    expect(result.output).not.toContain("generatedNoise179");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
