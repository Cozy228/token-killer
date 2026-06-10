import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git fetch behavior", () => {
  // RTK: git/git.rs run_fetch — count ref-update lines ("->" or "[new") and collapse
  // to "ok fetched (N new refs)", dropping the per-ref noise.
  test("summarizes fetched refs as a count", async () => {
    const result = await filterRtkOutput(
      ["git", "fetch"],
      [
        "From https://github.com/foo/bar",
        " * [new branch]      main       -> origin/main",
        "   abc1234..def5678  develop    -> origin/develop",
      ].join("\n"),
    );

    expect(result.output).not.toMatch(/new branch/);

    expectRtkParity(result, {
      critical: ["ok fetched (2 new refs)"],
      forbidden: [/origin\/develop/, /\* \[new branch\]/],
      exact: "ok fetched (2 new refs)",
    });
  });

  // RTK: run_fetch — no ref updates collapses to "ok fetched".
  test("reports a no-op fetch", async () => {
    const result = await filterRtkOutput(["git", "fetch"], "From https://github.com/foo/bar");
    expectRtkParity(result, { critical: ["ok fetched"], exact: "ok fetched" });
  });
  // (The missing-remote failure passthrough is gated by the product fixtureCase
  // "git-fetch preserves missing remote failure".)
});
