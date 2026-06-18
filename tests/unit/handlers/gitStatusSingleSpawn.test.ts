import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Issue #40: `tk git status` must spawn the underlying git ONCE on the common
// clean/dirty path. The second human `git status` capture is reserved for the
// in-progress-operation case, detected by cheap `.git/` probes. These tests pin
// the spawn count and the detached/in-progress recovery, plus the standalone
// helpers.

// Spy on executeCommand so we can count spawns and feed canned porcelain output.
const executeCommand = vi.fn<(...args: any[]) => Promise<any>>();
vi.mock("../../../src/executor.js", () => ({
  executeCommand: (...args: unknown[]) => executeCommand(...args),
}));

const { gitStatusHandler, resolveGitDir, hasInProgressState, detachedHeadFromGitDir } =
  await import("../../../src/handlers/git/status.js");

function parsed(args: string[]) {
  return {
    program: "git",
    args: ["status", ...args],
    original: ["git", "status", ...args],
    displayCommand: ["git", "status", ...args].join(" "),
  };
}

function porcelainResult(stdout: string, exitCode = 0) {
  return { command: "git status --porcelain -b", stdout, stderr: "", exitCode, durationMs: 1 };
}

describe("issue #40: git status helpers", () => {
  let repo: string;
  const realCwd = process.cwd();

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "tk-gitstatus-"));
  });

  afterEach(async () => {
    process.chdir(realCwd);
    await rm(repo, { recursive: true, force: true });
  });

  describe("resolveGitDir", () => {
    test("returns the .git directory for a main worktree, from a nested dir", async () => {
      await mkdir(path.join(repo, ".git"));
      const nested = path.join(repo, "src", "deep");
      await mkdir(nested, { recursive: true });
      expect(resolveGitDir(nested)).toBe(path.join(repo, ".git"));
    });

    test("follows a linked-worktree .git file to its per-worktree git dir", async () => {
      const wt = await mkdtemp(path.join(tmpdir(), "tk-wt-"));
      const perWorktree = path.join(repo, ".git", "worktrees", "wt");
      await writeFile(path.join(wt, ".git"), `gitdir: ${perWorktree}\n`);
      expect(resolveGitDir(wt)).toBe(perWorktree);
      await rm(wt, { recursive: true, force: true });
    });

    test("returns undefined outside any repo", async () => {
      const plain = await mkdtemp(path.join(tmpdir(), "tk-nogit-"));
      expect(resolveGitDir(plain)).toBeUndefined();
      await rm(plain, { recursive: true, force: true });
    });
  });

  describe("hasInProgressState", () => {
    test("clean git dir has no in-progress state", async () => {
      const gitDir = path.join(repo, ".git");
      await mkdir(gitDir);
      expect(hasInProgressState(gitDir)).toBe(false);
    });

    test.each([
      ["MERGE_HEAD", "file"],
      ["CHERRY_PICK_HEAD", "file"],
      ["REVERT_HEAD", "file"],
      ["BISECT_LOG", "file"],
      ["rebase-merge", "dir"],
      ["rebase-apply", "dir"],
    ])("detects %s as in-progress", async (marker, kind) => {
      const gitDir = path.join(repo, ".git");
      await mkdir(gitDir);
      if (kind === "dir") {
        await mkdir(path.join(gitDir, marker));
      } else {
        await writeFile(path.join(gitDir, marker), "deadbeef\n");
      }
      expect(hasInProgressState(gitDir)).toBe(true);
    });
  });

  describe("detachedHeadFromGitDir", () => {
    test("reconstructs the detached ref from a raw-oid HEAD file", async () => {
      const gitDir = path.join(repo, ".git");
      await mkdir(gitDir);
      await writeFile(path.join(gitDir, "HEAD"), "982154df296b060c9ae1847d89d144c5d4d6b6a4\n");
      expect(detachedHeadFromGitDir(gitDir)).toBe("HEAD detached at 982154d");
    });

    test("returns undefined when HEAD is a symref (on a branch)", async () => {
      const gitDir = path.join(repo, ".git");
      await mkdir(gitDir);
      await writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
      expect(detachedHeadFromGitDir(gitDir)).toBeUndefined();
    });
  });
});

describe("issue #40: gitStatusHandler.execute spawn count", () => {
  let repo: string;
  const realCwd = process.cwd();

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "tk-gitstatus-exec-"));
    await mkdir(path.join(repo, ".git"));
    await writeFile(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    process.chdir(repo);
    executeCommand.mockReset();
  });

  afterEach(async () => {
    process.chdir(realCwd);
    await rm(repo, { recursive: true, force: true });
  });

  test("clean tree spawns git exactly once", async () => {
    executeCommand.mockResolvedValueOnce(porcelainResult("## main...origin/main\n"));
    await gitStatusHandler.execute(parsed([]), {} as never);
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand.mock.calls[0]![0].args).toEqual(["status", "--porcelain", "-b"]);
  });

  test("dirty tree spawns git exactly once", async () => {
    executeCommand.mockResolvedValueOnce(porcelainResult("## main\nM  src/a.ts\n?? b.txt\n"));
    await gitStatusHandler.execute(parsed([]), {} as never);
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  test("detached HEAD: one spawn, ref recovered from .git/HEAD into auxStdout", async () => {
    await writeFile(path.join(repo, ".git", "HEAD"), "982154df296b060c9ae1847d89d144c5d4d6b6a4\n");
    executeCommand.mockResolvedValueOnce(porcelainResult("## HEAD (no branch)\n M src/a.ts\n"));
    const result = await gitStatusHandler.execute(parsed([]), {} as never);
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(result.auxStdout).toBe("HEAD detached at 982154d");
  });

  test.each([
    ["MERGE_HEAD", "file"],
    ["CHERRY_PICK_HEAD", "file"],
    ["REVERT_HEAD", "file"],
    ["BISECT_LOG", "file"],
    ["rebase-merge", "dir"],
    ["rebase-apply", "dir"],
  ])("in-progress %s: second human capture runs (two spawns)", async (marker, kind) => {
    const gitDir = path.join(repo, ".git");
    if (kind === "dir") {
      await mkdir(path.join(gitDir, marker));
    } else {
      await writeFile(path.join(gitDir, marker), "deadbeef\n");
    }
    executeCommand.mockResolvedValueOnce(porcelainResult("## main\n")).mockResolvedValueOnce({
      command: "git status",
      stdout: "On branch main\n\nYou are currently cherry-picking commit abc1234.\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    });
    const result = await gitStatusHandler.execute(parsed([]), {} as never);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    // The second spawn is the plain human `git status` under LC_ALL=C.
    expect(executeCommand.mock.calls[1]![0].args).toEqual(["status"]);
    expect(executeCommand.mock.calls[1]![1]).toEqual({ LC_ALL: "C" });
    expect(result.auxStdout).toContain("cherry-picking");
  });

  test("nonzero porcelain exit does not spawn the second capture", async () => {
    executeCommand.mockResolvedValueOnce(porcelainResult("", 128));
    await gitStatusHandler.execute(parsed([]), {} as never);
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });
});
