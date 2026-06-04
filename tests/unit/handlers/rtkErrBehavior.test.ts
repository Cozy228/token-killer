import { describe, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK err behavior", () => {
  test("keeps error blocks from arbitrary commands and removes surrounding info noise", async () => {
    const result = await filterRtkOutput(
      ["err", "npm", "run", "build"],
      [
        "info: starting build",
        "warning: deprecated option",
        "error: build failed",
        "  at src/app.ts:10",
        "info: done",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "warning: deprecated option",
        "error: build failed",
        "src/app.ts:10",
      ],
      forbidden: [
        /info: starting build/,
        /info: done/,
      ],
      maxOutputChars: 120,
    });
  });
});
