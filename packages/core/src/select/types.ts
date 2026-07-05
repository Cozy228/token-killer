/**
 * Selection-engine typed structs (CTX-IMPL §6 + P28 addendum: "envelope is an
 * internal TYPED STRUCT; markdown is the final render step" — slice 1g renders,
 * this layer only builds the struct. §10's budget/omission property tests
 * target these types, never a rendered string).
 */
import type { EntityKind, Facet } from "../store/types.ts";

export type BudgetTier = "lean" | "wide";

/** Response sections in their FIXED order (§7 stable-shape rule; envelope last). */
export type SectionName = "subject" | "code" | "decisions" | "history" | "memory" | "conflicts";
export const SECTION_ORDER: readonly SectionName[] = [
  "subject",
  "code",
  "decisions",
  "history",
  "memory",
  "conflicts",
];

/** Render tiers per item (§6.5): full → skeleton → line+handle. */
export type RenderTier = "full" | "skeleton" | "line";

export interface RenderedItem {
  entityId: string;
  kind: EntityKind;
  name: string;
  /** Interned short handle — every rendered item carries one (G-5). */
  handle: string;
  tier: RenderTier;
  /** Tier text (internal; 1g owns markdown). Always complete for its tier — never mid-cut. */
  text: string;
  /** chars/4 estimate of `text` (§6.5). */
  tokens: number;
  /** Final composite score this item ranked with. */
  score: number;
  /** Display locator (`path[:start-end]` / commit oid), when file/git-backed. */
  locator?: string;
}

/** An omission — counted AND handle'd (§6.5 "no silent truncation, ever"). */
export interface OmittedItem {
  entityId: string;
  kind: EntityKind;
  name: string;
  handle: string;
  score: number;
  section: SectionName;
}

export interface SectionResult {
  name: SectionName;
  items: RenderedItem[];
  omitted: OmittedItem[];
  /** Section cap after borrowing, in tokens. */
  budgetTokens: number;
  usedTokens: number;
  /** Reconciliation invariant: considered === items.length + omitted.length. */
  considered: number;
}

/**
 * The envelope struct (P28: typed, rendered by 1g). `truncated` vs `partial`
 * are DISTINCT (§7): capped-but-valid subset vs sub-query-failed.
 */
export interface SelectionEnvelope {
  budgetTier: BudgetTier;
  totalBudgetTokens: number;
  /** Tokens reserved for the envelope render itself (never borrowable). */
  envelopeReserveTokens: number;
  perSectionBudget: Record<SectionName, number>;
  usedTokens: number;
  omittedTotal: number;
  truncated: boolean;
  partial: boolean;
  /** Disclosed tunables (§6 "constants … envelope-disclosed"). */
  constants: Record<string, number | string>;
  notes: string[];
}

export type SelectMode = "task" | "ref" | "handle" | "facet";

/** One end of a symbol's call preview (2d biography): a drillable neighbor. */
export interface CallPreviewRef {
  entityId: string;
  name: string;
  handle: string;
}

/**
 * The compact call-graph preview under a symbol subject (§7 template + B6): a
 * few callers (`←`) and callees (`→`) with drill handles, plus a `!callers` /
 * `!callees` facet handle for the overflow. Present only when the subject is a
 * symbol with at least one resolved call edge.
 */
export interface CallPreview {
  callers: CallPreviewRef[];
  callees: CallPreviewRef[];
  /** Callers/callees beyond the previewed few (drill the facet handle). */
  moreCallers: number;
  moreCallees: number;
  /** `<sym>!callers` / `<sym>!callees` short facet handles. */
  callersHandle: string;
  calleesHandle: string;
}

export interface SelectResult {
  ok: true;
  mode: Exclude<SelectMode, "facet">; // facet drill-downs return FacetResult
  /** The subject entity (ref/handle target, or the task's top-ranked hit). */
  subject: RenderedItem | undefined;
  sections: SectionResult[];
  envelope: SelectionEnvelope;
  /** Symbol subjects (2d): compact caller/callee preview with drill handles. */
  callPreview?: CallPreview;
}

/** Recoverable conditions are values (G-3); 1g turns them into success-shaped guidance. */
export interface SelectMiss {
  ok: false;
  reason: "unknown-ref" | "empty-store" | "no-input";
  guidance: string;
  /** Candidate entities for an unknown ref, when any look close. */
  candidates: Array<{ entityId: string; name: string; kind: EntityKind; handle: string }>;
}

export interface SelectInput {
  task?: string;
  ref?: string;
  handle?: string;
  budget?: BudgetTier;
  now?: () => number;
}

export interface SearchInput {
  query: string;
  kinds?: EntityKind[];
  now?: () => number;
}

export interface SearchItem {
  entityId: string;
  kind: EntityKind;
  name: string;
  handle: string;
  score: number;
  /** True when force-included by named-seed injection (§6.1). */
  named: boolean;
  /** 1 when the item came from lexical seeds; 2 when reached by expansion. */
  hop: 0 | 1 | 2;
  locator?: string;
  /** One-line render (name + locator + handle). */
  line: string;
  tokens: number;
}

export interface SearchResult {
  ok: true;
  query: string;
  items: SearchItem[];
  /** Ranked candidates beyond the render cap — counted, never silent. */
  omitted: OmittedItem[];
  considered: number;
  truncated: boolean;
  constants: Record<string, number | string>;
}

/** Facet drill-down result (skips PPR, own ~800-token budget). */
export interface FacetResult {
  ok: true;
  mode: "facet";
  entityId: string;
  kind: EntityKind;
  handle: string;
  facet: Facet;
  text: string;
  tokens: number;
  budgetTokens: number;
  truncated: boolean;
  partial: boolean;
  notes: string[];
}

// ---- internal pipeline types ----

export interface Seed {
  entityId: string;
  /** Seed mass (teleport weight input; NAMED_SEED_WEIGHT for named seeds). */
  weight: number;
  /** Raw lexical relevance used for the RRF lexical list ordering. */
  lexicalScore: number;
  named: boolean;
}

export interface SubgraphNode {
  entityId: string;
  /** 0 = seed; 1/2 = expansion hops. */
  depth: 0 | 1 | 2;
  /** Best inbound path confidence (seeds = 1). */
  confidence: number;
  /** Frontier priority = parent score × edge confidence (search flat rank input). */
  priority: number;
}

export interface SubgraphEdge {
  src: string;
  dst: string;
  predicate: string;
  confidence: number;
}

export interface Subgraph {
  nodes: Map<string, SubgraphNode>;
  edges: SubgraphEdge[];
}
