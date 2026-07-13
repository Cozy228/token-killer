// Recent lens (D11, default lens for slice 5c). PURE + deterministic.
//
// Activity is shown with a NEUTRAL luminance / border-weight ramp — never
// saturated color (that budget is reserved for claim status, D11/D15). Files map
// to one of four recency buckets; the renderer turns the bucket into a
// `recency-0..3` class on the file lot and the substrate/variant CSS carries the
// visible ramp. Buckets DO NOT touch claim-status ticks; lit/dim and selection
// emphasis stack above the ramp.
//
//   bucket 0  touched inside the default event window (last 20 commits)
//   bucket 1  otherwise touched within ~a month of the newest commit
//   bucket 2  older (has a commit date, but neither of the above)
//   bucket 3  never touched (no commit date)

import type { AtlasModel, CorpusInput } from "./types.js";
import { fileId, fileOfSym } from "./compile.js";

export type RecencyBucket = 0 | 1 | 2 | 3;

/** ~30 days in ms — the "this month" band around the newest commit. */
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Classify one file's recency into a neutral bucket.
 * @param recency    file's max commit epoch (ms) or null (never touched)
 * @param inWindow   is the file inside the default event's commit window
 * @param newestEpoch newest commit epoch across the corpus (the "now" reference)
 */
export function recencyBucket(
  recency: number | null | undefined,
  inWindow: boolean,
  newestEpoch: number,
  monthMs: number = MONTH_MS,
): RecencyBucket {
  if (recency === null || recency === undefined) return 3;
  if (inWindow) return 0;
  if (newestEpoch - recency <= monthMs) return 1;
  return 2;
}

/**
 * File ids touched inside the default event's commit window — the corpus event's
 * anchor files plus every `touches` target resolved to its file lot. This is the
 * precise "last 20 commits' window" membership (no time heuristic needed).
 */
export function recentFileSet(corpus: CorpusInput): Set<string> {
  const set = new Set<string>();
  for (const f of corpus.event.anchorFiles) set.add(f);
  for (const t of corpus.edges.touches) {
    const target = t.target;
    if (target.startsWith("file:")) set.add(target);
    else if (target.startsWith("sym:")) set.add(fileId(fileOfSym(target)));
  }
  return set;
}

/** Newest commit epoch across all file lots, or 0 when none carry a date. */
export function newestRecency(model: AtlasModel): number {
  let newest = 0;
  for (const n of model.nodes) {
    if (n.kind === "file" && typeof n.recency === "number" && n.recency > newest) {
      newest = n.recency;
    }
  }
  return newest;
}

/**
 * Build the `fileId -> RecencyBucket` map for the Recent lens over a compiled
 * model + its corpus. Only file lots appear; folders/decls are never bucketed.
 */
export function recencyBuckets(model: AtlasModel, corpus: CorpusInput): Map<string, RecencyBucket> {
  const recent = recentFileSet(corpus);
  const newest = newestRecency(model);
  const out = new Map<string, RecencyBucket>();
  for (const n of model.nodes) {
    if (n.kind !== "file") continue;
    out.set(n.id, recencyBucket(n.recency ?? null, recent.has(n.id), newest));
  }
  return out;
}
