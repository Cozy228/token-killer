import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK rust runner behavior", () => {
  test("passes through rustc version output without adding summaries", async () => {
    const result = await filterRtkOutput(["rustc", "--version"], "rustc 1.88.0 (abcdef 2026-05-01)\n");

    expect(result.output).toContain("rustc 1.88.0");
    expect(result.output).not.toMatch(/Summary:/);

    expectRtkParity(result, {
      critical: [
        "rustc 1.88.0",
      ],
      forbidden: [
        /Summary:/,
      ],
      exact: result.rawOutput.trim(),
      maxOutputChars: result.rawOutput.trim().length,
    });
  });
});
