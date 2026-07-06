/**
 * Incremental correctness trio + memory-anchor drift (CTX-IMPL §4 / §5.2 / §5.5)
 * — slice 2c. The hardest bug class is "a file that didn't change has stale
 * derived data"; the three guards below (ported off gitnexus's incremental
 * subgraph-extract / shadow-candidates and graphify's shrink guard, adapted to
 * our store's link API) close it, and the drift classifier reaches the two
 * M1-deferred stale classes (`signature-changed` / `body-changed`).
 *
 * All functions operate on the pinned foundation `Store` (links + entities +
 * memory) — no new persistence shape beyond a file→file `imports` link, which
 * the code adapter writes so the boundary/shadow graph has edges to walk.
 */
import { posix } from "node:path";
import { refoldMemory } from "../../memory/fold.ts";
import type { Store } from "../../store/store.ts";
import type { SymbolRecord } from "../../extract/code/symbol.ts";

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

export function fileEntityId(relPath: string): string {
  return `file:${relPath}`;
}

function pathOfFileId(id: string): string | undefined {
  return id.startsWith("file:") ? id.slice("file:".length) : undefined;
}

/** A file's module key = its path with the trailing extension removed
 *  (`src/util.ts` → `src/util`). Two files share a specifier target when their
 *  keys match (different extension) or one is the other's `/index` form. */
export function moduleKey(relPath: string): string {
  return relPath.replace(/\.[^./]+$/, "");
}

// ---------------------------------------------------------------------------
// Import resolution (feeds the boundary/shadow graph)
// ---------------------------------------------------------------------------

/** Resolution priority (JS/TS family first so a `.ts` shadows a `.js` sibling —
 *  the classic same-basename/different-ext case; then Python). Package-system
 *  languages (Go/Java/Rust/C#) never carry relative specifiers, so they resolve
 *  to nothing here by construction. */
export const RESOLVE_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyi",
];

/**
 * Resolve a relative module specifier from `fromRelPath` to a project file in
 * `known`, or `undefined` (external / unresolved). Tries an exact hit, then each
 * extension in priority order, then the `/index` form — the resolution rule the
 * shadow guard re-runs when a higher-priority sibling appears.
 */
export function resolveImport(
  fromRelPath: string,
  specifier: string,
  known: ReadonlySet<string>,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined; // bare/external specifier
  const base = posix.normalize(posix.join(posix.dirname(fromRelPath), specifier));
  const clean = base.startsWith("./") ? base.slice(2) : base;
  if (clean.startsWith("../")) return undefined; // escapes the project root
  if (known.has(clean)) return clean;
  for (const ext of RESOLVE_EXTENSIONS) {
    const cand = clean + ext;
    if (known.has(cand)) return cand;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const cand = `${clean}/index${ext}`;
    if (known.has(cand)) return cand;
  }
  return undefined;
}

/** Index `known` paths by module key for the shadow lookup. */
export function buildModuleIndex(known: Iterable<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const path of known) {
    const key = moduleKey(path);
    const bucket = index.get(key);
    if (bucket) bucket.push(path);
    else index.set(key, [path]);
  }
  return index;
}

// ---------------------------------------------------------------------------
// 1-hop boundary expansion
// ---------------------------------------------------------------------------

/**
 * Every `imports` edge that crosses the changed-set boundary drags its
 * unchanged endpoint back into the re-ingest set (a barrel edit can redirect an
 * edge whose endpoints' bytes never changed). Walks both directions of the
 * persisted file→file `imports` links.
 */
export function expandBoundary(store: Store, changedOrDeleted: ReadonlySet<string>): Set<string> {
  const expansion = new Set<string>();
  for (const path of changedOrDeleted) {
    const fileId = fileEntityId(path);
    for (const link of store.linksFrom(fileId, "imports")) {
      const neighbor = pathOfFileId(link.dst);
      if (neighbor && !changedOrDeleted.has(neighbor)) expansion.add(neighbor);
    }
    for (const link of store.linksTo(fileId, "imports")) {
      const neighbor = pathOfFileId(link.src);
      if (neighbor && !changedOrDeleted.has(neighbor)) expansion.add(neighbor);
    }
  }
  return expansion;
}

// ---------------------------------------------------------------------------
// Shadow detection
// ---------------------------------------------------------------------------

/** Existing files whose specifier `added` could now steal (same key/different
 *  ext, or a file-vs-`/index` pair). */
