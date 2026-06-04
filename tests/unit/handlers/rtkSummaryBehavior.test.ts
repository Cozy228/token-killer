import { describe, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK summary behavior", () => {
  test("summarizes arbitrary test command output instead of replaying all lines", async () => {
    const result = await filterRtkOutput(
      ["summary", "npm", "test"],
      [
        "PASS src/a.test.ts",
        "FAIL src/b.test.ts",
        "Tests: 1 failed, 12 passed, 13 total",
        "Snapshots: 0 total",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "[FAIL] Command: npm test",
        "Test Results:",
        "[ok] 12 passed",
        "[FAIL] 1 failed",
        "FAIL src/b.test.ts",
      ],
      forbidden: [
        /Snapshots: 0 total/,
      ],
      maxOutputChars: 260,
    });
  });
});
