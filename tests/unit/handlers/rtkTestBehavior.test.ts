import { describe, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK test behavior", () => {
  test("extracts generic test failures and compact summaries from wrapped commands", async () => {
    const result = await filterRtkOutput(
      ["test", "cargo", "test"],
      [
        "running 3 tests",
        "test foo::test_a ... ok",
        "test foo::test_b ... FAILED",
        "test foo::test_c ... ok",
        "failures:",
        "    foo::test_b",
        "test result: FAILED. 2 passed; 1 failed; 0 ignored",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "[FAIL] FAILURES:",
        "foo::test_b",
        "SUMMARY:",
        "test result: FAILED. 2 passed; 1 failed; 0 ignored",
      ],
      forbidden: [
        /running 3 tests/,
        /test foo::test_a \.\.\. ok/,
      ],
      maxOutputChars: 220,
    });
  });
});
