import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git commit behavior", () => {
  // RTK: git/git.rs run_commit — a successful commit collapses to "ok <hash>",
  // dropping the "[branch hash] subject" envelope.
  test("collapses a successful commit to an ok summary with the short hash", async () => {
    const result = await filterRtkOutput(
      ["git", "commit", "-m", "fix: typo"],
      ["[main abc1234] fix: typo", " 1 file changed, 2 insertions(+)"].join("\n"),
    );

    expect(result.output).toContain("abc1234");

    expectRtkParity(result, {
      critical: ["ok abc1234"],
      // RTK emits "ok <hash>" ONLY — the subject must be dropped, not appended.
      forbidden: [/^\[main/m, /1 file changed/, /fix: typo/],
      exact: "ok abc1234",
    });
  });

  // RTK: run_commit — "nothing to commit" maps to the explicit no-op summary so an
  // agent can tell it apart from a real commit.
  test("reports nothing to commit without a false success hash", async () => {
    const result = await filterRtkOutput(
      ["git", "commit", "-m", "noop"],
      ["On branch main", "nothing to commit, working tree clean"].join("\n"),
      1,
    );
    expectRtkParity(result, {
      critical: ["ok (nothing to commit)"],
      exact: "ok (nothing to commit)",
    });
  });
  // (The dry-run dirty-tree failure passthrough is gated by the product fixtureCase
  // "git-commit preserves dry-run dirty tree details".)
});
