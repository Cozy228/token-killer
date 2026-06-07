import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../../helpers/rtkCommandHarness.js";

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

  // RTK: pytest_cmd.rs::test_filter_pytest_xfail_caps_and_tee_hint — 15 XFAIL lines
  // cap at MAX_XFAIL (10) and emit "… +5 more" + a recovery hint.
  test("caps xfail entries at 10 and emits an overflow hint", async () => {
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
    expect(listed).toBeLessThanOrEqual(10);
    expect(result.output).toContain("… +5 more");
    expect(result.output).toMatch(/tk --raw/);
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
