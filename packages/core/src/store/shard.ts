/**
 * Worktree-aware project shard placement (CTX-IMPL §3 + §9 P28 addenda).
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
  const start = realpathSync(resolve(dir));
  try {
    // May print a relative path (e.g. ".git") — resolve against the query dir.
    const commonDir = realpathSync(resolve(start, git(["rev-parse", "--git-common-dir"], start)));
    const toplevel = realpathSync(git(["rev-parse", "--show-toplevel"], start));
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

/** Base data dir: $CTX_HOME, default ~/.ctx (tests always set CTX_HOME — G-7). */
export function ctxHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CTX_HOME && env.CTX_HOME.length > 0 ? env.CTX_HOME : join(homedir(), ".ctx");
}

export function shardDir(shard: string, home: string): string {
  return join(home, "projects", shard);
}

export function storePath(shard: string, home: string): string {
  return join(shardDir(shard, home), "store.sqlite");
}
