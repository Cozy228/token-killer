# Measurement harness precedes the code-graph feature

**Status:** proposed (grilling 2026-06-18) — implementation design:
[`measurement-harness-design-20260618.md`](../reports/measurement-harness-design-20260618.md)

The code graph's headline value is **borrowed benchmark percentages** ("47% fewer tokens") that
the research itself flags as directional, unreproducible, and up to 30× run-to-run variance. tk's
moat is the opposite — "honesty is the moat: a measured number is never combined with an estimate"
(the ledger model, `estimate_kind`, `saved_tokens`). So we **build the measurement harness first,
before building the graph**, and never report a borrowed % as if measured.

## Decision

- A **new first slice (before the tree-sitter/sqlite spike)** builds the evaluation harness from
  research-compendium §11: `uncached_input_tokens` delta, `search_result_usefulness`,
  `omission_bug_rate`, `duplicate_reads`, tool-call/round counts, and the **fallback-replay** method
  (re-run a failed task with the projected evidence escalated to raw; if it flips, count a context-
  omission bug). A **baseline** (agent without the graph) is captured first.
- The graph reports **only mechanical facts of what it did** (nodes returned, `file:line` count,
  reads avoided this turn) under `estimate_kind = opportunity/heuristic`. It **never** writes
  `saved_tokens` — that name is reserved for ledger ① measured command savings.
- **No external % claim** ships until it has passed our own harness on real multi-turn tasks.

## Considered options

- *Build the graph first, measure later*: the natural order, but risks optimizing the wrong number
  (risk #10) and shipping unverifiable claims into an honesty-branded tool. Rejected.
- *Skip value accounting, treat the graph as a pure capability*: simplest, but forgoes proving — in
  tk's own honest ledgers — that the feature actually cuts uncached input tokens. Rejected.

## Consequences

- **Pro:** every subsequent slice's value is measured, not assumed; keeps "measured ≠ estimate" intact.
- **Pro:** the harness doubles as the safety net (omission-bug-rate guards the quality gate).
- **Con:** slower to first visible feature — the instrument is built before the thing it measures.
