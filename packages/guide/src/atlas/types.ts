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

/** A raw code edge carried with its provenance claim id. */
export interface CorpusEdge {
  src: string;
  dst: string;
  count: number;
  claimId: number | null;
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
  claimId: number | null;
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
  /** Stable content hash of the input (FNV-1a hex over canonical JSON). */
  projectionId: string;
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

export interface RailStep {
  nodeId: string;
  group: RailGroup;
  hop: number;
  edgeKind: "anchor" | "contains" | "calls" | "imports";
  /** Provenance string, e.g. `links.claim_id=14751 predicate=calls`. */
  provenance: string;
  label: string;
  path: string;
}

export interface EventProjection {
  /** Sorted for byte-stable JSON. */
  litNodeIds: string[];
  litEdges: AtlasEdge[];
  viewport: Viewport;
  rail: RailStep[];
  event: { kind: "diff"; label: string; from: string; to: string };
  projectionId: string;
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
