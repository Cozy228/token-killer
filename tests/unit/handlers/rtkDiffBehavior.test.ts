import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";
import { lcsChanges } from "../../../src/handlers/common/diff.js";

// RTK: git/diff_cmd.rs::make_large_unified_diff — one file, N removed then N added.
function makeLargeUnifiedDiff(added: number, removed: number): string {
  const lines = [
    "diff --git a/config.yaml b/config.yaml",
    "--- a/config.yaml",
    "+++ b/config.yaml",
    "@@ -1,200 +1,200 @@",
  ];
  for (let i = 0; i < removed; i += 1) lines.push(`-old_value_${i}`);
  for (let i = 0; i < added; i += 1) lines.push(`+new_value_${i}`);
  return lines.join("\n");
}

describe("RTK diff behavior", () => {
  // RTK: diff_cmd.rs::test_condense_unified_diff_single_file — strip diff/@@/---/+++
  // metadata, keep [file] header + every changed line.
  test("condenses unified diff to file metadata and changed lines", async () => {
    const result = await filterRtkOutput(
      ["diff", "old.ts", "new.ts"],
      [
        "--- old.ts",
        "+++ new.ts",
        "@@ -1,2 +1,2 @@",
        "-const value = 1;",
        "+const value = 2;",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: ["[file] new.ts (+1 -1)", "-const value = 1;", "+const value = 2;"],
      // H8-diff fix: @@ hunk headers are now kept (they locate the change in the
      // file); --- metadata lines are still dropped.
      forbidden: [/^--- old\.ts$/m],
      exact: [
        "[file] new.ts (+1 -1)",
        "  @@ -1,2 +1,2 @@",
        "  -const value = 1;",
        "  +const value = 2;",
      ].join("\n"),
    });
  });

  // RTK: diff_cmd.rs::test_condense_unified_diff_multiple_files — each +++ flushes
  // the previous file; both files appear with their own header.
  test("condenses multiple files in one unified diff", async () => {
    const result = await filterRtkOutput(
      ["diff", "-"],
      [
        "diff --git a/a.rs b/a.rs",
        "--- a/a.rs",
        "+++ b/a.rs",
        "+added line",
        "diff --git a/b.rs b/b.rs",
        "--- a/b.rs",
        "+++ b/b.rs",
        "-removed line",
      ].join("\n"),
    );

    expect(result.output).toContain("[file] a.rs (+1 -0)");
    expect(result.output).toContain("  +added line");
    expect(result.output).toContain("[file] b.rs (+0 -1)");
    expect(result.output).toContain("  -removed line");
  });

  // ADR 0001 divergence: within budget tg shows every changed line in full with
  // NO overflow footer at all — not even RTK's uncapped "... +190 more". The
  // file metadata header is kept and all 200 change lines survive.
  test("shows every changed line with no overflow footer for large files", async () => {
    const result = await filterRtkOutput(["diff", "-"], makeLargeUnifiedDiff(100, 100));

    expect(result.output).toContain("[file] config.yaml (+100 -100)");
    // No "more" footer of any kind (capped or uncapped).
    expect(result.output).not.toMatch(/more/);
    // Every +/- change line is present in full, first through last.
    expect(result.output).toContain("-old_value_0");
    expect(result.output).toContain("-old_value_99");
    expect(result.output).toContain("+new_value_0");
    expect(result.output).toContain("+new_value_99");
  });

  // RTK: diff_cmd.rs::test_condense_unified_diff_no_false_overflow — 8 changes
  // (<= 10) produce no "more" footer.
  test("emits no overflow footer when changes fit the threshold", async () => {
    const result = await filterRtkOutput(["diff", "-"], makeLargeUnifiedDiff(4, 4));

    expect(result.output).toContain("[file] config.yaml (+4 -4)");
    expect(result.output).not.toMatch(/more/);
  });

  // RTK: diff_cmd.rs::test_no_truncation_large_diff — a large diff keeps every
  // change line; the footer is informational, the content is never dropped.
  test("never truncates change content in a large diff", async () => {
    const result = await filterRtkOutput(["diff", "-"], makeLargeUnifiedDiff(60, 60));

    for (let i = 0; i < 60; i += 1) {
      expect(result.output).toContain(`+new_value_${i}`);
      expect(result.output).toContain(`-old_value_${i}`);
    }
  });
});

