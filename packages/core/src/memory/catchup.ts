/**
 * Catch-up export (S3 migration + the F4 post-migration safety net).
 *
 * Sweeps store-only memory into the committed / overlay files, id-keyed by EVENT
 * id so it is idempotent AND crash-resumable at the granularity of a single line
 * (F1): a re-run exports exactly the event lines not yet present, so a crash
 * between a create line and its lifecycle line is completed on the next run.
 *
 * For a non-diverted row the ENTIRE event history is exported VERBATIM (F2): the
 * slice-2 backfill guarantees every row has a complete history, so the create
 * event becomes the `mem` line carrying its own `refs.status`, and each lifecycle
 * event becomes a `dec` line — ids/at preserved. No synthesized status replay, so
 * the migrating machine (after the reset rebuild, F5) folds EXACTLY like a fresh
 * clone. Secret-shaped rows (E4) keep the landing rewrite: a stable-id
 * `needs-review` create in the OVERLAY + a terminal-status replay (so a dead
 * secret does not resurrect), never committed.
 *
 * This module writes files only; it never touches the store index. The caller
 * runs the reset rebuild AFTER this (the ordering guard — nothing strands).
 * No LLM / no network — deterministic file appends.
 */
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import { ulidOf } from "./fileStore.ts";
import { scanMemoryForSecret, secretRemediationNote } from "./secretGuard.ts";
import type { SerializedDecision, SerializedMemory } from "./serialize.ts";
import type { MemoryEvent, MemoryEventVerb, MemoryRow, MemoryStatus } from "../store/types.ts";
import type { Store } from "../store/store.ts";

const VERB_FOR_STATUS: Record<MemoryStatus, MemoryEventVerb> = {
  active: "confirm",
  "needs-review": "review",
  retired: "retire",
  superseded: "supersede",
};

export interface CatchUpReport {
  /** Rows that wrote ≥1 new line this run. */
  exported: number;
  /** Rows whose every event was already present (idempotent skip). */
  skipped: number;
  /** Rows diverted by the E4 secret guard. */
  diverted: number;
  toMainline: number;
  toOverlay: number;
}

/** Every event id already present in the committed / overlay files. */
export function fileEventIds(files: MemoryFiles): Set<string> {
  const ids = new Set<string>();
  for (const zone of ["mainline", "overlay"] as const) {
    for (const m of files.readMemories(zone)) ids.add(m.eventId);
    for (const d of files.readDecisions(zone)) ids.add(d.eventId);
  }
  return ids;
}

/**
 * Export store-only memory events not yet present in the files (id-keyed).
 *
 * `excludeCommittedIds` (the pull-delta non-append fallback, F5) marks event ids
 * that were in the OLD committed history: a row whose create was committed and is
 * now GONE from the files is a redaction/removal, not a local write — it must be
 * PURGED by the reset, never re-exported. A genuinely store-only row (its create
 * never committed) is preserved. For migration the set is empty (sweep everything).
 */
export function catchUpStoreOnlyEvents(
  store: Store,
  files: MemoryFiles,
  excludeCommittedIds?: ReadonlySet<string>,
): CatchUpReport {
  files.ensureScaffold();
  const present = fileEventIds(files);
  const report: CatchUpReport = {
    exported: 0,
    skipped: 0,
    diverted: 0,
    toMainline: 0,
    toOverlay: 0,
  };

  for (const mem of store.allMemories()) {
    // A committed-origin row being reconciled by the reset (its create was in the
    // old commit) is purged, not re-exported (F5 redaction purge path).
    const createId = store.memoryEvents(mem.entityId).find((e) => e.verb === "create")?.id;
    if (createId !== undefined && excludeCommittedIds?.has(createId)) {
      report.skipped++;
      continue;
    }
    const finding = scanMemoryForSecret(mem.gist, mem.detail);
    let wrote = false;
    let zone: MemoryZone;

    if (finding.secret) {
      zone = "overlay";
      report.diverted++;
      const ulid = ulidOf(mem.entityId);
      const createId = `migsec-${ulid}`; // stable → resume-idempotent
      if (!present.has(createId)) {
        files.appendMemory(
          zone,
          secretEntry(store, mem, createId, secretRemediationNote(finding.cls as string)),
          mem.detail,
        );
        present.add(createId);
        wrote = true;
      }
      // R5: replay a TERMINAL original status so a dead secret does not resurrect.
      if (mem.status === "retired" || mem.status === "superseded") {
        const replayId = `migrep-${ulid}`;
        if (!present.has(replayId)) {
          // Deterministic `at` strictly after the create (stable across machines).
          const createAt =
            store.memoryEvents(mem.entityId).find((e) => e.verb === "create")?.at ?? 0;
          files.appendDecision(
            zone,
            secretReplay(replayId, mem.entityId, mem.status, createAt + 1),
          );
          present.add(replayId);
          wrote = true;
        }
      }
    } else {
      zone =
        mem.origin.startsWith("host-import") && mem.status === "needs-review"
          ? "overlay"
          : "mainline";
      // F2: export the ENTIRE event history VERBATIM, id-keyed.
      const anchoredAt = readAnchoredAt(store, mem.entityId);
      const anchors = store.anchorsOf(mem.entityId);
      for (const ev of store.memoryEvents(mem.entityId)) {
        if (present.has(ev.id)) continue;
        if (ev.verb === "create") {
          files.appendMemory(zone, memLine(mem, ev, anchoredAt, anchors), mem.detail);
        } else {
          files.appendDecision(zone, decLine(ev));
        }
        present.add(ev.id);
        wrote = true;
      }
    }

    if (wrote) {
      report.exported++;
      if (zone === "mainline") report.toMainline++;
      else report.toOverlay++;
    } else {
      report.skipped++;
    }
  }
  return report;
}

