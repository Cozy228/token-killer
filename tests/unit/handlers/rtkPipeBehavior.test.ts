import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK pipe behavior", () => {
  test("keeps command failure signal while trimming noisy progress", async () => {
    const result = await filterRtkOutput(
      ["pipe", "cargo", "test"],
      ["Compiling crate v0.1.0", "test result: FAILED. 1 passed; 1 failed", "error: test failed"].join("\n"),
      1,
    );

    expect(result.output).toContain("FAILED");
    expect(result.output).toContain("1 failed");
    expect(result.output).not.toMatch(/Compiling crate/);

    expectRtkParity(result, {
      critical: [
        "FAILED",
        "1 failed",
      ],
      forbidden: [
        /Compiling crate/,
      ],
      maxOutputChars: 90,
    });
  });
});
