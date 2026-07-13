/**
 * `ctx guide` projection kernel — DTO contract (M3 K1).
 *
 * Two layers, and the boundary between them is load-bearing:
 *
 *  • the ATLAS (`AtlasModel`) is the COMPLETE logical code space (D7/D33/D36):
 *    every file entity is a container lot, and every declaration that EXISTS IN THIS
 *    CHECKOUT is an atom (existence = a `contains` link; see `Declaration`). It carries
 *    ZERO display budget and performs ZERO truncation. Anything the kernel does not model
 *    as a first-class node/relation is COUNTED in `AtlasDisclosure` — never silently
 *    dropped, and never guessed at from a stale address.
 *
 *  • a PROJECTION (`BoundedProjection`) is a bounded, renderable slice of the
 *    atlas. Display budgets live HERE and only here, and every omission a budget
 *    causes is disclosed with an exact count and an expansion handle (D40).
 *
 * D24 naming gate applies to every identifier and every string in this kernel; the gate's
 * word list lives in the test, not here, so this file cannot trip it by quoting it.
 */
import type { Confidence, Derivation, Disclosure } from "../store/types.ts";

// ---------------------------------------------------------------------------
// Relations (D25 edge-role stratification over the store's link kinds)
// ---------------------------------------------------------------------------

/** The store link predicates the guide models. D25 stratifies exactly these. */
export type RelationKind =
  | "contains"
  | "calls"
  | "imports"
  | "touches"
  | "references"
  | "co-changed"
  | "renamed-to";

/**
 * D25 edge-role layers. `backbone` is the default lit structure; `event-evidence`
 * lights under an event/toggle; `historical-correlation` is never default and is
 * labelled as correlation only; `identity` serves anchor repair + the timeline.
 */
export type RelationLayer =
  | "backbone"
  | "event-evidence"
  | "historical-correlation"
  | "identity";

/** Fixed D25 assignment. Exported so the renderer never re-invents it. */
export const RELATION_LAYER: Readonly<Record<RelationKind, RelationLayer>> = {
  contains: "backbone",
  calls: "backbone",
  imports: "backbone",
  touches: "event-evidence",
  references: "event-evidence",
  "co-changed": "historical-correlation",
  "renamed-to": "identity",
};

export const RELATION_KINDS: readonly RelationKind[] = Object.keys(
  RELATION_LAYER,
) as RelationKind[];

/**
 * One store link, normalised. `src -> dst` IS the direction and it is never
 * reordered: caller -> callee, importer -> imported, container -> contained,
 * commit -> touched, old -> new. D34 makes space express this direction, so the
 * kernel must hand it over rather than leave the renderer to guess.
 */
export interface Relation {
  src: string;
  dst: string;
  kind: RelationKind;
  layer: RelationLayer;
  /** Provenance back-pointer into `claims`. Every backbone link has one today. */
  claimId: number | undefined;
  method: string;
  /** The link's own numeric confidence column (0..1) — NOT the claim tier. */
  linkConfidence: number;
  stale: boolean;
  /** False when the endpoint has no entity row (measured: 460 `touches` dst,
   *  6 `renamed-to` on both sides). Such a relation is KEPT and counted, never
   *  turned into a fabricated node. */
  srcResolved: boolean;
  dstResolved: boolean;
}

/** Adjacency + kind/layer indexes over the complete relation set. */
export interface RelationIndex {
  all: readonly Relation[];
  byKind: ReadonlyMap<RelationKind, readonly Relation[]>;
  byLayer: ReadonlyMap<RelationLayer, readonly Relation[]>;
  outgoing: ReadonlyMap<string, readonly Relation[]>;
  incoming: ReadonlyMap<string, readonly Relation[]>;
}

// ---------------------------------------------------------------------------
// Atlas (D7 / D36) — the complete logical model
// ---------------------------------------------------------------------------

/**
 * A declaration — THE atom (D36). `function | method | class | const`.
 *
 * A `Declaration` exists ONLY for a symbol reachable through a `contains` link — i.e. one
 * that exists in its file in this checkout, right now. `contains` is the FACT of existence;
 * the symbol's `locator` is only its ADDRESS, and addresses get reused. A symbol without
 * that link is RETIRED (`AtlasModel.retiredDeclarationIds`), is never an atom, and never
 * renders. So "an atom with no lot" is a contradiction in terms rather than a category:
 * `fileId` is always a real, current container.
 */
export interface Declaration {
  id: string;
  name: string;
  qualified: string;
  symbolKind: string;
  lang: string;
  /** Always present, and always taken from the `contains` link — never from the locator. */
  fileId: string;
  path: string;
  span: readonly [number, number];
  scope: string;
}

