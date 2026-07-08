/**
 * Hardened `git` subprocess helpers for the git source adapter (CONTEXA-IMPL §5.1).
 *
 * Carrier is the local `git` binary — no native dependency, no network. Every
 * call is local-only (log / rev-list / rev-parse over the on-disk object store);
 * nothing here fetches. Buffers are capped (256 MiB, gitnexus's ENOBUFS guard)
 * and every spawn carries an explicit timeout (CI cold-start tax, §10).
 */
import { execFileSync, spawnSync } from "node:child_process";

/** gitnexus's maxBuffer against ENOBUFS on large `git log` output (§5.1). */
export const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const REV_TIMEOUT_MS = 10_000;
const LOG_TIMEOUT_MS = 120_000;

export class GitError extends Error {
  // Explicit field (not a constructor parameter property): core is consumed
  // from source via Node's native type stripping, which rejects non-erasable
  // TS syntax (tsconfig enforces erasableSyntaxOnly).
  readonly code: "not-a-repo" | "bad-revision" | "spawn-failed";

  constructor(message: string, code: "not-a-repo" | "bad-revision" | "spawn-failed") {
    super(message);
    this.name = "GitError";
    this.code = code;
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

/** spawnSync with stdin `input`; git errors classify like `run` (§5.1). */
function runWithInput(root: string, args: string[], input: string, timeout: number): Buffer {
  const res = spawnSync("git", args, {
    cwd: root,
    input,
    timeout,
    maxBuffer: GIT_MAX_BUFFER,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (res.error) {
    const msg = res.error.message;
    if (/ENOBUFS|maxBuffer/i.test(msg)) throw new GitError(msg, "spawn-failed");
    throw new GitError(msg, "spawn-failed");
  }
  const stderr = res.stderr?.toString() ?? "";
  if (res.status !== 0 && stderr) {
    if (/not a git repository/i.test(stderr)) throw new GitError(stderr, "not-a-repo");
    if (/bad revision|unknown revision|ambiguous argument/i.test(stderr)) {
      throw new GitError(stderr, "bad-revision");
    }
    // diff-tree/cat-file --batch tolerate per-record misses without a nonzero
    // exit; a genuine fatal exits nonzero — surface it.
    throw new GitError(stderr, "spawn-failed");
  }
  return res.stdout ?? Buffer.alloc(0);
}

/**
 * Post-image blobs for many `<rev>:<path>` specs via ONE `git cat-file --batch`
 * process — avoids a spawn per file across a batch of commits (§5.1 batch
 * discipline; the ENOBUFS-hardened path). Records stream back in input order:
 * a present object is `<oid> blob <size>\n<bytes>\n`, a missing one is
 * `<spec> missing\n`. Missing / non-blob specs map to `undefined`. Content is
 * sliced by the header's byte length then decoded utf8 (never sliced by a
 * character index — binary-safe, multibyte-safe, G-8 in spirit).
 */
export function catFileBatch(root: string, specs: string[]): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  const unique = [...new Set(specs)];
  if (unique.length === 0) return out;
  const buf = runWithInput(root, ["cat-file", "--batch"], unique.join("\n") + "\n", LOG_TIMEOUT_MS);
  let i = 0;
  let idx = 0;
  while (i < buf.length && idx < unique.length) {
    const nl = buf.indexOf(0x0a, i);
    if (nl === -1) break;
    const header = buf.toString("utf8", i, nl);
    const m = /^([0-9a-f]{40}) (\w+) (\d+)$/.exec(header);
    if (m && m[2] === "blob") {
      const size = Number(m[3]);
      const start = nl + 1;
      out.set(unique[idx]!, buf.toString("utf8", start, start + size));
      i = start + size + 1; // skip content + its trailing LF
    } else if (m) {
      // A present non-blob (tree/commit): skip its bytes, record nothing usable.
      const size = Number(m[3]);
      out.set(unique[idx]!, undefined);
      i = nl + 1 + size + 1;
    } else {
      out.set(unique[idx]!, undefined); // "<spec> missing" (one line, no body)
      i = nl + 1;
    }
    idx++;
  }
  return out;
}

/**
 * Per-commit unified diffs (post-image ranges) for many commit oids via ONE
 * `git diff-tree --stdin` process. `--unified=0` = exact changed lines;
 * `-M` rename-aware; `--root` includes the initial commit's additions;
 * `-r` recurses into trees. Parsed by `parseDiffTreeStream`.
 */
export function diffTreeStdin(root: string, oids: string[]): string {
  if (oids.length === 0) return "";
  const buf = runWithInput(
    root,
    [
      "-c",
      "core.quotepath=false",
      "diff-tree",
      "--stdin",
      "-r",
      "-M",
      "--root",
      "--unified=0",
      "--no-color",
      "-p",
    ],
    oids.join("\n") + "\n",
    LOG_TIMEOUT_MS,
  );
  return buf.toString("utf8");
}
