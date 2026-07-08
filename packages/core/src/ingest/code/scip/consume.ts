/**
 * SCIP pass (2e closer, CONTEXA-IMPL §5.2 "SCIP when present"; D16 read-back
 * `docs/codemap/impl/appendix-A1-copyable.md:480–500`).
 *
 * Everything downstream of tree-sitter is Derived. When an `index.scip` sits at
 * the repo root this pass UPGRADES the covered claims to Observed (SCIP has
 * jurisdiction — a compiler saw the types tree-sitter can only guess), and
 * arbitrates any tree-sitter × SCIP overlap on the SAME predicate down to ONE
 * link whose provenance discloses the winner (Observed beats Derived, §2
 * claims→arbitration→links).
 *
 * Two upgraded fact shapes:
 *  - IDENTITY — every SCIP Definition occurrence reconciles (file + range line)
 *    to the tree-sitter symbol whose span encloses it, and re-asserts that
 *    file→symbol `contains` fact with carrier=scip / authority=observed.
 *  - REFERENCE — every non-Definition occurrence joins its enclosing tree-sitter
 *    symbol (the referrer) to the reconciled definition of the referenced SCIP
 *    symbol → a `calls` (method descriptor `…().`) or `references` edge,
 *    carrier=scip / authority=observed. tree-sitter-only symbols/edges stay
 *    Derived (never touched).
 *
 * D16 FAIL-OPEN (the load-bearing correctness rule): the file is decoded FULLY
 * and every mutation buffered in memory BEFORE a single write; the buffer is
 * then flushed inside ONE store transaction. A malformed/truncated `index.scip`
 * throws in the decode phase → we return `applied:false` having written nothing,
 * so the store is left EXACTLY as tree-sitter left it (no half-applied SCIP
 * generation). Any fault mid-flush rolls the transaction back to the same state.
 * The disclosure is success-shaped (a result field), never an `isError`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "../../../store/store.ts";
import type { Authority, LinkInput } from "../../../store/types.ts";
import { fileEntityId } from "../incremental.ts";
import {
  decodeScipIndex,
  isCallableScipSymbol,
  isLocalScipSymbol,
  SCIP_ROLE_DEFINITION,
  ScipDecodeError,
  type ScipIndex,
} from "./reader.ts";

/** Trust ladder for arbitration (§2 authority enum). A link is only ever
 *  upgraded, never downgraded: a new claim wins the link iff its authority
 *  ranks at least as high as the claim currently behind the link. */
const AUTHORITY_RANK: Record<Authority, number> = {
  confirmed: 4,
  observed: 3,
  derived: 2,
  inferred: 1,
};

export type ScipPassReason = "absent" | "malformed" | "read-failed" | "empty" | "consumed";

export interface ScipPassResult {
  /** true = SCIP claims/upgrades were committed; false = tree-sitter-only. */
  applied: boolean;
  reason: ScipPassReason;
  /** identity `contains` claims upgraded to observed. */
  identity: number;
  /** reference `calls`/`references` edges asserted observed. */
  edges: number;
  /** links whose provenance flipped Derived→Observed via arbitration. */
  arbitrated: number;
  /** SCIP documents whose file was in the effective (re-parsed) set. */
  documents: number;
  /** decode/read error message when `applied:false` for a fault (disclosure). */
  error?: string;
}

export interface ScipPassOptions {
  /** Repo root that holds `index.scip` (the code source's `projectRoot`). */
  repoRoot: string;
  /** The generation the tree-sitter symbols were written at (claims share it). */
  gen: number;
  /**
   * Files re-parsed this ingest — SCIP emits edges ONLY for occurrences in these
   * documents (mirrors tree-sitter's discipline: bounded, no per-ingest claim
   * bloat over unchanged files). The definition-reconciliation map is still
   * built from ALL documents so a cross-file reference resolves its target.
   * Omitted → every document is effective (cold ingest).
   */
  effectivePaths?: ReadonlySet<string>;
  /** Override the `index.scip` path (tests). Default `<repoRoot>/index.scip`. */
  scipPath?: string;
}

interface FileSymbol {
  id: string;
  start: number;
  end: number;
}

