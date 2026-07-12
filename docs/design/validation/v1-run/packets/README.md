---
status: active
review_after: 2026-07-19
purpose: >
  Blind adjudication packets for the V0 WoZ stage-1 truth panel (protocol
  §7). Generated 2026-07-12 from the 12 operator scorecards, after all 12
  cases were operated and before any adjudication.
---

# Adjudication packets — v1 run

One packet per case (`case-NN.md`), self-contained: a fresh panel session
needs only the packet, the pinned repo clone, and the GitHub API.

## Packet-contents ruling (recorded at generation, before any vote)

Protocol §7 clause 2 gives the panel: the question, the PR, the admissible
source set, and the operator's final answer WITH its confidence label — but
not the operator's confidence rationale or private notes. §6/§7 also require
adjudication "against the operator's verbatim log" (what was actually
retrievable). Resolution applied here:

- **Included:** case metadata + cutoff + merge-commit pin; the operator's
  pre-question subject read; the 5 pre-registered questions with class +
  materiality; the operator's verbatim query lists; the operator's final
  answer paragraphs verbatim; the confidence label; any process/deviation
  note the operator explicitly disclosed to the panel (cases 1, 12).
- **Excluded:** the scorecards' "Evidence (cited)" sections — the operator's
  selection and interpretation of evidence. Panel members must do their own
  independent read of the admissible sources; providing the operator's
  evidence digest would anchor the very judgment (was the answer reachable
  and right?) the panel exists to make. Inline references to those sections
  (e.g. case 1's "flagged inline (⚠)") therefore point at material not in
  the packet — by design.

## How adjudication runs

1. **Two model votes per case, isolated.** Claude and Codex each score every
   packet in fresh sessions (no operator-session context, no sight of the
   other's vote; §7 clauses 1–3). Feed the session ONLY the packet file.
2. **Vote files:** `votes/case-NN-claude.md` and `votes/case-NN-codex.md`.
   Per question: score (`correct` / `abstained-correctly` / `partial` +
   fraction with enumerated sub-claims / `incorrect` / `false-reassurance`),
   plus a one-paragraph justification citing admissible evidence.
3. **Maintainer tie-break** only after both model votes for that question
   are recorded (§7); materiality of any false-reassurance candidate is the
   maintainer's final call. Record resolutions in `votes/case-NN-final.md`.
4. **Window:** operation completed 2026-07-12 → adjudication must close by
   **2026-07-19** (§7, 7 days).
5. **No aggregates until done.** No per-case %, no 9/12 tally, until all 60
   questions are scored (§7 anti-gaming rule). Aggregate verdict then goes
   in `../AGGREGATE-VERDICT.md` per §8/§9.

## Session integrity

The operator session (this one) generated these packets mechanically
(script: parse scorecards → strip Evidence sections) and does not vote.
Packets were not hand-edited after generation.
