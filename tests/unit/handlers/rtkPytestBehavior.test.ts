import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK pytest behavior", () => {
  test("keeps summary and failure assertion while stripping session banner", async () => {
    const result = await filterRtkOutput(
      ["pytest"],
      [
        "================ test session starts ================",
        "collected 5 items",
        "",
        "tests/test_order.py ..F..                                            [100%]",
        "",
        "================ FAILURES ================",
        "___ test_submit ___",
        "",
        "    def test_submit():",
        ">       assert False",
        "E       assert False",
        "",
        "tests/test_order.py:10: AssertionError",
        "",
        "================ short test summary info ================",
        "FAILED tests/test_order.py::test_submit - assert False",
        "================ 4 passed, 1 failed in 0.10s ================",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("4 passed, 1 failed");
    expect(result.output).toContain("test_submit");
    expect(result.output).toContain("assert False");
    expect(result.output).not.toMatch(/test session starts/);

    expectRtkParity(result, {
      critical: [
        "4 passed, 1 failed",
        "test_submit",
        "assert False",
      ],
      forbidden: [
        /test session starts/,
      ],
      maxOutputChars: 320,
    });
  });
});
