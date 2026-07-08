/**
 * Reindex — rebuild the SQLite memory cache from the committed `.contexa/` files
 * (slice 3). The files are the append-only source of truth (B1); this module
 * repopulates the rebuildable index over them. Two entry points, both callable +
 * tested here; wiring into the refresh cold path is slice 4 (this slice does NOT
 * touch `memory/adapter.ts`).
 *
 *  - `reindexMemoryFromFiles` — full rebuild. Parses mainline + overlay entries
 *    and decisions, repopulates events (INSERT OR IGNORE — idempotent), refolds
 *    all statuses, rebuilds FTS. Order-independent (E2: total order = `(at, ULID)`,
 *    never file line order) — shuffled input yields identical results. At the end,
 *    drift annotations are RECOMPUTED FROM SCRATCH against the current code index
 *    (S4 §1 — the deliberate revisit of the R2-2 within-process stickiness).
 *  - `pullDeltaReindex` — process exactly the added lines from
 *    `git diff <old>..<new> -- .contexa/memory/…` (S10 #3: pulled-delta-proportional,
 *    safe under `merge=union`). Any non-append diff shape (a rewrite / manual
 *    conflict resolution touching existing lines) falls back to a full rebuild.
 *
 * No LLM / no network at reindex time beyond local read-only git plumbing.
 */
import { execFileSync } from "node:child_process";
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import type { SerializedDecision, SerializedMemory } from "./serialize.ts";
import { lineTag, parseDecision, parseMemory } from "./serialize.ts";
import { classifyAbsentAnchor, isAncestor } from "./anchoredAt.ts";
import { catchUpStoreOnlyEvents } from "./catchup.ts";
import { identityCandidatePairs } from "./dedup.ts";
import {
  foldStatus,
  rebuildConflictStatuses,
  rebuildMemoryStatuses,
  refoldMemory,
} from "./fold.ts";
import type { Store } from "../store/store.ts";
import type { Entity, MemoryDriftReason, MemoryEvent, MemoryOrigin } from "../store/types.ts";

const MEMORY_SOURCE = "memory";
const ZONES: readonly MemoryZone[] = ["mainline", "overlay"];

export interface ReindexReport {
  /** Memory (create) entries indexed. */
  memories: number;
  /** Lifecycle/decision events indexed. */
  decisions: number;
  /** Committed lines skipped because they were unparseable (R1 — corrupt /
   *  hand-edited line; success-shaped, surfaced for a later `ctx doctor`). */
  skipped: number;
  /** Overlay mem entries skipped because MAINLINE already owns the id (F6 —
   *  mainline wins deterministically; surfaced for a later `ctx doctor`). */
  shadowedOverlay: number;
}

export interface ReindexOptions {
  recomputeDrift?: boolean;
  /**
   * `additive` (default): INSERT OR IGNORE over the append-only tables — safe for
   * plain appends. `reset`: the sanctioned files→store cache reset (F5) — used at
   * migration end and on a NON-APPEND pull-delta fallback (a rewrite/redaction
   * that must SHED rows). Reset runs the catch-up export FIRST (ordering guard),
   * so store-only rows are committed before the cache is cleared — nothing strands.
   */
  mode?: "additive" | "reset";
  /** Event ids that were in the OLD committed history (pull-delta fallback): a
   *  redacted/removed committed row is purged, not re-exported by the catch-up. */
  resetExcludeIds?: ReadonlySet<string>;
}

/** Rebuild the memory index cache from every committed / overlay file. Never
 *  throws on a mangled line — it is skipped + counted (R1 / S1b). */
