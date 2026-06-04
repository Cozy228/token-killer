import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK eslint behavior", () => {
  test("summarizes JSON lint issues by file and rule", async () => {
    const result = await filterRtkOutput(
      ["eslint", "src"],
      JSON.stringify([
        {
          filePath: "/repo/src/utils.ts",
          messages: [
            { ruleId: "prefer-const", severity: 2, line: 3, column: 7, message: "Use const" },
            { ruleId: "no-unused-vars", severity: 1, line: 4, column: 1, message: "unused" },
          ],
        },
      ]),
      1,
    );

    expect(result.output).toContain("ESLint");
    expect(result.output).toContain("utils.ts");
    expect(result.output).toContain("prefer-const");
    expect(result.output).toContain("no-unused-vars");
    expect(result.output).not.toMatch(/"filePath"/);

    expectRtkParity(result, {
      critical: [
        "ESLint",
        "utils.ts",
        "prefer-const",
        "no-unused-vars",
      ],
      forbidden: [
        /"filePath"/,
      ],
      maxOutputChars: 240,
    });
  });
});
