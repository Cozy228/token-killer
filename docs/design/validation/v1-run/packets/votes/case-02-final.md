---
case: 2
adjudicator: maintainer
date: 2026-07-13
inputs: [case-02-claude.md, case-02-codex.md]
---

# Case 2 final — token-killer#89 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | partial 5/6 | partial 4/8 | **partial (4/8)** | Ruling R1: the question's first half ("which spellings route in") was never answered; Codex's enumeration adopted. Both votes agree the plugin-goal passthrough→compressed delta was missed. |
| 2 | correct | partial 2/3 | **partial (2/3)** | Pointing at the migration-plan doc without stating its recorded quiet/footer intent does not answer the rationale question in full. |
| 3 | correct | correct | **correct** | Votes agree; adopted. |
| 4 | correct | false-reassurance | **partial (2/3)** | Maintainer: the contract was NOT honored — `important.slice(0, 40)` is passed as a lossless digest, violating ADR 0001's first-N ban (defect filed as a follow-up issue). Demoted from FR per R3's escape clause: the answer's contract-location and ladder-wiring sub-claims are right; the wrong sub-claim is a compliance judgment the panel itself had to litigate, not a bare completeness confirmation. |
| 5 | partial 3/4 | false-reassurance | **false-reassurance** | "No release checklist exists" is wrong (`docs/INSTALL.md` §4–§5 is an in-repo release procedure) and the confirmed "nothing else required" clearance could wrongly clear 0.3.3 as releasable. |

**Case coverage: (0.5 + 0.667 + 1 + 0.667 + 0) / 5 = 2.833/5 ≈ 56.7% — fails the ≥80% bar.**
False-reassurance instances: Q5.
