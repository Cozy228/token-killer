/**
 * Worktree-aware project shard placement (CONTEXA-IMPL §3 + §9 P28 addenda).
 *
 * Shard key = 12 hex of blake2b over realpath(`git rev-parse --git-common-dir`);
 * fallback = realpath(project root) for non-git dirs. `--git-common-dir` (not
 * `--git-dir`) resolves every git worktree to the main repo's .git — per-worktree
 * store data must not die with the worktree.
 *
 * Path duality: `projectRoot` is the CURRENT checkout's toplevel (read-through
 * resolves project-relative paths against the checkout the caller opened from);
 * the shard is common-dir keyed so all checkouts of one repo share one store.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { blake2bHex } from "./hash.ts";

/**
 * Canonical path for identity hashing. `realpathSync.native` (the OS call)
 * expands Windows 8.3 short names (`RUNNER~1` → `runneradmin`), which the JS
 * implementation does not — without it, a repo reached via a short-name TEMP
 * path hashes to a DIFFERENT shard than the same repo via its long path
 * (git's `--show-toplevel` always reports the long form). Falls back to the
 * JS implementation on platforms/paths where the native call errors.
 */
function realPath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return realpathSync(p);
  }
}

export const SHARD_HEX_LEN = 12;

export interface ShardResolution {
  shard: string; // 12-hex blake2b prefix
  projectRoot: string; // realpath of the CURRENT checkout root (worktree-local)
  mainRoot: string; // realpath of the main checkout root (shared across worktrees)
  git: boolean;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  }).trim();
}

export function resolveShard(dir: string): ShardResolution {
  const start = realPath(resolve(dir));
  try {
    // May print a relative path (e.g. ".git") — resolve against the query dir.
    const commonDir = realPath(resolve(start, git(["rev-parse", "--git-common-dir"], start)));
    const toplevel = realPath(git(["rev-parse", "--show-toplevel"], start));
    // Main checkout root: the common dir is <mainRoot>/.git for normal repos;
    // bare repos have no worktree root — fall back to the common dir itself.
    const mainRoot = basename(commonDir) === ".git" ? dirname(commonDir) : commonDir;
    return {
      shard: blake2bHex(commonDir).slice(0, SHARD_HEX_LEN),
      projectRoot: toplevel,
      mainRoot,
      git: true,
    };
  } catch {
    return {
      shard: blake2bHex(start).slice(0, SHARD_HEX_LEN),
      projectRoot: start,
      mainRoot: start,
      git: false,
    };
  }
}

/** Base data dir: $CONTEXA_HOME, default ~/.contexa (tests always set CONTEXA_HOME — G-7). */
export function contexaHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CONTEXA_HOME && env.CONTEXA_HOME.length > 0
    ? env.CONTEXA_HOME
    : join(homedir(), ".contexa");
}

export function shardDir(shard: string, home: string): string {
  return join(home, "projects", shard);
}

export function storePath(shard: string, home: string): string {
  return join(shardDir(shard, home), "store.sqlite");
}
