---
packet: 3
pr: czync/token-killer#87
cutoff: 2026-07-08T09:01:09Z
merge_commit: f8b0f67dfdb6614e4411a7286ffd559c5595b2e9
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 3 (token-killer#87)

**PR:** czync/token-killer#87 — "chore: raise Node minimum to 22.18"
**Cutoff (UTC):** 2026-07-08T09:01:09Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `f8b0f67dfdb6614e4411a7286ffd559c5595b2e9` (base: main)

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
   `git worktree add --detach <tmp> f8b0f67dfdb6614e4411a7286ffd559c5595b2e9` in the token-killer
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
6. **Output your vote** as `packets/votes/case-03-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, empty body, 22-file list,
hunks for ci.yml (matrix 20/22 → 22.18.0/24/26; removed the "build needs
tsdown >=22.18 but runtime target is node20" comment + the `if: node==22`
install guard), package.json (engines >=20 → >=22.18.0; packageManager pnpm
10.34.3 → 11.10.0; devDeps refresh incl. @types/node 25→22.18), executor.ts
(TextDecoder type spelling), plus .nvmrc/.node-version/docs touches.

**Floor note:** raw size 2533 lines/22 files includes 2394 lockfile lines
(pnpm-lock 960+605, server/pnpm-lock 339+490). Excluding lockfiles: ~139
lines across 20 files — still above the ≥40-line/≥3-file floor. No
replacement triggered.

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | Raising `engines` from `>=20` to `>=22.18.0` cuts off Node 20 and 22.0–22.17 machines. Which in-repo surfaces encode a Node floor (install docs, doctor/install checks, hook launch paths, dist build target, server Dockerfile, tester guides), does the PR update every one of them, and what still says "Node 20" (or another floor) after this change? | yes |
| 2 | Ownership / routing | What prior decision set the previous floor (`>=20` with dist `target: node20`), and where is the 20→22.18 raise's rationale recorded — decision log entry, ADR, commit message, or only the deleted CI comment about tsdown requiring 22.18? Who/what does a reviewer consult to confirm the floor raise is intended product policy rather than build-tool convenience? | yes |
| 3 | Verification-evidence | Does CI at cutoff actually exercise the new minimum — 22.18.0 on BOTH OSes including the previously-gated install/dist steps (the `if: node==22` guard was removed) — and was that run green at or before the cutoff? | yes |
| 4 | Convention / decision-context | The deleted ci.yml comment records a deliberate build-vs-runtime split: build needs tsdown ≥22.18, but the shipped artifact kept `target: node20` so Node-20 users stay supported. Does any other record (tsdown.config, docs, decisions) confirm that split as policy, and does this PR change the dist target too — i.e., is the collapse of the split acknowledged anywhere? | yes |
| 5 | Delivery-requirements | For the installed field, what must accompany an engines raise so existing Node-20/22.x users fail loudly and correctly (pnpm engine-strict behavior, install-script guards, doctor message, INSTALL.md, .nvmrc/.node-version, WINDOWS-TESTER-GUIDE, pnpm 11 packageManager pin) — which of these does the PR ship and which are missing? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — floor touchpoints: updated vs stale

**Operator's verbatim queries:**

```
grep -rn ">=20|Node 20|node20" (pinned tree, md/json/mjs/sh/ts, excl. node_modules)
grep -n -i node docs/INSTALL.md ; grep -n target tsdown.config.mjs
grep -n FROM server/app/Dockerfile ; cat .nvmrc .node-version
gh pr diff 87 | sed -n '/plans\/001/,/^diff/p'
```

**Operator's final answer (verbatim):**

Answer: the load-bearing surfaces (engines, dist target, install doc,
version files, Dockerfile, tester guide, CI matrix) all moved to 22.18
in-PR. Two human-facing stragglers remain at cutoff — the plans/001 CI
matrix line and the leader-report's "Node 20+" adopter requirement — the
latter matters because it's the document pitched at deciders of the install
base. Nothing in `src/` gates on a Node version at runtime (see Q5).

**Operator confidence label:** **confirmed**

---

### Q2 — where the floor decisions are recorded

**Operator's verbatim queries:**

```
git log -1 --format='%B' f8b0f67d                     → bare title, no body
git log --format='%h %cI' -1 86e99e14                 → 2026-07-08T12:42Z = POST-cutoff
git show 41ae71f8:FABLE-DECISION-LOG.md | grep -n "P10 —"   (pre-cutoff copy)
git log f8b0f67d --grep="node|engines" -i -- package.json
```

**Operator's final answer (verbatim):**

Answer: a reviewer CAN reconcile "≥22 is intended policy" against P10 in
the decision log (reachable pre-cutoff, though only on the unmerged
feat/1.0.0 branch — same reachability caveat as case 1). What has NO record
anywhere is the jump from policy "≥22" to exactly "22.18.0" for the
RUNTIME floor: the only written trace is the deleted comment stating it as
a build-tool requirement. The maintainer (sole author) is the routing
target for that gap.

**Operator confidence label:** **confirmed**

---

### Q3 — does CI exercise the new floor, green at cutoff?

**Operator's verbatim queries:**

```
gh api repos/czync/token-killer/pulls/87 -q .head.sha
gh api 'repos/…/actions/runs?head_sha=<head>'   → 2 runs:
  created=2026-07-08T09:01:00Z updated=09:03:58Z success
  created=2026-07-08T09:01:11Z updated=09:03:53Z success
```

**Operator's final answer (verbatim):**

Answer: the PR itself installs exactly the right verification (minimum
pinned as a matrix entry on both OSes, install/dist smoke un-gated), but
the green verdict for THIS PR's head materialized ~3 minutes after merge.
At cutoff a reviewer could verify the workflow design, not a green run.

**Operator confidence label:** **confirmed**

---

### Q4 — the build-vs-runtime split: recorded, and knowingly collapsed?

**Operator's verbatim queries:**

```
gh pr diff 87 (ci.yml hunk — the deleted comment)
grep -n target tsdown.config.mjs (@${S})
git show "${S}^:tsdown.config.mjs" | grep -n target
git show 41ae71f8:FABLE-DECISION-LOG.md | grep -n -A3 "P10 —"
```

**Operator's final answer (verbatim):**

Answer: yes, the split was deliberately recorded (in the very comment the
PR deletes), and the PR knowingly collapses it — dist target, engines, and
CI floor move together, which is the coherent way to do it. The recorded
authorization is P10's ≥22 substrate decision; the residual unrecorded
delta is again the 22.18 specificity (see Q2). Nothing contradicts a
standing decision; D33's Node-20 machine concern was explicitly retired by
P10.

**Operator confidence label:** **confirmed**

---

### Q5 — does the install base fail loudly and correctly?

**Operator's verbatim queries:**

```
grep -n -i "node|version" src/shim/doctor.ts        → no node-version check
ls .npmrc → absent ; grep -n engine package.json    → engines block only
grep -rn "process.version" src/ → (no runtime floor gate found)
cat .nvmrc .node-version → 22.18.0
```

**Operator's final answer (verbatim):**

Answer: the passive delivery set is complete (engines + version files +
docs + Docker + CI), but the ACTIVE guards are absent: no engine-strict
pin, no doctor check, no runtime version gate. For a distributed field
where install-time engine warnings are routinely ignored, the failure mode
for under-floor Nodes is an unguided runtime error. That gap is the
material delivery item this PR does not carry.

**Operator confidence label:** **confirmed**

---

