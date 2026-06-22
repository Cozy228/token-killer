# Staged ranking pipeline (lexical→anchors→expand→resolve→PPR), not weighted-score or RRF fusion

Status: accepted

codemap retrieval ranks results with a **staged cascade**, not a flat weighted-score
fusion and not Reciprocal Rank Fusion across lexical, graph and path signals. The pipeline
is: (1) **lexical search** (FTS5 BM25 + the codegraph name/kind/path/multi-term/test
heuristics) produces a bounded set of **candidate anchors**; (2) **AST expansion** builds a
bounded **structural neighborhood** around those anchors; (3) **SCIP or the language type
checker** resolves symbol identity and canonical relations before graph ranking; (4) lexical
relevance, explicit symbols, explicit paths, workspace locality, and query `purpose` are
converted into a **normalized personalization seed distribution**; (5) **query-local
Personalized PageRank** ranks the resolved neighborhood. The final order is **primarily
determined by PPR**, while exact user-specified symbols and paths keep **deterministic
precedence**, and lexical rank and path proximity act as **stable tie-breakers**.

This supersedes the weighted-sum `finalScore = 0.60·lexical + 0.20·PPR + 0.10·path +
0.10·session` that an earlier draft (appendix A3 §1) imported from the
`Token-killer-Research` design doc.

## Considered Options

- **Weighted-sum `finalScore`** (the imported draft) — rejected. It requires normalizing
  every channel (open-ended BM25, [0,1] PPR, integer path) onto one scale, and the
  0.60/0.20/0.10/0.10 weights had no empirical calibration. Neither reference uses it.
- **RRF across lexical + PPR + path** — rejected *for this combination*. RRF's purpose is
  fusing **genuinely independent** retrieval channels. Lexical signals are not independent
  of PPR here — they **produce PPR's seeds** — so RRF-combining them double-counts the same
  evidence. RRF (`Σ 1/(60+rank)`, the GitNexus pattern) is retained **only** for truly
  independent channels such as lexical + embedding (embeddings are Unsupported in scope, so
  this path is dormant).
- **codegraph additive-bonus single layer** (no PPR) — the proven MIT exemplar, but it
  demotes PPR to a weak additive term, contradicting the "PageRank Required, default on"
  commitment (ADR/decision #8).

## Consequences

- The pipeline avoids the **double-counting** of fusing seed-upstream signals back in at the
  end. PPR is the structural ranker; lexical/path are upstream (seeding) and downstream
  (tie-breaking), never a third weighted channel.
- "PageRank Required, default on" is honored: PPR is the primary final ranker, not an
  optional re-rank.
- Determinism is preserved: exact user-specified symbols/paths are always surfaced first,
  independent of PPR mass.
- Open follow-on (does not block build): the normalized seed-mass weights (query-hit /
  stack-trace / changed-file / edited-file tiers, appendix A3 §4.1) remain a calibration
  target for the K harness `recall@k`, not magic constants.
