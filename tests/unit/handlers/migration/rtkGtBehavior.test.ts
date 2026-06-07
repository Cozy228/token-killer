import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../../helpers/rtkCommandHarness.js";

describe("RTK gt behavior", () => {
  // RTK: git/gt_cmd.rs::test_filter_gt_log_exact_format — the graph is KEPT; only
  // author emails are stripped and over-long lines truncated.
  test("keeps the stack graph but strips author emails", async () => {
    const result = await filterRtkOutput(
      ["gt", "log"],
      [
        "◉  abc1234 feat/add-auth 2d ago",
        "│  feat(auth): add login endpoint",
        "│",
        "◉  def5678 feat/add-db 3d ago user@example.com",
        "│  feat(db): add migration system",
        "│",
        "◉  ghi9012 main 5d ago admin@corp.io",
        "│  chore: update dependencies",
        "~",
      ].join("\n"),
    );

    expect(result.output).not.toMatch(/user@example\.com/);
    expect(result.output).not.toMatch(/admin@corp\.io/);

    expectRtkParity(result, {
      critical: ["feat/add-auth", "feat(auth): add login endpoint", "main"],
      forbidden: [/user@example\.com/, /admin@corp\.io/],
      exact: [
        "◉  abc1234 feat/add-auth 2d ago",
        "│  feat(auth): add login endpoint",
        "│",
        "◉  def5678 feat/add-db 3d ago",
        "│  feat(db): add migration system",
        "│",
        "◉  ghi9012 main 5d ago",
        "│  chore: update dependencies",
        "~",
      ].join("\n"),
    });
  });

  // RTK: test_filter_gt_log_truncation — entries beyond MAX_LOG_ENTRIES (15) are
  // capped with a "... +N more entries" marker.
  test("caps long stacks with a more-entries marker", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      lines.push(`◉  hash${i} branch-${i} 1d ago dev@example.com`);
      lines.push(`│  commit message ${i}`);
      lines.push("│");
    }
    lines.push("~");

    const result = await filterRtkOutput(["gt", "log"], lines.join("\n"));

    expectRtkParity(result, {
      critical: ["... +5 more entries"],
      forbidden: [/dev@example\.com/],
      minTokenSavingsRatio: 0.2,
    });
  });

  // RTK: test_filter_gt_submit_exact_format — collapse push/PR noise to a summary.
  test("summarizes a submit into pushed + PR lines", async () => {
    const result = await filterRtkOutput(
      ["gt", "submit"],
      [
        "Pushed branch feat/add-auth",
        "Created pull request #42 for feat/add-auth",
        "Pushed branch feat/add-db",
        "Updated pull request #40 for feat/add-db",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: ["pushed feat/add-auth, feat/add-db"],
      exact: [
        "pushed feat/add-auth, feat/add-db",
        "created PR #42 feat/add-auth",
        "updated PR #40 feat/add-db",
      ].join("\n"),
    });
  });

  // RTK: test_filter_gt_sync_exact_format.
  test("summarizes a sync with deleted branch names", async () => {
    const result = await filterRtkOutput(
      ["gt", "sync"],
      [
        "Synced with remote",
        "Deleted branch feat/merged-feature",
        "Deleted branch fix/old-hotfix",
      ].join("\n"),
    );
    expectRtkParity(result, {
      critical: ["ok sync: 1 synced, 2 deleted (feat/merged-feature, fix/old-hotfix)"],
      exact: "ok sync: 1 synced, 2 deleted (feat/merged-feature, fix/old-hotfix)",
    });
  });

  // RTK: test_filter_gt_restack_exact_format + test_filter_gt_create_exact_format.
  test("summarizes restack and create operations", async () => {
    const restack = await filterRtkOutput(
      ["gt", "restack"],
      [
        "Restacked branch feat/add-auth on main",
        "Restacked branch feat/add-db on feat/add-auth",
        "Restacked branch fix/parsing on feat/add-db",
      ].join("\n"),
    );
    expectRtkParity(restack, {
      critical: ["ok restacked 3 branches"],
      exact: "ok restacked 3 branches",
    });

    const create = await filterRtkOutput(["gt", "create"], "Created branch feat/new-feature");
    expectRtkParity(create, {
      critical: ["ok created feat/new-feature"],
      exact: "ok created feat/new-feature",
    });
  });
});
