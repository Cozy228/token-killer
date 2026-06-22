# Physical schema = raw fact_claims (Kythe/Wikibase) + materialized nodes/edges serving tier + tk-unique arbitration ledger

Status: accepted

The physical storage is **two-tier with a tk-unique arbitration ledger between the tiers**,
combining patterns from three external systems (no code-graph reference has a claim+arbitration
model — they are single-layer graphs where the extractor writes final nodes/edges with at most a
`provenance`/`confidence` tag, which is exactly the single-tag model ADR 0019 rejected):

- **Raw fact tier — `fact_claims`** (append-only, immutable), modeled on **Kythe** `Entry(source,
  edge_kind, target, fact_name, fact_value)` and **Wikibase** Statements (with
  qualifier/reference/rank as first-class data). Every producer assertion lands here with
  source/revision/producer/authority/confidence/evidence and its generation.
- **Materialized serving tier — `nodes` / `edges`** (the C5/C6 generic tables), modeled on
  **Kythe serving tables** (xrefs / paged edge sets built by a separate pipeline, not joined from
  raw facts at query time) and **codegraph's hot path**. Ranking, Behavior, and projection read
  only this tier. `edges` rows are accepted ArbitrationDecisions carrying `decision_id` and refs
  to supporting/conflicting claims.
- **tk-unique middle — `arbitration_decisions` + `decision_claims`** — the independent decision
  ledger that **neither Kythe nor Wikibase has**. Kythe accepts indexer entries by default (no
  arbitration); Wikibase stores the selection result directly on `rank` (no separate decision
  ledger, no dependency invalidation). tk records each ArbitrationDecision (predicate-specific
  policy, cardinality, classified disagreement) and links it to the claims it weighed.

Plus `identity_bindings` (SourceDefinition → CanonicalSymbol), a `dependency_index` reverse-index
(claim → decision → edge → local derived fact) for incremental invalidation, and generation
counters (`canonicalGeneration` / `behaviorGeneration` / `rankEpoch`) in meta.

## Consequences

- The hot path stays codegraph-shaped and fast (ranking reads materialized `edges`, never joins
  raw claims); the Evidence Drawer / conflict disclosure / re-arbitration read `fact_claims` +
  `arbitration_decisions` on demand. This is the Wikibase truthy-dump (canonical projection) vs
  full-dump (all claims) split, made physical.
- Incremental update (ADR 0021 dirty queue) uses `dependency_index` to find exactly which
  decisions/edges a changed file's claims invalidate, re-arbitrates in staging, and atomically
  publishes a new generation.
- Other code-graph projects' query shapes are reusable, but their single-layer storage is **not**
  a justification to drop the claim/arbitration layering.
- Resolves §17 Open Decision #3.
