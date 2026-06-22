# Ablation protocol

**Status:** accepted (grilling 2026-06-21 D12 / Q10; demoted from the former "nested sparse ablation"
architecture to a protocol rule — no interaction-status, no adaptive factorial system).

K13 and D7 are not a factorial matrix. D7's projection arms live inside K13's `+graph` arm.

## Decision

- **K13 tests retrieval technology** — `baseline · +output-compression · +smart-read · +repo-map/graph ·
  +symbol-index`. All cells hold **one locked projection configuration** (conservative or last-validated),
  so K13 isolates the technology, not the projection policy.
- **D7 tests projection within the graph arm** — Code-only vs four-layer ranking/projection, per profile.
- **No full matrix.** Pick the K13 winner and the D7 winner independently, then run **one combined
  confirmation** of the final configuration against baseline (correctness non-regressing, the expected
  benefits still present, tokens not materially reversed).
- Ablations embed into the [benchmark harnesses](0023-benchmark-architecture.md): K13 in the SWE-bench
  control arms, D7 on fixed task slices.

## Consequences

- Affordable on the proxy runner (≈ `5 + 4×profiles + 1 confirm`, not the full grid).
- Higher-order interactions outside the single confirmation are not chased; this is an accepted,
  disclosed limit, not a guarantee.
