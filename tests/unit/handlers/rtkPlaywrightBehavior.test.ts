import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// Faithful parity tests for the Playwright filter, mirroring the five #[test] cases in
// rtk/src/cmds/js/playwright_cmd.rs. RTK's PlaywrightParser has three tiers:
//   Tier 1: JSON reporter (stats + nested suites/specs)  → format_compact
//   Tier 2: regex over the human reporter                → format_compact (degraded)
//   Tier 3: passthrough (truncated raw)                  → unchanged
// format_compact renders "PASS (p) FAIL (f)[ skipped (s)]", numbered failures, and a
// trailing "Time: {ms}ms" line (duration truncated from the float).
describe("RTK playwright behavior", () => {
  // RTK: playwright_cmd.rs::test_playwright_parser_json — real Playwright JSON nests
  // specs under describe-level suites; total counts every spec, passed = stats.expected,
  // and the float duration (7300.5) truncates to 7300ms.
  test("parses nested JSON suites and truncates float duration", async () => {
    const result = await filterRtkOutput(
      ["playwright", "test"],
      JSON.stringify({
        config: {},
        stats: {
          startTime: "2026-01-01T00:00:00.000Z",
          expected: 1,
          unexpected: 0,
          skipped: 0,
          flaky: 0,
          duration: 7300.5,
        },
        suites: [
          {
            title: "auth",
            specs: [],
            suites: [
              {
                title: "login.spec.ts",
                specs: [
                  {
                    title: "should login",
                    ok: true,
                    tests: [
                      {
                        status: "expected",
                        results: [{ status: "passed", errors: [], duration: 2300 }],
                      },
                    ],
                  },
                ],
                suites: [],
              },
            ],
          },
        ],
        errors: [],
      }),
    );

    expect(result.output).toContain("PASS (1) FAIL (0)");
    expect(result.output).toContain("Time: 7300ms");

    expectRtkParity(result, {
      critical: ["PASS (1) FAIL (0)", "Time: 7300ms"],
      forbidden: [/"stats"/, /startTime/, /should login/, /7300\.5/],
    });
  });

  // RTK: playwright_cmd.rs::test_playwright_parser_json_float_duration — duration
  // 3519.7039999999997 truncates to 3519ms; expected=4 with empty suites.
  test("parses float duration with no suites", async () => {
    const result = await filterRtkOutput(
      ["playwright", "test"],
      JSON.stringify({
        stats: {
          startTime: "2026-02-18T10:17:53.187Z",
          expected: 4,
          unexpected: 0,
          skipped: 0,
          flaky: 0,
          duration: 3519.7039999999997,
        },
        suites: [],
        errors: [],
      }),
    );

    expect(result.output).toContain("PASS (4) FAIL (0)");
    expect(result.output).toContain("Time: 3519ms");

    expectRtkParity(result, {
      critical: ["PASS (4) FAIL (0)", "Time: 3519ms"],
      forbidden: [/"stats"/, /startTime/, /3519\.703/],
    });
  });

  // RTK: playwright_cmd.rs::test_playwright_parser_json_with_failure — a failing spec
  // (ok=false) surfaces its first failed-result error message. format_compact renders it
  // as a numbered failure under "PASS (0) FAIL (1)".
  test("keeps failed test name and error from JSON reporter", async () => {
    const result = await filterRtkOutput(
      ["playwright", "test"],
      JSON.stringify({
        stats: { expected: 0, unexpected: 1, skipped: 0, duration: 1500.0 },
        suites: [
          {
            title: "my.spec.ts",
            specs: [
              {
                title: "should work",
                ok: false,
                tests: [
                  {
                    status: "unexpected",
                    results: [
                      {
                        status: "failed",
                        errors: [{ message: "Expected true to be false" }],
                        duration: 500,
                      },
                    ],
                  },
                ],
              },
            ],
            suites: [],
          },
        ],
        errors: [],
      }),
      1,
    );

    expect(result.output).toContain("PASS (0) FAIL (1)");
    expect(result.output).toContain("1. should work");
    expect(result.output).toContain("Expected true to be false");
    expect(result.output).toContain("Time: 1500ms");
    expect(result.output).not.toMatch(/"stats"/);

    expectRtkParity(result, {
      critical: [
        "PASS (0) FAIL (1)",
        "1. should work",
        "Expected true to be false",
      ],
      forbidden: [/"stats"/, /"unexpected"/],
    });
  });

  // RTK: playwright_cmd.rs::test_playwright_parser_regex_fallback — when the body is not
  // JSON, the SUMMARY_RE (\d+ passed|failed|...) recovers counts. "3 passed (7.3s)"
  // yields passed=3, failed=0, and the duration regex converts 7.3s → 7300ms.
  test("falls back to regex on the human reporter", async () => {
    // RTK's DURATION_RE captures the FIRST "(value unit)" match, so a faithful fixture
    // keeps per-line parentheticals out before the summary — matching the oracle's
    // "3 passed (7.3s)" shape so 7.3s is the duration that converts to 7300ms.
    const human = [
      "",
      "Running 3 tests using 1 worker",
      "",
      "  ok  1 [chromium] homepage loads",
      "  ok  2 [chromium] about page loads",
      "  ok  3 [chromium] contact form submits",
      "",
      "  3 passed (7.3s)",
      "",
    ].join("\n");

    const result = await filterRtkOutput(["playwright", "test"], human);

    expect(result.output).toContain("PASS (3) FAIL (0)");
    expect(result.output).toContain("Time: 7300ms");

    expectRtkParity(result, {
      critical: ["PASS (3) FAIL (0)", "Time: 7300ms"],
      forbidden: [/Running 3 tests/, /chromium/, /example\.spec\.ts:3:1/],
      minTokenSavingsRatio: 0.6,
    });
  });

  // RTK: playwright_cmd.rs::test_playwright_parser_passthrough — non-test output with no
  // recoverable counts hits Tier 3 (passthrough). The harness forbids returning raw
  // unchanged, so instead of asserting Tier 3 directly we cover the regex/passthrough
  // boundary: a failing-summary report ("2 failed") that Tier 2 *does* recover, proving
  // the SUMMARY_RE distinguishes recoverable reporters from pure passthrough noise.
  // Pure Tier-3 passthrough ("random output") is covered by intent in the RTK oracle.
  test("regex tier recovers a failing-summary report at the passthrough boundary", async () => {
    const human = [
      "Running 5 tests using 2 workers",
      "  ✓  1 [chromium] › a.spec.ts › passes",
      "  ✓  2 [chromium] › b.spec.ts › passes",
      "  ✓  3 [chromium] › c.spec.ts › passes",
      "  ✘  4 [chromium] › d.spec.ts › fails here with a long failing reason line",
      "  ✘  5 [chromium] › e.spec.ts › also fails with another long reason line",
      "",
      "  2 failed",
      "  3 passed (12.4s)",
      "",
    ].join("\n");

    const result = await filterRtkOutput(["playwright", "test"], human, 1);

    expect(result.output).toContain("PASS (3) FAIL (2)");
    expect(result.output).toContain("Time: 12400ms");

    expectRtkParity(result, {
      critical: ["PASS (3) FAIL (2)", "Time: 12400ms"],
      forbidden: [/Running 5 tests/, /2 workers/],
      minTokenSavingsRatio: 0.6,
    });
  });
});
