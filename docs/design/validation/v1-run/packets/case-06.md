---
packet: 6
pr: czync/token-killer#53
cutoff: 2026-06-17T17:38:12Z
merge_commit: 0e5cc1aaa01652e228ad91bcee6a69f773611033
base: feat/0.3.1
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 6 (token-killer#53)

**PR:** czync/token-killer#53 — "perf(inspect): single-pass scan + habits over one JSON.parse"
**Cutoff (UTC):** 2026-06-17T17:38:12Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `0e5cc1aaa01652e228ad91bcee6a69f773611033` (base: feat/0.3.1)

## Instructions to the panel member (read fully before scoring)

You are one vote on the truth panel of the V0 WoZ stage-1 protocol
(`docs/design/validation/V0-WOZ-PROTOCOL.md`, frozen 2026-07-11). You are
adjudicating in a FRESH session, independent of the operator session and of
the other panel member. Rules that bind you:

1. **Blindness.** Do NOT read the operator scorecards
   (`docs/design/validation/v1-run/case-*.md`), the v1-run README checklist
   notes, or any other packet's votes before casting yours. This packet is
   your only operator-derived input. Do not consult `ctx` or any compiled
   artifact.
2. **Admissibility (§3).** Only evidence existing at or before the cutoff
   above is admissible. Pin your reads:
   `git worktree add --detach <tmp> 0e5cc1aaa01652e228ad91bcee6a69f773611033` in the token-killer
   clone; history queries only on that commit's ancestry; GitHub API
   records filtered `created_at <= cutoff`. The realized post-merge outcome
   of the PR is inadmissible for the knowability judgment.
3. **Your job per question:** against your OWN independent read of the
   admissible sources plus the operator's verbatim queries below, judge:
   (a) was the operator's final answer correct? (b) was the answer (or a
   better one) reachable from admissible sources? (c) does any confident
   claim in the answer turn out wrong — if so, on a material question,
   apply the false-reassurance test (§2).
4. **Scoring rubric (§7, fixed):** score each question exactly one of
   `correct` (1.0) · `abstained-correctly` (0, never a kill trigger) ·
   `partial` (fraction = correctly-backed material sub-claims ÷ required
   material sub-claims; enumerate the sub-claims) · `incorrect` (0) ·
   `false-reassurance` (wrong AND presented as confirmed/safe/complete on a
   material question — kill trigger).
5. **False reassurance (§2, verbatim intent):** a material question answered
   wrongly while presented as confirmed/safe/complete — a confident wrong
   answer that would have reassured the reviewer into an action the truth
   would have changed. A disclosed unknown ("sources do not establish X")
   is NOT a failure; a lazy abstention where the answer WAS reachable
   scores `incorrect`.
