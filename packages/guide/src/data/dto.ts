/**
 * The wire contract, defined ONCE.
 *
 * The projection DTOs are re-exported straight from the kernel's own source
 * (`packages/core/src/guide/types.ts`) rather than copied. A copy would drift, and a
 * drifted DTO is exactly how "live" and "export" quietly become two products — which
 * D17 forbids. These are TYPE-ONLY re-exports: `verbatimModuleSyntax` erases them, so
 * no core code, and certainly no `node:sqlite`, is ever pulled into the browser bundle.
 */
export type {
  AggregateEdge,
  AtlasDisclosure,
  BoundaryNode,
  BoundedProjection,
  ClaimSet,
  ConfidenceSummary,
  Degree,
  FreshnessState,
  GenerationView,
  Grain,
  GuideEvent,
  NoVisibleRoute,
  OmissionDisclosure,
  ProjectedContainer,
  ProjectedDeclaration,
  ProjectionKind,
  ProjectionSubject,
  RelationGroup,
  RelationKind,
  RelationLayer,
  SourceGeneration,
} from "../../../core/src/guide/types.ts";

/** The D28 left rail's payload. Also from the kernel — the SPA computes no projection. */
export type {
  AttentionCounts,
  GuideTree,
  TreeNode,
  TreeNodeKind,
} from "../../../core/src/guide/tree.ts";

import type { GenerationView } from "../../../core/src/guide/types.ts";

/** The repository the guide is serving. Deterministic; no generated prose. */
export interface RepoView {
  /** Basename of the project root — what the top bar names. */
  name: string;
  /** Absolute project root. A developer-local tool: the real path is the honest answer. */
  root: string;
}

/**
 * `GET /api/generation`. The top bar's whole payload, and the ONLY thing that decides
 * the `live | snapshot | stale` badge.
 *
 * The server recomputes this on EVERY call — never a snapshot taken at startup. The
 * store can go stale underneath a running server (a sibling worktree runs `ctx sync`
 * and, since all worktrees of a repo share one shard, supersedes this checkout's
 * generation), and the badge has to be able to say so.
 */
export interface GuideStatus {
  repo: RepoView;
  generation: GenerationView;
}
