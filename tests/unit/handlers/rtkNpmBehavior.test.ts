import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK npm behavior", () => {
  test("filters npm warnings and lifecycle banner while keeping useful output", async () => {
    const result = await filterRtkOutput(
      ["npm", "run", "build"],
      ["> project@1.0.0 build", "npm WARN deprecated left-pad", "Build completed"].join("\n"),
    );

    expect(result.output).toContain("Build completed");
    expect(result.output).not.toMatch(/npm WARN/);
    expect(result.output).not.toMatch(/> project@/);

    expectRtkParity(result, {
      critical: [
        "Build completed",
      ],
      forbidden: [
        /npm WARN/,
        /> project@/,
      ],
      exact: "Build completed",
    });
  });
});
