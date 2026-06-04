import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK ruff behavior", () => {
  test("summarizes JSON violations with file, rule, fixable count", async () => {
    const result = await filterRtkOutput(
      ["ruff", "check", "."],
      JSON.stringify([
        { filename: "/repo/main.py", code: "F401", location: { row: 1, column: 8 }, message: "unused import", fix: { applicability: "safe" } },
        { filename: "/repo/utils.py", code: "E501", location: { row: 2, column: 1 }, message: "line too long" },
      ]),
      1,
    );

    expect(result.output).toContain("2 issues");
    expect(result.output).toContain("1 fixable");
    expect(result.output).toContain("F401");
    expect(result.output).toContain("main.py");
    expect(result.output).not.toMatch(/"filename"/);

    expectRtkParity(result, {
      critical: [
        "2 issues",
        "1 fixable",
        "F401",
        "main.py",
      ],
      forbidden: [
        /"filename"/,
      ],
      maxOutputChars: 220,
    });
  });
});
