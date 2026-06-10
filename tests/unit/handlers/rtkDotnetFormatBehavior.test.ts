import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK dotnet format behavior", () => {
  test("summarizes files with formatting changes from report JSON", async () => {
    const result = await filterRtkOutput(
      ["dotnet", "format", "--verify-no-changes"],
      JSON.stringify({
        files: [
          { filePath: "Program.cs", changes: [{ lineNumber: 42, formatDescription: "Fix whitespace" }] },
          { filePath: "Order.cs", changes: [] },
        ],
      }),
      1,
    );

    expect(result.output).toContain("Program.cs");
    expect(result.output).toContain("42");
    expect(result.output).toContain("Fix whitespace");

    expectRtkParity(result, {
      critical: [
        "Program.cs",
        "42",
        "Fix whitespace",
      ],
      maxOutputChars: 120,
    });
  });
});