export function reindexMemoryFromFiles(
  store: Store,
  files: MemoryFiles,
  opts: ReindexOptions = {},
): ReindexReport {
  if (opts.mode === "reset") {
    // Ordering guard (F5): export store-only events BEFORE clearing the cache.
    // `resetExcludeIds` keeps committed-then-removed rows from being re-exported.
    catchUpStoreOnlyEvents(store, files, opts.resetExcludeIds);
    store.resetMemoryCache();
  }
  const gen = store.beginGeneration(MEMORY_SOURCE);
  const report: ReindexReport = { memories: 0, decisions: 0, skipped: 0, shadowedOverlay: 0 };
  // F6: MAINLINE wins. Track the ids ingested from mainline so an overlay mem
  // entry with the same id never clobbers the committed (possibly redacted) text.
  const mainlineIds = new Set<string>();
  // C6-3: every memory id PRESENT in the current files (both zones, including a
  // mainline-shadowed overlay id) — the identity derivation filters to this so a
  // stale store row (additive reindex never sheds) can't re-file a conflict.
  const seenMemoryIds = new Set<string>();
  for (const zone of ZONES) {
    for (const raw of files.memoryLines(zone)) {
      const m = parseMemory(raw);
      if (!m) {
        report.skipped++;
        continue;
      }
      seenMemoryIds.add(m.memoryId);
      if (zone === "overlay" && mainlineIds.has(m.memoryId)) {
        report.shadowedOverlay++;
        continue;
      }
      ingestMemoryEntry(store, files, zone, m, gen);
      if (zone === "mainline") mainlineIds.add(m.memoryId);
      report.memories++;
    }
    for (const raw of files.decisionLines(zone)) {
      const d = parseDecision(raw);
      if (!d) {
        report.skipped++;
        continue;
      }
      // C3-3 (F-C): MAINLINE wins for lifecycle decisions too. A leftover overlay
      // `dec` on a mainline-owned id (e.g. a migration secret replay) would flip a
      // committed memory's fold LOCALLY, breaking mainline-wins + peer determinism.
      // Skip + count it. EXEMPTION: under the E4 opt-out (`localOnly`) every legit
      // decision — including for pre-opt-out mainline creates — is routed to the
      // overlay and MUST keep folding, so it is never shadowed there. Non-destruction
      // holds: the line stays in the file; only the index ignores it (doctor already
      // surfaces `shadowedOverlay`).
      if (zone === "overlay" && mainlineIds.has(d.memoryId) && !files.localOnly) {
        report.shadowedOverlay++;
        continue;
      }
      store.ingestMemoryEvent(decisionEvent(d));
      report.decisions++;
    }
  }
  rebuildMemoryStatuses(store, gen);
  rebuildConflictStatuses(store);
  // C6-3: scope drift derivation to the ids present in the current files too (shed
  // stale additive rows), exactly like the identity layer below.
  if (opts.recomputeDrift !== false) recomputeDriftAtReindex(store, gen, seenMemoryIds);
  // D1 identity layer (item 1): derive `sameAsCandidate` conflicts from committed
  // content — independent of the code index, so it runs regardless of `recomputeDrift`.
  // C6-3: scope to the ids present in the current files (shed stale additive rows).
  recomputeIdentityAtReindex(store, gen, seenMemoryIds);
  store.publishGeneration(MEMORY_SOURCE);
  return report;
}

/** Ingest one committed memory (create) entry into the index cache. */
function ingestMemoryEntry(
  store: Store,
  files: MemoryFiles,
  zone: MemoryZone,
  m: SerializedMemory,
  gen: number,
): void {
  const detail = m.detailPointer ? files.readSidecar(zone, m.detailPointer) : undefined;
  store.upsertEntity({
    id: m.memoryId,
    kind: "memory",
    name: m.gist.slice(0, 80),
    locator: { t: "store" },
    // `anchoredAt` + `anchorSigs` ride in the entity attrs so the from-scratch
    // drift recompute can read the author's HEAD (S4 §4) and the O-18 content-hash
    // baseline (item 2) without dedicated columns — both are recomputed per
    // checkout, never synced.
    attrs: {
      origin: m.origin,
      ...(m.anchoredAt ? { anchoredAt: m.anchoredAt } : {}),
      ...(m.anchorSigs && Object.keys(m.anchorSigs).length > 0 ? { anchorSigs: m.anchorSigs } : {}),
    },
    gen,
  });
  store.writeMemory({
    entityId: m.memoryId,
    gist: m.gist,
    detail, // a dangling pointer reads `undefined` — success-shaped (S1b)
    origin: m.origin as MemoryOrigin,
    sessionRef: m.sessionRef,
    authority: m.authority, // carried VERBATIM (R4) — 4-valued, no collapse
    status: m.status,
    validFrom: m.validFrom,
    validTo: m.validTo,
  });
  // Item 4: record the zone the create currently lives in (derived provenance,
  // recomputed per checkout). MAINLINE wins for a shadowed id (the overlay entry
  // never reaches here — F6 skips it before this call), so this reflects the
  // committed zone whenever mainline owns the id.
  store.setMemoryOriginZone(m.memoryId, zone);
  store.ingestMemoryEvent(createEvent(m));
  // Anchors: both the anchors table AND the `anchoredTo` links (the drift path
  // reads links). Anchor targets may not exist yet (code un-ingested) — that is
  // fine; anchors carry no FK.
  store.setAnchors(m.memoryId, m.anchors);
  for (const anchorId of m.anchors) {
    store.setLink({
      src: m.memoryId,
      dst: anchorId,
      predicate: "anchoredTo",
      method: "explicit-key",
    });
  }
  store.ftsIndex(m.memoryId, {
    name: m.gist.slice(0, 80),
    text: `${m.gist} ${detail ?? ""}`.trim(),
    kind: "memory",
  });
  store.internHandle(m.memoryId);
}

