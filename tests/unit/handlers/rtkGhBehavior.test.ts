import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";
import { buildGhArgs } from "../../../src/handlers/git/hostingCli.js";

describe("RTK gh behavior", () => {
  // RTK: gh_cmd.rs — gh's human table is never trusted; RTK re-runs each
  // subcommand with `--json <fields>` and filters the JSON. Explicit `--json`
  // (or a view's --jq/--web/--comments) means passthrough.
  describe("child command construction (--json injection)", () => {
    test("pr list injects the PR JSON fields", () => {
      expect(buildGhArgs(["pr", "list"])).toEqual([
        "pr",
        "list",
        "--json",
        "number,title,state,author,updatedAt",
      ]);
    });

    test("repo view injects the repo JSON fields after the user args", () => {
      expect(buildGhArgs(["repo", "view", "owner/name"])).toEqual([
        "repo",
        "view",
        "owner/name",
        "--json",
        "name,owner,description,url,stargazerCount,forkCount,isPrivate",
      ]);
    });

    test("run list injects fields and the --limit 10 cap", () => {
      expect(buildGhArgs(["run", "list"])).toEqual([
        "run",
        "list",
        "--json",
        "databaseId,name,status,conclusion,createdAt",
        "--limit",
        "10",
      ]);
    });

    test("explicit --json passes through untouched", () => {
      const args = ["pr", "list", "--json", "number"];
      expect(buildGhArgs(args)).toBe(args);
    });

    test("a pr view with --web is a passthrough, not a JSON re-run", () => {
      const args = ["pr", "view", "42", "--web"];
      expect(buildGhArgs(args)).toBe(args);
    });
  });

  // RTK: format_pr_list / format_issue_list — an empty list emits the explicit
  // "No …" summary and must NEVER fall back to the raw `[]` JSON envelope.
  test.each([
    [["gh", "pr", "list"], "No Pull Requests"],
    [["gh", "issue", "list"], "No Issues"],
  ])("empty %s renders the No-… summary, not raw []", async (cmd, expected) => {
    const result = await filterRtkOutput(cmd as string[], "[]");
    expect(result.output.trim()).toBe(expected);
    expect(result.output).not.toContain("[]");
  });

  // RTK: gh_cmd.rs::format_issue_view — end-to-end, not just build-args. The
  // injected `issue view --json ...` JSON must render a summary, never raw JSON.
  test("renders issue view as a summary, not raw JSON", async () => {
    const result = await filterRtkOutput(
      ["gh", "issue", "view", "42"],
      JSON.stringify({
        number: 42,
        title: "Login throws on empty password",
        state: "OPEN",
        author: { login: "alice" },
        url: "https://github.com/o/r/issues/42",
        body: "Steps to reproduce:\n1. submit empty form",
      }),
    );

    expectRtkParity(result, {
      critical: [
        "[open] Issue #42: Login throws on empty password",
        "  Author: @alice",
        "  Status: OPEN",
        "  URL: https://github.com/o/r/issues/42",
        "  Description:",
        "    Steps to reproduce:",
      ],
      // Must not leak the raw JSON envelope.
      forbidden: [/"number":/, /"author":/, /\{/],
    });
  });

  // RTK: gh_cmd.rs::format_issue_list — "Issues\n  [open] #N title" (no labels).
  test("renders issue list with binary state icons and no labels", async () => {
    const result = await filterRtkOutput(
      ["gh", "issue", "list"],
      JSON.stringify([
        { number: 1, title: "open bug", state: "OPEN", author: { login: "a" } },
        { number: 2, title: "done", state: "CLOSED", author: { login: "b" } },
      ]),
    );

    expectRtkParity(result, {
      critical: ["Issues", "  [open] #1 open bug", "  [closed] #2 done"],
      exact: ["Issues", "  [open] #1 open bug", "  [closed] #2 done"].join("\n"),
    });
  });

  // RTK: gh_cmd.rs::format_run_list — "Workflow Runs\n  <icon> <name> [<id>]".
  test("renders workflow runs with conclusion icons", async () => {
    const result = await filterRtkOutput(
      ["gh", "run", "list"],
      JSON.stringify([
        { databaseId: 101, name: "CI", status: "completed", conclusion: "success" },
        { databaseId: 102, name: "Deploy", status: "completed", conclusion: "failure" },
        { databaseId: 103, name: "Nightly", status: "in_progress", conclusion: "" },
      ]),
    );

    expectRtkParity(result, {
      critical: [
        "Workflow Runs",
        "[ok] CI [101]",
        "[FAIL] Deploy [102]",
        "[time] Nightly [103]",
      ],
      forbidden: [/workflowName/, /displayTitle/, /undefined/],
    });
  });

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
