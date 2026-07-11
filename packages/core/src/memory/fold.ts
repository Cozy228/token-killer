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
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import { recordDecision } from "./writeThrough.ts";
import type {
  MemoryDriftReason,
  MemoryEvent,
  MemoryEventVerb,
  MemoryStatus,
} from "../store/types.ts";

/**
 * The ONE stable, cross-machine claim key (R8): `subject|predicate|object|locus`.
 * Committed resolution refs and the E6 dump both address claims through this — a
 * per-store autoincrement id is meaningless on another clone. Claim field values
 * (entity ids, fixed predicates, reason classes) never contain `|`.
 */
export function claimKeyOf(c: {
  subject: string;
  predicate: string;
  object?: string;
  locus?: string;
}): string {
  return [c.subject, c.predicate, c.object ?? "", c.locus ?? ""].join("|");
}

function claimKeyById(store: Store, id: number): string | undefined {
  const c = store.getClaim(id);
  return c ? claimKeyOf(c) : undefined;
}

/** Resolve a committed claim key to a LOCAL claim id by content (R8). */
function localClaimIdForKey(store: Store, key: string): number | undefined {
  const parts = key.split("|");
  const [subject, predicate] = parts;
  const object = parts[2] ?? "";
  const locus = parts.slice(3).join("|"); // tolerate a `|` inside locus, defensively
  if (!subject || !predicate) return undefined;
  for (const c of store.claimsFor(subject, predicate)) {
    if ((c.object ?? "") === object && (c.locus ?? "") === locus) return c.id;
  }
  return undefined;
}

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
 * events. The FIRST `create` in total order sets the baseline (its `refs.status`
 * landing status, else `active`); any LATER `create` is ignored (F3 — slice 3's
 * union-merged files can replay a create, and a duplicate must never reset the
 * baseline over an intervening confirm/retire). Each status-asserting verb after
 * the baseline overrides. Order-independent.
 */
export function foldStatus(events: readonly MemoryEvent[]): MemoryStatus {
  let status: MemoryStatus = "active";
  let seenCreate = false;
  for (const e of totalOrder(events)) {
    if (e.verb === "create") {
      if (!seenCreate) {
        status = isMemoryStatus(e.refs.status) ? e.refs.status : "active";
        seenCreate = true;
      }
      continue; // later creates are inert
    }
    const s = VERB_STATUS[e.verb];
    if (s !== undefined) status = s;
  }
  return status;
}

/**
 * DR-10 — the equivalent as-of / bitemporal recompute path (P37 ⑧
 * EQUIVALENT-SCHEME). LAW §3 requires "answer as of T, recompute on demand".
 * Because memory is event-sourced (an append-only, totally-ordered log per S4),
 * the as-of answer is just the fold over the events whose transaction time `at`
 * is `<= asOf` — no `valid_from`/`valid_to` column read is needed. This is the
 * transaction-time axis of §3's bitemporality: a later diff is never evaluated
 * against an earlier summary because the earlier summary is recomputed from the
 * events that existed then. (The columns remain written for the explicit
 * valid-time axis; this path covers the transaction-time recompute the DR flags.)
 */
export function foldStatusAsOf(events: readonly MemoryEvent[], asOf: number): MemoryStatus {
  return foldStatus(events.filter((e) => e.at <= asOf));
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
  store.cacheMemoryStatus(memoryId, effective);
  return effective;
}

/**
 * Resolve or dismiss a conflict through the event log (C4/Decision 5): append the
 * immutable decision event carrying the conflict reference, THEN materialize the
 * cached `conflicts.status`. The single seam for conflict-status writes — no
 * caller dual-writes `cacheConflictStatus` directly (F6).
 */
export function resolveConflictViaEvent(
  store: Store,
  memoryId: string,
  a: number,
  b: number,
  verb: "resolve-conflict" | "dismiss",
  actor = "cli",
  files?: MemoryFiles,
  // C4-2 (F-E): the resolution decision must follow the CONFIRM's zone. Default
  // `mainline` keeps every other caller's behaviour; `setMemoryLifecycle` passes
  // `overlay` for a secret-diverted / unpromoted-overlay / `--local` confirm, so a
  // committed resolution `dec` never dangles on an id no peer has (the D3 class).
  zone: MemoryZone = "mainline",
): void {
  // R8: the committed bytes must be CONTENT-ADDRESSED — per-store autoincrement
  // claim ids are meaningless on another clone (they collide or mis-target). Write
  // stable claim KEYS (`subject|predicate|object|locus`) so a peer resolves the
  // referenced pair by content on reindex. (Legacy same-store events still carry
  // numeric `conflictA/B` and remain valid locally — read below.)
  const keyA = claimKeyById(store, a);
  const keyB = claimKeyById(store, b);
  const refs =
    keyA !== undefined && keyB !== undefined
      ? { a: keyA, b: keyB }
      : { conflictA: a, conflictB: b }; // fallback (claim vanished — same-store only)
  // Human/CLI resolution → the caller's zone (committed MAINLINE by default; the
  // overlay for a secret/unpromoted/`--local` confirm) via write-through.
  recordDecision(store, files, zone, {
    memoryId,
    verb,
    actor,
    refs,
    carrier: actor,
    method: "explicit-key",
    authority: "confirmed",
  });
  store.cacheConflictStatus(a, b, verb === "dismiss" ? "dismissed" : "resolved");
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
  for (const c of store.allConflicts()) store.cacheConflictStatus(c.a, c.b, "open");
  for (const e of store.allMemoryEvents()) {
    if (e.verb !== "resolve-conflict" && e.verb !== "dismiss") continue;
    const status = e.verb === "dismiss" ? "dismissed" : "resolved";
    // R8: content-addressed refs (new writes) resolve to LOCAL claim ids by
    // content; numeric refs (legacy same-store events) apply directly.
    const ka = e.refs.a;
    const kb = e.refs.b;
    if (typeof ka === "string" && typeof kb === "string") {
      const la = localClaimIdForKey(store, ka);
      const lb = localClaimIdForKey(store, kb);
      if (la !== undefined && lb !== undefined) store.cacheConflictStatus(la, lb, status);
      continue;
    }
    const a = e.refs.conflictA;
    const b = e.refs.conflictB;
    if (typeof a === "number" && typeof b === "number") {
      store.cacheConflictStatus(a, b, status);
    }
  }
}
