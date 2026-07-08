import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

describe("RTK pytest behavior", () => {
  // RTK: python/pytest_cmd.rs::test_filter_pytest_with_failures — keep the summary
  // counts and failure detail, strip the session banner + per-test progress.
  // Fixture-backed (pytest_failed.txt, a realistic full pytest run).
  test("keeps summary and failure assertion while stripping session banner", async () => {
    const result = await filterRtkFixture(["pytest"], "tests/fixtures/python/pytest_failed.txt", 1);

    expect(result.output).toContain("Pytest: 118 passed, 1 failed");
    expect(result.output).toContain("test_duplicate_submit");
    expect(result.output).toContain("AssertionError");
    expect(result.output).not.toMatch(/test session starts/);

    expectRtkParity(result, {
      critical: ["Pytest: 118 passed, 1 failed", "test_duplicate_submit", "AssertionError"],
      forbidden: [/test session starts/, /platform darwin/, /\[100%\]/],
      // 879 raw chars compress to ~350; real cap below raw size.
      minSavingsRatio: 0.4,
      maxOutputChars: 480,
    });
  });

  // RTK: pytest_cmd.rs::test_filter_pytest_all_pass — collapses to "Pytest: N passed".
  test("collapses an all-pass run to a one-line summary", async () => {
    const result = await filterRtkFixture(["pytest"], "tests/fixtures/python/pytest_passed.txt", 0);

    expect(result.output.trim()).toBe("Pytest: 118 passed");
  });

  // RTK: pytest_cmd.rs::test_filter_pytest_no_tests — zero collected → status line.
  test("reports no tests collected", async () => {
    const result = await filterRtkOutput(
      ["pytest"],
      [
        "=== test session starts ===",
        "collected 0 items",
        "",
        "=== no tests ran in 0.00s ===",
      ].join("\n"),
      5,
    );

    expect(result.output.trim()).toBe("Pytest: No tests collected");
  });

  // RTK: pytest_cmd.rs::test_filter_pytest_quiet_mode_failures — a bare (no "===")
  // summary in -q mode is still parsed; must NOT report "No tests collected".
  test("parses a quiet-mode bare summary line", async () => {
    const result = await filterRtkOutput(
      ["pytest", "-q"],
      [
        "=== test session starts ===",
        "collected 1705 items",
        "",
        ".......F.......",
        "",
        "=== FAILURES ===",
        "___ test_something ___",
        "E   AssertionError: expected True",
        "",
        "=== short test summary info ===",
        "FAILED tests/test_foo.py::test_something - AssertionError",
        "5 failed, 1698 passed, 2 skipped in 108.89s",
      ].join("\n"),
      1,
    );

    expect(result.output).not.toMatch(/No tests collected/);
    expect(result.output).toContain("Pytest: 1698 passed, 5 failed, 2 skipped");
    expect(result.output).toContain("test_something");
  });

  // ADR 0001 divergence: within budget tg lists every XFAIL entry instead of
  // RTK's MAX_XFAIL (10) cap + "… +5 more" + "ctx --raw" recovery hint. All 15
  // expected-failure outcomes are kept with their reasons.
  test("lists every xfail entry with no overflow cap", async () => {
    const lines = [
      "=== test session starts ===",
      "collected 15 items",
      "",
      "=== short test summary info ===",
    ];
    for (let i = 0; i < 15; i += 1) {
      lines.push(`XFAIL test_x.py::test_case_${i} - known issue #${i}`);
    }
    lines.push("=== 0 passed, 15 xfailed in 0.05s ===");

    const result = await filterRtkOutput(["pytest"], lines.join("\n"), 0);

    const section = result.output.split("Expected-failure outcomes:")[1] ?? "";
    const listed = section.split("\n").filter((l) => l.trim().startsWith("XFAIL")).length;
    // All 15 XFAIL lines kept, including the ones RTK would drop past its cap.
    expect(listed).toBe(15);
    expect(result.output).toContain("XFAIL test_x.py::test_case_0 - known issue #0");
    expect(result.output).toContain("XFAIL test_x.py::test_case_14 - known issue #14");
    // No RTK cap marker and no recovery hint.
    expect(result.output).not.toContain("more");
    expect(result.output).not.toMatch(/ctx --raw/);
  });

  // RTK: pytest_cmd.rs::test_filter_pytest_xfail_xpass — XPASS in particular is
  // surfaced (an expected-failure that now passes).
  test("surfaces xfail and xpass outcomes with their reasons", async () => {
    const result = await filterRtkOutput(
      ["pytest"],
      [
        "=== test session starts ===",
        "collected 5 items",
        "",
        "test_math.py ..xxX                                                 [100%]",
        "",
        "=== short test summary info ===",
        "XFAIL test_math.py::test_division_by_zero - known bug in division",
        "XFAIL test_math.py::test_float_precision - float precision issue — bug #42",
        "XPASS test_math.py::test_unexpected_pass - this should fail but currently passes",
        "=== 2 passed, 2 xfailed, 1 xpassed in 0.05s ===",
      ].join("\n"),
      0,
    );

    expect(result.output).toContain("2 xfailed");
    expect(result.output).toContain("1 xpassed");
    expect(result.output).toContain("XPASS");
    expect(result.output).toContain("test_division_by_zero");
  });
});