// H5 regression: rename, binary, and mode-only facts must survive compactUnifiedDiff.
describe("H5: compactUnifiedDiff retains semantic metadata lines", () => {
  test("rename from/to lines survive the compact pass", async () => {
    const renameDiff = [
      "diff --git a/old-name.ts b/new-name.ts",
      "similarity index 100%",
      "rename from old-name.ts",
      "rename to new-name.ts",
    ].join("\n");

    const result = await filterRtkOutput(["git", "diff", "HEAD"], renameDiff);

    expect(result.output).toContain("rename from old-name.ts");
    expect(result.output).toContain("rename to new-name.ts");
    // Label uses the rename target
    expect(result.output).toContain("new-name.ts");
  });

  test("Binary files line survives the compact pass", async () => {
    const binaryDiff = [
      "diff --git a/img.png b/img.png",
      "index abc1234..def5678 100644",
      "Binary files a/img.png and b/img.png differ",
    ].join("\n");

    const result = await filterRtkOutput(["git", "diff", "HEAD"], binaryDiff);

    expect(result.output).toContain("Binary files");
    expect(result.output).toContain("img.png");
  });

  test("mode-only change lines (old/new mode) survive the compact pass", async () => {
    const modeDiff = [
      "diff --git a/script.sh b/script.sh",
      "old mode 100644",
      "new mode 100755",
    ].join("\n");

    const result = await filterRtkOutput(["git", "diff", "HEAD"], modeDiff);

    expect(result.output).toContain("old mode 100644");
    expect(result.output).toContain("new mode 100755");
  });

  test("new file mode line survives the compact pass", async () => {
    const newFileDiff = [
      "diff --git a/added.ts b/added.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/added.ts",
      "@@ -0,0 +1,2 @@",
      "+const x = 1;",
      "+export default x;",
    ].join("\n");

    const result = await filterRtkOutput(["git", "diff", "HEAD"], newFileDiff);

    expect(result.output).toContain("new file mode 100644");
    expect(result.output).toContain("+const x = 1;");
  });

  test("deleted file mode line survives the compact pass", async () => {
    const deletedFileDiff = [
      "diff --git a/removed.ts b/removed.ts",
      "deleted file mode 100644",
      "--- a/removed.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-const x = 1;",
      "-export default x;",
    ].join("\n");

    const result = await filterRtkOutput(["git", "diff", "HEAD"], deletedFileDiff);

    expect(result.output).toContain("deleted file mode 100644");
    expect(result.output).toContain("-const x = 1;");
  });
});

// RTK: diff_cmd.rs compute_diff invariants mapped to ctx's LCS differ. ctx uses LCS
// rather than RTK's Jaccard-similarity modification detection, so similarity_* do
// not map; the anti-truncation invariants do.
describe("RTK diff compute (LCS) anti-truncation", () => {
  // RTK: test_no_truncation_large_diff — 500 lines, every 3rd changed → 100+ changes.
  test("returns every change for a large file pair without truncation", () => {
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 500; i += 1) {
      a.push(`line_${i}`);
      b.push(i % 3 === 0 ? `CHANGED_${i}` : `line_${i}`);
    }
    const changes = lcsChanges(a, b);
    expect(changes.length).toBeGreaterThan(100);
  });

  // RTK: test_long_lines_not_truncated — a 500-char line is kept at full length.
  test("keeps long lines at full length", () => {
    const longLine = "x".repeat(500);
    const changes = lcsChanges([longLine], ["short"]);
    const removed = changes.find((c) => c.kind === "removed");
    expect(removed?.content.length).toBe(500);
  });
});