interface BufferedEdge {
  predicate: "contains" | "calls" | "references";
  src: string;
  dst: string;
  locus: string;
}

function normalizePath(p: string): string {
  return p.split("\\").join("/");
}

/** Symbols per file (repo-rel path → [{id, span}]), for range reconciliation. */
function fileSymbolIndex(store: Store): Map<string, FileSymbol[]> {
  const index = new Map<string, FileSymbol[]>();
  for (const e of store.entitiesByKind("symbol")) {
    if (e.locator.t !== "file" || !e.locator.span) continue;
    const path = normalizePath(e.locator.path);
    const bucket = index.get(path);
    const entry: FileSymbol = { id: e.id, start: e.locator.span[0], end: e.locator.span[1] };
    if (bucket) bucket.push(entry);
    else index.set(path, [entry]);
  }
  return index;
}

/** The innermost tree-sitter symbol whose span encloses `line1based` (smallest
 *  span wins, so a method beats its class) — the file+range reconcile the D16
 *  appendix calls `lookupTsNode`. */
function reconcile(symbols: FileSymbol[] | undefined, line1based: number): string | undefined {
  if (!symbols) return undefined;
  let best: FileSymbol | undefined;
  for (const s of symbols) {
    if (line1based < s.start || line1based > s.end) continue;
    if (!best || s.end - s.start < best.end - best.start) best = s;
  }
  return best?.id;
}

/** 0-based SCIP range → 1-based line (matches symbol spans); undefined if empty. */
function rangeLine(range: number[]): number | undefined {
  return range.length >= 1 ? range[0]! + 1 : undefined;
}

/**
 * Build the buffered mutation set from a decoded index (no store writes). Pure
 * over `(index, symbolIndex, effectivePaths)` so the mapping is unit-testable.
 */
function planMutations(
  index: ScipIndex,
  symbolIndex: Map<string, FileSymbol[]>,
  effectivePaths: ReadonlySet<string> | undefined,
): { edges: BufferedEdge[]; documents: number } {
  // Global definition map (from ALL documents): scip symbol → our sym id. A
  // cross-file reference resolves its target here even if that file wasn't
  // re-parsed this pass.
  const defOf = new Map<string, string>();
  for (const doc of index.documents) {
    const path = normalizePath(doc.relativePath);
    const symbols = symbolIndex.get(path);
    for (const occ of doc.occurrences) {
      if ((occ.symbolRoles & SCIP_ROLE_DEFINITION) === 0) continue;
      if (isLocalScipSymbol(occ.symbol)) continue; // doc-local: no cross-file identity
      const line = rangeLine(occ.range);
      if (line === undefined) continue;
      const symId = reconcile(symbols, line);
      if (symId) defOf.set(occ.symbol, symId);
    }
  }

  const edges: BufferedEdge[] = [];
  const seen = new Set<string>();
  let documents = 0;
  for (const doc of index.documents) {
    const path = normalizePath(doc.relativePath);
    if (effectivePaths && !effectivePaths.has(path)) continue; // bounded to re-parsed files
    documents++;
    const symbols = symbolIndex.get(path);
    const fileId = fileEntityId(path);
    for (const occ of doc.occurrences) {
      const line = rangeLine(occ.range);
      if (line === undefined) continue;
      const locus = `${path}#L${line}`;
      if ((occ.symbolRoles & SCIP_ROLE_DEFINITION) !== 0) {
        // IDENTITY: file --contains--> sym, observed (upgrades tree-sitter).
        const symId = defOf.get(occ.symbol) ?? reconcile(symbols, line);
        if (!symId) continue;
        pushEdge(edges, seen, { predicate: "contains", src: fileId, dst: symId, locus });
        continue;
      }
      // REFERENCE: enclosing referrer --calls|references--> reconciled target.
      if (isLocalScipSymbol(occ.symbol)) continue;
      const referrer = reconcile(symbols, line);
      const target = defOf.get(occ.symbol);
      if (!referrer || !target || referrer === target) continue;
      const predicate = isCallableScipSymbol(occ.symbol) ? "calls" : "references";
      pushEdge(edges, seen, { predicate, src: referrer, dst: target, locus });
    }
  }
  return { edges, documents };
}

