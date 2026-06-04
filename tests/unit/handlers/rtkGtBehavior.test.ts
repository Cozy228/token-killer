import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK gt behavior", () => {
  test("keeps stacked branch names and removes decorative graph noise", async () => {
    const result = await filterRtkOutput(
      ["gt", "log"],
      ["◉ feature/auth", "│ #12 fix auth flow", "◯ main"].join("\n"),
    );

    expect(result.output).toContain("feature/auth");
    expect(result.output).toContain("fix auth flow");
    expect(result.output).toContain("main");

    expectRtkParity(result, {
      critical: [
        "feature/auth",
        "fix auth flow",
        "main",
      ],
      forbidden: [
        /[◉◯│]/,
      ],
      maxOutputChars: 45,
    });
  });
});
