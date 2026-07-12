---
packet: 9
pr: czync/atlas#18
cutoff: 2026-06-30T18:00:33Z
merge_commit: 6e9a4bdc125519b836c9bd7f4595f8b255390517
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 9 (atlas#18)

**PR:** czync/atlas#18 — "feat(atlas): 0.2.0 — resource-first portal, dev mock/live seam, zero-download E2E"
**Cutoff (UTC):** 2026-06-30T18:00:33Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `6e9a4bdc125519b836c9bd7f4595f8b255390517` (base: main)

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
   `git worktree add --detach <tmp> 6e9a4bdc125519b836c9bd7f4595f8b255390517` in the atlas
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
6. **Output your vote** as `packets/votes/case-09-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, body (integration branch for
0.2.0, "opened to run full CI — cross-OS E2E matrix + prod-build smoke, only
validated locally so far", hardening list: warmup global-setup, DEV_MOCKS
strict 1/0 + NODE_ENV prod gate, /releases mock, /whatsnew SSR hydration,
a11y baseline, root README), top-dir distribution (349 files; GitHub file API
sample dominated by context-layer/src; root README/DESIGN/CONTEXT touched).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The dev mock/live seam (`DEV_MOCKS` strict `1`/`0`, `NODE_ENV` prod gate) decides whether the portal serves mock data. Where exactly is the production gate implemented at cutoff, what happens in a prod build if `DEV_MOCKS=1` leaks into the environment, and which surfaces (badge, routes like /releases) depend on the seam? | yes |
| 2 | Ownership / routing | Root DESIGN.md/CONTEXT.md changed in this PR. What do the recorded design docs at cutoff say "resource-first portal" means and where was that direction decided — is 0.2.0's shape traceable to a recorded decision a reviewer can check the implementation against? | yes |
| 3 | Verification-evidence | The body admits the cross-OS E2E matrix + prod smoke were "only validated locally so far" and the PR exists to run them in CI. Did CI actually run and pass on this PR's head before the 18:00:33Z cutoff — and how does sibling PR#19 ("e2e CI green — drop video", merged 06:42Z same day) relate to this PR's CI status? | yes |
| 4 | Convention / decision-context | "Zero-download E2E" is in the title. What recorded constraint motivates zero-download (network policy, corporate environment, CI determinism), where is it written at cutoff, and what does the E2E setup do instead of downloading? | yes |
| 5 | Delivery-requirements | For 0.2.0 to be usable by its intended audience, what do the repo's own docs (README/CONTEXT/DESIGN at cutoff) require around deployment/serving, and is any doc-required piece (e.g. a deploy story, live-data wiring for /releases) missing from the merged state? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — can the mock seam leak into prod?

**Operator's verbatim queries:**

```
grep -rn DEV_MOCKS portal/ context-layer/ (excl. node_modules)
cat portal/server/devMocks/shouldMock.ts
sed -n '1,40p' portal/server/devMocks/start.ts
grep -n plugins portal/vite.config.ts
```

**Operator's final answer (verbatim):**

Answer: the production build cannot serve mocks by env leakage — mocking
requires a plugin that only `vite serve` registers, so `DEV_MOCKS=1` in
prod does nothing and the badge degrades to 'live'. The seam's blast
radius is confined to dev/E2E; the one subtlety (marker-vs-function as
source of truth) is documented in the code itself.

**Operator confidence label:** **confirmed**

---

### Q2 — is 0.2.0's shape traceable to a recorded decision?

**Operator's verbatim queries:**

```
grep -rn -i "resource-first" README.md DESIGN.md CONTEXT.md PRODUCT.md plans/ docs/
head -10 docs/adr/0015-portal-resource-first-ia.md
```

**Operator's final answer (verbatim):**

Answer: fully traceable — the resource-first pivot has an accepted ADR
(0015) with dates, supersession links to the three ADRs it revises, a
grilling record, and a dedicated execution plan; the root context doc
cites it. A reviewer can diff the implementation against ADR-0015's
target model directly. (Notably stronger recording practice than the
token-killer cases, where equivalents lived in code comments.)

**Operator confidence label:** **confirmed**

---

### Q3 — did the CI this PR exists for actually pass pre-cutoff?

**Operator's verbatim queries:**

```
gh api repos/czync/atlas/pulls/18 -q .head.sha        → b65bc3a3
gh api 'repos/czync/atlas/actions/runs?head_sha=b65bc3a3'
gh pr view 19 -R czync/atlas --json baseRefName,mergedAt,body
```

**Operator's final answer (verbatim):**

Answer: yes — the declared purpose of the PR was fulfilled before merge:
the head's CI run, including the previously-local-only E2E matrix,
completed green 75s before cutoff, after a same-day dedicated CI-fix
loop (PR#19) had cleared the ffmpeg/video blocker on the branch.

**Operator confidence label:** **confirmed**

---

### Q4 — where "zero-download" is recorded and what it does instead

**Operator's verbatim queries:**

```
grep -rn -i "zero-download" docs plans README.md portal
(plan 026-e2e-browser-testing.md hits at :204, :259, :308, :316, :336)
```

**Operator's final answer (verbatim):**

Answer: instead of downloading browsers, E2E drives a system-installed
browser channel (`PW_CHANNEL` + per-OS defaults) under an explicit
no-download CI gate, all pre-registered in plan 026 with its own
acceptance gates. The constraint is a recorded, deliberate design with a
doctor/diagnostic companion — not an ad-hoc CI hack — and the video-drop
in PR#19 is its known cost.

**Operator confidence label:** **confirmed**

---

### Q5 — doc-required delivery completeness

**Operator's verbatim queries:**

```
grep -n -i "deploy|serve|releases" README.md ; grep -rn -i deploy CONTEXT.md
ls (root) — infra/ package present
```

**Operator's final answer (verbatim):**

Answer: within what the repo's own docs demand, 0.2.0 is
delivery-complete at cutoff: dev + prod-server paths documented and
working per CI smoke, the mock/live seam documented in README, releases
covered in the mock path. The live-Confluence path necessarily depends
on out-of-repo creds/deployment (infra config), which the docs assign to
`infra/` rather than to this PR.

**Operator confidence label:** **partial** (the sweep for "doc-required but missing" was

---

