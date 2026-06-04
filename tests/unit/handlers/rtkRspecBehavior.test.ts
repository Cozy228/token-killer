import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK rspec behavior", () => {
  test("keeps failed examples and summary", async () => {
    const result = await filterRtkOutput(
      ["rspec"],
      ["Failures:", "1) Order submits once", "expected false to be true", "12 examples, 1 failure"].join("\n"),
      1,
    );

    expect(result.output).toContain("12 examples");
    expect(result.output).toContain("1 failure");
    expect(result.output).toContain("Order submits once");

    expectRtkParity(result, {
      critical: [
        "12 examples",
        "1 failure",
        "Order submits once",
      ],
      maxOutputChars: 120,
    });
  });
});
