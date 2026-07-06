/**
 * Deterministic memory status fold (slice 2 — event log on the current storage).
 *
 * The append-only `memory_events` log (migration 002) is the SOURCE of a
 * memory's lifecycle status; `memory.status` is a rebuildable CACHE of the fold
 * over that log (S10 #4). This module owns:
 *
 *  - the pure fold `foldStatus()` over events in total order `(at, then ULID)`
 *    (E2) — order-independent: shuffled insertion yields identical results;
 *  - the E5 collision predicate + contradiction filing (a memory whose log holds
 *    BOTH a `retire` and a `supersede` decision — mutually-exclusive terminal
 *    dispositions taken independently → later-by-total-order wins, a
 *    `contradiction` conflict is filed, nothing auto-merged);
 *  - `composeStatus()` — the served status = the fold combined with the S4 drift
 *    annotation (A5: `target-removed`/`signature-changed` → needs-review;
 *    `body-changed` → down-rank only), so drift NEVER clobbers the fold and a
 *    refold/rebuild never erases an active drift annotation;
 *  - `refoldMemory()` — the change-set-bounded materializer run at event append
 *    (never per query), and `rebuildMemoryStatuses()` / `rebuildConflictStatuses()`
 *    — the "store is a rebuildable view" path (tests assert cache == fold).
 *
 * No LLM / no network — a pure deterministic function of the local event log.
 */
import type { Store } from "../store/store.ts";
import type {
  MemoryDriftReason,
  MemoryEvent,
  MemoryEventVerb,
  MemoryStatus,
} from "../store/types.ts";

/** Verbs that assert a memory status. `create` carries its landing status in
 *  `refs.status` (the fold baseline) and is handled separately below. */
const VERB_STATUS: Readonly<Partial<Record<MemoryEventVerb, MemoryStatus>>> = {
  confirm: "active",
  review: "needs-review",
  retire: "retired",
  supersede: "superseded",
};

const MEMORY_STATUSES: readonly MemoryStatus[] = [
  "active",
  "needs-review",
  "superseded",
  "retired",
];

function isMemoryStatus(v: unknown): v is MemoryStatus {
  return typeof v === "string" && (MEMORY_STATUSES as readonly string[]).includes(v);
}

/** Total order over events (E2): `(at, then ULID)`. Returns a new array; the
 *  caller's insertion / file line order is irrelevant to the result. */
export function totalOrder(events: readonly MemoryEvent[]): MemoryEvent[] {
  return [...events].sort((x, y) =>
    x.at !== y.at ? x.at - y.at : x.id < y.id ? -1 : x.id > y.id ? 1 : 0,
  );
}

/**
 * Pure fold: derive `active|needs-review|superseded|retired` from a memory's
 * events. `create` sets the baseline (its `refs.status` landing status, else
 * `active`); each later status-asserting verb overrides. Order-independent.
 */
export function foldStatus(events: readonly MemoryEvent[]): MemoryStatus {
  let status: MemoryStatus = "active";
  for (const e of totalOrder(events)) {
    if (e.verb === "create") {
      status = isMemoryStatus(e.refs.status) ? e.refs.status : "active";
      continue;
    }
    const s = VERB_STATUS[e.verb];
    if (s !== undefined) status = s;
  }
  return status;
}

/**
 * E5 collision predicate. A GENUINE collision = the memory's log carries BOTH a
 * `retire` and a `supersede` event: two mutually-exclusive terminal dispositions
 * ("this is dead/wrong" vs "this is replaced by memory Y") taken as independent
 * decisions. Normal single-track lifecycle flows (create→review→confirm,
 * create→retire, create→supersede) never hold both, so this never false-fires.
 * Returns the latest-by-total-order event of each verb so the contradiction is
 * filed between the two competing decisions.
 */
