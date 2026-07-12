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

## Reusable vote-session launch prompt

Launch each vote in a FRESH session (new Claude Code conversation, or a new
Codex CLI run). One packet per session. Replace `NN` (01–12) and
`<claude|codex>` before sending. Votes stay uncommitted; the maintainer
commits after both model votes for a case are recorded.

```text
You are a truth-panel member for the V0 WoZ stage-1 adjudication
(P2 substrate viability). Your ONLY operator-derived input is this packet:

  docs/design/validation/v1-run/packets/case-NN.md   (repo: token-killer)

Read it fully and follow its embedded instructions exactly. Hard rules for
this session, in addition to the packet's:

1. Identity: you are the <claude|codex> vote. Work alone — no other model,
   agent, or person.
2. Blindness: do NOT open the operator scorecards
   (docs/design/validation/v1-run/case-*.md), the v1-run README,
   packets/votes/ (other votes), or any other packet. Do not use ctx or any
   compiled artifact. Treat recalled memory or prior knowledge about these
   repos as INADMISSIBLE: every claim in your vote must cite evidence you
   retrieved in THIS session via a logged query against the pinned sources.
3. Sources: clones at /Users/ziyu/Workspace/token-killer and
   /Users/ziyu/Workspace/atlas. Pin a detached git worktree at the packet's
   merge commit exactly as the packet instructs; run all file/history reads
   against it. GitHub API queries must filter created_at <= the packet's
   cutoff. Anything newer is inadmissible.
4. Score all 5 questions with the packet's rubric (correct /
   abstained-correctly / partial + fraction with enumerated sub-claims /
   incorrect / false-reassurance). Then write EXACTLY ONE file:
     docs/design/validation/v1-run/packets/votes/case-NN-<claude|codex>.md
   Format: frontmatter (case, voter, date), then one section per question
   with the score and a one-paragraph justification citing the admissible
   evidence you checked (file:line or exact command). Write the file in
   English.
5. Do not compute any per-case percentage or aggregate. Do not modify any
   other file. Do not git commit or push. Remove your temporary worktree
   when done, and end by stating only which file you wrote.
```

Launch notes: for Claude, start the session in the token-killer repo so the
packet path resolves; the session may reply in chat per its own rules — only
the vote file's content is protocol output. For Codex, pass the same text as
the task prompt; Codex must also respect the no-commit rule (its runtime
cannot commit in linked worktrees anyway).
