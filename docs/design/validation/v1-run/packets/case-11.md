---
packet: 11
pr: czync/atlas#2
cutoff: 2026-05-21T14:19:15Z
merge_commit: ee26e4f2afbaaca2de95bfc7b91420361388d1dc
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 11 (atlas#2)

**PR:** czync/atlas#2 — "Codex atlas v1 implementation"
**Cutoff (UTC):** 2026-05-21T14:19:15Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `ee26e4f2afbaaca2de95bfc7b91420361388d1dc` (base: main)

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
   `git worktree add --detach <tmp> ee26e4f2afbaaca2de95bfc7b91420361388d1dc` in the atlas
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
6. **Output your vote** as `packets/votes/case-11-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title (a Codex-built v1
implementation), EMPTY body, 60-file list (portal/src 49 — availability API
+143, matrix-view +215, status-dot, a +188-line render-cost debug test;
docs/product business_value +432 and guidance_design +87; DESIGN.md font
migration IBM Plex → system; Dockerfile +1; demo handoff doc +109).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The new server-side `availability.ts` API and the `matrix-view` component land together with a dedicated render-cost DEBUG test (+188 lines). Which routes/components consume the availability API at cutoff, and does the debug test record a known scale/perf risk for the matrix that a reviewer should treat as a constraint? | yes |
| 2 | Ownership / routing | This is a model-built (Codex) implementation. What recorded design authority existed at cutoff for it to implement against (DESIGN.md, docs/product/*), and can a reviewer trace the v1 scope to a written source, or was the scope only in the (empty-bodied) PR itself? | yes |
| 3 | Verification-evidence | What automated verification existed at the 2026-05-21 cutoff — did ANY CI workflow exist in the repo (the CI pipeline PR #8 is dated a month later), did any checks run on this PR's head, and what do the in-PR tests (matrix-view, status-dot) actually assert? | yes |
| 4 | Convention / decision-context | The PR edits DESIGN.md (IBM Plex → system font) in the same change-set that implements UI against it. Was DESIGN.md the recorded design authority at cutoff, and does any recorded process govern changing the authority doc alongside the implementation — or is self-amending the spec unregulated here? | yes |
| 5 | Delivery-requirements | A demo handoff doc (`docs/demo_skills_routes_handoff.md`, +109) ships in-PR alongside a Dockerfile tweak. What does that handoff doc require to actually run/demo the thing, and is each requirement satisfied by the merged tree at cutoff (scripts exist, routes exist, container builds plausible)? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — availability API consumers + does the debug test record a constraint?

**Operator's verbatim queries:**

```
grep -rn "fetchAvailability|availabilityQuery" portal/src (ts/tsx, excl. server file) @ee26e4f2
grep -rn "MatrixView" portal/src | grep -v matrix-view.t
sed -n '1,190p' portal/scripts/measure-availability-render-cost.debug.test.tsx
grep -n debug portal/package.json
grep -rln "render cost|PERF-availability" docs/ portal/ (*.md)  → EMPTY
```

**Operator's final answer (verbatim):**

Answer: consumers are four routes through one shared TanStack Query
(`["availability"]`) — the matrix route renders it, the catalog and guidance
routes preload it. The debug test is a measurement harness, not a recorded
constraint: it encodes the anticipated scale (dense ~300-cell matrix) but
asserts nothing, is excluded from `pnpm test`, and no threshold or measured
number is written down anywhere. A reviewer inherits the author's perf
*concern* but no perf *contract*.

**Operator confidence label:** **confirmed**

---

### Q2 — what design authority could a Codex build trace to at cutoff?

**Operator's verbatim queries:**

```
git ls-tree --name-only dc5c2016 ; git ls-tree -r --name-only dc5c2016 -- docs/
git diff --stat dc5c2016 3b17ebf3 -- docs/ DESIGN.md AGENTS.md README.md
git show dc5c2016:docs/product/atlas_v1_design_status_snapshot.md | head -40
git grep -n -i "availability|matrix" dc5c2016 -- docs/ PRODUCT.md DESIGN.md
git show dc5c2016:AGENTS.md | head -30 ; git show dc5c2016:CLAUDE.md
```

**Operator's final answer (verbatim):**

Answer: traceable — the v1 scope existed in writing before the PR: the
availability matrix is implemented against `catalog_design.md` and its HTML
prototype, and overall v1 scope against implementation_plan.md and the
design-status snapshot. The empty PR body means the PR adds no scope record
of its own, but a reviewer can trace every major surface in the diff to a
pre-existing spec document rather than to the maintainer's memory.

**Operator confidence label:** **confirmed**

---

### Q3 — what automated verification existed at the 2026-05-21 cutoff?

**Operator's verbatim queries:**

```
git ls-tree -r --name-only ee26e4f2 -- .github/   → EMPTY
gh api repos/czync/atlas/pulls/2  (head sha, created_at, merged_at)
gh api repos/czync/atlas/commits/ee26e4f2/check-runs -q .total_count   → 0
gh api 'repos/czync/atlas/actions/runs?head_sha=3b17ebf3'  -q .total_count → 0
grep -c "expect(" matrix-view.test.ts status-dot.test.tsx availability-row-model.test.ts
sed -n '1,60p' portal/src/components/explore/matrix-view.test.ts ; cat status-dot.test.tsx
```

**Operator's final answer (verbatim):**

Answer: no automated verification existed — no workflows, no checks, no runs
on this PR's head; merge followed PR creation by 10 seconds. Verification, if
any, was local and unrecorded (the body is empty, so not even a "green
locally" claim exists). The in-PR suite is thin and mixed: real logic
coverage for the row model and status dot, but the matrix component's only
test is a source-string containment check, and the perf harness (Q1) asserts
nothing.

**Operator confidence label:** **confirmed** (sourced absence for CI; test content confirmed)

---

### Q4 — is DESIGN.md the recorded authority, and is self-amending it regulated?

**Operator's verbatim queries:**

```
git diff dc5c2016 3b17ebf3 -- DESIGN.md | grep "^[-+].*Plex|font|system"
git grep -n "DESIGN.md" ee26e4f2 -- '*.md' '*.json' '*.ts' '*.tsx'
git show ee26e4f2:docs/README.md | head -50
git show ee26e4f2:docs/architecture/constraints.md | grep -n -i "design|font"
sed -n '12,20p' portal/src/styles/globals.css ; git show dc5c2016:portal/src/styles/globals.css | grep -n Plex
```

**Operator's final answer (verbatim):**

Answer: DESIGN.md functioned as the de-facto visual authority (the code
follows it before and after) but was NOT the recorded authority at cutoff —
the doc map omits it and the only cross-reference denies it exists. The
repo's recorded spec-first discipline (constraints #33/#52) covers
current_design.md only, so amending DESIGN.md alongside the implementation
that consumes it is unregulated: nothing at cutoff distinguishes "the spec
changed, code followed" from "the code changed, spec was rewritten to
agree".

**Operator confidence label:** **confirmed** (sourced absence for the process)

---

### Q5 — what does the demo handoff doc require, and does the merged tree satisfy it?

**Operator's verbatim queries:**

```
cat docs/demo_skills_routes_handoff.md
for f in contextApiConsumer.ts agentSkills.ts skill-install.ts
  portal/public/.well-known/agent-skills/index.json:  git cat-file -e ee26e4f2:$f
git ls-tree --name-only ee26e4f2 -- portal/src/routes/ | grep -i skill  → EMPTY
git diff dc5c2016 3b17ebf3 -- portal/Dockerfile ; grep -n packageManager package.json
git log --format='%h %cI %s' dc5c2016..3b17ebf3 -- docs/demo_skills_routes_handoff.md
```

**Operator's final answer (verbatim):**

Answer: the handoff doc requires nothing of the merged tree — by its own
declaration it describes code that is deliberately NOT in the tree. Checked
on its actual terms, it is accurate: every referenced demo/skills artifact is
verifiably absent at cutoff, so the doc and tree are consistent, and the
Dockerfile tweak is an unrelated, internally-consistent pnpm pin. What a
reviewer should take from it: the PR ships less than the branch once
contained, the revert is documented with a resume path, and nothing in the
doc is falsified by the tree.

**Operator confidence label:** **confirmed** (question premise corrected from the source)

---

