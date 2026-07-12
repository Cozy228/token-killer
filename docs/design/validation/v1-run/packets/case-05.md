---
packet: 5
pr: czync/token-killer#47
cutoff: 2026-06-18T05:44:23Z
merge_commit: aab70754f77f1a6147e16104a6da20f3d00f9956
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 5 (token-killer#47)

**PR:** czync/token-killer#47 — "token-killer 0.3.1 (+ Windows dogfood follow-ups)"
**Cutoff (UTC):** 2026-06-18T05:44:23Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `aab70754f77f1a6147e16104a6da20f3d00f9956` (base: main)

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
   `git worktree add --detach <tmp> aab70754f77f1a6147e16104a6da20f3d00f9956` in the token-killer
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
6. **Output your vote** as `packets/votes/case-05-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, full body (0.3.1 scope +
dogfood follow-up tracker #38–#46 with priorities, all checkboxes unchecked),
36-file list. Size note: 36,386 of the 41,047 lines are two committed debug
reports (`reports/debug-2026061606…/07….md`, 18,193 lines each); functional
change ≈ 4.6k lines — floor unaffected.

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The hot-path `git status` handler is reworked for single-spawn (+158/-15) and a new hook "beacon" (src/hook/beacon.ts, +claude.ts/+copilot.ts touches) enters the per-prompt hook path for BOTH hosts. What do these two hot surfaces now do on every invocation on an end-user machine — extra writes, new files, new failure modes if the beacon file/dir is unwritable — and which callers depend on the old `git status` capture behavior? | yes |
| 2 | Ownership / routing | This PR merges branch `feat/0.3.1`, onto which sub-PRs #48–#56 landed the day before (same-timestamp batch). Were those sub-PRs individually CI-checked/reviewed before landing on the branch, and what does approving #47 actually re-verify — is there a recorded gate for the branch, or does the reviewer of #47 inherit ~4.6k lines re-reviewed from scratch? | yes |
| 3 | Verification-evidence | The body's tracker lists #45 HIGH and #44/#40/#41/#42 MEDIUM with ALL checkboxes unchecked. Which tracker items are actually resolved inside this branch at cutoff (file list suggests #40/#41/#42/#38/#39/#46 landed), which remain open, and was CI green on the head at or before the 05:44:23Z cutoff? | yes |
| 4 | Convention / decision-context | Two 18,193-line debug reports captured on the Windows tester box are committed into `reports/`. What recorded convention governs debug-report contents (the renderDebug scrubbing seam — paths, usernames, hostnames), and do these committed files comply with it? | yes |
| 5 | Delivery-requirements | Tracker item #45 (HIGH) demands: bump package.json → 0.3.1 AND a CI assert that baked `VERSION == package.json`. The diff shows package.json +1/-1 and scripts/test-install.sh +17. Is the full version-drift gate delivered and CI-wired at cutoff, and is anything else the dogfood report marks as ship-blocking still missing for a field 0.3.1? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — the two hot surfaces' new per-invocation behavior

**Operator's verbatim queries:**

```
sed -n '1,30p' src/hook/beacon.ts (@${S}) ; grep -n beacon src/hook/{claude,copilot}.ts
grep -n "spawn|probe|capture" src/handlers/git/status.ts ; sed -n '1,18p' same
```

**Operator's final answer (verbatim):**

Answer: on an end-user machine, default behavior adds NOTHING to the hook
wire (beacon off) and REMOVES a spawn from the `git status` hot path
(second capture only when fs probes say an op is in progress). Failure
modes are narrowed, not widened: beacon is additive-only when opted in;
the probes are read-only existsSync calls. No dependent callers found.

**Operator confidence label:** **confirmed**

---

### Q2 — what gate did the branch content actually pass

**Operator's verbatim queries:**

```
git log aab70754 --format='%h %s' -15        → aab70754 is a SQUASH of feat/0.3.1
gh pr view 53 / 50 --json reviews,statusCheckRollup,mergedAt
gh pr view 53 --json statusCheckRollup (per-check)
gh api …/actions/runs?head_sha=<pr47 head>
```

**Operator's final answer (verbatim):**

Answer: approving #47 is the ONLY real gate the aggregate passed —
the sub-PRs were individually unreviewed and partially red (Node 22
failures) when they landed on the branch. The final branch-tip CI run
(green, pre-cutoff) is what vouches for the merged state; a reviewer of
#47 inherits the full ~4.6k functional lines with no prior per-slice
review to lean on.

**Operator confidence label:** **confirmed**

---

### Q3 — tracker truth: which items are actually fixed at cutoff

**Operator's verbatim queries:**

```
(file list from PR diff, subject) ; gh issue view 38/40/42/45 --json state,closedAt
gh api …/actions/runs?head_sha=<pr47 head>
```

**Operator's final answer (verbatim):**

Answer: at cutoff the tracker is stale-pessimistic — all 9 items are
substantively resolved inside the PR (each with its artifact, most with
named tests), while the body's checkboxes and the GitHub issues still
read open. A reviewer trusting the body would think the follow-ups are
outstanding; a reviewer diffing the branch finds them done. CI on the
final head was green two hours before merge.

**Operator confidence label:** **confirmed**

---

### Q4 — committed debug reports vs the scrub convention

**Operator's verbatim queries:**

```
grep -n -B3 -A8 scrub src/debug/render.ts
grep -c "/Users/" reports/debug-20260616064120.md      → 2259
grep -n -m2 -B2 "/Users/ziyu" same                      → command-history table
grep -c cozyultra same                                  → 4
grep -c 'C:\\Users\\' same                              → 0
```

**Operator's final answer (verbatim):**

Answer: the only recorded scrubbing convention is `scrubHome`, and it is
field-scoped; the two 18k-line committed reports comply with its letter
but leak what it never covered — thousands of raw home-path command
strings and the tester machine name. There is no recorded
whole-document scrub requirement at cutoff for a reviewer to enforce;
the leak is real but violates no written rule that existed then.

**Operator confidence label:** **confirmed**

---

### Q5 — is the #45 version-drift gate complete

**Operator's verbatim queries:**

```
grep -n '"version"' package.json (@${S})            → "0.3.1"
grep -n -A8 VERSION scripts/test-install.sh         → Step 3b drift guard
grep -n test:install .github/workflows/ci.yml       → wired in CI
```

**Operator's final answer (verbatim):**

Answer: yes — the HIGH item is fully delivered at cutoff: version bumped,
drift assert written into test:install, and test:install wired in CI
(on the Node-22 matrix leg). Per the PR's own recorded prioritization,
no other item was ship-blocking for a field 0.3.1.

**Operator confidence label:** **confirmed**

---

