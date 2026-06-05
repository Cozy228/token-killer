import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK gh behavior", () => {
  // RTK: gh_cmd.rs::format_pr_list — gh resolves `pr list` to JSON and renders
  // "Pull Requests\n  [open] #N <title> (<author>)".
  test("renders the PR list with state icons and authors", async () => {
    const result = await filterRtkOutput(
      ["gh", "pr", "list"],
      JSON.stringify([
        { number: 12, title: "fix auth flow", state: "OPEN", author: { login: "alice" } },
        { number: 13, title: "update deps", state: "OPEN", author: { login: "bob" } },
      ]),
    );

    expect(result.output).toContain("#12");
    expect(result.output).toContain("fix auth flow");

    expectRtkParity(result, {
      critical: ["Pull Requests", "[open] #12 fix auth flow (alice)", "[open] #13 update deps (bob)"],
      exact: [
        "Pull Requests",
        "  [open] #12 fix auth flow (alice)",
        "  [open] #13 update deps (bob)",
      ].join("\n"),
    });
  });

  // RTK: format_pr_list caps the listing at CAP_LIST (20) with "  … +N more".
  test("caps long PR lists at CAP_LIST", async () => {
    const prs = Array.from({ length: 25 }, (_, i) => ({
      number: i + 1,
      title: `pr ${i + 1}`,
      state: "OPEN",
      author: { login: "dev" },
    }));
    const result = await filterRtkOutput(["gh", "pr", "list"], JSON.stringify(prs));

    expectRtkParity(result, {
      critical: ["… +5 more"],
      forbidden: [/#21 /],
    });
  });

  // RTK: format_repo_view — "owner/name", "[public]", stars/forks, url (no default branch).
  test("renders repo view identity without verbose chrome", async () => {
    const result = await filterRtkOutput(
      ["gh", "repo", "view"],
      JSON.stringify({
        name: "token-guard",
        owner: { login: "Cozy228" },
        description: "",
        url: "https://github.com/Cozy228/token-guard",
        stargazerCount: 7,
        forkCount: 2,
        isPrivate: false,
      }),
    );

    expectRtkParity(result, {
      critical: ["Cozy228/token-guard", "[public]", "7 stars | 2 forks", "https://github.com/Cozy228/token-guard"],
      exact: [
        "Cozy228/token-guard",
        "  [public]",
        "  7 stars | 2 forks",
        "  https://github.com/Cozy228/token-guard",
      ].join("\n"),
    });
  });
});