/** A file — a CONTAINER LOT, not an atom (D36). */
export interface FileLot {
  id: string;
  path: string;
  /** Basename. */
  name: string;
  /** Directory of `path` (`""` at repo root). */
  dir: string;
  scope: string;
  /** EVERY declaration this file currently `contains`. Never budgeted. */
  declarationIds: readonly string[];
  /**
   * The lot's evidence anchor: the content hash the code ingest recorded for this file at
   * the published generation (from its manifest). This is what makes a lot a claim-backed
   * object rather than a bare path — D15's trust grammar and D33's provenance render it.
   */
  contentHash: string;
  /**
   * True when a `contains` link named a file entity that does not exist, and the lot had
   * to be synthesised. Zero today (`contains` has no dangling endpoints); kept so an atom
   * can never be dropped for want of a lot. Counted in the disclosure.
   */
  synthetic: boolean;
}

/**
 * Everything the kernel could NOT model as a first-class node/relation, counted.
 * This is the anti-truncation ledger: a number here is a promise that the fact
 * exists and was not silently discarded.
 */
export interface AtlasDisclosure {
  /** Lots: file entities the code ingest saw at the published generation. */
  lotsInAtlas: number;
  /**
   * File entities OUTSIDE the code manifest. Two classes, both excluded from every
   * projection and both reachable as entities:
   *   - code that no longer exists (the killed v4 branch's `packages/guide/**`);
   *   - files the code ingest never indexes (docs, config) — D5 rules the canvas renders the
   *     CODE structure graph only, so these were never Atlas lots and are NOT "retired".
   * `lotsInAtlas + lotsOutsideAtlas === fileEntitiesInStore`.
   */
  lotsOutsideAtlas: number;
  fileEntitiesInStore: number;
  filesWithDeclarations: number;
  syntheticFileLots: number;
  /** Atoms: symbols reachable through a `contains` link. */
  declarationsTotal: number;
  /** Every symbol row in the store. `declarationsTotal + declarationsRetired`. */
  symbolsInStore: number;
  /**
   * Symbols with NO `contains` link — they do not exist in their file in this checkout.
   * Retired, not deleted: reachable via `AtlasModel.retiredDeclarationIds` so rename
   * chains survive (D20), never an atom, never rendered. Measured 689.
   */
  declarationsRetired: number;
  /** `calls` links with both ends on atoms — the ones the Atlas can draw (measured 3,868). */
  callsInAtlas: number;
  /**
   * `calls` links with at least one RETIRED end (measured 578). Excluded from the Atlas —
   * but counted, never silently dropped: `callsInAtlas + callsWithRetiredEnd` must equal
   * the store's `calls` total. That is D33's discipline applied to retirement.
   */
  callsWithRetiredEnd: number;
  relationsTotal: number;
  /** Relations whose src and/or dst has no entity row. Kept, counted, never fabricated. */
  relationsWithUnresolvedEndpoint: number;
  /**
   * Store link predicates OUTSIDE D25's seven kinds (measured: `amends` 3,
   * `supersedes` 1 — decision->decision). Not modelled; counted so the omission
   * is on the record rather than invisible.
   */
  excludedRelationKinds: readonly { kind: string; count: number }[];
}

/** The complete logical Atlas. No budget, no truncation, no ranking. */
export interface AtlasModel {
  generation: GenerationView;
  /** The lots. Every one is a file the code ingest saw at the published generation. */
  files: readonly FileLot[];
  /**
   * File entities that are NOT Atlas lots (absent from the code manifest). Reachable, never
   * visible — no projection may emit one as a node. See `AtlasDisclosure.lotsOutsideAtlas`
   * for the two classes this holds.
   */
  nonAtlasLotIds: readonly string[];
  /** The atoms. Every one exists in its file in this checkout. */
  declarations: readonly Declaration[];
  /**
   * Symbols that no `contains` link reaches: they no longer exist in their file (or their
   * file no longer exists). REACHABLE, never VISIBLE — the entities survive so rename-chain
   * history and anchor durability survive (D20), but they are not atoms and no projection
   * may ever emit them as nodes.
   */
  retiredDeclarationIds: readonly string[];
  relations: RelationIndex;
  scopes: readonly string[];
  disclosure: AtlasDisclosure;
  fileById: ReadonlyMap<string, FileLot>;
  declarationById: ReadonlyMap<string, Declaration>;
}

// ---------------------------------------------------------------------------
// Generation / freshness (D10, D28, D33)
// ---------------------------------------------------------------------------

