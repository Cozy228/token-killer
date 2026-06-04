import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git log behavior", () => {
  test("keeps commits and body signal while stripping trailers", async () => {
    const result = await filterRtkOutput(
      ["git", "log"],
      [
        "abc1234 fix auth",
        "BREAKING CHANGE: removed old API",
        "Signed-off-by: Dev <dev@example.com>",
        "def5678 update docs",
      ].join("\n"),
    );

    expect(result.output).toContain("abc1234");
    expect(result.output).toContain("BREAKING CHANGE");
    expect(result.output).toContain("def5678");
    expect(result.output).not.toMatch(/Signed-off-by/);

    expectRtkParity(result, {
      critical: [
        "abc1234",
        "BREAKING CHANGE",
        "def5678",
      ],
      forbidden: [
        /Signed-off-by/,
      ],
      exact: [
        "abc1234 fix auth",
        "  BREAKING CHANGE: removed old API",
        "def5678 update docs",
      ].join("\n"),
    });
  });
});
