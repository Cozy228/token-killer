import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK format behavior", () => {
  test("summarizes formatted and changed files without progress chatter", async () => {
    const result = await filterRtkOutput(
      ["format"],
      [
        "Checking formatting...",
        "src/button.tsx",
        "src/session.ts",
        "Code style issues found in the above file(s). Forgot to run Prettier?",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("2");
    expect(result.output).toContain("button.tsx");
    expect(result.output).toContain("session.ts");
    expect(result.output).not.toMatch(/Checking formatting/);

    expectRtkParity(result, {
      critical: [
        "2",
        "button.tsx",
        "session.ts",
      ],
      forbidden: [
        /Checking formatting/,
      ],
      exact: [
        "Prettier: 2 files need formatting",
        "═══════════════════════════════════════",
        "1. src/button.tsx",
        "2. src/session.ts",
        "",
        "Run `prettier --write` to fix",
      ].join("\n"),
    });
  });
});
