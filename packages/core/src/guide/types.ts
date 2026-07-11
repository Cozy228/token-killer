/**
 * M3 guide — public projection DTOs (brief §2 "projection kernel", goal prompt
 * "projection kernel first"). These are the typed structs promoted from the
 * private `diag` shapes; the guide server serializes them, React components adapt
 * them. Every fact embeds an `EvidencePacket` (provenance-or-it-does-not-render);
 * every projection declares a `BudgetDisclosure` (profile-budget: edge predicates,
 * depth, node caps, disclosed omissions).
 */
import type { EntityKind } from "../store/types.ts";
import type { EvidencePacket } from "./glyphs.ts";

/** Profile budget for a projection (goal prompt "profile budgets"). */
export interface ProjectionBudget {
  /** Edge predicates the traversal is allowed to follow. */
  edgePredicates: string[];
  /** Max traversal depth from the seed(s). */
  depth: number;
  /** Node cap the projection will not exceed. */
  nodeCap: number;
}

/** Declared budget + what the budget forced out (disclosed IN the payload, G-budget). */
export interface BudgetDisclosure {
  budget: ProjectionBudget;
  /** Total items omitted because a cap/depth was hit. */
  omitted: number;
  /** Omissions attributed to a reason (e.g. `node-cap`, `depth`). */
  omittedByReason: Record<string, number>;
}

/** The pre-V1 accelerator disclosure (DR-01) + accelerator banner carried on every projection. */
export interface ProjectionMeta {
  /** ACCELERATOR_DISCLOSURE text — the standing "not validated" banner (DR-01). */
  disclosure: string;
  /** As-of computation time (epoch-ms) of this projection build. */
  generatedAt: number;
}

/** A rendered fact with resolvable provenance (Subject sections). */
export interface GuidedFact {
  /** Predicate / relationship label. */
  label: string;
  /** Object / rendered value. */
  value: string;
  /** Drill handle for the related entity when the fact points at one. */
  handle?: string;
  /** Related entity id when the fact points at one. */
  entityId?: string;
  /** Provenance-or-it-does-not-render: every fact resolves through this. */
  evidence: EvidencePacket;
}

// ---- Canvas (entry) ----

export interface CanvasSourceStat {
  source: string;
  entityCount: number;
  /** Published generation of the source (health signal). */
  publishedGen: number;
  /** Cursor position string when known (freshness signal). */
  cursorPosition?: string;
  /** Cursor freshness epoch-ms when known. */
  cursorFreshness?: number;
  /** Coverage: entities this source contributes / total entities (0..1). */
  coverage: number;
}

export interface CanvasCluster {
  id: string;
  label: string;
  kind: EntityKind;
  /** Entities in the cluster (its total size). */
  size: number;
  /** A bounded sample of member entities (drillable), capped by the budget. */
  members: Array<{ entityId: string; name: string; handle: string; evidence: EvidencePacket }>;
}

export interface CanvasBadges {
  needsReview: number;
  openConflicts: number;
  /** E8-style ops signal: sources whose cursor is missing or stale. */
  e8StaleSources: string[];
  perSource: CanvasSourceStat[];
}

export interface CanvasProjection {
  kind: "canvas";
  meta: ProjectionMeta;
  sources: CanvasSourceStat[];
  clusters: CanvasCluster[];
  /** Hot areas: entities with the most co-change / touch edges (churn seed). */
  hotAreas: Array<{ entityId: string; name: string; handle: string; heat: number }>;
  badges: CanvasBadges;
  budget: BudgetDisclosure;
}

// ---- Lenses (canvas overlays) ----

export interface TimeLensLink {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  predicate: "supersedes";
  at: number;
}
export interface TimeLensProjection {
  kind: "time-lens";
  meta: ProjectionMeta;
  /** Supersession/decision chains overlaid on the canvas, time-ordered. */
  chains: TimeLensLink[];
  budget: BudgetDisclosure;
}

