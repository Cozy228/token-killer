import { describe, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK jest behavior", () => {
  test("uses RTK JavaScript test summary formatting for Jest JSON output", async () => {
    const result = await filterRtkOutput(
      ["jest", "--json"],
      JSON.stringify({
        numTotalTests: 3,
        numPassedTests: 2,
        numFailedTests: 1,
        testResults: [
          {
            name: "src/cart.test.ts",
            assertionResults: [
              {
                fullName: "Cart totals discounts",
                status: "failed",
                failureMessages: ["Expected total to be 42"],
              },
            ],
          },
        ],
      }),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "PASS (2) FAIL (1)",
        "Cart totals discounts",
        "Expected total to be 42",
      ],
      forbidden: [
        /numTotalTests/,
        /assertionResults/,
      ],
      exact: [
        "PASS (2) FAIL (1)",
        "",
        "1. Cart totals discounts",
        "   Expected total to be 42",
      ].join("\n"),
    });
  });
});
