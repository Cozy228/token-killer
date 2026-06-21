# Materialized read model + dirty queue + repair overlay + query-local PageRank

**Status:** accepted (grilling 2026-06-21 D8; Product Contract §8)

The expensive four-layer backend must update under a **no-daemon, lazy-on-read** model. The risk is
that a file change triggers a full cascade (invalidate claims → re-arbitrate → update canonical edges
→ recompute PageRank) *at query time*, blowing the latency budget. PageRank is the global cost
centre. "No daemon" must not mean "stuff all of a daemon's work into the first query."

## Decision

- **Materialize a read model.** FactClaims, identity bindings, ArbitrationDecisions, canonical edges,
  and function-local CFG/def-use/effect are stored. Cross-function flow, impact paths, Context
  Packets, and query-local PageRank are computed per query, not stored.
- **Claim-scoped incremental, no full-graph BFS.** A file change re-extracts that file's claims and
  semantic-diffs them. Body-only changes rebuild only that function's claims + local Behavior; only
  identity/signature/export-surface changes extend to direct referencers via referencer set-diff.
  Dirty scope propagates through an explicit dependency index (claim → decision → canonical edge →
  local derived fact).
- **Atomic generations + repair overlay.** A dirty closure that fits the query refresh budget is
  re-resolved in staging and atomically published as a new canonical generation. If it does not fit,
  no half-update is published: the last consistent snapshot is kept and the current query runs on
  `effective graph = snapshot − invalidated keys + freshly arbitrated overlay edges`, repairing only
  the seeds, target symbol, and needed neighbourhood. Unfinished keys persist in a **dirty queue** and
  later queries continue.
- **Split PageRank.** Query-local bounded PPR (≤~2000 nodes / 10000 edges) is Required and gives
  locally-fresh ranking on PARTIAL changes. The global structural prior is an Optional materialized
  cache that may be slightly stale or disabled. ARCHITECTURE/FULL changes do not block ordinary
  queries with a full-repo recompute; only architecture queries or explicit `tk sync` catch up
  globally.
- **Report freshness, banner only when it bites.** Each query reports
  canonicalGeneration/behaviorGeneration/rankEpoch/rankFreshness; a prominent stale/partial banner
  appears only when an unrepaired region intersects the answer or the refresh budget was truncated.

## Considered options

- *Computed-on-read canonical view*: always fresh, zero maintenance, but re-arbitrates (and re-ranks)
  every query — repeated cost on every lazy refresh, at odds with the latency goal. Rejected.
- *Hybrid: materialize structure, arbitrate + rank on read*: two refresh paths and PageRank still a
  per-query global cost. Rejected.
- *Add a daemon/watcher to maintain the materialized view*: outside current product scope (decision
  to keep no resident daemon; watcher opt-in only). Rejected as the default.

## Consequences

- **Pro:** fast reads from a materialized model; the first query after a change never uses
  known-wrong edges; global PageRank is never the latency centre of a lazy refresh.
- **Pro:** honest freshness reporting per generation.
- **Con:** the dependency index, dirty queue, repair overlay, and generation bookkeeping are
  substantial machinery.
- **Con:** the global prior can lag on large/architectural changes; impact/architecture answers must
  disclose partial coverage rather than block.
