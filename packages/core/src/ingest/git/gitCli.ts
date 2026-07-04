/**
 * Hardened `git` subprocess helpers for the git source adapter (CTX-IMPL §5.1).
 *
 * Carrier is the local `git` binary — no native dependency, no network. Every
 * call is local-only (log / rev-list / rev-parse over the on-disk object store);
 * nothing here fetches. Buffers are capped (256 MiB, gitnexus's ENOBUFS guard)
 * and every spawn carries an explicit timeout (CI cold-start tax, §10).
 */
import { execFileSync } from "node:child_process";

/** gitnexus's maxBuffer against ENOBUFS on large `git log` output (§5.1). */
export const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const REV_TIMEOUT_MS = 10_000;
const LOG_TIMEOUT_MS = 120_000;

export class GitError extends Error {
  constructor(
    message: string,
    readonly code: "not-a-repo" | "bad-revision" | "spawn-failed",
  ) {
    super(message);
    this.name = "GitError";
  }
}

function run(cwd: string, args: string[], timeout: number): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      maxBuffer: GIT_MAX_BUFFER,
      // Local object store only; no credential/remote access is ever needed.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not a git repository/i.test(msg)) throw new GitError(msg, "not-a-repo");
    if (/bad revision|unknown revision|ambiguous argument/i.test(msg)) {
      throw new GitError(msg, "bad-revision");
    }
    throw new GitError(msg, "spawn-failed");
  }
}

/** Current tip oid (full 40-hex), or undefined for an empty repo (no commits). */
export function headOid(root: string): string | undefined {
  try {
    return run(root, ["rev-parse", "HEAD"], REV_TIMEOUT_MS).trim();
  } catch (err) {
    // Unborn HEAD (no commits yet) — a clean, empty source, not an error.
    if (err instanceof GitError && err.code === "bad-revision") return undefined;
    throw err;
  }
}

/**
 * Commits reachable from HEAD but not from `since` — the dirtyCheck count (§4.2).
 * `since === undefined` → the full history count (cold start). A `since` oid that
 * no longer exists (history rewrite) throws GitError('bad-revision'); the adapter
 * treats that as a full re-ingest.
 */
export function revListCount(root: string, since: string | undefined): number {
  const range = since === undefined ? ["HEAD"] : [`${since}..HEAD`];
  return Number(run(root, ["rev-list", "--count", ...range], REV_TIMEOUT_MS).trim());
}

/** Raw `git log` bytes for the walk (parsed by walk.ts). Rename-aware (-M). */
export function rawLog(root: string, args: string[]): string {
  return run(root, ["-c", "core.quotepath=false", "log", ...args], LOG_TIMEOUT_MS);
}