function createEvent(m: SerializedMemory): MemoryEvent {
  return {
    id: m.eventId,
    memoryId: m.memoryId,
    verb: "create",
    actor: m.actor,
    reason: m.reason,
    refs: { status: m.status },
    carrier: m.carrier,
    locus: undefined,
    method: m.method,
    authority: m.authority,
    at: m.at,
  };
}

function decisionEvent(d: SerializedDecision): MemoryEvent {
  return {
    id: d.eventId,
    memoryId: d.memoryId,
    verb: d.verb,
    actor: d.actor,
    reason: d.reason,
    refs: d.refs ?? {},
    carrier: d.carrier,
    locus: d.locus,
    method: d.method,
    authority: d.authority,
    at: d.at,
  };
}

/**
 * Recompute drift from scratch (S4 §1). First CLEAR every annotation (the
 * deliberate unsticking of the R2-2 within-process stickiness — a branch switch
 * must not carry stale drift). Then, only if a code index is actually published,
 * re-derive `target-removed` for any code-shaped anchor that is ABSENT and whose
 * committed `anchored-at` is an ancestor of HEAD (S4 §4). A not-ancestor absent
 * anchor is branch-absent (`unresolved-here`, S9) — never marked stale. Skips
 * when the code index is absent (cannot judge freshness → leave cleared).
 */
