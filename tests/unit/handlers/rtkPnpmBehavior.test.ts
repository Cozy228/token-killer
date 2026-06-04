import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK pnpm behavior", () => {
  test("groups dependency listing sections and strips tree characters", async () => {
    const result = await filterRtkOutput(
      ["pnpm", "list", "--depth=0"],
      [
        "dependencies:",
        "react@19.0.0",
        "devDependencies:",
        "eslint@9.0.0",
        "Legend: production dependency",
      ].join("\n"),
    );

    expect(result.output).toContain("[prod]");
    expect(result.output).toContain("react");
    expect(result.output).toContain("[dev]");
    expect(result.output).toContain("eslint");
    expect(result.output).not.toMatch(/Legend:/);
    expect(result.output).not.toMatch(/[├└│]/);

    expectRtkParity(result, {
      critical: [
        "[prod]",
        "react",
        "[dev]",
        "eslint",
      ],
      forbidden: [
        /Legend:/,
        /[├└│]/,
      ],
      exact: [
        "2 packages (1 prod / 1 dev)",
        "[prod]",
        "  react 19.0.0",
        "[dev]",
        "  eslint 9.0.0",
      ].join("\n"),
    });
  });
});
