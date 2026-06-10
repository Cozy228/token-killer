import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK dotnet binlog behavior", () => {
  test("extracts build errors and redacts sensitive environment values", async () => {
    const result = await filterRtkOutput(
      ["dotnet", "msbuild", "-bl"],
      [
        "PATH=/usr/local/bin",
        "GITHUB_TOKEN=ghp_123",
        "Program.cs(10,5): error CS0103: The name 'foo' does not exist",
        "Build FAILED.",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("CS0103");
    expect(result.output).toContain("Program.cs");
    expect(result.output).not.toMatch(/ghp_123/);
    expect(result.output).not.toMatch(/\/usr\/local\/bin/);

    expectRtkParity(result, {
      critical: [
        "CS0103",
        "Program.cs",
      ],
      forbidden: [
        /ghp_123/,
        /\/usr\/local\/bin/,
      ],
      maxOutputChars: 180,
    });
  });
});
