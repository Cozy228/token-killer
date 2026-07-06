/**
 * S4 §4 — `anchored-at` capture + the deterministic-across-peers absent-anchor
 * classifier.
 *
 * The committed anchor line carries `anchored-at:<commit-id>` — the author's HEAD
 * at remember-time, written once, part of the committed bytes. For an ABSENT
 * anchor target, one `git merge-base --is-ancestor <anchored-at> HEAD` decides
 * whether the target ever lived on this line of history:
 *   - ancestor of HEAD  → it existed here and is now gone → `target-removed` drift
 *     (→ stale-suspect, A5).
 *   - not an ancestor   → it rode in from a divergent branch → `unresolved-here`
 *     (branch-absent, NOT stale).
 *   - no `anchored-at` (legacy rows) → `skip` (conservative — never fabricate a
 *     commit id, never falsely mark stale).
 *
 * Grounding "having-been-here" in the git graph (not the local index history)
 * makes the split classify identically on every peer and on a fresh clone (E6).
 * All git calls are read-only, local, zero-egress.
 */
import { execFileSync } from "node:child_process";

function git(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
  } catch {
    return undefined;
  }
}

/** The author's current HEAD commit (full oid) — `undefined` outside a repo or
 *  before the first commit. Written into the committed anchor bytes at write time. */
export function currentHeadCommit(projectRoot: string): string | undefined {
  const oid = git(["rev-parse", "HEAD"], projectRoot);
  return oid && /^[0-9a-f]{7,64}$/.test(oid) ? oid : undefined;
}

/** True iff `commit` is an ancestor of `ref` (default HEAD). Missing commit /
 *  non-repo → false (treated as "not provably an ancestor"). */
export function isAncestor(projectRoot: string, commit: string, ref = "HEAD"): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, ref], {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 10_000,
    });
    return true; // exit 0 = is an ancestor
  } catch {
    return false; // exit 1 = not an ancestor; exit 128 = unknown commit / non-repo
  }
}

export type AbsentAnchorClass = "target-removed" | "unresolved-here" | "skip";

/**
 * Classify an ABSENT local anchor target using the committed `anchoredAt` commit
 * (S4 §4). Deterministic across peers: reads only the git graph, never the local
 * index history.
 */
export function classifyAbsentAnchor(
  projectRoot: string,
  anchoredAt: string | undefined,
): AbsentAnchorClass {
  if (!anchoredAt) return "skip";
  return isAncestor(projectRoot, anchoredAt) ? "target-removed" : "unresolved-here";
}
