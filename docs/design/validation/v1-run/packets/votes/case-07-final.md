---
case: 7
adjudicator: maintainer
date: 2026-07-13
inputs: [case-07-claude.md, case-07-codex.md]
---

# Case 7 final — token-killer#52 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | correct | false-reassurance | **false-reassurance** | Maintainer sides with Codex: the cache key has no content check, so a same-path/same-size/same-mtime rewrite is a real counterexample to the confirmed "never disagree" claim; filtered reports also mix event-scan with separately cached unfiltered habits. |
| 2 | correct | correct | **correct** | Votes agree; adopted. |
| 3 | correct | partial 2/4 | **partial (3/4)** | Maintainer hybrid: dock only the fifth-checkbox attribution (the dogfood cold→warm timing check lives in `windows-dogfood.ps1`, not `extractCache.test.ts`); the "117 tests = author-asserted" characterization is reasonable and not docked. |
| 4 | correct | partial 1/2 | **partial (1/2)** | The operator understated the recorded timing-flakiness convention (vitest.config 30s budgets + CI hang ceilings, both introduced to govern exactly this risk class). |
| 5 | correct | correct | **correct** | Votes agree; adopted. |

**Case coverage: (0 + 1 + 0.75 + 0.5 + 1) / 5 = 3.25/5 = 65% — fails the ≥80% bar.**
False-reassurance instances: Q1.