function shadowTargets(added: string, moduleIndex: ReadonlyMap<string, string[]>): string[] {
  const key = moduleKey(added);
  const out: string[] = [];
  const push = (candidates: readonly string[] | undefined): void => {
    if (!candidates) return;
    for (const c of candidates) if (c !== added) out.push(c);
  };
  push(moduleIndex.get(key)); // same key, different extension
  if (key.endsWith("/index")) push(moduleIndex.get(key.slice(0, -"/index".length))); // added is dir index
  push(moduleIndex.get(`${key}/index`)); // an existing dir index the bare file shadows
  return out;
}

/**
 * A newly added file can steal an import/mention resolution from a pre-existing
 * file; those referrers must re-resolve. Returns the referrer paths (excluding
 * anything already being re-ingested).
 */
export function expandShadow(
  store: Store,
  addedFiles: readonly string[],
  moduleIndex: ReadonlyMap<string, string[]>,
  alreadyReingesting: ReadonlySet<string>,
): Set<string> {
  const expansion = new Set<string>();
  for (const added of addedFiles) {
    for (const target of shadowTargets(added, moduleIndex)) {
      for (const link of store.linksTo(fileEntityId(target), "imports")) {
        const referrer = pathOfFileId(link.src);
        if (referrer && referrer !== added && !alreadyReingesting.has(referrer)) {
          expansion.add(referrer);
        }
      }
    }
  }
  return expansion;
}

// ---------------------------------------------------------------------------
// Shrink guard
// ---------------------------------------------------------------------------

/** A pass that drops below this fraction of the previous symbol graph, with no
 *  observed deletions, is treated as a silently-truncated extraction. */
export const SHRINK_RATIO = 0.5;
/** Below this many prior symbols the guard is disabled — a tiny graph naturally
 *  swings by large fractions and there is nothing to protect. */
export const SHRINK_MIN_BASELINE = 4;

export interface ShrinkDecision {
  refused: boolean;
  reason: string;
  prevSymbols: number;
  projectedSymbols: number;
}

export function shrinkGuard(
  prevTotal: number,
  projectedTotal: number,
  deletedCount: number,
): ShrinkDecision {
  const refused =
    prevTotal >= SHRINK_MIN_BASELINE &&
    deletedCount === 0 &&
    projectedTotal < prevTotal * SHRINK_RATIO;
  return {
    refused,
    reason: refused
      ? `symbol graph would shrink ${prevTotal}→${projectedTotal} (below ${SHRINK_RATIO}× previous) with no observed deletions — refusing to publish a likely-truncated extraction`
      : "",
    prevSymbols: prevTotal,
    projectedSymbols: projectedTotal,
  };
}

// ---------------------------------------------------------------------------
// Memory-anchor drift (reason-classified staleness)
// ---------------------------------------------------------------------------

export type StaleReasonClass = "signature-changed" | "body-changed" | "target-removed";

export interface PrevSymbol {
  arity: number | undefined;
  hash: string | undefined;
  qualified: string;
}

/** Read a file's currently-published symbols (via `contains`) as the drift
 *  baseline: id → { arity, hash, qualified }. */
export function readPrevSymbols(
  store: Store,
  fileId: string,
  maxGen: number,
): Map<string, PrevSymbol> {
  const prev = new Map<string, PrevSymbol>();
  for (const link of store.linksFrom(fileId, "contains")) {
    const e = store.getEntity(link.dst);
    if (!e || e.kind !== "symbol" || e.gen > maxGen) continue;
    prev.set(e.id, {
      arity: typeof e.attrs.arity === "number" ? e.attrs.arity : undefined,
      hash: e.contentHash,
      qualified: typeof e.attrs.qualified === "string" ? e.attrs.qualified : e.name,
    });
  }
  return prev;
}

function arityChanged(a: number | undefined, b: number | undefined): boolean {
  return (a ?? -1) !== (b ?? -1);
}

/**
 * Compare a file's previous symbols against its freshly-extracted ones and flag
 * every anchored memory whose symbol drifted, reason-classed:
 *   - same id, arity changed        → `signature-changed`
 *   - same id, body hash changed    → `body-changed`
 *   - id retired but the qualified  → `signature-changed` (a rename / overload
 *     name still present               re-key, e.g. `sym:f#foo` → `sym:f#foo~1`)
 *   - id retired, name gone         → `target-removed`
 * Returns the number of memories flagged.
 */
