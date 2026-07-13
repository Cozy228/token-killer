---
case: 9
adjudicator: maintainer
date: 2026-07-13
inputs: [case-09-claude.md, case-09-codex.md]
---

# Case 9 final — atlas#18 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | correct | partial 2/3 | **partial (2/3)** | Ruling R1: the question asked which surfaces the seam affects; the operator never enumerated them. Unanswered is unanswered. |
| 2 | correct | partial 1/2 | **partial (1/2)** | Ruling R1: what "resource-first" means was asked and not answered; traceability half stands. |
| 3 | correct | correct | **correct** | Votes agree; adopted. |
| 4 | partial 2/3 | partial 2/3 | **partial (2/3)** | Votes agree (same enumeration, same missed motivating-constraint sub-claim); adopted. |
| 5 | correct | false-reassurance | **false-reassurance** | Maintainer sides with Codex: the ECS task env in `infra/main.tf` injects no `CONFLUENCE_*` variables or secrets — the pipe that delivers credentials to the app is missing, so "delivery-complete" would clear a production portal whose documented live release surface cannot work. |

**Case coverage: (0.667 + 0.5 + 1 + 0.667 + 0) / 5 = 2.833/5 ≈ 56.7% — fails the ≥80% bar.**
False-reassurance instances: Q5.