export function recomputeDriftAtReindex(
  store: Store,
  gen: number,
  seenIds?: ReadonlySet<string>,
): void {
  for (const m of store.allMemories()) {
    store.setMemoryDrift(m.entityId, null);
    // S9 `unresolved-here` is per-checkout derived state too — clear then re-derive
    // from scratch, so a branch switch never carries a stale branch-absent flag.
    store.setMemoryUnresolvedHere(m.entityId, false);
  }
  // R2 — the derived `stale-suspect` conflict layer is per-checkout index state
  // (S4 §1), so recompute it from scratch: delete the cached rows, then re-file
  // ONLY the ones re-derived below. Otherwise `rebuildConflictStatuses` reopens
  // yesterday's drift forever, and a long-lived peer + a fresh clone at the same
  // commit dump DIFFERENT conflict sets (E6 breakage). Cache deletion only — the
  // committed source, the append-only events, and the stale-reason claims are
  // untouched (non-destruction). The R2-2 within-process stickiness formally
  // ENDS here (ratified S4 §1); contradiction conflicts keep deriving from events.
  store.deleteConflictsByKind("stale-suspect");
  const codePublished = store.publishedGen("code") > 0 || store.publishedGen("docs") > 0;
  // Re-derivation needs a checkout to run `git merge-base --is-ancestor` against.
  const projectRoot = store.projectRoot;
  if (codePublished) {
    for (const m of store.allMemories()) {
      // C6-3 (for drift): on an ADDITIVE full reindex the store keeps rows for
      // memories whose committed line is GONE on this checkout (the additive path
      // never sheds rows). Deriving drift from such a stale row would re-file a
      // `stale-suspect` a fresh clone never has, diverging a long-lived peer (E6).
      // The CLEAR loop above is deliberately UNFILTERED (every row, incl. stale
      // ones, has its drift/unresolved-here annotation reset); only this DERIVE step
      // scopes to the ids actually present in the CURRENT files. `undefined`
      // (pull-delta: append-only, no removals) → no filtering, correct there.
      if (seenIds !== undefined && !seenIds.has(m.entityId)) continue;
      // R9: a human `confirm` that already cleared a `target-removed` drift on this
      // line of history suppresses re-deriving THAT class — otherwise every reindex
      // (slice-4 branch switches) re-undoes the confirm forever. Item 2 refines it
      // to per-ANCHOR: the suppression applies only to an ABSENT target's
      // `target-removed`; a PRESENT anchor whose committed content-hash baseline no
      // longer matches (a reappeared-and-changed target) STILL re-derives drift, so
      // the hash comparison beats a stale `clearedDrift` (the R9 reappear edge).
      // C6-1: `target-removed` suppression is PER-ANCHOR — a confirm lists the absent
      // anchors it judged (`confirmAbsent`); a legacy confirm (no list) still
      // suppresses memory-wide (degrade rule).
      const trSuppress = targetRemovedSuppression(store, m.entityId, projectRoot);
      // S6-R1: the present-target signatures a human `confirm` judged (committed in
      // the confirm dec refs). A present anchor whose current signature EQUALS the
      // confirmed one is suppressed (the human accepted exactly this state); a later
      // change (current ≠ confirmed) re-derives. Deterministic from committed bytes.
      const confirmedSigs = activeConfirmSigs(store, m.entityId);
      const anchoredAt = readAnchoredAt(store, m.entityId);
      const sigs = readAnchorSigs(store, m.entityId);
      // F1 (review): scan ALL anchors before deciding, and let the HIGHEST-severity
      // drift class WIN (target-removed > signature-changed > body-changed), never a
      // break-on-first-match (order-dependent). Collect classes, then file one drift.
      let removedAnchor: string | undefined;
      let changedAnchor: string | undefined;
      let changedReason: MemoryDriftReason | undefined;
      let unresolved = false;
      for (const anchorId of store.anchorsOf(m.entityId)) {
        const target = store.getEntity(anchorId);
        if (target) {
          // O-18 present-target drift (item 2): compare the target's CURRENT content
          // signature to the committed baseline. A change re-derives deterministically
          // at a full reindex / on a fresh clone (previously ONLY `target-removed`
          // survived a reindex — R2's named follow-up). Absent baseline (legacy anchor)
          // → no present-target drift, exactly today's behaviour.
          const reason = presentTargetDrift(sigs?.[anchorId], target);
          if (reason) {
            // S6-R1: a confirm that judged this exact present state suppresses the
            // re-derivation, so a full reindex never re-undoes the human's recovery.
            const confirmed = confirmedSigs[anchorId];
            const suppressed = confirmed !== undefined && sigEquals(confirmed, currentSig(target));
            if (!suppressed && driftRank(reason) > driftRank(changedReason ?? null)) {
              changedReason = reason;
              changedAnchor = anchorId;
            }
          }
          continue;
        }
        if (!/^(sym|file):/.test(anchorId)) {
          // External SoR target (category-③, e.g. a Jira/PR id): no local snapshot
          // to resolve against → `unresolved-here` (S9), never stale.
          unresolved = true;
          continue;
        }
        // Absent local (symbol/file) target: the committed anchored-at ancestry
        // splits `target-removed` (drift → stale-suspect) from branch-absent
        // (`unresolved-here`, S9 — never stale, never down-ranked).
        const cls = classifyAbsentAnchor(projectRoot, anchoredAt);
        if (cls === "target-removed") {
          if (!(trSuppress.legacy || trSuppress.anchors.has(anchorId))) removedAnchor ??= anchorId;
        } else if (cls === "unresolved-here") {
          unresolved = true;
        }
        // `skip` (no anchored-at): conservative — contributes neither class.
      }
      if (removedAnchor !== undefined) {
        fileDrift(store, m.entityId, removedAnchor, "target-removed", gen); // highest wins
      } else if (changedAnchor !== undefined && changedReason !== undefined) {
        fileDrift(store, m.entityId, changedAnchor, changedReason, gen);
      } else if (unresolved) {
        store.setMemoryUnresolvedHere(m.entityId, true);
      }
    }
  }
  // Re-fold so every served status = fold ∘ drift after the recompute.
  rebuildMemoryStatuses(store, gen);
  // R10: re-apply resolution events AFTER the stale-suspect re-file, so a locally
  // resolved/dismissed conflict that is still derivable does not reopen. (Composes
  // with R9: a confirmed memory does not even re-file; this covers non-confirm
  // resolutions like `dismiss`.)
  rebuildConflictStatuses(store);
}