export function flagAnchorDrift(
  store: Store,
  prev: ReadonlyMap<string, PrevSymbol>,
  next: readonly SymbolRecord[],
  gen: number,
): number {
  const nextById = new Map(next.map((s) => [s.id, s]));
  const nextQualified = new Set(next.map((s) => s.qualified));
  let flagged = 0;
  for (const [oldId, old] of prev) {
    const nu = nextById.get(oldId);
    let reason: StaleReasonClass | undefined;
    if (nu) {
      if (arityChanged(old.arity, nu.arity)) reason = "signature-changed";
      else if (old.hash !== undefined && nu.contentHash !== old.hash) reason = "body-changed";
    } else {
      reason = nextQualified.has(old.qualified) ? "signature-changed" : "target-removed";
    }
    if (reason) flagged += flagAnchored(store, oldId, reason, gen);
  }
  return flagged;
}

/**
 * Flag every memory anchored to `targetId` (a symbol OR a file entity), recording
 * the reason class as a `stale-reason` claim AND filing a reason-classed
 * `stale-suspect` conflict (E7/A5), so drift surfaces in `conflictCandidates()`
 * and the guide stale-list — mirroring how docs mentions file stale-suspects.
 *
 * A5 reason-class action split: `signature-changed` / `target-removed` flip the
 * memory to `needs-review`; `body-changed` does NOT flip status (noise control)
 * — it is down-ranked only, via the `stale-reason` claim the rank freshness
 * penalty reads. All three still file the conflict + claim (visible, not hidden).
 *
 * S4: drift is DERIVED, per-checkout INDEX state — recorded as the memory's
 * `drift_reason` annotation (NOT an event, NEVER committed) and composed into
 * the served status by the fold (`composeStatus`). This keeps the append-only
 * event log untouched by a branch checkout, and a refold/rebuild never erases an
 * active drift annotation. The A5 status effect is applied by `composeStatus`.
 */
/** Drift severity ladder (F5): target-removed ≥ signature-changed > body-changed
 *  > no-drift. Escalate-only writes never downgrade the annotation. */
function driftSeverity(reason: StaleReasonClass | null): number {
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

export function flagAnchored(
  store: Store,
  targetId: string,
  reason: StaleReasonClass,
  gen: number,
): number {
  let count = 0;
  for (const link of store.linksTo(targetId, "anchoredTo")) {
    const memId = link.src;
    if (!store.getMemory(memId)) continue;
    // Drift annotation contract (F5 + R2-2 arbitration): the drift class is
    // ESCALATE-ONLY AND STICKY-UNTIL-CONFIRM, mirroring the open stale-suspect
    // conflict it files.
    //   - escalate-only: within a reingest a memory anchored to two symbols may
    //     be flagged twice; a lower class (body-changed) must NOT overwrite a
    //     higher one (signature-changed/target-removed) and drop the needs-review
    //     effect. Equal-or-higher replaces; lower is ignored.
    //   - sticky: a LATER reingest observing only a lower class also does not
    //     downgrade — once flagged needs-review, the ONLY recovery is a human
    //     `confirm` (E7-recovery). Auto-downgrade would silently clear a requested
    //     review ("conflicts surfaced, never auto-merged"). This is the ratified
    //     Phase-1 semantic, not a bug. Per-checkout wholesale re-derivation of
    //     drift is slice-3 reindex scope (S4), which resets annotations from
    //     scratch on branch switch — revisit the stickiness there deliberately.
    const current = store.getMemory(memId)?.driftReason ?? null;
    if (driftSeverity(reason) >= driftSeverity(current)) store.setMemoryDrift(memId, reason);
    refoldMemory(store, memId, gen); // recompose served status = fold ∘ drift (A5)
    // `stale-reason` powers the rank down-rank; keep it for all reason classes.
    const reasonClaim = store.addClaim({
      subject: memId,
      predicate: "stale-reason",
      object: reason,
      carrier: "tree-sitter",
      locus: targetId,
      method: "structural",
      authority: "derived",
      gen,
    });
    // A subject-carrying claim so the conflict's `a` resolves to the memory
    // (a distinct predicate — NOT `anchoredTo`, which would move the memory's
    // recency decay basis and make a stale entry look freshly anchored).
    const anchorClaim = store.addClaim({
      subject: memId,
      predicate: "stale-anchor",
      object: targetId,
      carrier: "tree-sitter",
      locus: targetId,
      method: "structural",
      authority: "derived",
      gen,
    });
    store.addConflict(anchorClaim, reasonClaim, "stale-suspect");
    count++;
  }
  return count;
}
