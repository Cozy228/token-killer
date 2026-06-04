import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK pip behavior", () => {
  test("summarizes installed packages from pip list", async () => {
    const result = await filterRtkOutput(
      ["pip", "list"],
      JSON.stringify([
        { name: "requests", version: "2.31.0" },
        { name: "pytest", version: "7.4.0" },
        { name: "ruff", version: "0.1.0" },
      ]),
    );

    expect(result.output).toContain("3 packages");
    expect(result.output).toContain("requests");
    expect(result.output).toContain("2.31.0");
    expect(result.output).toContain("pytest");
    expect(result.output).not.toMatch(/----------/);

    expectRtkParity(result, {
      critical: [
        "3 packages",
        "requests",
        "2.31.0",
        "pytest",
      ],
      forbidden: [
        /----------/,
      ],
      exact: [
        "pip list: 3 packages",
        "═══════════════════════════════════════",
        "",
        "[P]",
        "  pytest (7.4.0)",
        "",
        "[R]",
        "  requests (2.31.0)",
        "  ruff (0.1.0)",
      ].join("\n"),
    });
  });
});