/**
 * D1 identity layer (slice 6 item 1): derive `sameAsCandidate` identity conflicts
 * from the committed bytes — two zones / two merged branches carrying the same-or-
 * near-identical memory. Files an OPEN `sameAsCandidate` conflict per near-dup pair
 * (surfaced, never auto-merged; the human resolves via the append-only decision-log
 * verbs, C4). This closes the slice-3 D1 scope limit: dedup links become committed-
 * DERIVED state (identical across peers and fresh clones, E6), not author-local.
 *
 * "claims=evidence, conflicts=state" (S4): the DERIVED conflict layer is
 * per-checkout index state, so — exactly like `stale-suspect` — clear the cached
 * `sameAsCandidate` conflicts first, then re-file only the ones re-derived from the
 * current committed content. Derivation is content-keyed + order-independent
 * (`identityCandidatePairs`), so a long-lived peer and a fresh clone converge to the
 * same conflict set. A human `dismiss`/`resolve-conflict` is folded by the trailing
 * `rebuildConflictStatuses` (content-addressed refs, R8). Retired memories are
 * excluded (a retired note is not a live duplicate).
 */
export function recomputeIdentityAtReindex(
  store: Store,
  gen: number,
  seenIds?: ReadonlySet<string>,
): void {
  // Cache deletion only — the committed source + append-only events are untouched
  // (non-destruction); the layer re-derives below.
  store.deleteConflictsByKind("sameAsCandidate");
  const memories = store
    .allMemories()
    // C6-2: exclude BOTH terminal statuses. A `retired` or `superseded` memory is
    // not a live duplicate — the human already dispositioned it (a supersede is
    // itself the resolution of a near-dup), so it must not seed a fresh
    // `sameAsCandidate`. Statuses are folded before this runs.
    .filter((m) => m.status !== "retired" && m.status !== "superseded")
    // C6-3: on an ADDITIVE full reindex the store keeps rows for memories whose
    // committed line is GONE on this checkout (the additive path never sheds rows —
    // the same stale-row exposure that pre-dates this slice for drift). Filter the
    // identity input to the ids actually present in the CURRENT files, so a peer that
    // switched to a checkout without M2's line stops re-filing the M1↔M2 conflict and
    // converges with a fresh clone (E6). `undefined` (pull-delta: append-only, no
    // removals) → no filtering, correct there.
    .filter((m) => seenIds === undefined || seenIds.has(m.entityId))
    .map((m) => ({ id: m.entityId, gist: m.gist }));
  for (const [a, b] of identityCandidatePairs(memories)) {
    // Non-destructive sameAsCandidate: one claim per direction (idempotent by
    // subject/object — reused if a write-time dedup already added it, F-mirror),
    // filed in canonical order so the conflict is identical across machines. The
    // E6 dump keys the conflict by claim CONTENT (subject|predicate|object|locus),
    // never the per-store numeric id, so two clones dump identically.
    const forward = findOrAddSameAsClaim(store, a, b, gen);
    const reverse = findOrAddSameAsClaim(store, b, a, gen);
    store.addConflict(forward, reverse, "sameAsCandidate");
  }
  // Fold any committed resolution/dismiss over the freshly re-filed conflicts.
  rebuildConflictStatuses(store);
}

/** Find-or-add the derived `sameAsCandidate` claim `subject → object` (matched by
 *  object so it reuses a write-time dedup claim of the same content). */
