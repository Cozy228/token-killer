---
case: 10
adjudicator: maintainer
date: 2026-07-13
inputs: [case-10-claude.md, case-10-codex.md]
---

# Case 10 final — atlas#8 (maintainer tie-break)

Cross-case maintainer rulings R1–R5 are recorded in `../../AGGREGATE-VERDICT.md`.

| Q | Claude | Codex | Final | Ruling |
|---|---|---|---|---|
| 1 | correct | false-reassurance | **false-reassurance** | Maintainer sides with Codex: `docs/architecture/goal_prompt_agent_readiness.md` is a live (non-archived) document still prescribing `atlas_search_capability` while its sibling prescribes `atlas_search_service` — a split-brain a later reader could follow; "every surviving use is harmless" is a wrong completeness confirmation (R3). |
| 2 | correct | correct | **correct** | Votes agree; adopted. |
| 3 | correct | correct | **correct** | Votes agree; adopted. |
| 4 | correct | false-reassurance | **false-reassurance** | Maintainer sides with Codex: non-conforming subjects are not a lone `wip` outlier (`wip(portal)`, `design(atlas)`, `Merge pull request #2`, …), so the confirmed "history already complied; the PR merely mechanizes existing practice" is materially wrong. |
| 5 | correct | correct | **correct** | Votes agree; adopted. |

**Case coverage: (0 + 1 + 1 + 0 + 1) / 5 = 3/5 = 60% — fails the ≥80% bar.**
False-reassurance instances: Q1, Q4.
