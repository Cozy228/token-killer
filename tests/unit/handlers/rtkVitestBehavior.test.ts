import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK vitest behavior", () => {
  test("parses JSON summary counts instead of dumping reporter JSON", async () => {
    const result = await filterRtkOutput(
      ["vitest", "run"],
      JSON.stringify({
        numTotalTests: 13,
        numPassedTests: 12,
        numFailedTests: 1,
        testResults: [
          {
            name: "src/order/submit.test.ts",
            assertionResults: [
              {
                fullName: "Order submit prevents duplicate submit",
                status: "failed",
                failureMessages: ["AssertionError: expected false to be true"],
              },
            ],
          },
        ],
      }),
      1,
    );

    expect(result.output).toContain("PASS (12) FAIL (1)");
    expect(result.output).toContain("Order submit prevents duplicate submit");
    expect(result.output).toContain("12");
    expect(result.output).toContain("1");
    expect(result.output).not.toMatch(/numTotalTests/);

    expectRtkParity(result, {
      critical: [
        "PASS (12) FAIL (1)",
        "Order submit prevents duplicate submit",
        "12",
        "1",
      ],
      forbidden: [
        /numTotalTests/,
      ],
      exact: [
        "PASS (12) FAIL (1)",
        "",
        "1. Order submit prevents duplicate submit",
        "   AssertionError: expected false to be true",
      ].join("\n"),
    });
  });
});