function readAnchoredAt(store: Store, memoryId: string): string | undefined {
  const v = store.getEntity(memoryId)?.attrs.anchoredAt;
  return typeof v === "string" ? v : undefined;
}

/** A `create` event → the committed `mem` line, carrying its status VERBATIM. */
function memLine(
  mem: MemoryRow,
  create: MemoryEvent,
  anchoredAt: string | undefined,
  anchors: string[],
): SerializedMemory {
  const status =
    typeof create.refs.status === "string" ? (create.refs.status as MemoryStatus) : mem.status;
  return {
    eventId: create.id,
    at: create.at,
    memoryId: mem.entityId,
    actor: create.actor,
    carrier: create.carrier,
    method: create.method,
    authority: create.authority,
    status,
    gist: mem.gist,
    origin: mem.origin,
    detailPointer: mem.detail ? ulidOf(mem.entityId) : undefined,
    anchors,
    anchoredAt,
    sessionRef: mem.sessionRef,
    reason: create.reason,
    validFrom: mem.validFrom,
    validTo: mem.validTo,
  };
}

/** A lifecycle event → a committed `dec` line, VERBATIM. */
function decLine(ev: MemoryEvent): SerializedDecision {
  return {
    eventId: ev.id,
    at: ev.at,
    memoryId: ev.memoryId,
    verb: ev.verb,
    actor: ev.actor,
    carrier: ev.carrier,
    method: ev.method,
    authority: ev.authority,
    reason: ev.reason,
    locus: ev.locus,
    refs: Object.keys(ev.refs).length > 0 ? ev.refs : undefined,
  };
}

/** The overlay `mem` line for a secret-diverted row (landing `needs-review`). */
function secretEntry(
  store: Store,
  mem: MemoryRow,
  eventId: string,
  remediation: string,
): SerializedMemory {
  const create = store.memoryEvents(mem.entityId).find((e) => e.verb === "create");
  return {
    eventId,
    at: create?.at ?? store.nextEventStamp().at,
    memoryId: mem.entityId,
    actor: create?.actor ?? "migration",
    carrier: create?.carrier ?? "migration",
    method: create?.method ?? "structural",
    authority: create?.authority ?? mem.authority,
    status: "needs-review",
    gist: mem.gist,
    origin: mem.origin,
    detailPointer: mem.detail ? ulidOf(mem.entityId) : undefined,
    anchors: store.anchorsOf(mem.entityId),
    anchoredAt: undefined,
    sessionRef: mem.sessionRef,
    reason: remediation,
    validFrom: mem.validFrom,
    validTo: mem.validTo,
  };
}

function secretReplay(
  eventId: string,
  memoryId: string,
  status: MemoryStatus,
  at: number,
): SerializedDecision {
  return {
    eventId,
    at,
    memoryId,
    verb: VERB_FOR_STATUS[status],
    actor: "migration",
    carrier: "migration",
    method: "structural",
    authority: "derived",
    reason: `migration: terminal status replayed as ${status}`,
  };
}
