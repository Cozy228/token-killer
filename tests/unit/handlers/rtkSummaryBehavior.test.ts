import { describe, expect, test } from "vitest";

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
      forbidden: [/Snapshots: 0 total/],
      maxOutputChars: 260,
    });
  });
});

// Regression tests for audit findings.
describe("summary audit regressions", () => {
  // M20-summary: a long summary must ship a declared omission (replacement), not
  // revert to raw (which happens when a `+N more` marker trips the base sniffer).
  test("M20-summary: long list output ships a declared omission, not raw revert", async () => {
    // Generate 50 list items — well over MAX_SUMMARY_LIST=12 — but keep each item
    // short so the whole list would exceed the token budget as a single block.
    const lines = Array.from({ length: 50 }, (_, i) => `item-${i}`);
    const bigOutput = lines.join("\n");

    const result = await filterRtkOutput(["summary", "ls", "."], bigOutput);

    // The output must NOT contain the banned `+N more` marker.
    expect(result.output).not.toMatch(/\.\.\. \+\d+ more/);
    // qualityStatus must not be "inflated" (which means a raw revert happened).
    expect(result.qualityStatus).not.toBe("inflated");
  });

  test("M20-summary: no +N more marker anywhere in summary output", async () => {
    const jsonOutput = JSON.stringify(
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key_${i}`, `value_${i}`])),
    );
    const result = await filterRtkOutput(["summary", "cat", "data.json"], jsonOutput);

    // Neither the list nor json +N more pattern must appear.
    expect(result.output).not.toMatch(/\+\d+ more/);
    expect(result.qualityStatus).not.toBe("inflated");
  });
});
