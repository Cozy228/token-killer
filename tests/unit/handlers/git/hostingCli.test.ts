import { describe, expect, test } from "vitest";

import { routeCommand } from "../../../../src/router.js";
import type { ParsedCommand, RawResult, TgOptions } from "../../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

function command(program: "gh" | "glab", args: string[]): ParsedCommand {
  return {
    program,
    args,
    original: [program, ...args],
    displayCommand: `${program} ${args.join(" ")}`,
  };
}

function raw(stdout: string, stderr = "", exitCode = 0): RawResult {
  return {
    command: "hosting cli",
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
  };
}

async function filter(program: "gh" | "glab", args: string[], result: RawResult) {
  const parsed = command(program, args);
  const handler = routeCommand(parsed);
  return handler.filter(result, parsed, options);
}

describe("GitHub CLI routing parity", () => {
  test.each([
    [["pr", "list"], "gh"],
    [["pr", "view", "123"], "gh"],
    [["pr", "checks", "123"], "gh"],
    [["pr", "status"], "gh"],
    [["pr", "create", "--title", "feat"], "gh"],
    [["pr", "merge", "123"], "gh"],
    [["pr", "diff", "123"], "gh"],
    [["pr", "comment", "123", "--body", "done"], "gh"],
    [["pr", "edit", "123", "--title", "new"], "gh"],
    [["issue", "list"], "gh"],
    [["issue", "view", "55"], "gh"],
    [["run", "list"], "gh"],
    [["run", "view", "999"], "gh"],
    [["repo", "view"], "gh"],
    [["api", "repos/foo/bar/pulls"], "gh"],
  ])("routes gh %s to %s", (args, handlerName) => {
    expect(routeCommand(command("gh", args)).name).toBe(handlerName);
  });
});

describe("GitHub CLI output parity", () => {
  test("formats pr list JSON into compact PR rows", async () => {
    const result = await filter(
      "gh",
      ["pr", "list"],
      raw(JSON.stringify([
        {
          number: 42,
          title: "feat: add token guard",
          state: "OPEN",
          author: { login: "alice" },
          updatedAt: "2026-06-02T10:00:00Z",
        },
      ])),
    );

    expect(result.handler).toBe("gh");
    expect(result.output).toContain("#42");
    expect(result.output).toContain("feat: add token guard");
    expect(result.output).toContain("alice");
    expect(result.output).not.toContain('"updatedAt"');
  });

  test("formats pr view JSON and filters markdown noise while preserving code blocks", async () => {
    const body = [
      "<!-- bot comment -->",
      "[![CI](https://example.com/badge.svg)](https://example.com)",
      "## Summary",
      "Implements git extended handlers.",
      "```ts",
      "const keep = true;",
      "```",
      "![screenshot](https://example.com/image.png)",
      "---",
    ].join("\n");
    const result = await filter(
      "gh",
      ["pr", "view", "42"],
      raw(JSON.stringify({
        number: 42,
        title: "feat: git extended",
        state: "OPEN",
        author: { login: "alice" },
        body,
        labels: [{ name: "tests" }],
        mergeable: "MERGEABLE",
        url: "https://github.com/foo/bar/pull/42",
      })),
    );

    expect(result.handler).toBe("gh");
    expect(result.output).toContain("#42");
    expect(result.output).toContain("feat: git extended");
    expect(result.output).toContain("Implements git extended handlers.");
    expect(result.output).toContain("const keep = true;");
    expect(result.output).not.toContain("bot comment");
    expect(result.output).not.toContain("badge.svg");
    expect(result.output).not.toContain("screenshot");
  });

  test("formats pr checks output and keeps failed checks actionable", async () => {
    const result = await filter(
      "gh",
      ["pr", "checks", "42"],
      raw([
        "build\tpass\t0\tBuild succeeded\thttps://github.com/foo/bar/actions/runs/1",
        "test\tfail\t0\tUnit tests failed\thttps://github.com/foo/bar/actions/runs/2",
      ].join("\n")),
    );

    expect(result.handler).toBe("gh");
    expect(result.output).toContain("test");
    expect(result.output).toContain("fail");
    expect(result.output).toContain("Unit tests failed");
    expect(result.output).not.toContain("Build succeeded");
  });

  test("formats issue list JSON into compact issue rows", async () => {
    const result = await filter(
      "gh",
      ["issue", "list"],
      raw(JSON.stringify([
        {
          number: 7,
          title: "Bug in raw dispatch",
          state: "OPEN",
          author: { login: "bob" },
          labels: [{ name: "bug" }],
        },
      ])),
    );

    expect(result.handler).toBe("gh");
    expect(result.output).toContain("#7");
    expect(result.output).toContain("Bug in raw dispatch");
    expect(result.output).toContain("bug");
    expect(result.output).not.toContain('"labels"');
  });

  test("formats run list JSON and preserves failure status", async () => {
    const result = await filter(
      "gh",
      ["run", "list"],
      raw(JSON.stringify([
        {
          databaseId: 999,
          workflowName: "CI",
          status: "completed",
          conclusion: "failure",
          headBranch: "main",
          displayTitle: "test failure",
        },
      ])),
    );

    expect(result.handler).toBe("gh");
    expect(result.output).toContain("999");
    expect(result.output).toContain("CI");
    expect(result.output).toContain("failure");
    expect(result.output).toContain("test failure");
  });

  test("formats repo view JSON without dumping the whole payload", async () => {
    const result = await filter(
      "gh",
      ["repo", "view"],
      raw(JSON.stringify({
        nameWithOwner: "foo/bar",
        description: "Token optimized CLI proxy",
        isPrivate: false,
        defaultBranchRef: { name: "main" },
        stargazerCount: 12,
        url: "https://github.com/foo/bar",
      })),
    );

    expect(result.handler).toBe("gh");
    expect(result.output).toContain("foo/bar");
    expect(result.output).toContain("Token optimized CLI proxy");
    expect(result.output).toContain("main");
    expect(result.output).not.toContain('"stargazerCount"');
  });

  test("passes explicit --json output through unfiltered", async () => {
    const payload = JSON.stringify({ number: 42, title: "raw requested" });
    const result = await filter("gh", ["pr", "view", "42", "--json", "number,title"], raw(payload));

    expect(result.handler).toBe("gh");
    expect(result.output.trim()).toBe(payload);
  });
});

