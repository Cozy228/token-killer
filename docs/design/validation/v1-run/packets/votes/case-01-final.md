---
case: 1
adjudicator: maintainer
date: 2026-07-13
inputs: [case-01-claude.md, case-01-codex.md]
---

# Case 1 final — token-killer#90 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | correct | correct | **correct** | Votes agree; adopted. |
| 2 | correct | correct | **correct** | Votes agree; adopted. |
| 3 | correct | partial 4/5 | **correct** | Maintainer: the operator was not required to discover that the root CI workflow never enters the isolated `server/` workspace; the stated CI-in-flight caveat was the material content. |
| 4 | correct | partial 1/2 | **partial (1/2)** | Maintainer: `docs/TELEMETRY.md` names ADR 0004 as the field-contract decision and ADR 0004 records the allow-list; the operator's "code/README-recorded only, no decision record" source attribution is wrong. Consistency sub-claim stands. |
| 5 | correct | correct | **correct** | Votes agree; adopted. |

**Case coverage: (1 + 1 + 1 + 0.5 + 1) / 5 = 4.5/5 = 90% — meets the ≥80% bar.**
False-reassurance instances: none.
