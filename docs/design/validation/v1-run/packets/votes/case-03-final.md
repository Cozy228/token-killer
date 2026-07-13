---
case: 3
adjudicator: maintainer
date: 2026-07-13
inputs: [case-03-claude.md, case-03-codex.md]
---

# Case 3 final — token-killer#87 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | partial 4/5 | false-reassurance | **false-reassurance** | Ruling R3: "all load-bearing surfaces moved, only two human-facing stragglers" is a wrong completeness confirmation — `scripts/check-installation.sh` still passes Node 20 and further Node-20 field claims remain. |
| 2 | partial 3/4 | false-reassurance | **false-reassurance** | Ruling R2: P10 lives only on the unmerged feat/1.0.0 branch and is inadmissible; "a reviewer CAN reconcile ≥22 against P10" is a confirmed claim built on inadmissible evidence. |
| 3 | correct | correct | **correct** | Votes agree; adopted. |
| 4 | correct | false-reassurance | **false-reassurance** | Same R2 consequence: the "recorded authorization is P10" confirmation has no admissible basis, the old split had further policy records (perf-goal doc), and post-merge contradictions remained. |
| 5 | partial 4/5 | partial 6/9 | **partial (6/9)** | Ruling R1: the question-named pnpm 11 pin was never classified; "the failure mode is an unguided runtime error" is asserted without evidence. Codex's enumeration adopted. |

**Case coverage: (0 + 0 + 1 + 0 + 0.667) / 5 = 1.667/5 ≈ 33.3% — fails the ≥80% bar.**
False-reassurance instances: Q1, Q2, Q4.
