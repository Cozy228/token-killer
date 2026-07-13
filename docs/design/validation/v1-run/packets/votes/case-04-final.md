---
case: 4
adjudicator: maintainer
date: 2026-07-13
inputs: [case-04-claude.md, case-04-codex.md]
---

# Case 4 final — token-killer#57 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | partial 4/5 | false-reassurance | **partial (4/5)** | Maintainer: the missed `windows-dogfood.ps1` caller fails loudly, so the core safety conclusion (deterministic hint, no silent breakage) holds; one missed surface in an otherwise correct enumeration. |
| 2 | partial 3/5 | false-reassurance | **false-reassurance** | "Nothing dangling on this surface" is a wrong completeness confirmation that stops the reviewer before reconciling ADR 0004 §5 / ADR 0015 (R3). |
| 3 | correct | correct | **correct** | Votes agree; adopted. |
| 4 | partial 3/4 | false-reassurance | **false-reassurance** | Ruling R3 (conservative-direction clause): "no ADR" is wrong — ADR 0014 records the `repo:`/`repo-` seam; telling a reviewer no decision record exists makes them omit an applicable accepted ADR. |
| 5 | correct | partial 1/4 | **correct** | Maintainer: `plans/014` carries no version number; its association with 0.3.2 existed only in the maintainer's head, not in any admissible document, so the operator's "scope lives in #58 + PR body" reading was the reachable answer. |

**Case coverage: (0.8 + 0 + 1 + 0 + 1) / 5 = 2.8/5 = 56% — fails the ≥80% bar.**
False-reassurance instances: Q2, Q4.
