# Confidence is a soft ranking factor, never a hard filter; truncation is presentational

Low confidence (especially on `heuristic` edges — callbacks, events, framework lifecycle, dynamic
dispatch) must never silently remove an edge from the agent's view. `confidence < threshold → remove`
is forbidden, because it makes exactly the hops a static reader cannot otherwise see disappear, and
the agent then misreads "weak evidence exists" as "the relationship does not exist."

## The three stages are separate

1. **Claim retention** — all raw heuristic FactClaims are retained (per ADR 0019), regardless of
   confidence.
2. **Arbitration → materialization** — arbitration decides which claims qualify to materialize into a
   canonical edge.
3. **Canonical participation** — once a claim is a publishable canonical edge, it **must** participate
   in retrieval, flow, impact, and callers computation. Confidence may down-weight its *rank*; it may
   **not** exclude it from *computation*.

## Budget constrains only the projection, not the computation

Token budget acts solely on the final projection display:

- When tight, show fewer heuristic edges, but always return the **omitted count**, a **summary by
  kind / confidence**, and a **stable expansion handle**.
- Distinguish **`presentationTruncated`** from **incompleteness**:
  - All edges participated in computation but only a subset was displayed → **`COMPLETE` +
    `presentationTruncated`**.
  - The graph traversal itself was aborted for budget → **`PARTIAL` / `UNKNOWN`** (per ADR 0035's
    per-layer `completeness`).

This keeps confidence as a **soft ranking factor** and keeps "never confidently wrong" intact: the
agent always learns that more (weakly-evidenced) edges exist and how to fetch them.

## The only permitted hard filter

When the user **explicitly** sets an evidence policy (e.g. *compiler-backed-only*), heuristic edges
may be excluded — but the result must disclose the **count of excluded edges** and state explicitly
that dynamic-runtime-path completeness is **not** guaranteed.

## Relationship to other decisions

Refines ADR 0035 (`completeness` gains the orthogonal `presentationTruncated` flag), and instantiates
ADR 0020 (Selection vs Projection: budget lives in projection) and ADR 0019 (claims retained,
arbitration materializes). (User-authored refinement, grilling 2026-06-22 round 4.)
