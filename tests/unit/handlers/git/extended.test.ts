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

function command(args: string[]): ParsedCommand {
  return {
    program: "git",
    args,
    original: ["git", ...args],
    displayCommand: `git ${args.join(" ")}`,
  };
}

function raw(stdout: string, stderr = "", exitCode = 0): RawResult {
  return {
    command: "git",
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
  };
}

async function filterGit(args: string[], result: RawResult) {
  const parsed = command(args);
  const handler = routeCommand(parsed);
  return handler.filter(result, parsed, options);
}

describe("git extended routing parity", () => {
  test.each([
    [["add", "."], "git-add"],
    [["commit", "-m", "fix: typo"], "git-commit"],
    [["push", "origin", "main"], "git-push"],
    [["pull", "--ff-only"], "git-pull"],
    [["fetch", "--all"], "git-fetch"],
    [["stash"], "git-stash"],
    [["stash", "push", "-m", "wip"], "git-stash"],
    [["stash", "save", "wip"], "git-stash"],
    [["stash", "list"], "git-stash"],
    [["stash", "show", "stash@{0}"], "git-stash"],
    [["stash", "apply", "stash@{0}"], "git-stash"],
    [["stash", "pop"], "git-stash"],
    [["stash", "drop", "stash@{0}"], "git-stash"],
    [["worktree"], "git-worktree"],
    [["worktree", "list"], "git-worktree"],
    [["worktree", "add", "../feature", "feature"], "git-worktree"],
    [["worktree", "remove", "../feature"], "git-worktree"],
  ])("routes git %s to %s", (args, handlerName) => {
    expect(routeCommand(command(args)).name).toBe(handlerName);
  });
});

describe("git add parity", () => {
  test("summarizes staged shortstat after successful add", async () => {
    const result = await filterGit(
      ["add", "."],
      raw(" 1 file changed, 5 insertions(+)\n"),
    );

    expect(result.handler).toBe("git-add");
    expect(result.output.trim()).toBe("ok 1 file changed, 5 insertions(+)");
  });

  test("keeps no-op add silent instead of inventing ok", async () => {
    const result = await filterGit(["add", "."], raw(""));

    expect(result.handler).toBe("git-add");
    expect(result.output).toBe("");
  });

  test("preserves git add failure details", async () => {
    const result = await filterGit(
      ["add", "missing.txt"],
      raw("", "fatal: pathspec 'missing.txt' did not match any files\n", 128),
    );

    expect(result.handler).toBe("git-add");
    expect(result.output).toContain("FAILED: git add");
    expect(result.output).toContain("missing.txt");
    expect(result.exitCode).toBe(128);
  });
});

describe("git commit parity", () => {
  test("compresses successful commit output to short hash and subject", async () => {
    const result = await filterGit(
      ["commit", "-m", "fix: typo"],
      raw("[main abc1234] fix: typo\n 1 file changed, 1 insertion(+)\n"),
    );

    expect(result.handler).toBe("git-commit");
    expect(result.output.trim()).toBe("ok abc1234 fix: typo");
  });

  test("preserves multiple commit message args as commit handler input", () => {
    const parsed = command([
      "commit",
      "-m",
      "feat: add multi-paragraph support",
      "-m",
      "This allows git commit -m title -m body.",
    ]);

    expect(parsed.args).toEqual([
      "commit",
      "-m",
      "feat: add multi-paragraph support",
      "-m",
      "This allows git commit -m title -m body.",
    ]);
    expect(routeCommand(parsed).name).toBe("git-commit");
  });

  test("routes combined -am flag without splitting it", () => {
    const parsed = command(["commit", "-am", "quick fix"]);

    expect(parsed.args).toEqual(["commit", "-am", "quick fix"]);
    expect(routeCommand(parsed).name).toBe("git-commit");
  });

  test("reports nothing-to-commit as a distinct no-op", async () => {
    const result = await filterGit(
      ["commit", "-m", "noop"],
      raw("", "nothing to commit, working tree clean\n", 1),
    );

    expect(result.handler).toBe("git-commit");
    expect(result.output.trim()).toBe("ok (nothing to commit)");
  });

  test("preserves real commit failures", async () => {
    const result = await filterGit(
      ["commit", "--amend", "-m", "new msg"],
      raw("", "fatal: You are in the middle of a merge -- cannot amend.\n", 128),
    );

    expect(result.handler).toBe("git-commit");
    expect(result.output).toContain("fatal:");
    expect(result.output).not.toContain("ok ");
  });
});

