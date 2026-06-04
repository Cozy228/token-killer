import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK rake behavior", () => {
  test("summarizes minitest pass counts", async () => {
    const result = await filterRtkOutput(
      ["rake", "test"],
      ["Run options: --seed 123", "8 runs, 12 assertions, 0 failures, 0 errors, 0 skips"].join("\n"),
    );

    expect(result.output).toContain("ok rake test");
    expect(result.output).toContain("8 runs");
    expect(result.output).toContain("0 failures");
    expect(result.output).not.toMatch(/Run options/);

    expectRtkParity(result, {
      critical: [
        "ok rake test",
        "8 runs",
        "0 failures",
      ],
      forbidden: [
        /Run options/,
      ],
      exact: "ok rake test: 8 runs, 12 assertions, 0 failures, 0 errors, 0 skips",
    });
  });
});
