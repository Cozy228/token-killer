# One complete bounded product: four operational layers, no version slicing

**Status:** accepted (grilling 2026-06-21 D1+D3; supersedes [ADR 0013](0013-code-graph-surface-scope.md))

The [codemap](../../CONTEXT.md#surfaces) is **one complete, bounded product**, not a sequence of
releases. Its backend holds four Required, capability-bounded knowledge layers — Code, Behavior,
Domain, Evidence — and serves two co-equal Required surfaces (Agent Surface and codeguide).
This reverses ADR 0013, which scoped the feature as a narrow "search/read lane only" with the
extension and richer analysis deferred.

## Decision

- **Four layers, all Required and operational.** Each must have a real producer, canonical schema,
  provenance/evidence, query path, Agent projection, codeguide display, and correctness tests.
  **No empty tables or nullable fields claiming future support.** Each is *capability-bounded* (its
  semantic scope is explicitly closed, not infinitely expandable).
- **Both surfaces are Required.** Agent Surface (token-saving) and codeguide (understanding)
  ship as one product; neither is "first" and neither is deferred.
- **Terminology Law (binding, whole-doc).** Describe every capability with exactly one state:
  *Required / Optional at runtime / On-demand / Profile-specific / Capability-bounded / Unsupported /
  Outside current product scope / Implementation dependency*. The words *v1, v2, MVP, thin slice,
  留槽, defer, Phase-as-release, roadmap phase* are **banned**. Authority levels
  (Observed/Derived/Inferred/Confirmed) are fact tiers, not phases. Complexity is bounded by
  capability boundaries; order is set by implementation dependencies only.
- **Outside current product scope ≠ backlog.** Items placed outside scope (wiki authoring,
  collaboration, comments/review/publishing/writeback, tours, autonomous daemon, arbitrary graph
  exploration) are **not** promised future work; re-inclusion requires a fresh product decision.

## Considered options

- *Narrow "search/read lane only" (ADR 0013)*: smallest surface, but it does not deliver the human
  understanding goal and treats Behavior/Domain/Evidence as out of scope. Reversed by the
  needs-driven goal that A (human understanding) and B (agent token-saving) are co-equal.
- *Lean core + schema slots, populate later*: smaller build, but it hides architecture debt behind
  empty tables and the very version-slicing the Terminology Law bans. Rejected by the user.
- *Unbounded four layers*: every language, every framework, sound whole-program analysis — not
  buildable or honest. Rejected in favour of capability-bounded layers ([0019](0019-evidence-claim-arbitration.md),
  and the Behavior/Domain boundaries in the Product Contract §4).

## Consequences

- **Pro:** the product contract is honest — what is claimed is operational, what is bounded is named,
  what is out is explicitly out.
- **Pro:** removes version-slicing as a hiding place for unfinished design.
- **Con:** a much larger initial build than ADR 0013's lane; Behavior and Domain are net-new layers
  with little reuse from the assimilation source.
- **Con:** "complete bounded product" raises the acceptance bar — every layer needs producers,
  consumers, and tests before it can be called done.
