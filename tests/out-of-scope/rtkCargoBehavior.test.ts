import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../helpers/rtkCommandHarness.js";

describe("RTK cargo behavior", () => {
  test("summarizes test pass counts and strips compilation noise", async () => {
    const result = await filterRtkOutput(
      ["cargo", "test"],
      [
        "Compiling app v0.1.0",
        "running 15 tests",
        "test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s",
      ].join("\n"),
    );

    expect(result.output).toContain("cargo test");
    expect(result.output).toContain("15 passed");
    expect(result.output).not.toMatch(/Compiling app/);

    expectRtkParity(result, {
      critical: [
        "cargo test",
        "15 passed",
      ],
      forbidden: [
        /Compiling app/,
      ],
      exact: "cargo test: 15 passed",
    });
  });
});
