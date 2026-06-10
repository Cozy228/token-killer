import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK dotnet trx behavior", () => {
  test("extracts failed test names and messages from trx XML", async () => {
    const result = await filterRtkOutput(
      ["dotnet", "test", "--logger", "trx"],
      [
        '<TestRun><ResultSummary outcome="Failed"><Counters total="2" executed="2" passed="1" failed="1" /></ResultSummary>',
        '<UnitTestResult testName="OrderTests.PreventsDuplicateSubmit" outcome="Failed">',
        "<Output><ErrorInfo><Message>Expected false but was true</Message></ErrorInfo></Output>",
        "</UnitTestResult></TestRun>",
      ].join(""),
      1,
    );

    expect(result.output).toContain("PreventsDuplicateSubmit");
    expect(result.output).toContain("Expected false");
    expect(result.output).toContain("failed");

    expectRtkParity(result, {
      critical: [
        "PreventsDuplicateSubmit",
        "Expected false",
        "failed",
      ],
      maxOutputChars: 160,
    });
  });
});