export interface ChurnLensCluster {
  members: Array<{ entityId: string; name: string; handle: string }>;
  /** Total co-change support across the cluster (heat). */
  support: number;
}
export interface ChurnLensProjection {
  kind: "churn-lens";
  meta: ProjectionMeta;
  clusters: ChurnLensCluster[];
  budget: BudgetDisclosure;
}

// ---- Subject (understanding) ----

export interface NeighborhoodNode {
  entityId: string;
  name: string;
  kind: EntityKind;
  handle: string;
  /** 0 = subject, 1..depth = hop. */
  depth: number;
}
export interface NeighborhoodEdge {
  src: string;
  dst: string;
  predicate: string;
  confidence: number;
}

export interface DecisionChainEntry {
  entityId: string;
  name: string;
  handle: string;
  verb: string;
  at: number;
  reason?: string;
  evidence: EvidencePacket;
}

export interface HistoryEntry {
  entityId: string;
  name: string;
  handle: string;
  /** `touches` | `co-changed`. */
  predicate: string;
  confidence: number;
}

export interface SubjectProjection {
  kind: "subject";
  meta: ProjectionMeta;
  subject: { entityId: string; kind: EntityKind; name: string; handle: string };
  /** The subject's own claim envelope (the biography header). */
  evidence: EvidencePacket;
  facts: GuidedFact[];
  decisionChain: DecisionChainEntry[];
  history: HistoryEntry[];
  neighborhood: { nodes: NeighborhoodNode[]; edges: NeighborhoodEdge[] };
  budget: BudgetDisclosure;
}

// ---- Inspector (inspection) ----

export interface ReviewQueueItem {
  entityId: string;
  handle: string;
  gist: string;
  /** Exact CLI command a human runs to act (never executed by the route, R1). */
  cliCommand: string;
  evidence: EvidencePacket;
}

export interface ConflictGroup {
  /** Reason class (conflict kind): contradiction | sameAsCandidate | stale-suspect. */
  reasonClass: string;
  items: Array<{
    a: number;
    b: number;
    subjectA: string;
    subjectB: string;
    /** Exact resolving CLI command (displayed, never executed). */
    cliCommand: string;
  }>;
}

export interface PushPreview {
  /** Verbatim would-be push digest (display only, R1). */
  digestText: string;
  bytes: number;
  budgetBytes: number;
  pins: string[];
  vetoes: string[];
  omittedGotchas: number;
}

export interface MemoryBrowserEntry {
  entityId: string;
  handle: string;
  name: string;
  gist: string;
  origin: string;
  zone: "mainline" | "overlay" | "unknown";
  status: string;
  /** Lifecycle event chain (verbs in time order). */
  lifecycle: Array<{ verb: string; actor: string; at: number; reason?: string }>;
  evidence: EvidencePacket;
}

export interface HealthSource {
  source: string;
  publishedGen: number;
  cursorPosition?: string;
  cursorFreshness?: number;
  /** E8 signal: cursor missing/stale. */
  stale: boolean;
}

export interface InspectorProjection {
  kind: "inspector";
  meta: ProjectionMeta;
  reviewQueue: ReviewQueueItem[];
  conflicts: ConflictGroup[];
  pushPreview: PushPreview;
  memoryBrowser: {
    zones: { mainline: number; overlay: number; unknown: number };
    entries: MemoryBrowserEntry[];
  };
  health: { sources: HealthSource[]; needsReview: number; openConflicts: number };
  budget: BudgetDisclosure;
}

// ---- Search (omnibox) ----

export interface SearchHit {
  entityId: string;
  kind: EntityKind;
  name: string;
  handle: string;
  evidence: EvidencePacket;
}

export interface SearchProjection {
  kind: "search";
  meta: ProjectionMeta;
  query: string;
  kinds: EntityKind[] | null;
  hits: SearchHit[];
  budget: BudgetDisclosure;
}

export type AnyProjection =
  | CanvasProjection
  | TimeLensProjection
  | ChurnLensProjection
  | SubjectProjection
  | InspectorProjection
  | SearchProjection;
