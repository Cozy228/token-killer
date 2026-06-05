import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git stash behavior", () => {
  // RTK: git/git.rs::test_filter_stash_list — strip the "WIP on <branch>:" /
  // "On <branch>:" prefix, keep "stash@{i}: <sha> <message>".
  test("strips WIP/On prefixes from stash list entries", async () => {
    const result = await filterRtkOutput(
      ["git", "stash", "list"],
      [
        "stash@{0}: WIP on main: abc1234 fix login",
        "stash@{1}: On feature: def5678 wip",
      ].join("\n"),
    );

    expect(result.output).not.toMatch(/WIP on/);
    expect(result.output).not.toMatch(/On feature/);

    expectRtkParity(result, {
      critical: ["stash@{0}: abc1234 fix login", "stash@{1}: def5678 wip"],
      forbidden: [/WIP on main/, /On feature/],
      exact: [
        "stash@{0}: abc1234 fix login",
        "stash@{1}: def5678 wip",
      ].join("\n"),
    });
  });

  // RTK: run_stash — an empty stash list collapses to "No stashes".
  // (The invalid-ref failure passthrough is gated by the product fixtureCase
  // "git-stash preserves invalid ref failure"; the migration harness intentionally
  // does not assert raw passthrough.)
  test("reports empty stash list", async () => {
    const result = await filterRtkOutput(["git", "stash", "list"], "");
    expectRtkParity(result, { critical: ["No stashes"] });
  });
});
