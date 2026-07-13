// Typed DTOs for the Code Atlas spike. Field names are the contract — keep them stable.
//
// Vocabulary authority: PRODUCT-DESIGN.md §3 (claim contract). The node-level `status`
// used here is a Guide-render derivation over that contract:
//   - "conflict"     : the entity's claims are party to an OPEN store conflict.
//   - "needs-review" : a needs-review memory anchors to the entity (anchors table).
//   - "active"       : neither of the above.
// Saturated color is spent ONLY on these three statuses (D11/D15 color budget).

export type NodeStatus = "active" | "needs-review" | "conflict";

// ---------------------------------------------------------------------------
// CorpusInput — the extractor output (public/generated/corpus.json) and the
// pure input to compile(). All paths are project-relative; no absolute paths.
// ---------------------------------------------------------------------------

export interface CorpusDecl {
  /** Entity id, e.g. `sym:packages/cli/src/cli.ts#foo`. */
  id: string;
  name: string;
  /** symbolKind from store attrs: function | method | class | const | ... */
  kind: string;
  /** Source order within the file (span-start ascending). */
  order: number;
}

export interface CorpusFile {
  /** Project-relative path (also the natural key). */
  path: string;
  declCount: number;
  decls: CorpusDecl[];
  status: NodeStatus;
  /** Max commit date (epoch ms) touching the file, else null. */
  recency: number | null;
}

/** A raw code edge carried with its provenance claim id(s). */
export interface CorpusEdge {
  src: string;
  dst: string;
  count: number;
  /**
   * First observed claim id for this src->dst pair (back-compat / wire field).
   * Kept so an already-generated corpus.json (single-claim shape) still loads.
   */
  claimId: number | null;
  /**
   * ALL distinct claim ids that back this src->dst pair after SQL dedup (D33
   * aggregate trust). Optional so a corpus.json generated before this field
   * still loads; when absent, consumers fall back to `[claimId]`.
   */
  claimIds?: number[];
}

// ---------------------------------------------------------------------------
// Claim sets (D33 aggregate trust). An aggregated edge/step carries the set of
// constituent claim ids that back it, bounded to CLAIM_ID_CAP with the rest
// disclosed as an omitted count — never "count + first claim id".
// ---------------------------------------------------------------------------

/** Max constituent claim ids carried inline; the rest become `omittedClaimCount`. */
export const CLAIM_ID_CAP = 32;

export interface ClaimSet {
  /** Distinct claim ids, ascending, capped at CLAIM_ID_CAP. */
  constituentClaimIds: number[];
  /** Distinct claim ids beyond the cap (honest, bounded disclosure). */
  omittedClaimCount: number;
}

/** Mutable accumulator for unioning claim ids across a rollup. */
export interface ClaimAccumulator {
  ids: Set<number>;
  omitted: number;
}

export function emptyClaimAccumulator(): ClaimAccumulator {
  return { ids: new Set<number>(), omitted: 0 };
}

/** Fold a claim source (id list + already-omitted count) into an accumulator. */
export function accumulateClaims(acc: ClaimAccumulator, ids: Iterable<number>, omitted = 0): void {
  for (const id of ids) acc.ids.add(id);
  acc.omitted += omitted;
}

/** Cap + disclose: turn an accumulator into a bounded ClaimSet. */
export function finalizeClaimSet(acc: ClaimAccumulator): ClaimSet {
  const sorted = [...acc.ids].sort((a, b) => a - b);
  const kept = sorted.slice(0, CLAIM_ID_CAP);
  return {
    constituentClaimIds: kept,
    omittedClaimCount: acc.omitted + (sorted.length - kept.length),
  };
}

/** One-shot: a bounded ClaimSet from a flat list of claim ids. */
export function claimSetFromIds(ids: Iterable<number>): ClaimSet {
  const acc = emptyClaimAccumulator();
  accumulateClaims(acc, ids);
  return finalizeClaimSet(acc);
}

/** Claim ids carried by a CorpusEdge (honest set if present, else the single id). */
export function corpusEdgeClaimIds(e: CorpusEdge): number[] {
  if (e.claimIds && e.claimIds.length > 0) return e.claimIds;
  return e.claimId != null ? [e.claimId] : [];
}

/** A commit->target touch, carried only for the event's commit range. */
export interface CorpusTouch {
  commit: string;
  target: string;
}

