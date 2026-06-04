import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK ls behavior", () => {
  test("summarizes useful project files and hides noise directories", async () => {
    const result = await filterRtkOutput(
      ["ls", "-la"],
      ["README.md", "package.json", "src", "node_modules", ".git", "tests"].join("\n"),
    );

    expect(result.output).toContain("README.md");
    expect(result.output).toContain("package.json");
    expect(result.output).toContain("src");
    expect(result.output).not.toMatch(/node_modules/);
    expect(result.output).not.toMatch(/\.git/);

    expectRtkParity(result, {
      critical: [
        "README.md",
        "package.json",
        "src",
      ],
      forbidden: [
        /node_modules/,
        /\.git/,
      ],
      exact: [
        "README.md",
        "package.json",
        "src/",
        "tests/",
      ].join("\n"),
    });
  });
});
