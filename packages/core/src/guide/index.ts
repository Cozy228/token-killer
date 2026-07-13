/**
 * `ctx guide` projection kernel (M3 K1) — pure functions over the store.
 *
 * No UI, no server, no SQL outside `store/`, no writes. The kernel builds the COMPLETE
 * logical Atlas (D7/D33/D36) and projects bounded, claim-backed slices of it (D27).
 */
export { buildAtlas, scopeOf, type AtlasOptions } from "./atlas.ts";
export { buildRelationIndex, relationsOf, NON_ATLAS_PREDICATES } from "./relations.ts";
export { aggregateClaims, ClaimReader } from "./claims.ts";
export { resolveGeneration, isServable, ATLAS_SOURCES, type FreshnessOptions } from "./freshness.ts";
export { ROUTE_KINDS } from "./bounded.ts";
export {
  projectOverview,
  projectScope,
  projectConnections,
  projectEvent,
} from "./projections.ts";
export {
  liveCodeFiles,
  symbolsInFile,
  retiredSymbolsOf,
  filesInCommit,
  diffForCommits,
} from "./queries.ts";
export type { LiveCodeFile } from "./queries.ts";
export { projectTree, DEFAULT_RECENT_COMMITS } from "./tree.ts";
export type {
  AttentionCounts,
  GuideTree,
  TreeNode,
  TreeNodeKind,
  TreeOptions,
} from "./tree.ts";
export {
  DEFAULT_BUDGET,
  RELATION_KINDS,
  RELATION_LAYER,
  type AggregateEdge,
  type AtlasDisclosure,
  type AtlasModel,
  type BoundaryNode,
  type BoundedProjection,
  type ClaimSet,
  type ConfidenceSummary,
  type ConnectionsOptions,
  type Declaration,
  type Degree,
  type EventOptions,
  type FileLot,
  type FreshnessState,
  type GenerationView,
  type Grain,
  type GuideEvent,
  type NoVisibleRoute,
  type OmissionDisclosure,
  type OverviewOptions,
  type ProjectedContainer,
  type ProjectedDeclaration,
  type ProjectionBudget,
  type ProjectionKind,
  type ProjectionSubject,
  type Relation,
  type RelationGroup,
  type RelationIndex,
  type RelationKind,
  type RelationLayer,
  type ScopeOptions,
  type SourceGeneration,
} from "./types.ts";
