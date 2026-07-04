/**
 * Co-change analytics (CTX-IMPL §5.1) — greenfield (no reference project mines
 * this). Over a sliding window (default last 500 commits) count how often each
 * unordered file pair changes in the same commit; pairs with support ≥ 3 become
 * `co-changed` links. Confidence = P(B|A) taken as the max of both directions
 * (= support / min(count(A), count(B))).
 *
 * Pairs are canonicalised src < dst so each unordered pair is emitted once, with
 * a deterministic tie-break (support desc, confidence desc, src asc, dst asc).
 */
import type { CommitRecord } from "./walk.ts";

export const DEFAULT_COCHANGE_WINDOW = 500;
export const COCHANGE_MIN_SUPPORT = 3;

export interface CochangePair {
  src: string; // repo-relative path, src < dst
  dst: string;
  support: number; // commits touching both
  confidence: number; // P(B|A), max of both directions
}

/**
 * A commit touching very many files contributes O(n²) pairs of one-off noise;
 * cap the per-commit fan-out so a bulk move/format commit cannot dominate. The
 * default is generous — real feature commits stay well under it.
 */
export const DEFAULT_MAX_FILES_PER_COMMIT = 200;

export interface CochangeOptions {
  minSupport?: number;
  maxFilesPerCommit?: number;
}

/** Post-image paths touched by a commit, de-duplicated. */
function commitPaths(commit: CommitRecord): string[] {
  const paths = new Set<string>();
  for (const f of commit.files) paths.add(f.path);
  return [...paths];
}

export function computeCochange(
  commits: CommitRecord[],
  opts: CochangeOptions = {},
): CochangePair[] {
  const minSupport = opts.minSupport ?? COCHANGE_MIN_SUPPORT;
  const maxFiles = opts.maxFilesPerCommit ?? DEFAULT_MAX_FILES_PER_COMMIT;

  const fileCount = new Map<string, number>();
  const pairSupport = new Map<string, number>();

  for (const commit of commits) {
    const paths = commitPaths(commit);
    if (paths.length < 2 || paths.length > maxFiles) {
      for (const p of paths) fileCount.set(p, (fileCount.get(p) ?? 0) + 1);
      continue;
    }
    for (const p of paths) fileCount.set(p, (fileCount.get(p) ?? 0) + 1);
    paths.sort();
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const key = `${paths[i]}\0${paths[j]}`;
        pairSupport.set(key, (pairSupport.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: CochangePair[] = [];
  for (const [key, support] of pairSupport) {
    if (support < minSupport) continue;
    const sep = key.indexOf("\0");
    const src = key.slice(0, sep);
    const dst = key.slice(sep + 1);
    const minCount = Math.min(fileCount.get(src) ?? support, fileCount.get(dst) ?? support);
    pairs.push({ src, dst, support, confidence: minCount > 0 ? support / minCount : 0 });
  }
  pairs.sort(
    (a, b) =>
      b.support - a.support ||
      b.confidence - a.confidence ||
      a.src.localeCompare(b.src) ||
      a.dst.localeCompare(b.dst),
  );
  return pairs;
}