function findOrAddSameAsClaim(store: Store, subject: string, object: string, gen: number): number {
  const existing = store
    .claimsFor(subject, "sameAsCandidate")
    .find((c) => (c.object ?? "") === object);
  if (existing) return existing.id;
  return store.addClaim({
    subject,
    predicate: "sameAsCandidate",
    object,
    carrier: "reindex",
    method: "semantic-proposal",
    authority: "derived",
    gen,
  });
}

/**
 * R9 / C6-1 — the `target-removed` suppression a human `confirm` established, now
 * PER ANCHOR. A confirm that cleared a `target-removed` drift, was made on this
 * branch's history (committed `confirmedAt` is an ancestor of HEAD), and still
 * governs (fold status active), suppresses re-deriving `target-removed` for the
 * absent anchors it listed (`confirmAbsent`). A LEGACY confirm (cleared
 * `target-removed` but carries no `confirmAbsent` — pre-C6-1 committed bytes) keeps
 * the old memory-WIDE suppression, so nothing regresses (degrade rule). A later
 * removal of a DIFFERENT anchor is NOT in any confirm's list → it still flags.
 */
function targetRemovedSuppression(
  store: Store,
  memoryId: string,
  projectRoot: string,
): { legacy: boolean; anchors: Set<string> } {
  const out = { legacy: false, anchors: new Set<string>() };
  const events = store.memoryEvents(memoryId);
  if (foldStatus(events) !== "active") return out;
  for (const e of events) {
    if (e.verb !== "confirm") continue;
    if (e.refs.clearedDrift !== "target-removed") continue;
    const at = e.refs.confirmedAt;
    if (typeof at !== "string" || !isAncestor(projectRoot, at)) continue;
    const absent = e.refs.confirmAbsent;
    if (Array.isArray(absent)) {
      for (const a of absent) if (typeof a === "string") out.anchors.add(a);
    } else {
      out.legacy = true; // legacy confirm → memory-wide suppression
    }
  }
  return out;
}

function readAnchoredAt(store: Store, memoryId: string): string | undefined {
  const attrs = store.getEntity(memoryId)?.attrs;
  const v = attrs?.anchoredAt;
  return typeof v === "string" ? v : undefined;
}

/** The committed O-18 content-hash baselines carried in the memory entity attrs
 *  (item 2), keyed by anchor id. Absent for legacy anchors. */
function readAnchorSigs(
  store: Store,
  memoryId: string,
): Record<string, { h: string; a?: number }> | undefined {
  const v = store.getEntity(memoryId)?.attrs.anchorSigs;
  return v && typeof v === "object" ? (v as Record<string, { h: string; a?: number }>) : undefined;
}

/**
 * O-18 (item 2): classify a PRESENT anchor target's drift by comparing its current
 * content signature to the committed baseline captured at write time. Mirrors the
 * within-branch `flagAnchorDrift` split (A5): arity changed → `signature-changed`;
 * else body hash changed → `body-changed`. No baseline (legacy anchor) → no drift
 * (returns undefined — exactly today's behaviour). Deterministic: reads committed
 * bytes + the current code index only.
 */
function presentTargetDrift(
  baseline: { h: string; a?: number } | undefined,
  target: Entity,
): MemoryDriftReason | undefined {
  if (!baseline) return undefined;
  const arity = typeof target.attrs.arity === "number" ? target.attrs.arity : undefined;
  if ((baseline.a ?? -1) !== (arity ?? -1)) return "signature-changed";
  if (target.contentHash !== undefined && target.contentHash !== baseline.h) return "body-changed";
  return undefined;
}

/** The target's CURRENT content signature (mirror of `anchorSigsFor` at write). */
function currentSig(target: Entity): { h: string; a?: number } {
  const arity = typeof target.attrs.arity === "number" ? target.attrs.arity : undefined;
  return arity !== undefined
    ? { h: target.contentHash ?? "", a: arity }
    : { h: target.contentHash ?? "" };
}

function sigEquals(a: { h: string; a?: number }, b: { h: string; a?: number }): boolean {
  return a.h === b.h && (a.a ?? -1) === (b.a ?? -1);
}

/**
 * S6-R1: the anchor signatures recorded by an ACTIVE-governing `confirm` (committed
 * in the confirm dec refs). Empty when the memory's fold is not active (a later
 * retire/supersede governs) or no confirm carried `confirmSigs` (legacy confirm →
 * today's behaviour). Merges every active confirm's map (last write wins per anchor
 * in total order — later confirms judge the newer state).
 */