6. **Output your vote** as `packets/votes/case-06-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, full body (summary, what
changed, 4 checked acceptance criteria, tests, reviewer notes about sibling
overlap with #38/#46 on scan.ts, worker-threads deferral), 5-file list.
Operator carries case-5 context (sub-PR batch merged 17:38:12Z into
feat/0.3.1 with Node-22 check failures, 0 reviews).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | This PR widens `scan.ts` exports (mergeAcc, finishScan, Accumulator, ScanTotals, PROGRESS_LINE_STRIDE) and touches files that siblings #38 (cache routing) and #46 (progress degrade) also modify, all merging at the same timestamp into `feat/0.3.1`. Did the three sibling changes compose cleanly in the branch state at cutoff — does `inspectSinglePass` actually honor #38's cross-run cache routing and #46's progress behavior — and who consumes the widened exports? | yes |
| 2 | Ownership / routing | For the shared `src/inspect/scan.ts` surface, what does the branch history at cutoff show about how the three same-timestamp merges were sequenced and reconciled (merge order, conflict resolutions), i.e. which PR's edits "won" and who holds the context for that reconciliation? | yes |
| 3 | Verification-evidence | The body claims 4 checked acceptance criteria and 117 local tests. What was the CI state on THIS PR's head at the 17:38:12Z cutoff (case-5 evidence suggests Node-22 FAILURE on both OSes), and do the four acceptance criteria have named tests in `tests/unit/inspect/passes.test.ts` at cutoff (JSON.parse spy, byte-identical regression, warm-cache, no-worker-threads assert)? | yes |
| 4 | Convention / decision-context | The body defers worker-thread concurrency "for Windows ESM-URL/second-entry risk". Which recorded prior incident or decision establishes that risk (e.g. the PR#3 Windows ESM loader work), and is the no-worker-threads constraint recorded anywhere durable beyond this PR body? | yes |
| 5 | Delivery-requirements | `inspectSinglePassAsync` ships tested but NOT wired into the CLI. What must still happen for users to get the AV-overlap benefit, is there a recorded follow-up to wire it, and does shipping an unwired exported function violate any repo gate (test-presence / dead-code checks) at cutoff? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — sibling composition + export consumers

**Operator's verbatim queries:**

```
git log --format='%h %cI %p %s' 0e5cc1aa | head -12       (merge topology)
grep -n "inspectSinglePass|scanCached|extractCache" src/inspect/cli.ts (@0e5cc1aa)
grep -rn "mergeAcc|finishScan|PROGRESS_LINE_STRIDE" src/ (excl. scan.ts)
git log -1 --format='%h %cI %p %s' 8de065d1 ; git merge-base --is-ancestor …
```

**Operator's final answer (verbatim):**

Answer: the three sibling changes compose cleanly and by design rather
than by luck — single-pass owns the unfiltered path, #52 (merged minutes
later on top) owns the filtered path, and #46's stride constant is
consumed by the new passes module. The widened exports have exactly one
consumer (passes.ts). One honest caveat: the combined branch state was
only exercised by CI at the aggregate level (see Q3/case-5 Q2), not per
pairwise combination.

**Operator confidence label:** **confirmed**

---

### Q2 — how the same-timestamp merges were actually sequenced

**Operator's verbatim queries:**

```
git log --format='%h %cI %p %s' 0e5cc1aa | head -12
git log --all --format='%h %cI %s' --grep="#38"
```

**Operator's final answer (verbatim):**

Answer: the reconciliation context lives with the maintainer alone: the
nine PRs were merged locally in a deliberate order (this PR second-to-
last, its filtered-path sibling #52 last, on top of it) and pushed as one
batch. No conflict-resolution commits appear between them — the merges
are clean — and no reviewer other than the merger exists in the record.

**Operator confidence label:** **confirmed**

---

### Q3 — CI truth at cutoff vs the checked acceptance boxes

**Operator's verbatim queries:**

```
gh api repos/czync/token-killer/pulls/53 -q .head.sha   → 34b8acbc
gh api 'repos/…/actions/runs?head_sha=34b8acbc'
gh pr view 53 --json statusCheckRollup (per-check, from case-5 log)
grep -n 'test(|worker' tests/unit/inspect/passes.test.ts (@0e5cc1aa)
```

**Operator's final answer (verbatim):**

Answer: the acceptance criteria are genuinely test-backed — the four
named tests exist and encode exactly the claimed properties. But the
PR-level verification claim fails at cutoff: this PR's head ran RED in
CI (both Node-22 jobs) and was merged anyway; only the later aggregate
branch-tip run (case 5) came back green. A reviewer at this PR's merge
moment had a red check staring at them.

**Operator confidence label:** **confirmed**

---

### Q4 — provenance of the "no worker threads" constraint

**Operator's verbatim queries:**

```
grep -rn "worker|pathToFileURL|ESM" docs/ plans/ (@0e5cc1aa)   → no durable record
gh issue view 39 --json createdAt,body   → created 2026-06-17T16:58:54Z (pre-cutoff)
grep -n worker tests/unit/inspect/passes.test.ts
```

**Operator's final answer (verbatim):**

Answer: the constraint IS recorded pre-cutoff — in issue #39's text and
enforced by a static test — but its underlying incident ("Windows
ESM-URL/second-entry risk") has no in-tree record at cutoff; a reviewer
can cite the rule, not its evidence. Sources establish where the rule
lives, not why it's true.

**Operator confidence label:** **confirmed** (with the provenance gap stated as the finding)

---

### Q5 — the unwired async variant's path to users

**Operator's verbatim queries:**

```
grep -rn "inspectSinglePassAsync" src/ tests/ (@0e5cc1aa)  → passes.ts + its test only
head -12 scripts/check-test-presence.sh
gh issue view 39 --json body (acceptance items)
```

**Operator's final answer (verbatim):**

Answer: users get no AV-overlap benefit until someone wires
`inspectSinglePassAsync` into `runInspect` (an async ripple through 3
callers, per the body). That gap is recorded as optional in issue #39,
violates no repo gate, and has no dedicated follow-up item at cutoff —
so the only tracker of this latent capability is the closed issue's
optional checkbox.

**Operator confidence label:** **confirmed**

---

