import { describe, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK npx behavior", () => {
  test("routes npx tsc through the TypeScript compiler filter", async () => {
    const result = await filterRtkOutput(
      ["npx", "tsc", "--noEmit"],
      [
        "src/auth.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/routes.ts(22,9): error TS7006: Parameter 'req' implicitly has an 'any' type.",
        "Found 2 errors in 2 files.",
      ].join("\n"),
      2,
    );

    expectRtkParity(result, {
      critical: [
        "TypeScript: 2 errors in 2 files",
        "TS2322",
        "TS7006",
      ],
      forbidden: [
        /Found 2 errors in 2 files/,
      ],
      maxOutputChars: 260,
    });
  });
});
