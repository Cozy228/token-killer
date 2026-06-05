import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git push behavior", () => {
  test("drops progress phases but preserves remote and ref summary", async () => {
    const result = await filterRtkOutput(
      ["git", "push"],
      [
        "Enumerating objects: 42, done.",
        "Counting objects: 100% (42/42), done.",
        "Compressing objects: 100% (20/20), done.",
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  master -> master",
      ].join("\n"),
    );

    expect(result.output).toContain("To https://github.com/foo/bar.git");
    expect(result.output).toContain("master -> master");
    expect(result.output).not.toMatch(/Enumerating objects/);
    expect(result.output).not.toMatch(/Counting objects/);

    expectRtkParity(result, {
      critical: [
        "To https://github.com/foo/bar.git",
        "master -> master",
      ],
      forbidden: [
        /Enumerating objects/,
        /Counting objects/,
      ],
      exact: [
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  master -> master",
        "ok master",
      ].join("\n"),
    });
  });

  // RTK: git/git.rs::test_push_filter_up_to_date_summary — "Everything up-to-date"
  // is kept and summarised as "ok (up-to-date)".
  test("summarises an up-to-date push", async () => {
    const result = await filterRtkOutput(["git", "push"], "Everything up-to-date\n");

    expect(result.output).toContain("Everything up-to-date");
    expect(result.output.trimEnd().endsWith("ok (up-to-date)")).toBe(true);
  });

  // RTK: git/git.rs::test_push_filter_passes_remote_messages_through — remote:
  // lines (vulnerability alerts etc.) survive; summary uses the pushed ref.
  test("passes remote messages through and summarises the ref", async () => {
    const result = await filterRtkOutput(
      ["git", "push"],
      [
        "remote: Resolving deltas: 100% (2/2), completed with 2 local objects.",
        "remote: GitHub found 1 vulnerability on foo/bar's default branch (1 moderate).",
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  feature -> feature",
      ].join("\n"),
    );

    expect(result.output).toContain("remote: Resolving deltas");
    expect(result.output).toContain("remote: GitHub found 1 vulnerability");
    expect(result.output.trimEnd().endsWith("ok feature")).toBe(true);
  });

  // RTK: git/git.rs::test_push_filter_no_summary_on_failure — a rejected push keeps
  // the rejection + error and never appends an "ok" summary.
  test("does not summarise a failed push", async () => {
    const result = await filterRtkOutput(
      ["git", "push"],
      [
        "To https://github.com/foo/bar.git",
        " ! [rejected]        master -> master (non-fast-forward)",
        "error: failed to push some refs to 'https://github.com/foo/bar.git'",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("[rejected]");
    expect(result.output).toContain("error: failed to push");
    expect(result.output).not.toMatch(/\bok\b/);
  });

  // RTK: git/git.rs::test_push_filter_first_ref_wins_for_summary — with multiple
  // pushed refs, the first one is used for the summary.
  test("uses the first ref for the summary when several are pushed", async () => {
    const result = await filterRtkOutput(
      ["git", "push"],
      [
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  feat/a -> feat/a",
        "   1111111..2222222  feat/b -> feat/b",
      ].join("\n"),
    );

    expect(result.output.trimEnd().endsWith("ok feat/a")).toBe(true);
  });

  // RTK: git/git.rs::test_push_filter_token_savings_on_verbose_output — verbose
  // push output (progress phases) compresses by >=60% (whitespace tokens).
  test("achieves RTK token savings on verbose push output", async () => {
    const result = await filterRtkOutput(
      ["git", "push"],
      [
        "Enumerating objects: 142, done.",
        "Counting objects: 100% (142/142), done.",
        "Delta compression using up to 8 threads",
        "Compressing objects: 100% (88/88), done.",
        "Writing objects: 100% (104/104), 28.50 KiB | 14.25 MiB/s, done.",
        "Total 104 (delta 64), reused 0 (delta 0), pack-reused 0",
        "remote: Resolving deltas: 100% (64/64), completed with 24 local objects.",
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  master -> master",
      ].join("\n"),
    );

    expect(result.output).toContain("To https://github.com/foo/bar.git");
    expect(result.output.trimEnd().endsWith("ok master")).toBe(true);
    expect(result.output).not.toMatch(/Enumerating objects/);

    expectRtkParity(result, {
      critical: ["ok master"],
      forbidden: [/Enumerating objects/, /Compressing objects/],
      // RTK git.rs token-savings invariant on verbose output: >= 60%.
      minTokenSavingsRatio: 0.6,
    });
  });
});