describe("git push parity", () => {
  test("drops progress phases and summarizes pushed ref", async () => {
    const result = await filterGit(
      ["push", "origin", "main"],
      raw([
        "Enumerating objects: 5, done.",
        "Counting objects: 100% (5/5), done.",
        "Delta compression using up to 8 threads",
        "Compressing objects: 100% (3/3), done.",
        "Writing objects: 100% (3/3), 312 bytes | 312.00 KiB/s, done.",
        "Total 3 (delta 2), reused 0 (delta 0)",
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  main -> main",
      ].join("\n")),
    );

    expect(result.handler).toBe("git-push");
    expect(result.output).toContain("To https://github.com/foo/bar.git");
    expect(result.output).toContain("main -> main");
    expect(result.output).toContain("ok main");
    expect(result.output).not.toContain("Enumerating objects");
    expect(result.output).not.toContain("Writing objects");
  });

  test("keeps remote messages and summarizes the first pushed ref", async () => {
    const result = await filterGit(
      ["push"],
      raw([
        "remote: Resolving deltas: 100% (2/2), completed with 2 local objects.",
        "remote: GitHub found 1 vulnerability on foo/bar's default branch.",
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  feat/a -> feat/a",
        "   1111111..2222222  feat/b -> feat/b",
      ].join("\n")),
    );

    expect(result.handler).toBe("git-push");
    expect(result.output).toContain("remote: GitHub found 1 vulnerability");
    expect(result.output).toContain("ok feat/a");
    expect(result.output).not.toContain("ok feat/b");
  });

  test("summarizes up-to-date push distinctly", async () => {
    const result = await filterGit(["push"], raw("Everything up-to-date\n"));

    expect(result.handler).toBe("git-push");
    expect(result.output).toContain("Everything up-to-date");
    expect(result.output).toContain("ok (up-to-date)");
  });

  test("does not emit ok summary on rejected push", async () => {
    const result = await filterGit(
      ["push"],
      raw([
        "To https://github.com/foo/bar.git",
        " ! [rejected]        main -> main (non-fast-forward)",
        "error: failed to push some refs to 'https://github.com/foo/bar.git'",
      ].join("\n"), "", 1),
    );

    expect(result.handler).toBe("git-push");
    expect(result.output).toContain("[rejected]");
    expect(result.output).toContain("error: failed to push");
    expect(result.output).not.toContain("ok ");
  });
});

describe("git pull and fetch parity", () => {
  test("summarizes up-to-date pull", async () => {
    const result = await filterGit(["pull", "--ff-only"], raw("Already up to date.\n"));

    expect(result.handler).toBe("git-pull");
    expect(result.output.trim()).toBe("ok (up-to-date)");
  });

  test("summarizes pull shortstat", async () => {
    const result = await filterGit(
      ["pull"],
      raw("Fast-forward\n src/a.ts | 5 +++++\n 3 files changed, 10 insertions(+), 2 deletions(-)\n"),
    );

    expect(result.handler).toBe("git-pull");
    expect(result.output.trim()).toBe("ok 3 files +10 -2");
  });

  test("preserves pull failure details", async () => {
    const result = await filterGit(
      ["pull"],
      raw("", "fatal: Not possible to fast-forward, aborting.\n", 128),
    );

    expect(result.handler).toBe("git-pull");
    expect(result.output).toContain("FAILED: git pull");
    expect(result.output).toContain("fast-forward");
  });

  test("counts new refs in fetch stderr", async () => {
    const result = await filterGit(
      ["fetch", "--all"],
      raw("", [
        "From github.com:foo/bar",
        " * [new branch]      feature-x -> origin/feature-x",
        "   abc1234..def5678  main      -> origin/main",
      ].join("\n")),
    );

    expect(result.handler).toBe("git-fetch");
    expect(result.output).toContain("ok fetched (2 new refs)");
    expect(result.output).toContain("feature-x -> origin/feature-x");
    expect(result.output).toContain("main      -> origin/main");
  });

  test("summarizes fetch with no new refs", async () => {
    const result = await filterGit(["fetch"], raw("", "From github.com:foo/bar\n"));

    expect(result.handler).toBe("git-fetch");
    expect(result.output.trim()).toBe("ok fetched");
  });
});

