/**
 * S3 — one-shot migration of store-only (M1) memory into committed `.ctx/` files.
 *
 * Idempotent + resumable, id-keyed by `mem:<ulid>` (a re-run scans the committed
 * logs and SKIPS every ULID already present → a second run writes zero lines).
 * The `meta` marker (`memory_migrated_at`) is written LAST, after all entries are
 * flushed — so a crash mid-migration leaves the marker unset and the next run
 * completes the remainder (id-keyed skip = idempotent; marker-last = resumable).
 *
 * Zone routing on export (E3): a row that is host-import-origin AND still
 * unconfirmed (`needs-review`) goes to the personal OVERLAY, not the committed
 * zone; everything else goes to Mainline. The E4 secret guard runs on the export
 * path: a secret-shaped entry is DIVERTED to the overlay as `needs-review` with a
 * success-shaped remediation note — never silently committed, never a hard error.
 *
 * Status is REPLAYED, not copied (S3): the create line carries the natural
 * landing status; a non-landing current status is reproduced by a synthesized
 * `migration` decision event so the E2/E5 fold derives the same status.
 * Provenance / authority / anchors / valid_from-to are carried verbatim.
 *
 * No LLM / no network — deterministic file writes + a local read-only reindex.
 */
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import { ulidOf } from "./fileStore.ts";
import { reindexMemoryFromFiles } from "./reindex.ts";
import { scanMemoryForSecret, secretRemediationNote } from "./secretGuard.ts";
import type { SerializedDecision, SerializedMemory } from "./serialize.ts";
import type { MemoryEvent, MemoryEventVerb, MemoryRow, MemoryStatus } from "../store/types.ts";
import type { Store } from "../store/store.ts";

export const MIGRATION_MARKER = "memory_migrated_at";

const VERB_FOR_STATUS: Record<MemoryStatus, MemoryEventVerb> = {
  active: "confirm",
  "needs-review": "review",
  retired: "retire",
  superseded: "supersede",
};

export interface MigrationReport {
  migrated: boolean;
  /** Rows written this run. */
  exported: number;
  /** Rows skipped because their ULID is already present (idempotent re-run). */
  skipped: number;
  /** Rows diverted by the secret guard (E4). */
  diverted: number;
  toMainline: number;
  toOverlay: number;
}

const ZERO = { exported: 0, skipped: 0, diverted: 0, toMainline: 0, toOverlay: 0 };

/** Migration is due when there is store-only memory and the marker is unset. */
export function isMigrationDue(store: Store): boolean {
  if (store.getMeta(MIGRATION_MARKER) !== undefined) return false;
  return store.allMemories().length > 0;
}

/** Natural landing status: host imports land `needs-review` (A3); authored memory
 *  lands `active`. Later transitions are replayed as decision events. */
function landingStatus(origin: string): MemoryStatus {
  return origin.startsWith("host-import") ? "needs-review" : "active";
}

export function migrateStoreMemoryToFiles(store: Store, files: MemoryFiles): MigrationReport {
  if (store.getMeta(MIGRATION_MARKER) !== undefined) {
    return { migrated: false, ...ZERO }; // already migrated
  }
  files.ensureScaffold();

  // Idempotency: the ULIDs already committed / in the overlay (skip these).
  const present = new Set<string>();
  for (const zone of ["mainline", "overlay"] as const) {
    for (const m of files.readMemories(zone)) present.add(m.memoryId);
  }

  let exported = 0;
  let skipped = 0;
  let diverted = 0;
  let toMainline = 0;
  let toOverlay = 0;

  for (const mem of store.allMemories()) {
    if (present.has(mem.entityId)) {
      skipped++;
      continue;
    }
    const finding = scanMemoryForSecret(mem.gist, mem.detail);
    let zone: MemoryZone;
    let landing: MemoryStatus;
    let reason: string | undefined;
    if (finding.secret) {
      zone = "overlay";
      landing = "needs-review";
      reason = secretRemediationNote(finding.cls as string);
      diverted++;
    } else if (mem.origin.startsWith("host-import") && mem.status === "needs-review") {
      zone = "overlay";
      landing = "needs-review";
    } else {
      zone = "mainline";
      landing = landingStatus(mem.origin);
    }

    const created = store.memoryEvents(mem.entityId).find((e) => e.verb === "create");
    const entry = memoryEntry(store, mem, created, landing, reason);
    files.appendMemory(zone, entry, mem.detail);

    // Status replay (S3): if the current status differs from the landing status,
    // synthesize a `migration` decision event so the fold reproduces it.
    if (!finding.secret && mem.status !== landing) {
      files.appendDecision(zone, migrationDecision(store, mem.entityId, mem.status));
    }

    exported++;
    if (zone === "mainline") toMainline++;
    else toOverlay++;
  }

  // Marker LAST (resumable): only after every entry + sidecar is flushed.
  store.setMeta(MIGRATION_MARKER, String(store.nextEventStamp().at));

  // Reindex: the store reverts to a pure rebuildable index over the files.
  reindexMemoryFromFiles(store, files);

  return { migrated: true, exported, skipped, diverted, toMainline, toOverlay };
}

/** Build the committed memory-log entry, carrying provenance verbatim. */
function memoryEntry(
  store: Store,
  mem: MemoryRow,
  created: MemoryEvent | undefined,
  landing: MemoryStatus,
  reason: string | undefined,
): SerializedMemory {
  const stamp = created ? { id: created.id, at: created.at } : store.nextEventStamp();
  return {
    eventId: stamp.id,
    at: stamp.at,
    memoryId: mem.entityId,
    actor: created?.actor ?? "migration",
    carrier: created?.carrier ?? "migration",
    method: created?.method ?? "structural",
    authority: created?.authority ?? mem.authority,
    status: landing,
    gist: mem.gist,
    origin: mem.origin,
    detailPointer: mem.detail ? ulidOf(mem.entityId) : undefined,
    anchors: store.anchorsOf(mem.entityId),
    // Legacy rows carry no `anchored-at` — never fabricate a commit id (item 6).
    anchoredAt: undefined,
    sessionRef: mem.sessionRef,
    reason,
    validFrom: mem.validFrom,
    validTo: mem.validTo,
  };
}

function migrationDecision(
  store: Store,
  memoryId: string,
  status: MemoryStatus,
): SerializedDecision {
  const stamp = store.nextEventStamp();
  return {
    eventId: stamp.id,
    at: stamp.at,
    memoryId,
    verb: VERB_FOR_STATUS[status],
    actor: "migration",
    carrier: "migration",
    method: "structural",
    authority: "derived",
    reason: `migration: status replayed as ${status}`,
  };
}
