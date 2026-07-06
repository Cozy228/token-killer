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
import { classifyAbsentAnchor, isAncestor } from "./anchoredAt.ts";
import { catchUpStoreOnlyEvents } from "./catchup.ts";
import {
  foldStatus,
  rebuildConflictStatuses,
  rebuildMemoryStatuses,
  refoldMemory,
} from "./fold.ts";
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
  for (const zone of ZONES) {
    for (const raw of files.memoryLines(zone)) {
      const m = parseMemory(raw);
      if (!m) {
        report.skipped++;
        continue;
      }
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
      // R9: a human `confirm` that already cleared a `target-removed` drift on
      // this line of history suppresses re-derivation — otherwise every reindex
      // (slice-4 branch switches) re-undoes the confirm forever.
      if (confirmSuppressesTargetRemoved(store, m.entityId, projectRoot)) continue;
      const anchoredAt = readAnchoredAt(store, m.entityId);
      for (const anchorId of store.anchorsOf(m.entityId)) {
        if (store.getEntity(anchorId)) continue; // present target — not removed
        if (!/^(sym|file):/.test(anchorId)) {
          // External SoR target (category-③, e.g. a Jira/PR id): no local snapshot
          // to resolve against → `unresolved-here` (S9), never stale.
          store.setMemoryUnresolvedHere(m.entityId, true);
          break;
        }
        // Absent local (symbol/file) target: the committed anchored-at ancestry
        // splits `target-removed` (drift → stale-suspect) from branch-absent
        // (`unresolved-here`, S9 — never stale, never down-ranked).
        const cls = classifyAbsentAnchor(projectRoot, anchoredAt);
        if (cls === "target-removed") {
          fileTargetRemoved(store, m.entityId, anchorId, gen);
          break; // one drift annotation per memory is enough
        }
        if (cls === "unresolved-here") {
          store.setMemoryUnresolvedHere(m.entityId, true);
          break;
        }
        // `skip` (no anchored-at): conservative — leave both annotations clear.
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
 * R9 — true iff the memory carries a `confirm` decision that cleared a
 * `target-removed` drift AND was made on this branch's history (its committed
 * `confirmedAt` is an ancestor of HEAD) AND still governs (fold status active).
 * The human already judged this absence on this line; re-deriving would undo it.
 */
function confirmSuppressesTargetRemoved(
  store: Store,
  memoryId: string,
  projectRoot: string,
): boolean {
  const events = store.memoryEvents(memoryId);
  if (foldStatus(events) !== "active") return false;
  for (const e of events) {
    if (e.verb !== "confirm") continue;
    if (e.refs.clearedDrift !== "target-removed") continue;
    const at = e.refs.confirmedAt;
    if (typeof at === "string" && isAncestor(projectRoot, at)) return true;
  }
  return false;
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
  rebuildConflictStatuses(store);
  store.publishGeneration(MEMORY_SOURCE);
  return { mode: "delta", added: addedCount, skipped };
}

/** Event ids committed at `tip` (both mainline logs) — the F5 purge exclusion. */
function committedEventIds(projectRoot: string, tip: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const path of [".ctx/memory/log.md", ".ctx/memory/decisions.md"]) {
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
        ".ctx/memory/log.md",
        ".ctx/memory/decisions.md",
      ],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 },
    );
  } catch {
    return undefined;
  }
}
