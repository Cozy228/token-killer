import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK playwright behavior", () => {
  test("parses JSON reporter output and keeps failed test details", async () => {
    const result = await filterRtkOutput(
      ["playwright", "test"],
      JSON.stringify({
        stats: { expected: 0, unexpected: 1, skipped: 0 },
        suites: [{ specs: [{ title: "should work", tests: [{ results: [{ status: "unexpected", errors: [{ message: "Expected true to be false" }] }] }] }] }],
        errors: [],
      }),
      1,
    );

    expect(result.output).toContain("failed");
    expect(result.output).toContain("should work");
    expect(result.output).toContain("Expected true to be false");
    expect(result.output).not.toMatch(/"stats"/);

    expectRtkParity(result, {
      critical: [
        "failed",
        "should work",
        "Expected true to be false",
      ],
      forbidden: [
        /"stats"/,
      ],
      maxOutputChars: 140,
    });
  });
});
