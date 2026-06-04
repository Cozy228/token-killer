import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK read behavior", () => {
  test("keeps source content and trims excessive middle lines with a marker", async () => {
    const result = await filterRtkOutput(
      ["cat", "src/main.ts"],
      Array.from({ length: 180 }, (_, i) => `line ${i + 1}`).join("\n"),
    );

    expect(result.output).toContain("line 1");
    expect(result.output).toContain("line 120");
    expect(result.output).not.toContain("line 180");

    expectRtkParity(result, {
      critical: [
        "line 1",
        "line 120",
      ],
      maxOutputChars: 1200,
    });
  });
});
