# Measurement co-evolves with the code graph

**Status:** accepted (grilling 2026-06-18)

The code graph's headline value is **borrowed benchmark percentages** ("47% fewer tokens") that
the research itself flags as directional, unreproducible, and up to 30× run-to-run variance. tk's
moat is the opposite — "honesty is the moat: a measured number is never combined with an estimate"
(the ledger model, `estimate_kind`, `saved_tokens`). So graph implementation and measurement are built
together: every slice carries safety and measurement evidence, but measurement does not block graph
development as a separate phase.

## Decision

- Each implementation slice includes measurement hooks for `uncached_input_tokens` deltas,
  returned anchor counts, avoided reads, duplicate-read pressure, fallback/raw escalation, and
  verification outcomes where applicable.
- The release hard gate is **safety**, not a savings percentage: anchors resolve, raw recovery exists,
  stale/hash mismatches are explicit, and graph output does not fabricate file locations.
- Savings are still mandatory to measure and report, but v1 does not fail release on a fixed token-savings
  threshold.
- The graph never writes `saved_tokens`; that name remains reserved for ledger ① measured command savings.
  Graph value uses `estimate_kind = opportunity/heuristic` unless a controlled measurement proves otherwise.

## Considered options

- *Measurement-first as a separate phase*: maximally honest, but it delays the first usable retrieval
  capability and over-serializes work that can be validated per slice. Rejected.
- *Savings threshold as release gate*: tempting for marketing, but fragile across repos and agents.
  Rejected for v1.
- *Dogfood only*: too weak for an honesty-branded token product. Rejected.

## Consequences

- **Pro:** graph work can proceed while still producing evidence for every slice.
- **Pro:** safety remains non-negotiable and independently testable.
- **Con:** v1 may ship without a single headline savings percentage.
