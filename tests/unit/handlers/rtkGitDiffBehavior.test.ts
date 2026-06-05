import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

// RTK oracle: git/diff_cmd.rs + system/pipe_cmd.rs::git_diff_wrapper —
// `rtk git diff` filters the diff with `compact_diff(input, 200)` and emits only
// the condensed per-file changes (header + hunks + `+N -M`), never a diffstat and
// never live working-tree state. tg's git-diff filter must process ONLY the
// provided diff text; it must not shell out to `git diff --stat` (which reads the
// real repo and previously inflated fixture output well past the raw size).
describe("RTK git-diff behavior", () => {
  test("condenses the provided diff and never reads live repo state", async () => {
    const result = await filterRtkFixture(["git", "diff"], "tests/fixtures/git/diff_large.txt");

    expectRtkParity(result, {
      critical: [
        "src/order/submit.ts",
        "@@ -40,7 +40,9 @@",
        "+  return api.submit({ ...payload, idempotencyKey })",
        "+1 -1",
      ],
      forbidden: [
        // A live `git diff --stat` shell-out would surface unrelated working-tree
        // files and an insertion/deletion summary; the filter must show neither.
        /files? changed/,
        /insertions?\(\+\)/,
        /three-way-comparison/,
      ],
      // Output must be strictly smaller than the raw diff it was given.
      minSavingsRatio: 0.1,
    });
  });
});