function activeConfirmSigs(
  store: Store,
  memoryId: string,
): Record<string, { h: string; a?: number }> {
  const events = store.memoryEvents(memoryId);
  if (foldStatus(events) !== "active") return {};
  const out: Record<string, { h: string; a?: number }> = {};
  for (const e of events) {
    if (e.verb !== "confirm") continue;
    const cs = e.refs.confirmSigs;
    if (cs && typeof cs === "object") {
      Object.assign(out, cs as Record<string, { h: string; a?: number }>);
    }
  }
  return out;
}

/** Drift severity ladder (mirror of incremental.ts): target-removed > signature-
 *  changed > body-changed > no-drift. Used to pick the highest across anchors. */
function driftRank(reason: MemoryDriftReason | null): number {
  switch (reason) {
    case "target-removed":
      return 3;
    case "signature-changed":
      return 2;
    case "body-changed":
      return 1;
    default:
      return 0;
  }
}

/** Mirror `flagAnchored`'s artifacts per-memory (drift + stale-suspect conflict),
 *  idempotently (stable claims keyed by locus) so repeated reindexes never spam.
 *  Reason-classed (A5) — `composeStatus` applies the status effect (signature-
 *  changed/target-removed → needs-review; body-changed → down-rank only). */
function fileDrift(
  store: Store,
  memId: string,
  targetId: string,
  reason: MemoryDriftReason,
  gen: number,
): void {
  store.setMemoryDrift(memId, reason);
  const reasonClaim = findOrAddClaim(store, memId, "stale-reason", reason, targetId, gen);
  const anchorClaim = findOrAddClaim(store, memId, "stale-anchor", targetId, targetId, gen);
  store.addConflict(anchorClaim, reasonClaim, "stale-suspect");
  refoldMemory(store, memId, gen);
}

function findOrAddClaim(
  store: Store,
  subject: string,
  predicate: string,
  object: string,
  locus: string,
  gen: number,
): number {
  const existing = store.claimsFor(subject, predicate).find((c) => c.locus === locus);
  if (existing) return existing.id;
  return store.addClaim({
    subject,
    predicate,
    object,
    carrier: "reindex",
    locus,
    method: "structural",
    authority: "derived",
    gen,
  });
}

export interface PullDeltaResult {
  mode: "delta" | "full-fallback";
  added: number;
  /** Added lines skipped because they were unparseable (R1). */
  skipped: number;
}

/**
 * Reindex exactly the appended lines pulled between two commits (S10 #3). Reads
 * ONLY the committed mainline logs (overlay is gitignored, never pulled). A
 * non-append diff shape → full rebuild fallback (correct, rare).
 */
