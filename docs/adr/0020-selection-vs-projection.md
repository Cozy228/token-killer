# Selection Graph vs Projection Graph: layers rank everywhere, serialize on profile

**Status:** accepted (grilling 2026-06-21 D7; Product Contract §9)

The four-layer backend is expensive. If every answer force-fed Behavior + Domain + Evidence into the
agent's context, per-answer token cost would explode — defeating the token-saving goal that
justifies the [codemap](../../CONTEXT.md#surfaces). This ADR resolves how richness reaches the
agent without bloating the common case.

## Decision

- **Separate Selection from Projection.** All four layers participate in candidate retrieval,
  Personalized PageRank, disambiguation, and quality-downweighting (Selection — they improve *which*
  code you get). Only the facts the current **projection profile** needs are serialized into agent
  context (Projection).
- **No intent classifier.** The agent declares the profile through explicit tools
  (`find_code` / `understand_symbol` / `trace_flow` / `analyze_impact` / `domain_context` /
  `explain_evidence`) or an explicit parameter. tk does not guess intent.
- **`locate` is the lean default**: 3–8 code anchors + a compact trust envelope; Behavior/Domain
  rank only, never expanded; typically 3k–6k chars. `understand` adds a bounded Behavior slice (≤12
  nodes) + 1–3 Domain labels. `flow`/`impact`/`domain`/`verify` promote one layer. Evidence is
  always-on metadata, expanded only when a conflict affects the answer or the user verifies.
- **Budget is a hard ceiling, not a fill quota.** Facts compete by *marginal utility per serialized
  char*; surplus budget is not filled with low-value content; at the cap the answer returns omitted
  counts + expansion handles, never a silent truncation.
- **Earning the budget is measured** (refined by
  [ADR 0022](0022-measurement-and-claim-boundaries.md), grilling D10). Evaluation ablates "layer in
  ranking" vs "layer in projection" separately. A layer earns a profile's default output budget only
  after passing a hard **correctness** gate and showing a **portable utility** improvement
  (Copilot- and human-observable) — with proxy (Claude Code) `whole-task uncached` tokens as only a cost
  constraint and tie-breaker, never the sole basis, and never by being available.

## Considered options

- *Layered projection by default* (every answer carries all four layers): richest single answer, but
  raises per-answer tokens and risks net loss on the primary metric. Rejected as the default.
- *Query-classified routing* (a classifier picks the layer subset): keeps the default lean but adds a
  routing layer and misclassification risk; the agent already knows its intent. Rejected.

## Consequences

- **Pro:** the default answer stays lean, so the expensive backend never bloats the common case; it
  pays off through ranking quality and on-demand depth.
- **Pro:** the value of each layer is falsifiable via ablation, not asserted.
- **Con:** the agent must pick a profile/tool; a wrong pick yields a less useful shape (mitigated by
  `locate` being a safe, cheap default).
- **Con:** per-profile layer caps and the marginal-utility projector are extra machinery to build and
  tune.
