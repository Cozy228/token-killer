import { describe, expect, test } from "vitest";

import { jsTestHandler } from "../../../../src/handlers/js/test.js";
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

describe("js test handler", () => {
  test("keeps failed tests and removes passing output", async () => {
    const raw: RawResult = {
      command: "npm test",
      stdout: [
        ...Array.from({ length: 420 }, (_, index) => `✓ src/noise-${index}.test.ts > passes ${index}`),
        "FAIL  src/order/submit.test.ts > prevents duplicate submit",
        "AssertionError: expected \"api.submit\" to be called 1 time, got 2",
        " ❯ src/order/submit.test.ts:42:15",
        "Test Files  1 failed | 24 passed (25)",
        "Tests  3 failed | 215 passed (218)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      { program: "npm", args: ["test"], original: ["npm", "test"], displayCommand: "npm test" },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("JS tests failed");
    expect(result.output).toContain("src/order/submit.test.ts > prevents duplicate submit");
    expect(result.output).toContain("expected \"api.submit\"");
    expect(result.output).toContain("src/order/submit.test.ts:42:15");
    expect(result.output).not.toContain("noise-419");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
