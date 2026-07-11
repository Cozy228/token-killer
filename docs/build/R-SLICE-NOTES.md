---
status: active
review_after: 2026-07-25
purpose: implementation deviation log for the R-slice (claim-serving integrity retrofit); first-class review deliverable per the goal prompt
---

# R-slice Implementation Notes (builder deviation log)

Branch `r-slice/opus`, worktree cut from `origin/feat/1.0.0` @ ffd62216.
Binding spec: `CONTEXA-IMPL.md` §8 (11-item acceptance) + Appendix A rows
DR-01/02/03/04/05/06/07/09/10/12/27/31/32 (with P37 corrigenda). Claim schema:
`PRODUCT-DESIGN.md` §3.

## Baseline (pre-change, pristine worktree)

`packages/core` suite: **5 failed | 451 passed | 2 todo (458)**. The 5 failures are
PRE-EXISTING living-repo doc-churn fragility (they ingest THIS repo and assert on
`CONTEXA-IMPL.md` content/ranking, which drifted since the tests were pinned — the
documented `living-repo-tests-fragile-to-doc-churn` hazard). They are NOT my
regressions; "green" below means "no new failures beyond these 5":
- `1e-docs.test.ts > A5-adr`
- `1f-selection.test.ts > A6-search`
- `1g-serve.test.ts > A7-drill`, `> A7-why`
- `2d-callgraph.test.ts > B4-mention (parseDiffHunks in CONTEXA-IMPL.md)`

## Key cross-cutting design decision (Decisions)

**D-SHADOW — `authority` retained as a compatibility shadow while `derivation` +
`confidence` become canonical.** DR-02 says "split EVERY persisted `authority`
field". The literal reading is to *remove* `authority`; its blast radius is 106
references across 20 core files + CLI + ~22 test files. A single-session full
removal is high-risk for leaving the tree red, which the goal prompt forbids
("STOP … with everything green rather than leaving a half-phase"). Conservative
interpretation taken (scope contract): I ADD `derivation`+`confidence` as the
persisted, canonical trust fields (columns + TS DTOs + committed grammar tokens),
computed centrally by one helper (`store/trust.ts::trustFor`) and backfilled per
DR-02; `authority` stays populated as a denormalized shadow so existing
readers/tests keep working, but it is no longer the *source* of trust. Full
removal of the `authority` column is recommended follow-up (see Open questions).
Nothing reads `authority` for a *new* trust decision; ranking is unchanged
(still reads the shadow) to avoid perturbing golden/living-repo rankings — logged,
not in the DR-02 acceptance item.

## Per-phase / per-DR log

(sections filled as each DR lands)

### Phase 1 — Schema + backfill

### Phase 2 — Freshness wiring

### Phase 3 — Restricted enforcement

### Phase 4 — Claim envelope at the boundary

### Phase 5 — Tail

## Deviations

- D-SHADOW (above): `authority` kept as a shadow column rather than removed.

## Adjacent-found (untouched)

## Open questions

- Full removal of the legacy `authority` column/field (DR-02 literal) — deferred;
  recommended as a dedicated mechanical follow-up once derivation+confidence are
  proven in review.

## 11-item acceptance self-check

(filled at the end; per-item PASS/FAIL/NOT-DONE + evidence)