function pushEdge(edges: BufferedEdge[], seen: Set<string>, edge: BufferedEdge): void {
  const key = `${edge.predicate} ${edge.src} ${edge.dst}`;
  if (seen.has(key)) return; // one claim/link per (predicate, src, dst) per pass
  seen.add(key);
  edges.push(edge);
}

/**
 * Arbitrate a link write (§2). Upgrade the resolved (src, predicate, dst) link
 * to point at `claimId` ONLY when the new claim's authority ranks at least as
 * high as the claim currently behind the link — so SCIP's Observed beats
 * tree-sitter's Derived, but never downgrades a Confirmed/Observed link. Returns
 * true when the link's provenance actually flipped to a higher authority.
 */
function arbitrateSetLink(store: Store, input: LinkInput, newAuthority: Authority): boolean {
  const existing = store.linksFrom(input.src, input.predicate).find((l) => l.dst === input.dst);
  let flipped = false;
  if (existing?.claimId !== undefined) {
    const prior = store.getClaim(existing.claimId);
    if (prior && AUTHORITY_RANK[newAuthority] < AUTHORITY_RANK[prior.authority]) {
      return false; // would downgrade — keep the higher-authority link
    }
    if (prior && AUTHORITY_RANK[newAuthority] > AUTHORITY_RANK[prior.authority]) flipped = true;
  }
  store.setLink(input);
  return flipped;
}

/**
 * Run the SCIP pass. Best-effort + fail-open: any absence/decode/read fault
 * returns `applied:false` with the store untouched (tree-sitter alone stands).
 * On success every buffered claim + arbitrated link upgrade is committed in ONE
 * transaction.
 */
export function runScipPass(store: Store, opts: ScipPassOptions): ScipPassResult {
  const empty = (reason: ScipPassReason, error?: string): ScipPassResult => ({
    applied: false,
    reason,
    identity: 0,
    edges: 0,
    arbitrated: 0,
    documents: 0,
    ...(error !== undefined ? { error } : {}),
  });

  const scipPath = opts.scipPath ?? join(opts.repoRoot, "index.scip");
  if (!existsSync(scipPath)) return empty("absent");

  // ---- Decode fully, in memory, BEFORE any write (D16 buffer-then-apply). A
  // truncated/malformed stream throws here → nothing was written → fail-open.
  let index: ScipIndex;
  try {
    const bytes = readFileSync(scipPath);
    index = decodeScipIndex(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return empty(err instanceof ScipDecodeError ? "malformed" : "read-failed", message);
  }
  if (index.documents.length === 0) return empty("empty");

  // ---- Plan the mutation set (pure) against the current symbol universe.
  const symbolIndex = fileSymbolIndex(store);
  const { edges, documents } = planMutations(index, symbolIndex, opts.effectivePaths);
  if (edges.length === 0) {
    // The file decoded cleanly but reconciled to nothing (e.g. every document
    // outside the effective set). Success-shaped, but nothing applied.
    return { applied: true, reason: "consumed", identity: 0, edges: 0, arbitrated: 0, documents };
  }

  // ---- Apply atomically. If anything throws mid-flush the transaction rolls
  // back to exactly the tree-sitter state (belt-and-suspenders over the
  // buffer-then-apply above).
  let identity = 0;
  let edgeCount = 0;
  let arbitrated = 0;
  store.transaction(() => {
    for (const e of edges) {
      const claimId = store.addClaim({
        subject: e.src,
        predicate: e.predicate,
        object: e.dst,
        carrier: "scip",
        locus: e.locus,
        method: "structural",
        authority: "observed",
        gen: opts.gen,
      });
      const confidence = e.predicate === "contains" ? 1.0 : e.predicate === "calls" ? 1.0 : 0.9;
      const flipped = arbitrateSetLink(
        store,
        {
          src: e.src,
          dst: e.dst,
          predicate: e.predicate,
          method: "structural",
          confidence,
          claimId,
        },
        "observed",
      );
      if (flipped) arbitrated++;
      if (e.predicate === "contains") identity++;
      else edgeCount++;
    }
  });

  return { applied: true, reason: "consumed", identity, edges: edgeCount, arbitrated, documents };
}

export { planMutations as __planMutationsForTest };
