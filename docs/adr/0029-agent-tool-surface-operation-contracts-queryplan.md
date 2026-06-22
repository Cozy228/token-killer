# Agent tool surface = 4 operation-contract tools; profiles decompose into an internal QueryPlan

Status: accepted

The agent tool surface keeps the **four codegraph-validated operation contracts** as the
default tools — `tk_explore`, `tk_search`, `tk_node`, `tk_callers` — which name four
*responsibilities* (primary exploration, cheap search, precise node read, reverse calls), not
six product profiles and not one omni-tool. This preserves codegraph's eval evidence (4
default tools won; the 1-tool gate lost −43%→+107%; `impact` appeared in zero evals;
tiny-repo <500 files drops to 3).

The six projection profiles are **not** external tool names and are **not** collapsed into a
single `purpose` enum, because they mix orthogonal dimensions:

- `locate` / `understand` are **task goals**,
- `flow` / `impact` are **traversal modes**,
- `domain` is a **knowledge layer**,
- `verify` is a **trust & projection mode**.

So they become **internal QueryPlan presets**. The internal protocol (formerly the monolithic
`CodeQuery`) is decomposed into three orthogonal parts:

1. **selection** — which knowledge layers to query (Code / Behavior / Domain / Evidence),
2. **traversal** — graph direction (callers / callees / flow / impact),
3. **projection** — output mode (understanding / editing / verification × locations / outline
   / source / evidence).

Each external tool compiles its **narrow** parameters into a full QueryPlan; the heavy
multi-parameter protocol is never exposed to the agent.

## Consequences

- Domain and Evidence layers are first reachable through `tk_explore.layers` and
  `tk_node.include` parameters — **not** by adding six profile tools and **not** by
  pre-adding `tk_domain` / `tk_verify`. A new default tool is added **only** when tk's own
  Domain/Evidence harness shows a dedicated tool meaningfully improves selection rate, call
  count, or result quality. This keeps the 4-tool evidence while preventing the
  code-navigation tool shape from constraining the full Repository Intelligence Core.
- Resolves the three-way doc contradiction: F.3 (4 verb tools), CONTEXT.md (6 profile tools),
  and A4.4 (one unified `CodeQuery`) are reconciled — the surface is F.3's 4 operation
  contracts, profiles are internal QueryPlan presets, and `CodeQuery` is replaced by the
  decomposed internal QueryPlan. CONTEXT.md's "Additive retrieval tool" stops naming six
  profile tools.
- Fewer contributed tools also suits the VS Code LM Tool API (more tools → harder model
  selection).
- The `RankingProfile` / BFS-direction work (appendix A3 §3) is the **traversal** dimension of
  the QueryPlan, not a separate exposed concept.
