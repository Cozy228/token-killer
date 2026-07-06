/**
 * S3 — migrate store-only (M1) memory into committed `.ctx/` files, and keep it
 * swept (F4). A one-shot gate is wrong: post-migration, store-only writes (the
 * MCP `remember` surface + the refresh-path import — wired in slice 4) would
 * strand behind a set marker forever. So this is an id-keyed CATCH-UP:
 * `isMigrationDue` = "any store memory event absent from the files"; the marker
 * is a last-run STAMP, not a gate; every cold-path check sweeps new store-only
 * events into their correct zone.
 *
 * The catch-up export (`catchup.ts`) exports the full event history VERBATIM
 * (F2), then this ends with the sanctioned RESET rebuild (F5) so the local store
 * re-derives from the files EXACTLY like a fresh clone — no additive drift, no
 * locally-only lifecycle history. The catch-up runs BEFORE the reset (ordering
 * guard) so nothing store-only strands.
 *
 * This amends the S3 settlement's "status replayed" MECHANICS (it predates the
 * slice-2 event log): status is now derived from the verbatim events, never a
 * mutable copy — the ruling is unchanged and satisfied more strictly.
 *
 * No LLM / no network — deterministic file writes + a local reset rebuild.
 */
import { catchUpStoreOnlyEvents, fileEventIds } from "./catchup.ts";
import type { MemoryFiles } from "./fileStore.ts";
import { reindexMemoryFromFiles } from "./reindex.ts";
import type { Store } from "../store/store.ts";

export const MIGRATION_MARKER = "memory_migrated_at";

export interface MigrationReport {
  migrated: boolean;
  /** Rows exported this run (wrote ≥1 new line). */
  exported: number;
  /** Rows already fully present (idempotent skip). */
  skipped: number;
  /** Rows diverted by the E4 secret guard. */
  diverted: number;
  toMainline: number;
  toOverlay: number;
}

/**
 * Migration is DUE whenever a store memory event is not yet in the files (F4) —
 * a brand-new store-only row OR a lifecycle line missing after a crash-resume.
 * O(events) scan; the marker does not gate it.
 */
export function isMigrationDue(store: Store, files: MemoryFiles): boolean {
  const present = fileEventIds(files);
  for (const e of store.allMemoryEvents()) {
    if (!present.has(e.id)) return true;
  }
  return false;
}

/**
 * Sweep store-only memory into the files, then reset-rebuild the index from the
 * files. Idempotent + crash-resumable (id-keyed catch-up). `migrated` is true
 * whenever the sweep ran (even if it exported nothing — a cheap no-op check).
 */
export function migrateStoreMemoryToFiles(store: Store, files: MemoryFiles): MigrationReport {
  // Catch-up FIRST (ordering guard) so nothing store-only strands under the reset.
  const report = catchUpStoreOnlyEvents(store, files);
  // Marker = last-run STAMP, not a gate (F4).
  store.setMeta(MIGRATION_MARKER, String(store.nextEventStamp().at));
  // The store reverts to a pure rebuildable index — reset so it re-derives from
  // the files exactly like a fresh clone (F5). (Reset re-runs the catch-up as a
  // belt-and-suspenders guard; it is an idempotent no-op the second time.)
  reindexMemoryFromFiles(store, files, { mode: "reset" });
  return { migrated: true, ...report };
}
