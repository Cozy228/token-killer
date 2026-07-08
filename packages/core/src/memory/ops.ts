/**
 * E8 memory ops surface (slice 4). A READ-ONLY report the `ctx doctor` check and
 * (later, M3) the guide Knowledge page render — the single shared seam so both
 * report the same numbers. The trust model assumes a human drains the review
 * queue (A3 imports can flood it), so operators get the signal without any
 * auto-expiry (non-destruction, E8).
 *
 * Everything here is a store read + a `.contexa` file read — no LLM, no network, no
 * git spawn, no writes (never creates `.contexa/`). The reindex counts (`skipped`,
 * `shadowedOverlay`) come from the manifest the memory adapter persisted at its
 * last cold-path ingest, so doctor need not reindex to report them.
 */
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import { ulidOf } from "./fileStore.ts";
import type { Store } from "../store/store.ts";

/** Meta key the memory adapter writes its file manifest under (shared constant). */
export const MEMORY_MANIFEST_META = "memory_file_manifest";

export interface MemoryOpsReport {
  /** Size of the `needs-review` queue (imports + agent notes awaiting a human). */
  reviewQueue: number;
  /** Age of the oldest `needs-review` item in ms, or undefined when the queue is
   *  empty (aging items visibly sink; there is no auto-expiry — E8). */
  oldestReviewAgeMs: number | undefined;
  /** Lines skipped as unparseable at the last reindex (R1 — hand-edited log). */
  reindexSkipped: number;
  /** Overlay entries shadowed by a same-id mainline entry at the last reindex
   *  (F6 mainline-wins — the promoted-then-orphaned overlay lines, item 4). */
  shadowedOverlay: number;
  /** Log lines whose `detail=<ulid>` sidecar is missing (S1b dangling pointer). */
  danglingSidecars: number;
  /** Sidecar files no committed/overlay line references (orphaned bodies). */
  orphanSidecars: number;
  /** External-snapshot ages (S9 advisory cadence). Empty until M4 network carriers. */
  snapshotAges: Array<{ carrier: string; ageMs: number }>;
}

const ZONES: readonly MemoryZone[] = ["mainline", "overlay"];

function readManifestCounts(store: Store): { skipped: number; shadowedOverlay: number } {
  const raw = store.getMeta(MEMORY_MANIFEST_META);
  if (raw === undefined) return { skipped: 0, shadowedOverlay: 0 };
  try {
    const m = JSON.parse(raw) as { reindex?: { skipped?: number; shadowedOverlay?: number } };
    return {
      skipped: m.reindex?.skipped ?? 0,
      shadowedOverlay: m.reindex?.shadowedOverlay ?? 0,
    };
  } catch {
    return { skipped: 0, shadowedOverlay: 0 };
  }
}

/**
 * Build the read-only E8 report. `now` is injected (fixed-clock tests); defaults
 * to the wall clock. `files` reads the committed/overlay `.contexa` layout — absent
 * files read as empty (never a throw, never a create).
 */
export function memoryOpsReport(
  store: Store,
  files: MemoryFiles,
  now: number = Date.now(),
): MemoryOpsReport {
  // Review queue + oldest age (from the create event of each needs-review row).
  let reviewQueue = 0;
  let oldestReviewAt: number | undefined;
  for (const m of store.allMemories()) {
    if (m.status !== "needs-review") continue;
    reviewQueue++;
    const create = store.memoryEvents(m.entityId).find((e) => e.verb === "create");
    if (create && (oldestReviewAt === undefined || create.at < oldestReviewAt)) {
      oldestReviewAt = create.at;
    }
  }

  // Sidecar integrity: referenced-but-missing (dangling) + present-but-unreferenced
  // (orphan), per zone.
  let danglingSidecars = 0;
  let orphanSidecars = 0;
  for (const zone of ZONES) {
    const referenced = new Set<string>();
    for (const entry of files.readMemories(zone)) {
      if (entry.detailPointer === undefined) continue;
      const ulid = entry.detailPointer || ulidOf(entry.memoryId);
      referenced.add(ulid);
      if (files.readSidecar(zone, ulid) === undefined) danglingSidecars++;
    }
    for (const ulid of files.sidecarUlids(zone)) {
      if (!referenced.has(ulid)) orphanSidecars++;
    }
  }

  const { skipped, shadowedOverlay } = readManifestCounts(store);
  return {
    reviewQueue,
    oldestReviewAgeMs: oldestReviewAt !== undefined ? Math.max(0, now - oldestReviewAt) : undefined,
    reindexSkipped: skipped,
    shadowedOverlay,
    danglingSidecars,
    orphanSidecars,
    snapshotAges: [], // no external snapshots until M4 network carriers (S9)
  };
}
