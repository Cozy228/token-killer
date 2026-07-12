---
status: active
review_after: 2026-07-25
purpose: >
  V1 operator-run working directory for the frozen V0 WoZ stage-1 protocol
  (docs/design/validation/V0-WOZ-PROTOCOL.md, frozen 2026-07-11, P41).
  Contains per-case operator scorecards (verbatim query logs) and, after the
  operation completes, blind adjudication packets for the truth panel.
---

# V1 run — operator session record

- **Run started:** 2026-07-11
- **Operator:** one Claude session (model-assisted, per protocol §10). The same
  session operates all 12 cases (§6 "one operator, one session"). This session
  will NOT adjudicate; panel votes run in fresh isolated sessions (§7 clause 1).
- **Case set:** the 12 PRs locked in protocol Appendix A. All cutoffs are
  merge-timestamp fallbacks (§10 limitation).

## Operational rulings (recorded before any case ran)

1. **Reading the PR itself is not a source query.** A reviewer at first review
   has the diff, title, and description in front of them; the operator reads
   these to write the 5 question stems. "Source queries" (§6) are queries into
   git history / code / docs / decision log / CI issued to ANSWER a question,
   and none run before that case's questions + materiality marks are written.
2. **No ctx anywhere in the operator path.** Protocol §6 bans ctx compiled
   answers; this run additionally avoids the `ctx` CLI wrappers (read/rg/tree)
   for source queries so every logged query is a plain reproducible
   git/grep/gh command.
3. **Cutoff enforcement:** each case pins a detached worktree at the PR's merge
   commit; code/doc/log reads run against that tree or `git show <sha>:path`.
   Git-history queries run against the merge commit's ancestry only. CI-record
   queries filter `created_at <= cutoff`. Anything newer is inadmissible.
4. **Memory discipline:** the operator model carries conversational memory
   about these repos, including post-cutoff knowledge. Mitigation: every
   answer must cite admissible evidence found by a logged query; a claim
   without a logged citation is not made. Where sources don't establish an
   answer, the operator abstains explicitly (§2: disclosed unknown ≠ failure).
5. **No self-scoring.** Scorecards record answers + confidence labels
   (confirmed / partial / abstained) only. Coverage %, per-question scores,
   and the 9/12 tally are computed by the panel after ALL adjudication (§7).

## Case checklist (operator phase)

- [x] Case 1 — token-killer#90 (operated 2026-07-12; 3 falsified extrapolations corrected from real queries, see scorecard note)
- [x] Case 2 — token-killer#89 (operated 2026-07-12)
- [x] Case 3 — token-killer#87 (operated 2026-07-12)
- [x] Case 4 — token-killer#57 (operated 2026-07-12)
- [x] Case 5 — token-killer#47 (operated 2026-07-12)
- [x] Case 6 — token-killer#53 (operated 2026-07-12)
- [x] Case 7 — token-killer#52 (operated 2026-07-12)
- [x] Case 8 — token-killer#51 (operated 2026-07-12)
- [x] Case 9 — atlas#18 (operated 2026-07-12)
- [x] Case 10 — atlas#8 (operated 2026-07-12)
- [x] Case 11 — atlas#2 (operated 2026-07-12; Q5 premise corrected: handoff doc is a revert record, not a demo runbook)
- [x] Case 12 — atlas#1 (operated 2026-07-12; one pre-question git-history query disclosed as protocol deviation in the scorecard)

Scorecards: `case-NN-<repo>-<pr>.md`. Blind packets (generated after all 12
cases complete, before any adjudication): `packets/`.
