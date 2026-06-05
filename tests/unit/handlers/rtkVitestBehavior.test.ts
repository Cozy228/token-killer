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

  // RTK: rtk/src/cmds/js/vitest_cmd.rs::test_vitest_parser_regex_fallback
  test("falls back to the human reporter counts when JSON is unavailable", async () => {
    const result = await filterRtkOutput(
      ["vitest", "run"],
      ["", " Test Files  2 passed (2)", "      Tests  13 passed (13)", "   Duration  450ms", ""].join(
        "\n",
      ),
      0,
    );

    expect(result.output).toContain("PASS (13) FAIL (0)");
    expect(result.output).toContain("Time: 450ms");
    expect(result.output).not.toMatch(/Test Files/);
  });

  // RTK: rtk/src/cmds/js/vitest_cmd.rs::test_vitest_parser_with_pnpm_prefix
  test("extracts JSON past a pnpm workspace banner", async () => {
    const result = await filterRtkOutput(
      ["pnpm", "vitest", "run"],
      [
        "Scope: all 6 workspace projects",
        " WARN  deprecated inflight@1.0.6: This module is not supported",
        "",
        '{"numTotalTests": 13, "numPassedTests": 13, "numFailedTests": 0, "numPendingTests": 0, "testResults": [], "startTime": 1000}',
      ].join("\n"),
      0,
    );

    expect(result.output).toContain("PASS (13) FAIL (0)");
    expect(result.output).not.toMatch(/numTotalTests/);
    expect(result.output).not.toMatch(/Scope:/);
  });

  // RTK: rtk/src/cmds/js/vitest_cmd.rs::test_vitest_parser_with_dotenv_prefix
  test("extracts JSON past a dotenv banner and keeps failure counts", async () => {
    const result = await filterRtkOutput(
      ["vitest", "run"],
      [
        "[dotenv] Loading environment variables from .env",
        "[dotenv] Injected 5 variables",
        "",
        '{"numTotalTests": 5, "numPassedTests": 4, "numFailedTests": 1, "numPendingTests": 0, "testResults": [], "startTime": 2000}',
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("PASS (4) FAIL (1)");
    expect(result.output).not.toMatch(/dotenv/);
  });

  // RTK: rtk/src/cmds/js/vitest_cmd.rs::test_vitest_parser_with_nested_json
  test("extracts a nested JSON object carrying assertion results", async () => {
    const result = await filterRtkOutput(
      ["vitest", "run"],
      [
        "prefix text",
        '{"numTotalTests": 2, "numPassedTests": 2, "numFailedTests": 0, "numPendingTests": 0, "testResults": [{"name": "test.js", "assertionResults": [{"fullName": "nested test", "status": "passed", "failureMessages": []}]}], "startTime": 1000}',
      ].join("\n"),
      0,
    );

    expect(result.output).toContain("PASS (2) FAIL (0)");
    expect(result.output).not.toMatch(/prefix text/);
  });
});
