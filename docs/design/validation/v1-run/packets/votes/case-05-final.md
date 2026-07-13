---
case: 5
adjudicator: maintainer
date: 2026-07-13
inputs: [case-05-claude.md, case-05-codex.md]
---

# Case 5 final — token-killer#47 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | correct | false-reassurance | **partial (2/3)** | Maintainer split ruling: swallowed git-dir read failures are NOT a material new failure mode, but the handler's own filter IS a dependent caller of the old double capture — the confirmed "no dependent callers found" sub-claim is wrong. Not FR (R3 escape clause: overall answer is an accurate mechanics account, not a completeness clearance). |
| 2 | correct | correct | **correct** | Votes agree; adopted. |
| 3 | correct | correct | **correct** | Votes agree; adopted. |
| 4 | correct | false-reassurance | **false-reassurance** | Ruling R4: the `renderDebug` "Final privacy net" contract comment ("no section may leak the literal home path") is a recorded convention; "the leak violates no written rule that existed then" is therefore a wrong confirmed claim on a material privacy question. |
| 5 | correct | correct | **correct** | Votes agree; adopted. |

**Case coverage: (0.667 + 1 + 1 + 0 + 1) / 5 = 3.667/5 ≈ 73.3% — fails the ≥80% bar.**
False-reassurance instances: Q4.