export function detectCollision(
  events: readonly MemoryEvent[],
): { retire: MemoryEvent; supersede: MemoryEvent } | undefined {
  const ordered = totalOrder(events);
  const retires = ordered.filter((e) => e.verb === "retire");
  const supersedes = ordered.filter((e) => e.verb === "supersede");
  if (retires.length === 0 || supersedes.length === 0) return undefined;
  return { retire: retires[retires.length - 1]!, supersede: supersedes[supersedes.length - 1]! };
}

/**
 * Served status = the fold composed with the S4 drift annotation (A5). Drift is
 * derived per-checkout index state, NOT an event: `target-removed` /
 * `signature-changed` raise an effective `needs-review`; `body-changed` is
 * down-rank-only (status unchanged). Terminal fold states (`retired` /
 * `superseded`) win — drift never resurrects a retired or superseded memory.
 */
export function composeStatus(
  fold: MemoryStatus,
  drift: MemoryDriftReason | null | undefined,
): MemoryStatus {
  if (fold === "retired" || fold === "superseded") return fold;
  if (drift === "target-removed" || drift === "signature-changed") return "needs-review";
  return fold;
}

/** Find-or-create the provenance claim mirroring a lifecycle event, so the
 *  claim-id-keyed conflicts table can reference it. Idempotent: one stable claim
 *  per event (keyed by `locus = event.id`), so refold never files duplicates. */
function lifecycleDecisionClaim(
  store: Store,
  memoryId: string,
  event: MemoryEvent,
  gen: number,
): number {
  const existing = store
    .claimsFor(memoryId, "lifecycle-decision")
    .find((c) => c.locus === event.id);
  if (existing) return existing.id;
  return store.addClaim({
    subject: memoryId,
    predicate: "lifecycle-decision",
    object: event.verb,
    carrier: event.carrier,
    locus: event.id,
    method: event.method,
    authority: event.authority,
    gen,
  });
}

/**
 * Recompute + materialize one memory's cached `status` from its events + drift
 * annotation (change-set-bounded: call this only for a memory whose event log
 * gained events, S10 #4 — never per query). Files the E5 contradiction if the
 * log collides. Returns the effective served status.
 */
export function refoldMemory(store: Store, memoryId: string, gen: number): MemoryStatus {
  const events = store.memoryEvents(memoryId);
  const fold = foldStatus(events);
  const collision = detectCollision(events);
  if (collision) {
    const a = lifecycleDecisionClaim(store, memoryId, collision.retire, gen);
    const b = lifecycleDecisionClaim(store, memoryId, collision.supersede, gen);
    store.addConflict(a, b, "contradiction"); // INSERT OR IGNORE — idempotent
  }
  const drift = store.getMemory(memoryId)?.driftReason ?? null;
  const effective = composeStatus(fold, drift);
  store.setMemoryStatus(memoryId, effective);
  return effective;
}

/**
 * Rebuild every memory's cached status from the event log (the "store is a
 * rebuildable materialized view" contract). Preserves the drift annotation
 * (recomposes with it, never erases it — invariant b). Used by tests to assert
 * cache == fold and by any post-pull reindex.
 */
export function rebuildMemoryStatuses(store: Store, gen: number): void {
  const ids = new Set(store.allMemoryEvents().map((e) => e.memoryId));
  for (const id of ids) refoldMemory(store, id, gen);
}

/**
 * Rebuild the cached `conflicts.status` from resolution events (C4/Decision 5:
 * resolve/dismiss are events; the column is folded state). Every conflict starts
 * `open`; each `resolve-conflict` / `dismiss` event (in total order) sets the
 * referenced pair's status.
 */
export function rebuildConflictStatuses(store: Store): void {
  for (const c of store.allConflicts()) store.setConflictStatus(c.a, c.b, "open");
  for (const e of store.allMemoryEvents()) {
    if (e.verb !== "resolve-conflict" && e.verb !== "dismiss") continue;
    const a = e.refs.conflictA;
    const b = e.refs.conflictB;
    if (typeof a === "number" && typeof b === "number") {
      store.setConflictStatus(a, b, e.verb === "dismiss" ? "dismissed" : "resolved");
    }
  }
}
