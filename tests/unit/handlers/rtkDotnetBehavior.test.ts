import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK dotnet behavior", () => {
  test("keeps test failure summary and strips restore/build boilerplate", async () => {
    const result = await filterRtkOutput(
      ["dotnet", "test"],
      [
        "Determining projects to restore...",
        "All projects are up-to-date for restore.",
        "Failed OrderTests.PreventsDuplicateSubmit [42 ms]",
        "Error Message: Expected false but was true",
        "Total tests: 12. Passed: 11. Failed: 1. Skipped: 0.",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("PreventsDuplicateSubmit");
    expect(result.output).toContain("Failed: 1");
    expect(result.output).toContain("Expected false");
    expect(result.output).not.toMatch(/Determining projects to restore/);

    expectRtkParity(result, {
      critical: [
        "PreventsDuplicateSubmit",
        "Failed: 1",
        "Expected false",
      ],
      forbidden: [
        /Determining projects to restore/,
      ],
      maxOutputChars: 180,
    });
  });
});