describe("git stash parity", () => {
  test("summarizes successful default stash while preserving stash subject", async () => {
    const result = await filterGit(
      ["stash"],
      raw("Saved working directory and index state WIP on main: abc1234 fix\n"),
    );

    expect(result.handler).toBe("git-stash");
    expect(result.output.trim()).toBe("ok stashed WIP on main: abc1234 fix");
  });

  test("passes through no-local-changes stash message", async () => {
    const result = await filterGit(["stash", "push"], raw("No local changes to save\n"));

    expect(result.handler).toBe("git-stash");
    expect(result.output.trim()).toBe("No local changes to save");
  });

  test("compacts stash list by removing WIP prefixes", async () => {
    const result = await filterGit(
      ["stash", "list"],
      raw("stash@{0}: WIP on main: abc1234 fix login\nstash@{1}: On feature: def5678 wip\n"),
    );

    expect(result.handler).toBe("git-stash");
    expect(result.output).toContain("stash@{0}: abc1234 fix login");
    expect(result.output).toContain("stash@{1}: def5678 wip");
    expect(result.output).not.toContain("WIP on main");
    expect(result.output).not.toContain("On feature");
  });

  test("reports empty stash list", async () => {
    const result = await filterGit(["stash", "list"], raw(""));

    expect(result.handler).toBe("git-stash");
    expect(result.output.trim()).toBe("No stashes");
  });

  test("uses compact diff for stash show", async () => {
    const result = await filterGit(
      ["stash", "show", "stash@{0}"],
      raw([
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n")),
    );

    expect(result.handler).toBe("git-stash");
    expect(result.output).toContain("src/a.ts");
    expect(result.output).toContain("-old");
    expect(result.output).toContain("+new");
  });

  test("summarizes stash apply-like subcommands", async () => {
    const result = await filterGit(["stash", "pop"], raw("Dropped refs/stash@{0}\n"));

    expect(result.handler).toBe("git-stash");
    expect(result.output.trim()).toBe("ok stash pop");
  });

  test("preserves stash failures", async () => {
    const result = await filterGit(
      ["stash", "apply", "stash@{7}"],
      raw("", "fatal: stash@{7} is not a valid reference\n", 128),
    );

    expect(result.handler).toBe("git-stash");
    expect(result.output).toContain("FAILED: git stash apply");
    expect(result.output).toContain("not a valid reference");
  });
});

describe("git worktree parity", () => {
  test("compacts worktree list and preserves path hash branch", async () => {
    const result = await filterGit(
      ["worktree", "list"],
      raw("/home/user/project  abc1234 [main]\n/home/user/worktrees/feat  def5678 [feature]\n"),
    );

    expect(result.handler).toBe("git-worktree");
    expect(result.output).toContain("abc1234 [main]");
    expect(result.output).toContain("def5678 [feature]");
  });

  test("summarizes worktree actions as ok", async () => {
    const result = await filterGit(["worktree", "add", "../feature", "feature"], raw(""));

    expect(result.handler).toBe("git-worktree");
    expect(result.output.trim()).toBe("ok");
  });

  test("preserves worktree action failures", async () => {
    const result = await filterGit(
      ["worktree", "remove", "../missing"],
      raw("", "fatal: '../missing' is not a working tree\n", 128),
    );

    expect(result.handler).toBe("git-worktree");
    expect(result.output).toContain("FAILED: git worktree remove ../missing");
    expect(result.output).toContain("not a working tree");
  });
});
