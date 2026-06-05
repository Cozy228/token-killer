import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../helpers/rtkCommandHarness.js";

describe("RTK go behavior", () => {
  test("keeps package failures and strips successful package noise", async () => {
    const result = await filterRtkOutput(
      ["go", "test", "./..."],
      ["ok  example.com/app/internal/auth 0.02s", "--- FAIL: TestSubmit (0.00s)", "submit_test.go:42: expected false", "FAIL example.com/app/orders 0.03s"].join("\n"),
      1,
    );

    expect(result.output).toContain("TestSubmit");
    expect(result.output).toContain("submit_test.go:42");
    expect(result.output).toContain("example.com/app/orders");
    expect(result.output).not.toMatch(/internal\/auth/);

    expectRtkParity(result, {
      critical: [
        "TestSubmit",
        "submit_test.go:42",
        "example.com/app/orders",
      ],
      forbidden: [
        /internal\/auth/,
      ],
      maxOutputChars: 140,
    });
  });
});