export function pullDeltaReindex(
  store: Store,
  files: MemoryFiles,
  opts: { projectRoot: string; oldTip: string; newTip: string },
): PullDeltaResult {
  // Old committed event ids — a redaction removes some of these; the reset must
  // purge those rows, not re-export them via the catch-up (F5).
  const excludeIds = (): ReadonlySet<string> => committedEventIds(opts.projectRoot, opts.oldTip);
  const diff = gitDiff(opts.projectRoot, opts.oldTip, opts.newTip);
  if (diff === undefined) {
    const r = reindexMemoryFromFiles(store, files, {
      mode: "reset",
      resetExcludeIds: excludeIds(),
    });
    return { mode: "full-fallback", added: 0, skipped: r.skipped };
  }
  // F7: route added lines by the FILE they came from (track the `+++` header),
  // not by tag alone; a rename degrades to delete+add (`--no-renames`) → the
  // non-append fallback catches it.
  let currentFile = "";
  const added: Array<{ file: string; content: string }> = [];
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++")) {
      currentFile = headerPath(raw);
      continue;
    }
    if (raw.startsWith("---")) continue; // old-side header
    if (raw.startsWith("-")) {
      // A removed / rewritten entry line = non-append shape → a rewrite/redaction
      // that must SHED rows → the sanctioned RESET reconciliation (F5).
      if (lineTag(raw.slice(1)) !== undefined) {
        const r = reindexMemoryFromFiles(store, files, {
          mode: "reset",
          resetExcludeIds: excludeIds(),
        });
        return { mode: "full-fallback", added: 0, skipped: r.skipped };
      }
      continue;
    }
    if (raw.startsWith("+")) {
      const content = raw.slice(1);
      if (content.trim().length > 0) added.push({ file: currentFile, content });
    }
  }
  const gen = store.beginGeneration(MEMORY_SOURCE);
  const touched = new Set<string>();
  let addedCount = 0;
  let skipped = 0;
  for (const { file, content } of added) {
    if (file.endsWith("log.md")) {
      const m = parseMemory(content);
      if (m) {
        ingestMemoryEntry(store, files, "mainline", m, gen);
        touched.add(m.memoryId);
        addedCount++;
      } else {
        skipped++; // corrupt (R1) or a `dec` line in the wrong file (F7)
      }
    } else if (file.endsWith("decisions.md")) {
      const d = parseDecision(content);
      if (d) {
        store.ingestMemoryEvent(decisionEvent(d));
        touched.add(d.memoryId);
        addedCount++;
      } else {
        skipped++;
      }
    } else {
      skipped++; // an entry line from an unexpected file
    }
  }
  for (const id of touched) refoldMemory(store, id, gen);
  // C3-1 (F-A): the delta path must recompute drift from scratch, exactly like the
  // full path (line ~112). Otherwise a pulled memory anchored to a target that is
  // absent-and-ancestry-removed on this checkout stays clean-active instead of
  // filing `target-removed` drift / stale-suspect. `recomputeDriftAtReindex`
  // re-runs `rebuildConflictStatuses` as its last step (R10), so we do not call it
  // separately here. Pull is a cold path; A11 (dirty/serve) is untouched.
  recomputeDriftAtReindex(store, gen);
  // D1 identity layer (item 1): a pulled near-dup (e.g. a peer committed a memory
  // that duplicates one of ours) must file `sameAsCandidate` at the pull-delta path
  // too, not only on a full rebuild. Deterministic + content-keyed.
  recomputeIdentityAtReindex(store, gen);
  store.publishGeneration(MEMORY_SOURCE);
  return { mode: "delta", added: addedCount, skipped };
}

/** Event ids committed at `tip` (both mainline logs) — the F5 purge exclusion. */
function committedEventIds(projectRoot: string, tip: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const path of [".contexa/memory/log.md", ".contexa/memory/decisions.md"]) {
    const text = gitShow(projectRoot, tip, path);
    if (text === undefined) continue;
    for (const raw of text.split("\n")) {
      const m = parseMemory(raw);
      if (m) {
        ids.add(m.eventId);
        continue;
      }
      const d = parseDecision(raw);
      if (d) ids.add(d.eventId);
    }
  }
  return ids;
}

function gitShow(projectRoot: string, tip: string, path: string): string | undefined {
  try {
    return execFileSync("git", ["--no-pager", "show", `${tip}:${path}`], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
  } catch {
    return undefined; // path absent at that commit → no ids
  }
}

/** The basename of a `+++ b/<path>` diff header (F7 file routing). */
function headerPath(header: string): string {
  const m = /^\+\+\+ (?:b\/)?(.*)$/.exec(header.trim());
  const p = m ? (m[1] as string) : "";
  return p.split("/").pop() ?? "";
}

/**
 * Local read-only `git diff` over the committed memory logs. `--no-ext-diff` +
 * `--no-textconv` (F3) neutralise any user `diff.external` (delta/difftastic) or
 * textconv filter that would otherwise mangle the plumbing output and silently
 * index nothing; `--no-renames` (F7) makes a log rename a delete+add so the
 * non-append fallback fires. `undefined` on any git error → full-rebuild fallback.
 */
function gitDiff(projectRoot: string, oldTip: string, newTip: string): string | undefined {
  try {
    return execFileSync(
      "git",
      [
        "--no-pager",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--no-color",
        "-U0",
        `${oldTip}..${newTip}`,
        "--",
        ".contexa/memory/log.md",
        ".contexa/memory/decisions.md",
      ],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 },
    );
  } catch {
    return undefined;
  }
}
