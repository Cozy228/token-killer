---
case: 8
adjudicator: maintainer
date: 2026-07-13
inputs: [case-08-claude.md, case-08-codex.md]
---

# Case 8 final — token-killer#51 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | correct | partial 3/4 | **partial (3/4)** | Ruling R1: the operator's verbatim answer covers only three of the four question-named consumers (report, telemetry, exit code) and never addresses scope-bucket persistence. |
| 2 | partial 2/3 | correct | **partial (2/3)** | Maintainer sides with Claude: ADR 0003's Consequences clause ("a missing bucket triggers a full inspect") is a contract term; this PR narrows it to `--static-only` without amending the ADR — the "match, not narrow" sub-claim is wrong (benign narrowing, so partial, not FR). |
| 3 | correct | correct | **correct** | Votes agree; adopted. |
| 4 | correct | correct | **correct** | Votes agree; adopted. |
| 5 | correct | correct | **correct** | Votes agree; adopted. |

**Case coverage: (0.75 + 0.667 + 1 + 1 + 1) / 5 = 4.417/5 ≈ 88.3% — meets the ≥80% bar.**
False-reassurance instances: none.
