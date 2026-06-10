import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git pull behavior", () => {
  // RTK: git/git.rs run_pull — "Already up to date" collapses to "ok (up-to-date)".
  test("collapses an up-to-date pull", async () => {
    const result = await filterRtkOutput(["git", "pull"], "Already up to date.");
    expectRtkParity(result, {
      critical: ["ok (up-to-date)"],
      exact: "ok (up-to-date)",
    });
  });

  // RTK: run_pull — a successful merge collapses to "ok <files> files +<ins> -<del>".
  test("summarizes a fast-forward pull as a shortstat line", async () => {
    const result = await filterRtkOutput(
      ["git", "pull"],
      [
        "Updating abc1234..def5678",
        "Fast-forward",
        " 3 files changed, 10 insertions(+), 2 deletions(-)",
      ].join("\n"),
    );

    expect(result.output).not.toMatch(/Fast-forward/);

    expectRtkParity(result, {
      critical: ["ok 3 files +10 -2"],
      forbidden: [/Updating/, /Fast-forward/],
    });
  });
  // (The unstaged-change failure passthrough is gated by the product fixtureCase
  // "git-pull preserves unstaged-change failure".)
});
