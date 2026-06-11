import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Windows `realpathSync` does NOT normalize drive-letter case — it returns the
// path with whatever case it was handed. VS Code's agent `run_in_terminal` reports
// a lowercase drive (`c:\…`) while the user's interactive shell reports uppercase
// (`C:\…`); since the resolved root is hashed as a raw string, the SAME repo would
// split into two `repo:<hash>` buckets that `tk gain` (single-bucket) can never
// reconcile (I6). Uppercasing the drive letter collapses both to one bucket. POSIX
// paths have no drive letter, so this is a no-op there.
export function normalizeDriveCase(
  p: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" ? p.replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`) : p;
}

function resolveProjectRoot(cwd: string): string {
  try {
    return normalizeDriveCase(realpathSync(cwd));
  } catch {
    return normalizeDriveCase(path.resolve(cwd));
  }
}

// Resolve a directory to the root of the git repository that contains it, so a
// project gets ONE fingerprint regardless of which subdirectory a command runs
// from OR which linked worktree it lives in. Keying on the raw cwd path (the old
// behaviour) fragmented a single project across many `repo:` buckets — every
// `cd src && …` and every worktree-isolated subagent minted its own — and
// `tk gain` then under-counted by reporting just one shard. The walk is in-process
// (stat/readFile up the tree, no `git` fork) to stay cheap on the compression hot
// path. A non-git directory returns undefined and the caller falls back to the
// cwd hash, so the fingerprint of the main repo ROOT is byte-identical to before.
function gitRepoAnchor(start: string): string | undefined {
  let dir = start;
  for (let depth = 0; depth < 64; depth += 1) {
    const dotgit = path.join(dir, ".git");
    let stat: ReturnType<typeof statSync> | undefined;
    try {
      stat = statSync(dotgit);
    } catch {
      stat = undefined;
    }
    if (stat) {
      // A `.git` DIRECTORY marks the main worktree / repo root.
      if (stat.isDirectory()) return dir;
      // A `.git` FILE marks a linked worktree: `gitdir: <common>/worktrees/<name>`.
      // The repo identity we want to share is the common dir's parent (the main
      // worktree root), three levels up from `.../.git/worktrees/<name>`.
      try {
        const match = /gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotgit, "utf8"));
        if (match) {
          const gitdir = path.resolve(dir, match[1]);
          if (gitdir.includes(`${path.sep}worktrees${path.sep}`)) {
            // realpath the main-repo root so it matches the fingerprint computed
            // when running FROM that repo (resolveProjectRoot already realpaths,
            // which on macOS rewrites /var → /private/var).
            return resolveProjectRoot(path.resolve(gitdir, "..", "..", ".."));
          }
        }
      } catch {
        // Unparseable .git file: anchor to this directory rather than guessing.
      }
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function tokenKillerHome(): string {
  if (process.env.TOKEN_KILLER_HOME) {
    return path.resolve(process.env.TOKEN_KILLER_HOME);
  }
  return path.join(os.homedir(), ".token-killer");
}

// Memoize per cwd (2.4a). The git layout that pins a project's fingerprint does not
// change within a single process run, so the (realpathSync + up-tree statSync walk)
// is computed ONCE per distinct cwd and reused. recordHistory alone asks for it 3×
// per command (historyFile, the record field, project meta), and governance/ledger
// add more — all collapse to one walk. Keyed by the RAW cwd string the caller passed
// (each tk invocation is a fresh process, so the cache never outlives one run).
const fingerprintCache = new Map<string, string>();

export function projectFingerprint(cwd: string): string {
  const cached = fingerprintCache.get(cwd);
  if (cached !== undefined) return cached;
  const normalized = resolveProjectRoot(cwd);
  const anchor = gitRepoAnchor(normalized) ?? normalized;
  const fingerprint = `repo:${createHash("sha256").update(anchor).digest("hex").slice(0, 12)}`;
  fingerprintCache.set(cwd, fingerprint);
  return fingerprint;
}

// Test-only seam: drop the memoized fingerprints so a test can exercise a changed
// git layout for a cwd it has already queried within the same process.
export function resetFingerprintCacheForTests(): void {
  fingerprintCache.clear();
}

// Render a fingerprint (logical id `repo:<hash>`) into a filesystem-safe path
// segment. `repo:<hash>` is the canonical id used for display/telemetry, but its
// colon is ILLEGAL in a Windows path component (reserved for the drive letter /
// NTFS alternate data streams), so `mkdir projects\repo:<hash>` throws ENOENT and
// every history write — hence every compression — silently fails open to
// passthrough. On POSIX the colon is a valid filename char, so this is a no-op
// and existing on-disk layout is untouched. We only neutralise characters
// Windows actually rejects, keeping the segment stable per platform.
export function fingerprintSegment(fingerprint: string): string {
  return process.platform === "win32" ? fingerprint.replace(/:/g, "-") : fingerprint;
}

export function projectDataDir(cwd: string): string {
  return path.join(tokenKillerHome(), "projects", fingerprintSegment(projectFingerprint(cwd)));
}

export function historyFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "history.jsonl");
}

// Local-display-only project label (ADR 0004 §3): basename, never the full path.
// Lives next to the project's history.jsonl. Never enters telemetry.
export function projectMetaFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "meta.json");
}

export function projectMetaFileForFingerprint(fingerprint: string): string {
  return path.join(tokenKillerHome(), "projects", fingerprintSegment(fingerprint), "meta.json");
}

export function rawOutputDir(cwd: string): string {
  return path.join(projectDataDir(cwd), "raw");
}

// ADR 0009 session dedup — both live under the per-project data dir, so the project
// fingerprint (git-repo-anchored) is IMPLICIT in the key: one store per project,
// keyed inside by the normalized command alone. No session id in the path.
export function dedupStoreFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "dedup.json");
}

export function dedupEventsFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "dedup-events.jsonl");
}

export function rawOutputPathRelative(cwd: string, fileName: string): string {
  return path.join("projects", fingerprintSegment(projectFingerprint(cwd)), "raw", fileName);
}

export function resolveStoredPath(storedPath: string): string {
  return path.isAbsolute(storedPath) ? storedPath : path.join(tokenKillerHome(), storedPath);
}