describe("GitLab CLI routing parity", () => {
  test.each([
    [["mr", "list"], "glab"],
    [["mr", "view", "42"], "glab"],
    [["mr", "create", "--title", "feat"], "glab"],
    [["mr", "merge", "42"], "glab"],
    [["mr", "approve", "42"], "glab"],
    [["issue", "list"], "glab"],
    [["issue", "view", "55"], "glab"],
    [["ci", "list"], "glab"],
    [["ci", "status"], "glab"],
    [["ci", "trace", "123"], "glab"],
    [["release", "list"], "glab"],
    [["release", "view", "v1.0.0"], "glab"],
    [["api", "projects/1/merge_requests"], "glab"],
  ])("routes glab %s to %s", (args, handlerName) => {
    expect(routeCommand(command("glab", args)).name).toBe(handlerName);
  });
});

describe("GitLab CLI output parity", () => {
  test("formats mr list JSON into compact MR rows", async () => {
    const result = await filter(
      "glab",
      ["mr", "list"],
      raw(JSON.stringify([
        {
          iid: 42,
          title: "feat: add GitLab support",
          state: "opened",
          author: { username: "alice" },
          web_url: "https://gitlab.com/foo/bar/-/merge_requests/42",
        },
      ])),
    );

    expect(result.handler).toBe("glab");
    expect(result.output).toContain("!42");
    expect(result.output).toContain("feat: add GitLab support");
    expect(result.output).toContain("alice");
    expect(result.output).not.toContain('"web_url"');
  });

  test("formats mr view JSON with branch, label, reviewer, and mergeability context", async () => {
    const result = await filter(
      "glab",
      ["mr", "view", "42"],
      raw(JSON.stringify({
        iid: 42,
        title: "feat: glab parity",
        state: "opened",
        source_branch: "feature",
        target_branch: "main",
        labels: ["tests", "git"],
        reviewers: [{ username: "reviewer" }],
        merge_status: "can_be_merged",
        description: "Keeps useful body content.",
        web_url: "https://gitlab.com/foo/bar/-/merge_requests/42",
      })),
    );

    expect(result.handler).toBe("glab");
    expect(result.output).toContain("!42");
    expect(result.output).toContain("feature");
    expect(result.output).toContain("main");
    expect(result.output).toContain("tests");
    expect(result.output).toContain("reviewer");
    expect(result.output).toContain("Keeps useful body content.");
  });

  test("formats GitLab CI list JSON and preserves failed pipeline", async () => {
    const result = await filter(
      "glab",
      ["ci", "list"],
      raw(JSON.stringify([
        {
          id: 123,
          status: "failed",
          ref: "main",
          web_url: "https://gitlab.com/foo/bar/-/pipelines/123",
        },
      ])),
    );

    expect(result.handler).toBe("glab");
    expect(result.output).toContain("123");
    expect(result.output).toContain("failed");
    expect(result.output).toContain("main");
  });

  test("filters GitLab CI trace boilerplate but keeps failing command", async () => {
    const result = await filter(
      "glab",
      ["ci", "trace", "123"],
      raw([
        "section_start:1710000000:prepare_executor[0K",
        "Running with gitlab-runner 16.0.0",
        "Fetching changes with git depth set to 20...",
        "$ pnpm test",
        "AssertionError: expected true to be false",
        "section_end:1710000001:prepare_executor[0K",
      ].join("\n")),
    );

    expect(result.handler).toBe("glab");
    expect(result.output).toContain("pnpm test");
    expect(result.output).toContain("AssertionError");
    expect(result.output).not.toContain("section_start");
    expect(result.output).not.toContain("gitlab-runner");
  });

  test("formats release list output compactly", async () => {
    const result = await filter(
      "glab",
      ["release", "list"],
      raw([
        "v1.0.0  Release 1.0.0  2026-06-01",
        "v0.9.0  Release 0.9.0  2026-05-01",
      ].join("\n")),
    );

    expect(result.handler).toBe("glab");
    expect(result.output).toContain("v1.0.0");
    expect(result.output).toContain("Release 1.0.0");
    expect(result.output).not.toContain("v0.9.0  Release 0.9.0  2026-05-01\nv0.9.0");
  });

  test("passes explicit JSON or output format through unfiltered", async () => {
    const payload = JSON.stringify({ iid: 42, title: "raw requested" });
    const result = await filter("glab", ["mr", "view", "42", "--output", "json"], raw(payload));

    expect(result.handler).toBe("glab");
    expect(result.output.trim()).toBe(payload);
  });
});
