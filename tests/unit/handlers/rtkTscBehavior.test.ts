import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK tsc behavior", () => {
  test("groups TypeScript errors by file and replaces raw summary", async () => {
    const result = await filterRtkOutput(
      ["tsc", "--noEmit"],
      [
        "src/auth.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/Button.tsx(20,7): error TS2345: Argument of type 'boolean' is not assignable.",
        "Found 2 errors in 2 files.",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("TypeScript: 2 errors in 2 files");
    expect(result.output).toContain("auth.ts");
    expect(result.output).toContain("Button.tsx");
    expect(result.output).toContain("TS2322");
    expect(result.output).not.toMatch(/Found 2 errors/);

    expectRtkParity(result, {
      critical: [
        "TypeScript: 2 errors in 2 files",
        "auth.ts",
        "Button.tsx",
        "TS2322",
      ],
      forbidden: [
        /Found 2 errors/,
      ],
      maxOutputChars: 260,
    });
  });
});
