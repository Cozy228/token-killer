import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

describe("RTK git worktree behavior", () => {
  // RTK: git/git.rs::test_filter_worktree_list — keep sha + [branch], normalize
  // whitespace to single spaces, compact $HOME to ~ (home not matched here).
  test("normalizes worktree listing whitespace while keeping sha and branch", async () => {
    const result = await filterRtkOutput(
      ["git", "worktree", "list"],
      [
        "/home/user/project  abc1234 [main]",
        "/home/user/worktrees/feat  def5678 [feature]",
      ].join("\n"),
    );

    expect(result.output).toContain("abc1234");
    expect(result.output).toContain("[main]");
    expect(result.output).toContain("[feature]");

    expectRtkParity(result, {
      critical: ["abc1234", "def5678", "[main]", "[feature]"],
      forbidden: [/ {2,}/],
      exact: [
        "/home/user/project abc1234 [main]",
        "/home/user/worktrees/feat def5678 [feature]",
      ].join("\n"),
    });
  });

  // RTK: filter_worktree_list compacts a $HOME-prefixed path to ~.
  test("compacts the home directory prefix to ~", async () => {
    const result = await filterRtkFixture(
      ["git", "worktree", "list"],
      "tests/fixtures/git/worktree_list.txt",
    );

    expectRtkParity(result, {
      critical: ["~/Workspace/token-killer", "62d59ca", "[token-killer-node-cli]"],
      forbidden: [/\/Users\/ziyu\/Workspace/],
    });
  });
});
