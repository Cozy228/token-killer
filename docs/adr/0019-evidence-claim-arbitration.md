# Evidence as immutable FactClaims + a predicate-specific arbitration layer

**Status:** accepted (grilling 2026-06-21 D6; Product Contract §6–7)

Multiple producers (tree-sitter heuristic, SCIP compiler-level, framework profile, host-LLM) will
disagree about the same call site. The [Evidence Graph](../../CONTEXT.md#codemap-layers) does not
let them write edges directly and pick a winner by a global confidence score.

## Decision

- **Producers submit immutable FactClaims.** An independent arbitration layer produces a
  *reconstructible* canonical view; raw claims are never fused or overwritten. A canonical edge is a
  materialized `ArbitrationDecision` referencing its supporting + conflicting claims.
- **Authority is predicate-specific**, not a global SCIP > tree-sitter ranking: tree-sitter is
  authoritative for syntactic facts (span/branch/assignment); fresh full-coverage SCIP for
  definition/reference/call-target identity; framework profile for route/event/job registration
  semantics; **host-LLM never arbitrates executable symbols or call edges**.
- **Each predicate declares cardinality + merge policy** (`definitionOf/contains` single;
  `implements/references` set; dynamic `resolvesTo` possible-set). Disagreement is *typed* —
  contradiction / supplement / alternative / out-of-coverage / stale — not uniformly "conflict".
- **Identity-merge is separated from edge-arbitration.** `CanonicalSymbol` keeps a stable opaque ID;
  a SCIP symbol is external identity only. Auto-bind only on same-file + same-revision + unique
  definition-span + compatible descriptor; otherwise record `sameAsCandidate`, never a destructive
  merge.
- **Every consumer is real**: PageRank and Behavior traverse only accepted edges; Agent Projection
  surfaces a conflict only when it affects the current answer; codeguide shows full
  claims/policy/rationale on demand; freshness invalidates stale decisions; evaluation measures
  arbitration precision and identity false-merge. (No machinery without a consumer.)

## Considered options

- *All producers write edges; pick winner by global confidence*: simplest, but loses provenance,
  cannot express predicate-specific authority, and silently discards minority evidence. Rejected.
- *Keep all edges, no canonical, arbitrate per query*: symmetric but pushes arbitration cost into
  every consumer and leaves "which edge set does PageRank run on?" ambiguous. Rejected.
- *Fuse producers into one edge with blended confidence*: cheapest downstream, but destroys the
  per-edge provenance the trust contract requires. Rejected.

## Consequences

- **Pro:** honest about disagreement; conflicts are typed, attributed, and surfaced only when they
  matter.
- **Pro:** the canonical view is a deterministic, reconstructible artifact for ranking/behavior.
- **Con:** more storage and machinery than a single edges table (claims + decisions + identity
  bindings + dependency index).
- **Con:** predicate-specific policies and cardinalities must be authored and tested per predicate.