export interface CorpusEvent {
  kind: "diff";
  label: string;
  range: { from: string; to: string };
  commitIds: string[];
  anchorFiles: string[];
  anchorSyms: string[];
}

export interface CorpusInput {
  schemaVersion: 1;
  repo: string;
  sourceRevision: string;
  generations: { code: number; git: number; docs: number; memory: number };
  files: CorpusFile[];
  edges: {
    /** sym -> sym */
    calls: CorpusEdge[];
    /** file -> file */
    imports: CorpusEdge[];
    /** commit -> target, scoped to the event range */
    touches: CorpusTouch[];
  };
  event: CorpusEvent;
  /** Human-readable omission/scope disclosures (D25 honest-gap). */
  disclosures: string[];
}

// ---------------------------------------------------------------------------
// AtlasModel — compile() output. Integer world units (multiply by UNIT px).
// ---------------------------------------------------------------------------

export type NodeKind = "folder" | "file" | "decl";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasNode {
  id: string;
  kind: NodeKind;
  name: string;
  /** Project-relative path (folder path, file path, or file#decl). */
  path: string;
  /** Parent node id, or null for the repo root region. */
  parent: string | null;
  depth: number;
  /** Absolute world-unit rect (integers). */
  rect: Rect;
  /** Footprint bucket side length (1..6) for files; region span for folders; 1 for decls. */
  footprint: number;
  status: NodeStatus;
  /** How many decls beyond the lot capacity are disclosed as "+N" (files only). */
  overflow: number;
  /**
   * Total declaration count for a FILE lot — carried so the self-describing file
   * lot can show a "N decls" chip WITHOUT the decl atoms ever reaching the
   * renderer (Option-A map slim-down). Files only; folders/decls leave it undefined.
   */
  declCount?: number;
  /** symbolKind for decl nodes (function|method|class|const|...); undefined otherwise. */
  symbolKind?: string;
  lit?: boolean;
  /**
   * Max commit date (epoch ms) touching this file, else null — carried onto file
   * lots so the Recent lens (D11, slice 5c) can classify a neutral recency ramp.
   * Files only; folders/decls leave it undefined.
   */
  recency?: number | null;
}

export interface AtlasEdge {
  src: string;
  dst: string;
  kind: "calls" | "imports";
  count: number;
  /**
   * Distinct claim ids backing this (possibly aggregated) edge, bounded to
   * CLAIM_ID_CAP (D33 aggregate trust). Replaces the former single `claimId`:
   * an aggregated edge merges every constituent atom edge's claim id here.
   */
  constituentClaimIds: number[];
  /** Distinct backing claim ids beyond the cap (honest, bounded disclosure). */
  omittedClaimCount: number;
  /**
   * Set on a visible-slice edge when ANY constituent atom edge is lit for the
   * current event. Lets aggregated edges (folder->folder at far LOD) light up
   * even though their key differs from the atom-level lit edge keys (defect 2).
   */
  lit?: boolean;
}

export interface AtlasRegion {
  id: string;
  path: string;
  depth: number;
  rect: Rect;
}

export interface AtlasModel {
  /**
   * Stable content hash of the STRUCTURE (FNV-1a hex over canonical JSON of the
   * files/decls/edge topology, no claim ids). Equal to `structuralProjectionId`;
   * kept as `projectionId` so existing session/persist keys stay stable.
   */
  projectionId: string;
  /** Structure-only identity (files/decls/edges; claim ids excluded). */
  structuralProjectionId: string;
  /**
   * Evidence identity (FNV-1a hex over the ordered claim-set content). Flips
   * when the backing claims change even if the structure is byte-identical, so
   * a claim-only regeneration is detectable (D33 projection identity).
   */
  evidenceProjectionId: string;
  nodes: AtlasNode[];
  /** id -> node, for O(1) lookup and ancestor walks. */
  nodeIndex: Map<string, AtlasNode>;
  edges: {
    /** File-level aggregated calls/imports (both endpoints are files). */
    file: AtlasEdge[];
    /** Raw sym->sym calls. */
    sym: AtlasEdge[];
  };
  regions: AtlasRegion[];
  generations: CorpusInput["generations"];
  repo: string;
  sourceRevision: string;
}

