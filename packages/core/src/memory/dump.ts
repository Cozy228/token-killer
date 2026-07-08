/**
 * E6 — canonical logical dump of the memory index.
 *
 * "Same committed `.contexa/` content → identical `store.sqlite` bytes" is physically
 * unachievable (page allocation, insertion order, FTS internals), so the
 * determinism acceptance is CANONICAL LOGICAL EQUALITY: a normalized dump with
 * rows in deterministic order compares equal across machines / fresh clones.
 *
 * Everything here is claim-id-free — conflicts are keyed by their claims' stable
 * content (subject / predicate / locus), never the per-store auto-increment id —
 * so two stores built from the same files dump identically.
 */
import type { Store } from "../store/store.ts";
import { claimKeyOf } from "./fold.ts";

export interface MemoryDumpRow {
  entityId: string;
  gist: string;
  detail: string | null;
  origin: string;
  authority: string;
  status: string;
  drift: string | null;
  validFrom: number | null;
  validTo: number | null;
  anchors: string[];
}

export interface EventDumpRow {
  id: string;
  memoryId: string;
  verb: string;
  actor: string;
  at: number;
  carrier: string;
  method: string;
  authority: string;
  refs: Record<string, unknown>;
}

export interface ConflictDumpRow {
  a: string; // stable claim key, not the numeric id
  b: string;
  kind: string;
  status: string;
}

export interface MemoryDump {
  memories: MemoryDumpRow[];
  events: EventDumpRow[];
  conflicts: ConflictDumpRow[];
}

/** Stable, id-free key for a claim — the ONE shared definition (R8, fold.ts). */
function claimKey(store: Store, claimId: number): string {
  const c = store.getClaim(claimId);
  return c ? claimKeyOf(c) : `?:${claimId}`;
}

/** Produce the canonical logical dump (deterministic row order). */
export function logicalDump(store: Store): MemoryDump {
  const memories: MemoryDumpRow[] = store
    .allMemories()
    .map((m) => ({
      entityId: m.entityId,
      gist: m.gist,
      detail: m.detail ?? null,
      origin: m.origin,
      authority: m.authority,
      status: m.status,
      drift: m.driftReason ?? null,
      validFrom: m.validFrom ?? null,
      validTo: m.validTo ?? null,
      anchors: [...store.anchorsOf(m.entityId)].sort(),
    }))
    .sort((x, y) => (x.entityId < y.entityId ? -1 : x.entityId > y.entityId ? 1 : 0));

  const events: EventDumpRow[] = store
    .allMemoryEvents()
    .map((e) => ({
      id: e.id,
      memoryId: e.memoryId,
      verb: e.verb,
      actor: e.actor,
      at: e.at,
      carrier: e.carrier,
      method: e.method,
      authority: e.authority,
      refs: e.refs,
    }))
    .sort((x, y) => (x.at !== y.at ? x.at - y.at : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  const conflicts: ConflictDumpRow[] = store
    .allConflicts()
    .map((c) => ({
      a: claimKey(store, c.a),
      b: claimKey(store, c.b),
      kind: c.kind,
      status: c.status,
    }))
    .sort((x, y) =>
      x.kind !== y.kind
        ? x.kind < y.kind
          ? -1
          : 1
        : x.a !== y.a
          ? x.a < y.a
            ? -1
            : 1
          : x.b < y.b
            ? -1
            : x.b > y.b
              ? 1
              : 0,
    );

  return { memories, events, conflicts };
}

/** Canonical JSON string of the dump (stable key order via the typed shape). */
export function dumpJson(store: Store): string {
  return JSON.stringify(logicalDump(store));
}
