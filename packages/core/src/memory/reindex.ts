/**
 * Reindex — rebuild the SQLite memory cache from the committed `.ctx/` files
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
 *    `git diff <old>..<new> -- .ctx/memory/…` (S10 #3: pulled-delta-proportional,
 *    safe under `merge=union`). Any non-append diff shape (a rewrite / manual
 *    conflict resolution touching existing lines) falls back to a full rebuild.
 *
 * No LLM / no network at reindex time beyond local read-only git plumbing.
 */
import { execFileSync } from "node:child_process";
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import type { SerializedDecision, SerializedMemory } from "./serialize.ts";
import { lineTag, parseDecision, parseMemory } from "./serialize.ts";
import { classifyAbsentAnchor } from "./anchoredAt.ts";
import { rebuildConflictStatuses, rebuildMemoryStatuses, refoldMemory } from "./fold.ts";
import type { Store } from "../store/store.ts";
import type { MemoryEvent, MemoryOrigin } from "../store/types.ts";

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
}

/** Rebuild the memory index cache from every committed / overlay file. Never
 *  throws on a mangled line — it is skipped + counted (R1 / S1b). */
export function reindexMemoryFromFiles(
  store: Store,
  files: MemoryFiles,
  opts: { recomputeDrift?: boolean } = {},
): ReindexReport {
  const gen = store.beginGeneration(MEMORY_SOURCE);
  const report: ReindexReport = { memories: 0, decisions: 0, skipped: 0 };
  for (const zone of ZONES) {
    for (const raw of files.memoryLines(zone)) {
      const m = parseMemory(raw);
      if (!m) {
        report.skipped++;
        continue;
      }
      ingestMemoryEntry(store, files, zone, m, gen);
      report.memories++;
    }
    for (const raw of files.decisionLines(zone)) {
      const d = parseDecision(raw);
      if (!d) {
        report.skipped++;
        continue;
      }
      store.ingestMemoryEvent(decisionEvent(d));
      report.decisions++;
    }
  }
  rebuildMemoryStatuses(store, gen);
  rebuildConflictStatuses(store);
  if (opts.recomputeDrift !== false) recomputeDriftAtReindex(store, gen);
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
    // `anchoredAt` rides in the entity attrs so the from-scratch drift recompute
    // can read the author's HEAD without a dedicated column (S4 §4).
    attrs: { origin: m.origin, ...(m.anchoredAt ? { anchoredAt: m.anchoredAt } : {}) },
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
export function recomputeDriftAtReindex(store: Store, gen: number): void {
  for (const m of store.allMemories()) store.setMemoryDrift(m.entityId, null);
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
      const anchoredAt = readAnchoredAt(store, m.entityId);
      for (const anchorId of store.anchorsOf(m.entityId)) {
        if (store.getEntity(anchorId)) continue; // present target — not removed
        if (!/^(sym|file):/.test(anchorId)) continue; // external → unresolved-here
        if (classifyAbsentAnchor(projectRoot, anchoredAt) === "target-removed") {
          fileTargetRemoved(store, m.entityId, anchorId, gen);
          break; // one drift annotation per memory is enough
        }
      }
    }
  }
  // Re-fold so every served status = fold ∘ drift after the recompute.
  rebuildMemoryStatuses(store, gen);
}

function readAnchoredAt(store: Store, memoryId: string): string | undefined {
  const attrs = store.getEntity(memoryId)?.attrs;
  const v = attrs?.anchoredAt;
  return typeof v === "string" ? v : undefined;
}

/** Mirror `flagAnchored`'s artifacts per-memory (drift + stale-suspect conflict),
 *  idempotently (stable claims keyed by locus) so repeated reindexes never spam. */
function fileTargetRemoved(store: Store, memId: string, targetId: string, gen: number): void {
  store.setMemoryDrift(memId, "target-removed");
  const reasonClaim = findOrAddClaim(store, memId, "stale-reason", "target-removed", targetId, gen);
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
  const diff = gitDiff(opts.projectRoot, opts.oldTip, opts.newTip);
  if (diff === undefined) {
    const r = reindexMemoryFromFiles(store, files);
    return { mode: "full-fallback", added: 0, skipped: r.skipped };
  }
  const added: string[] = [];
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---")) continue; // file headers
    if (raw.startsWith("-")) {
      // A removed / rewritten entry line = non-append shape → full reconciliation.
      if (lineTag(raw.slice(1)) !== undefined) {
        const r = reindexMemoryFromFiles(store, files);
        return { mode: "full-fallback", added: 0, skipped: r.skipped };
      }
      continue;
    }
    if (raw.startsWith("+")) {
      const content = raw.slice(1);
      if (lineTag(content) !== undefined) added.push(content);
    }
  }
  const gen = store.beginGeneration(MEMORY_SOURCE);
  const touched = new Set<string>();
  let skipped = 0;
  for (const content of added) {
    if (lineTag(content) === "mem") {
      const m = parseMemory(content);
      if (m) {
        ingestMemoryEntry(store, files, "mainline", m, gen);
        touched.add(m.memoryId);
      } else {
        skipped++; // R1: a tag-valid but corrupt appended line is skipped
      }
    } else {
      const d = parseDecision(content);
      if (d) {
        store.ingestMemoryEvent(decisionEvent(d));
        touched.add(d.memoryId);
      } else {
        skipped++;
      }
    }
  }
  for (const id of touched) refoldMemory(store, id, gen);
  rebuildConflictStatuses(store);
  store.publishGeneration(MEMORY_SOURCE);
  return { mode: "delta", added: added.length, skipped };
}

/** Local read-only `git diff` over the committed memory logs. `undefined` when
 *  git is unavailable / the range is invalid → caller falls back to full rebuild. */
function gitDiff(projectRoot: string, oldTip: string, newTip: string): string | undefined {
  try {
    return execFileSync(
      "git",
      [
        "diff",
        "--no-color",
        "-U0",
        `${oldTip}..${newTip}`,
        "--",
        ".ctx/memory/log.md",
        ".ctx/memory/decisions.md",
      ],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 },
    );
  } catch {
    return undefined;
  }
}
