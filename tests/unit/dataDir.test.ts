import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  fingerprintSegment,
  historyFile,
  normalizeDriveCase,
  projectFingerprint,
  rawOutputPathRelative,
  contexaHome,
} from "../../src/core/dataDir.js";

const previousHome = process.env.CONTEXA_HOME;

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.CONTEXA_HOME;
  } else {
    process.env.CONTEXA_HOME = previousHome;
  }
});

describe("dataDir", () => {
  test("stores project data under CONTEXA_HOME", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "ctx-home-"));
    process.env.CONTEXA_HOME = home;
    const cwd = path.join(home, "workspace");
    const fingerprint = projectFingerprint(cwd);

    expect(contexaHome()).toBe(home);
    expect(fingerprint).toMatch(/^repo:[a-f0-9]{12}$/);
    // The on-disk segment sanitizes ':' to '-' on Windows (':' is illegal in paths);
    // fingerprintSegment is a no-op on POSIX, so this matches the product on both.
    const seg = fingerprintSegment(fingerprint);
    expect(historyFile(cwd)).toBe(path.join(home, "projects", seg, "history.jsonl"));
    expect(rawOutputPathRelative(cwd, "sample.log")).toBe(
      path.join("projects", seg, "raw", "sample.log"),
    );

    await rm(home, { recursive: true, force: true });
  });

  test("anchors the fingerprint to the git repo root across subdirs and worktrees", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "ctx-repo-"));
    await mkdir(path.join(repo, ".git"));
    const nested = path.join(repo, "src", "handlers");
    await mkdir(nested, { recursive: true });

    // A subdirectory of the repo shares the repo root's fingerprint — running a
    // command from `src/handlers` must NOT mint a separate `repo:` bucket.
    expect(projectFingerprint(nested)).toBe(projectFingerprint(repo));

    // A linked worktree (`.git` is a file pointing at <repo>/.git/worktrees/<name>)
    // resolves to the SAME main-repo fingerprint, so isolated agents don't fragment.
    const worktree = await mkdtemp(path.join(tmpdir(), "ctx-wt-"));
    await writeFile(
      path.join(worktree, ".git"),
      `gitdir: ${path.join(repo, ".git", "worktrees", "wt")}\n`,
    );
    expect(projectFingerprint(worktree)).toBe(projectFingerprint(repo));

    await rm(repo, { recursive: true, force: true });
    await rm(worktree, { recursive: true, force: true });
  });

  test("falls back to the cwd hash outside a git repo", async () => {
    const a = await mkdtemp(path.join(tmpdir(), "ctx-nogit-a-"));
    const b = await mkdtemp(path.join(tmpdir(), "ctx-nogit-b-"));
    // Two unrelated non-git directories keep distinct fingerprints (no anchor).
    expect(projectFingerprint(a)).not.toBe(projectFingerprint(b));
    expect(projectFingerprint(a)).toMatch(/^repo:[a-f0-9]{12}$/);
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });

  test("normalizes Windows drive-letter case so c: and C: map to one bucket (I6)", () => {
    // VS Code's agent run_in_terminal reports a lowercase drive while the user's
    // interactive shell reports uppercase; realpathSync does not reconcile them, so
    // the same repo would split into two un-mergeable buckets. Uppercase the drive.
    expect(normalizeDriveCase("c:\\Users\\u\\contexa", "win32")).toBe("C:\\Users\\u\\contexa");
    expect(normalizeDriveCase("C:\\Users\\u\\contexa", "win32")).toBe("C:\\Users\\u\\contexa");
    // POSIX paths have no drive letter — identity (existing buckets untouched).
    expect(normalizeDriveCase("/home/u/contexa", "linux")).toBe("/home/u/contexa");
    // A lowercase first segment on POSIX must never be mistaken for a drive letter.
    expect(normalizeDriveCase("/c/data", "linux")).toBe("/c/data");
  });

  test("spawn passes CONTEXA_HOME under vitest", () => {
    const probe = spawnSync(
      process.execPath,
      ["-e", "console.log(process.env.CONTEXA_HOME || 'missing')"],
      {
        encoding: "utf8",
        env: { ...process.env, CONTEXA_HOME: "/tmp/ctx-probe-home" },
        timeout: 15000,
      },
    );
    expect(probe.stdout.trim()).toBe("/tmp/ctx-probe-home");
  });

  test("CLI subprocess respects CONTEXA_HOME", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-env-cli-"));
    const tkHome = path.join(dir, "ctx-data");
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const cli = path.join(repoRoot, "src/cli.ts");
    await writeFile(path.join(dir, "sample.txt"), "hello\n");
    const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;
    const result = spawnSync(process.execPath, ["--import", tsxLoader, cli, "cat", "sample.txt"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, CONTEXA_HOME: tkHome },
      timeout: 20000,
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    process.env.CONTEXA_HOME = tkHome;
    const expectedHistory = historyFile(dir);
    const history = await readFile(expectedHistory, "utf8");
    expect(history).toContain("cat sample.txt");

    await rm(dir, { recursive: true, force: true });
  });
});