/**
 * The badge D28 puts in the top bar.
 *
 *  • `live`     — every atlas source's published generation was built under THIS
 *                 checkout's identity tuple, and has data.
 *  • `snapshot` — the DTO came from an export (D17), and its identity matches.
 *  • `stale`    — a published generation EXISTS but was built under a DIFFERENT
 *                 identity tuple. THE GENERATION TRAP: every worktree of this repo
 *                 shares ONE shard while each invalidates the others' generations,
 *                 so `publishedGen()` returns 0 and the store READS AS EMPTY. It is
 *                 not empty and it is not live — it is stale, and saying so is the
 *                 whole point of the badge. Never render this as `live`, never
 *                 silently fall back to the data, never call it `empty`.
 *  • `empty`    — no published generation at all. Needs `ctx sync`.
 */
export type FreshnessState = "live" | "snapshot" | "stale" | "empty";

export interface SourceGeneration {
  source: string;
  /** What the store will actually serve: 0 when the identity does not match. */
  publishedGen: number;
  /** The identity the stored generation was built under (undefined = never built). */
  storedIdentity: string | undefined;
  matchesCurrentIdentity: boolean;
}

export interface GenerationView {
  state: FreshnessState;
  /** This checkout's identity tuple digest, right now. */
  currentIdentity: string;
  /** Committed git tip of the checkout (`""` when there is none). */
  repoRev: string;
  sources: readonly SourceGeneration[];
  /** Honest, non-generated explanation of `state`. Copy is D24-clean. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Claim sets (D33 / PRODUCT-DESIGN §3)
// ---------------------------------------------------------------------------

/**
 * The provenance of ONE aggregated edge/step. D33 forbids "count + first claim
 * id": every constituent is listed. PRODUCT-DESIGN §3 forbids an aggregate being
 * more confident than its weakest constituent, so `confidenceSummary.weakest`
 * is the only tier a renderer may present for the aggregate.
 */
export interface ClaimSet {
  relationKind: RelationKind;
  /** Number of constituent relations this aggregate stands for. */
  count: number;
  /** One per constituent relation, in constituent order. Complete, never capped. */
  constituentClaimIds: readonly number[];
  /** The constituent relations themselves, so a renderer can expand the aggregate. */
  constituents: readonly { src: string; dst: string }[];
  /**
   * Source revisions the evidence resolves to. Only `git`-carried claims name a
   * revision (their locus IS the commit oid); a `tree-sitter` structural claim
   * records a generation, not a revision, and the store does not keep per-generation
   * revision history — so a revision is NOT invented for it. Those constituents are
   * counted in `revisionsUnresolved` instead.
   */
  evidenceRevisions: readonly string[];
  /** Distinct generation stamps of the constituent claims (ascending). */
  evidenceGenerations: readonly number[];
  revisionsUnresolved: number;
  /** Distinct derivations present. `null` = unknown provenance (never rendered as fact). */
  derivations: readonly (Derivation | null)[];
  confidenceSummary: ConfidenceSummary;
  freshness: "fresh" | "stale";
  /** Weakest (most restrictive) disclosure class across constituents. */
  disclosure: Disclosure;
  /**
   * Constituents the consumer CANNOT inspect individually in this projection —
   * because their far endpoint collapsed into a boundary node or a collapsed
   * container. `0` when every constituent is individually reachable.
   */
  omittedCount: number;
}

export interface ConfidenceSummary {
  /** The tier the aggregate may claim. Never stronger than any constituent. */
  weakest: Confidence | null;
  /** Distinct tiers present, strongest first. */
  tiers: readonly (Confidence | null)[];
}

// ---------------------------------------------------------------------------
// Bounded projections (D27 four-state canvas)
// ---------------------------------------------------------------------------

export type ProjectionKind = "overview" | "scope" | "connections" | "event";

export type Grain = "scope" | "file" | "declaration" | "boundary";

/** In-bounds degree. `noVisibleRoute` is `inbound + outbound === 0` (D40). */
export interface Degree {
  inbound: number;
  outbound: number;
}

export interface ProjectedDeclaration {
  id: string;
  name: string;
  symbolKind: string;
  path: string;
  span: readonly [number, number];
  degree: Degree;
  /**
   * D40, declaration grain: this declaration has degree 0 inside its expanded
   * file within THIS bounded set. The renderer cannot compute it (it never sees
   * the unbounded model), so the kernel hands it over. Selection is MECHANICAL —
   * degree — never a judgment of importance (D25/D40).
   */
  noVisibleRoute: boolean;
}

export interface ProjectedContainer {
  id: string;
  grain: "scope" | "file";
  name: string;
  path: string;
  scope: string;
  /** Expanded children. `[]` when collapsed — see `declarationCount`. */
  declarations: readonly ProjectedDeclaration[];
  /** TOTAL declarations in the atlas for this container. Never truncated. */
  declarationCount: number;
  /** `declarationCount - declarations.length`. The `+N more` handle's exact N. */
  omittedDeclarations: number;
  /** Of `omittedDeclarations`, how many were dropped for having no visible route (D40). */
  omittedNoVisibleRoute: number;
  expanded: boolean;
  degree: Degree;
  /** D40, file grain: degree 0 within the bounded set -> the honest periphery. */
  noVisibleRoute: boolean;
  /** scope grain only. */
  fileCount?: number;
}

/**
 * An out-of-scope endpoint, aggregated. Clicking one re-roots the canvas (D30).
 * `memberIds` is COMPLETE — the kernel does not truncate it; a renderer may.
 */
export interface BoundaryNode {
  id: string;
  name: string;
  path: string;
  grain: "boundary";
  direction: "inbound" | "outbound" | "both";
  memberCount: number;
  memberIds: readonly string[];
  /** The atlas id to re-root on. */
  reroot: string;
}

/** An edge between two projected nodes. Carries its full claim set (D33). */
export interface AggregateEdge {
  id: string;
  src: string;
  dst: string;
  srcGrain: Grain;
  dstGrain: Grain;
  layer: RelationLayer;
  claimSet: ClaimSet;
}

/** A connected component of the bounded set (undirected, over drawn edges). */
export interface RelationGroup {
  id: string;
  memberIds: readonly string[];
  size: number;
}

/** Every omission a display budget caused, with an exact count (D40). */
export interface OmissionDisclosure {
  containers: number;
  declarations: number;
  edges: number;
  boundaryMembers: number;
  /** Human-readable, D24-clean, no generated prose. */
  notes: readonly string[];
}

export interface ProjectionSubject {
  id: string;
  grain: Grain;
  name: string;
  path: string;
}

export interface BoundedProjection {
  kind: ProjectionKind;
  subject: ProjectionSubject | undefined;
  /**
   * The projection's hard anchors (D22): the event's changed entities, or the
   * connections subject. The Evidence Rail narrates FROM these (D23/D32), so the
   * kernel must name them — the renderer cannot recover them from the node set.
   */
  anchors?: readonly string[];
  generation: GenerationView;
  containers: readonly ProjectedContainer[];
  boundaries: readonly BoundaryNode[];
  edges: readonly AggregateEdge[];
  groups: readonly RelationGroup[];
  /** D40 at BOTH grains, precomputed. */
  noVisibleRoute: NoVisibleRoute;
  omitted: OmissionDisclosure;
}

export interface NoVisibleRoute {
  /** Containers with degree 0 in the bounded set -> labelled peripheral area. */
  containerIds: readonly string[];
  /**
   * Degree-0 containers the container budget could not draw. D40 forbids the honest
   * periphery from being silently dropped, and the mechanical (degree) cut hits it
   * FIRST — so its exact count must survive as its own `+N more (no visible route)`
   * handle at the container grain, never folded into the generic "N more" bucket.
   */
  omittedContainerCount: number;
  /** Per expanded container, its degree-0 declarations -> `+N more (no visible route)`. */
  declarations: readonly { containerId: string; declarationIds: readonly string[] }[];
}

// ---------------------------------------------------------------------------
// Projection options
// ---------------------------------------------------------------------------

/**
 * Display budgets. They exist ONLY here (D33): the atlas never sees them. Every
 * budget-caused omission is reported in `OmissionDisclosure`.
 */
export interface ProjectionBudget {
  /** Max containers drawn. */
  maxContainers: number;
  /** Max declarations drawn inside ONE expanded container. */
  maxDeclarationsPerContainer: number;
  /** Max edges drawn. */
  maxEdges: number;
}

export const DEFAULT_BUDGET: ProjectionBudget = {
  maxContainers: 120,
  maxDeclarationsPerContainer: 40,
  maxEdges: 400,
};

export interface OverviewOptions {
  budget?: Partial<ProjectionBudget>;
}

export interface ScopeOptions {
  budget?: Partial<ProjectionBudget>;
  /** File ids to expand into their declarations (D27: explicit expand only). */
  expand?: readonly string[];
}

export interface ConnectionsOptions {
  budget?: Partial<ProjectionBudget>;
  /** Relation kinds to walk. Default: the backbone (`calls` + `imports`). */
  kinds?: readonly RelationKind[];
}

/**
 * D22 event: hard anchors only. `commits` names commit entity ids; `anchors`
 * names file/declaration ids directly (a user-selected node set / search hit).
 */
export interface GuideEvent {
  commits?: readonly string[];
  anchors?: readonly string[];
}

export interface EventOptions {
  budget?: Partial<ProjectionBudget>;
}