// C2-pytest regression: collection/import errors (exit 2) must preserve the
// traceback — they must NOT be silently reported as "No tests collected".
// These tests drive the handler directly to avoid the harness passthrough guard
// (the fix intentionally returns raw, which would look like "no compression" to
// the harness but is the correct behaviour for error exits).
describe("C2-pytest: collection-error fixture (exit 2)", () => {
  test("preserves ModuleNotFoundError traceback on exit 2", async () => {
    // The session banner on stdout is stripped by filterPytestOutput but
    // the error block on stderr is NOT in any parsed section, so the
    // combined raw is different from either alone — and the fix returns
    // combined raw, not the truncated stdout.
    const stdout = [
      "=== test session starts ===",
      "platform darwin -- Python 3.12.0",
      "collected 0 items / 1 error",
      "",
      "=== 1 error in 0.07s ===",
    ].join("\n");
    const stderr = [
      "=== ERRORS ===",
      "____ ERROR collecting tests/test_app.py ____",
      "ImportError while importing test module '/project/tests/test_app.py'.",
      "ModuleNotFoundError: No module named 'mymodule'",
    ].join("\n");

    const result = await filterRtkOutput(["pytest"], stdout, 2, stderr);

    // The error text must survive — NOT a vacuous "No tests collected".
    expect(result.output).toContain("ModuleNotFoundError");
    expect(result.output).not.toContain("Pytest: No tests collected");
  });

  test("preserves usage error on exit 4 when all counts are zero", async () => {
    const stdout = "=== test session starts ===\nplatform darwin";
    const stderr = [
      "ERROR: usage: pytest [options] [file_or_dir]",
      "pytest: error: unrecognized arguments: --bad-flag",
    ].join("\n");

    const result = await filterRtkOutput(["pytest", "--bad-flag"], stdout, 4, stderr);

    // The usage error must survive — NOT a vacuous "No tests collected".
    expect(result.output).toContain("unrecognized arguments");
    expect(result.output).not.toContain("Pytest: No tests collected");
  });

  test("still reports No tests collected on exit 5 (normal no-collection outcome)", async () => {
    const result = await filterRtkOutput(
      ["pytest"],
      [
        "=== test session starts ===",
        "collected 0 items",
        "",
        "=== no tests ran in 0.00s ===",
      ].join("\n"),
      5,
    );

    expect(result.output.trim()).toBe("Pytest: No tests collected");
  });
});

describe("RTK pytest parse_summary_line", () => {
  // RTK: pytest_cmd.rs::test_parse_summary_line — order-sensitive parsing
  // (xpassed/xfailed contain passed/failed). Verified through the handler output.
  test("counts passed/failed/skipped/xfailed/xpassed in order", async () => {
    const result = await filterRtkOutput(
      ["pytest"],
      [
        "=== test session starts ===",
        "collected 6 items",
        "=== short test summary info ===",
        "FAILED test.py::a - boom",
        "=== 2 passed, 1 failed, 2 xfailed, 1 xpassed in 1.0s ===",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("Pytest: 2 passed, 1 failed, 2 xfailed, 1 xpassed");
  });
});
