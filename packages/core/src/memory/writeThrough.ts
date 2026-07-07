/**
 * Write-through seam (slice 3): every production memory write appends to the
 * correct zone's committed / overlay FILE first, then updates the SQLite index
 * (events table + fold), synchronously. The files are the append-only source of
 * truth (B1); the store is the rebuildable cache.
 *
 * When `files` is omitted the paths behave exactly as slice 2 (store-only) — this
 * keeps the store as the sole authority for callers that have not opted into the
 * file model yet (e.g. living-repo acceptance fixtures that must not write into
 * the real repo). Production callers (CLI) pass a `MemoryFiles`.
 *
 * Ordering: allocate the monotonic stamp (id/at) from the store, serialize the
 * committed line with THAT stamp, write the file, THEN insert the event with the
 * same id/at. So a crash after the file write but before the DB insert is
 * recovered by reindex (the event is already in the source-of-truth file); the
 * reverse (DB has it, file does not) never loses data because the file is the
 * source a full reindex rebuilds from.
 */
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import { ulidOf } from "./fileStore.ts";
import type { Authority, ClaimMethod, MemoryEventVerb, MemoryStatus } from "../store/types.ts";
import type { Store } from "../store/store.ts";

export interface CreateThroughInput {
  memoryId: string;
  gist: string;
  detail?: string;
  origin: string;
  actor: string;
  carrier: string;
  method: ClaimMethod;
  authority: Authority;
  status: MemoryStatus;
  anchors: string[];
  anchoredAt?: string;
  /** O-18 committed content-hash baselines per anchor (item 2), captured at write
   *  time from each resolved target's `contentHash` (+ symbol arity). */
  anchorSigs?: Record<string, { h: string; a?: number }>;
  sessionRef?: string;
  reason?: string;
  validFrom?: number;
  validTo?: number;
}

/** Append a `create` event + memory entry through the file layer, then the
 *  store. Returns the create-event id. */
export function recordCreate(
  store: Store,
  files: MemoryFiles | undefined,
  zone: MemoryZone,
  input: CreateThroughInput,
): string {
  const { id, at } = store.nextEventStamp();
  if (files) {
    files.appendMemory(
      zone,
      {
        eventId: id,
        at,
        memoryId: input.memoryId,
        actor: input.actor,
        carrier: input.carrier,
        method: input.method,
        authority: input.authority,
        status: input.status,
        gist: input.gist,
        origin: input.origin,
        detailPointer: input.detail ? ulidOf(input.memoryId) : undefined,
        anchors: input.anchors,
        anchoredAt: input.anchoredAt,
        ...(input.anchorSigs ? { anchorSigs: input.anchorSigs } : {}),
        sessionRef: input.sessionRef,
        reason: input.reason,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
      input.detail,
    );
  }
  store.appendMemoryEvent({
    id,
    at,
    memoryId: input.memoryId,
    verb: "create",
    actor: input.actor,
    reason: input.reason,
    refs: { status: input.status },
    carrier: input.carrier,
    method: input.method,
    authority: input.authority,
  });
  return id;
}

export interface DecisionThroughInput {
  memoryId: string;
  verb: MemoryEventVerb;
  actor: string;
  carrier: string;
  method: ClaimMethod;
  authority: Authority;
  reason?: string;
  locus?: string;
  refs?: Record<string, unknown>;
}

/** Append a lifecycle / decision event through the file layer, then the store. */
export function recordDecision(
  store: Store,
  files: MemoryFiles | undefined,
  zone: MemoryZone,
  input: DecisionThroughInput,
): string {
  const { id, at } = store.nextEventStamp();
  if (files) {
    files.appendDecision(zone, {
      eventId: id,
      at,
      memoryId: input.memoryId,
      verb: input.verb,
      actor: input.actor,
      carrier: input.carrier,
      method: input.method,
      authority: input.authority,
      reason: input.reason,
      locus: input.locus,
      refs: input.refs,
    });
  }
  store.appendMemoryEvent({
    id,
    at,
    memoryId: input.memoryId,
    verb: input.verb,
    actor: input.actor,
    reason: input.reason,
    refs: input.refs,
    carrier: input.carrier,
    locus: input.locus,
    method: input.method,
    authority: input.authority,
  });
  return id;
}
