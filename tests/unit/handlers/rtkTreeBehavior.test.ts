import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK tree behavior", () => {
  test("removes summary while preserving hierarchy structure", async () => {
    const result = await filterRtkFixture(
      ["tree", "."],
      "tests/fixtures/common/tree_with_summary.txt",
    );

    expect(result.output).toContain("├── src");
    expect(result.output).toContain("│   ├── main.rs");
    expect(result.output).toContain("└── tests");
    expect(result.output).toContain("test.rs");
    expect(result.output).not.toMatch(/directories/);
    expect(result.output).not.toMatch(/files/);

    expectRtkParity(result, {
      critical: [
        "├── src",
        "│   ├── main.rs",
        "└── tests",
        "test.rs",
      ],
      forbidden: [
        /directories/,
        /files/,
      ],
      exact: [
        ".",
        "├── src",
        "│   ├── main.rs",
        "│   └── lib.rs",
        "└── tests",
        "    └── test.rs",
      ].join("\n"),
    });
  });
});
