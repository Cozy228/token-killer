import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// RTK: system/tree.rs::filter_tree_output — strip the trailing
// `N directories, M files` summary line while preserving the tree hierarchy
// (├──/└──/│), and remove trailing empty lines.

describe("RTK tree behavior", () => {
  // RTK: tree.rs::test_filter_removes_summary + test_filter_preserves_structure.
  test("removes the summary line while preserving hierarchy structure", async () => {
    const result = await filterRtkFixture(["tree", "."], "tests/fixtures/common/tree_with_summary.txt");

    expect(result.output).toContain("├── src");
    expect(result.output).toContain("│   ├── main.rs");
    expect(result.output).toContain("└── tests");
    expect(result.output).toContain("test.rs");

    expectRtkParity(result, {
      critical: ["├── src", "│   ├── main.rs", "│   └── lib.rs", "└── tests", "    └── test.rs"],
      // Only the "N directories, M files" summary is removed.
      forbidden: [/directories,/, /\d+ files?$/m],
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

  // RTK: tree.rs::test_filter_summary_variations — different summary phrasings
  // (singular/plural directory/file) are all stripped, content is preserved.
  test("strips summary variations regardless of singular/plural phrasing", async () => {
    const variations: Array<[string, string]> = [
      [".\n└── file.txt\n\n0 directories, 1 file\n", "1 file"],
      [".\n└── file.txt\n\n1 directory, 0 files\n", "1 directory"],
      [".\n└── file.txt\n\n10 directories, 25 files\n", "25 files"],
    ];

    for (const [input, summaryFragment] of variations) {
      const result = await filterRtkOutput(["tree", "."], input);
      expect(result.output).not.toContain(summaryFragment);
      expect(result.output).toContain("file.txt");
      expect(result.output).toContain("└── file.txt");
    }
  });

  // RTK: tree.rs::test_filter_removes_trailing_empty_lines (combined with summary
  // removal so the change is visible past trim()) — trailing blank lines and the
  // summary line are removed, leaving the hierarchy + a single final newline.
  test("removes trailing empty lines and the summary line", async () => {
    const result = await filterRtkOutput(
      ["tree", "."],
      ".\n├── file.txt\n\n0 directories, 1 file\n\n\n",
    );
    expect(result.output).toBe(".\n├── file.txt\n");
  });
});
