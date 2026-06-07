import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

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

  // ADR 0001 divergence: RTK caps the stack at MAX_LOG_ENTRIES (15) with a
  // "... +N more entries" marker. tg's gt handler is NOT ladder-converted, so that
  // marker is an UNDECLARED omission: the ADR 0001 safety net rejects any handler
  // output carrying it and fails open to RAW. Crucially, the raw still contains the
  // author emails, so capping would re-leak them — exactly why the supported tg path
  // is the lossless one: at/within the cap (<= 15 entries) tg keeps every entry,
  // strips every author email, and emits NO fake overflow marker.
  test("keeps every entry up to the cap, strips emails, no fake marker", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      lines.push(`◉  hash${i} branch-${i} 1d ago dev${i}@example.com`);
      lines.push(`│  commit message ${i}`);
      lines.push("│");
    }
    lines.push("~");

    const result = await filterRtkOutput(["gt", "log"], lines.join("\n"));

    // Every entry is retained (first and last), all author emails are stripped,
    // and there is NO fake "... +N more entries" omission marker.
    expect(result.output).toContain("hash0 branch-0");
    expect(result.output).toContain("hash14 branch-14");
    expect(result.output).not.toMatch(/@example\.com/);
    expect(result.output).not.toMatch(/(?:\.{3}|…)\s*\+\d+\s+more/);

    expectRtkParity(result, {
      critical: ["hash0 branch-0", "hash14 branch-14"],
      forbidden: [/@example\.com/, /(?:\.{3}|…)\s*\+\d+\s+more/],
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
