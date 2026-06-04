import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK prettier behavior", () => {
  test("summarizes files that need formatting", async () => {
    const result = await filterRtkOutput(
      ["prettier", "--check", "src"],
      [
        "Checking formatting...",
        "src/button.tsx",
        "src/session.ts",
        "src/page.tsx",
        "Code style issues found in the above file(s). Forgot to run Prettier?",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("3 files need formatting");
    expect(result.output).toContain("button.tsx");
    expect(result.output).toContain("session.ts");
    expect(result.output).not.toMatch(/Checking formatting/);

    expectRtkParity(result, {
      critical: [
        "3 files need formatting",
        "button.tsx",
        "session.ts",
      ],
      forbidden: [
        /Checking formatting/,
      ],
      exact: [
        "Prettier: 3 files need formatting",
        "═══════════════════════════════════════",
        "1. src/button.tsx",
        "2. src/session.ts",
        "3. src/page.tsx",
        "",
        "Run `prettier --write` to fix",
      ].join("\n"),
    });
  });
});