// ---------------------------------------------------------------------------
// VisibleSlice — the ONLY thing the renderer ever receives (D12).
// ---------------------------------------------------------------------------

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VisibleSlice {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  counts: {
    logicalNodes: number;
    logicalEdges: number;
    visibleNodes: number;
    visibleEdges: number;
  };
  omissions: string[];
  generation: CorpusInput["generations"];
  projectionId: string;
  /**
   * Ids in this slice that must render lit for the current event — the lit
   * anchors/edges plus, for lit nodes hidden by the current zoom, their nearest
   * visible ancestor (a lit aggregation). Guarantees the Change Trace is legible
   * at every zoom (D22/D25).
   */
  litVisibleIds: string[];
}

// ---------------------------------------------------------------------------
// EventProjection — the Change Trace (D22/D23/D25).
// ---------------------------------------------------------------------------

export type RailGroup = "anchors" | "contains" | "calls" | "imports";

/**
 * A node's role in an event projection (D32):
 *   - anchor    : a changed file/symbol the event names directly.
 *   - neighbor  : a directly-observed 1-hop counterpart of an anchor.
 *   - ancestor  : a containing folder — lit for tree highlight ONLY, never in
 *                 the viewport bbox (root-pollution defect class).
 */
export type EventRole = "anchor" | "neighbor" | "ancestor";

export interface RailStep {
  nodeId: string;
  group: RailGroup;
  hop: number;
  edgeKind: "anchor" | "contains" | "calls" | "imports";
  /** Provenance string, e.g. `links.claim_ids=14751,14802 predicate=calls`. */
  provenance: string;
  label: string;
  path: string;
  /**
   * Constituent claim ids backing this step (calls/imports steps; empty for
   * anchor/contains steps which are structural). Bounded to CLAIM_ID_CAP.
   */
  constituentClaimIds: number[];
  /** Backing claim ids beyond the cap. */
  omittedClaimCount: number;
}

export interface EventProjection {
  /**
   * The lit set used for VIEWPORT math and canvas lighting: anchors + directly
   * observed 1-hop neighbors ONLY. Ancestors are excluded by construction (they
   * live in `litAncestors`); the viewport is this set's own bbox (D32).
   */
  litNodeIds: string[];
  /** Resolved changed anchors (subset of litNodeIds). */
  anchors: string[];
  /** Directly observed 1-hop neighbors of the anchors (subset of litNodeIds). */
  neighbors: string[];
  /**
   * Containing folders of the lit set — for LEFT-TREE highlight only. NEVER
   * enters the viewport bbox (root pollution is a defect class, now tested).
   */
  litAncestors: string[];
  litEdges: AtlasEdge[];
  viewport: Viewport;
  rail: RailStep[];
  event: { kind: "diff"; label: string; from: string; to: string };
  /**
   * Symbol anchors that could NOT resolve to a declaration node and were
   * downgraded to their containing file (disclosed, not silent). With the D33
   * kernel-completeness fix most symbols resolve, so this is normally small.
   */
  downgrades: number;
  /** Neighbor edges dropped by the per-anchor neighbor cap (disclosed). */
  omittedNeighborCount: number;
  projectionId: string;
  /** Structure identity of the model this projection was computed from. */
  structuralProjectionId: string;
  /** Evidence identity of the model this projection was computed from. */
  evidenceProjectionId: string;
}

/** Result of resolving a URL/corpus event into a projectable event, or a typed rejection. */
export type ResolvedEvent = { ok: true; event: ProjectableEvent } | { ok: false; reason: string };

export interface ProjectableEvent {
  kind: "diff";
  label: string;
  from: string;
  to: string;
  anchorFiles: string[];
  anchorSyms: string[];
}

// ---------------------------------------------------------------------------
// GenerationInfo — the cheap generation-metadata payload (D10, slice 5c). The
// live server answers GET /api/generation with this WITHOUT the full corpus body
// so the reader can be told a new generation exists without swapping the map.
// ---------------------------------------------------------------------------

export interface GenerationInfo {
  generations: CorpusInput["generations"];
  /** Stable string identity of the served generation (compare to detect a swap). */
  identity: string;
  /** Cheap corpus counts so the switch prompt can show a diff line. */
  fileCount: number;
  declCount: number;
}

/** Canonical identity string for a generation tuple (deterministic). */
export function generationIdentity(g: CorpusInput["generations"]): string {
  return `${g.code}.${g.git}.${g.docs}.${g.memory}`;
}
