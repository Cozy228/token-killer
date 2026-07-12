---
packet: 12
pr: czync/atlas#1
cutoff: 2026-05-12T17:01:51Z
merge_commit: dc5c20168e13a8a4cedf949bc39f9394d8a19984
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 12 (atlas#1)

**PR:** czync/atlas#1 — "Implement Atlas V1 context layer, infra plan, and guidance updates"
**Cutoff (UTC):** 2026-05-12T17:01:51Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `dc5c20168e13a8a4cedf949bc39f9394d8a19984` (base: main)

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
   `git worktree add --detach <tmp> dc5c20168e13a8a4cedf949bc39f9394d8a19984` in the atlas
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
6. **Output your vote** as `packets/votes/case-12-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, body (summary: context-layer
API surface — contracts, routes, resolvers, repositories, seeding, Lambda;
acceptance coverage + infra planning; refreshed AGENTS/CLAUDE/DESIGN/PRODUCT
+ shadcn skill bundle; testing section states "Not run (not requested)"),
247-file list by top dir (portal 138, context-layer 49, docs 22, .agents 13,
packages 7 — atlas-schema + atlas-acceptance, infra 4, root config ~14);
+46,643/−125.

**Protocol deviation (disclosed):** one git-history query ran during the
subject read, before questions were written — `git log --oneline dc5c2016^1`
(returned the base branch's 2 commit subjects: docs-only history, incl.
"implementation plan" and "architecture constraints"). Q2 and Q4 were shaped
with that knowledge. Logged here per README ruling #1's spirit; the panel
may discount those stems' pre-registration purity.

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The PR introduces a shared workspace package `packages/atlas-schema` alongside context-layer `contracts.ts`. At cutoff, which workspaces consume the shared schema, and is the topic/source data contract single-sourced or duplicated between portal and context-layer — a drift surface a reviewer must check? | yes |
| 2 | Ownership / routing | This founding PR converts a docs-only repo into 247 files in one merge. Pre-PR main carried an implementation plan with subgoals and do/don't rules. Can each major surface in the diff (context-layer API, portal app, infra plan, acceptance package) be traced to a recorded subgoal, or did the build exceed its written order? | yes |
| 3 | Verification-evidence | The body claims "expanded unit coverage" but states tests were "Not run (not requested)". What verification evidence existed at the 2026-05-12 cutoff — CI/checks on the head, any recorded run anywhere — and what does the acceptance package (`v1Acceptance.test.ts`) actually assert: runtime behavior or plan-conformance? | yes |
| 4 | Convention / decision-context | Pre-PR `constraints.md` demands every code change be checked against its constraints before committing. Sampling its hard constraints at cutoff (TypeScript-only runtime, data-model fields defined in `current_design.md` first, no V1 auth): does the merged tree comply, and does any record show the check actually happened? | yes |
| 5 | Delivery-requirements | "Infra planning" lands as TypeScript (`infra/src/atlasInfraPlan.ts` + test), not as IaC. What does the plan require for V1 deployment (Lambda, DynamoDB feedback table, hosting), and for each requirement is there deployable backing at cutoff (handler code, table design, any actual IaC or deploy script) — or is deployment entirely unrealized? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — is the shared contract single-sourced, and who consumes it?

**Operator's verbatim queries:**

```
head -30 packages/atlas-schema/src/index.ts   @dc5c2016
grep -rln "@atlas/schema" portal/src context-layer/src infra/src packages/*/src | dir-count
grep -n "@atlas/schema" portal/package.json context-layer/package.json atlas-acceptance/package.json
cat context-layer/src/contracts.ts ; cat portal/src/contracts.test.ts
```

**Operator's final answer (verbatim):**

Answer: single-sourced — one zod schema package is the contract for both
sides plus acceptance; contracts.ts is an alias, not a duplicate; no copied
response types were found on the portal side. The drift surface the question
posits does not exist at cutoff.

**Operator confidence label:** **confirmed**

---

### Q2 — does the 247-file founding diff trace to a written order?

**Operator's verbatim queries:**

```
git show dc5c2016^1:docs/architecture/implementation_plan.md  (489 lines; phase list, module table, commit strategy)
git ls-tree -r --name-only dc5c2016^1   → 10 files, docs-only
git log --format='%h %cI %s' dc5c2016^1..dc5c2016^2 ; git rev-list --count …  → 88
```

**Operator's final answer (verbatim):**

Answer: fully traceable — nothing in the diff exceeds the written order; each
surface implements a named phase of the pre-existing plan, and the commit
granularity follows the plan's own strategy. What collapsed is the review
granularity: the plan's 8 sequenced review units were delivered as a single
53-minute, 46k-line merge, so the written order governed the build but not
the review.

**Operator confidence label:** **confirmed**

---

### Q3 — what verification evidence existed at cutoff, and what does acceptance assert?

**Operator's verbatim queries:**

```
git ls-tree -r --name-only dc5c2016 -- .github/   → EMPTY
gh api 'repos/czync/atlas/actions/runs?head_sha=80fe220b' -q .total_count  → 0
gh api repos/czync/atlas/commits/dc5c2016/check-runs -q .total_count      → 0
sed -n '1,87p' packages/atlas-acceptance/src/v1Acceptance.test.ts
grep -rn "renderCapabilityDetail" portal/src  → views/portalViews.ts + its test only
```

**Operator's final answer (verbatim):**

Answer: zero verification evidence at cutoff — no CI existed, nothing ran on
the head, and the body affirmatively records that the authored test suite was
never executed. The acceptance package asserts the product loop's core rules
(governed bundle shape, citation-only answers, visible failure modes) but
in-process against seed data, with a stubbed LLM and a string-rendering stand-
in for the Portal — so even if someone had run it, it would prove plan
conformance of the logic, not the deployed experience. 46,643 lines merged on
an unexecuted test suite.

**Operator confidence label:** **confirmed** (sourced absence + body's own disclaimer)

---

### Q4 — do the pre-PR constraints hold in the merged tree, and was the check recorded?

**Operator's verbatim queries:**

```
git show dc5c2016^1:docs/architecture/constraints.md | grep -n -i "typescript|auth|field|first"
git ls-tree -r --name-only dc5c2016 | grep -E '\.(py|go|java|rb)$'   → EMPTY
grep -rn -i "login|signin|sso" portal/src context-layer/src   → false positives only (authority_level, aria-label)
grep -n "source_class|steward|authority_level" packages/atlas-schema/src/index.ts
git diff dc5c2016^1 dc5c2016^2 -- docs/architecture/constraints.md   (32 lines)
git log --format='%s' dc5c2016^1..dc5c2016^2 | grep -i "constraint"  → 0 hits
```

**Operator's final answer (verbatim):**

Answer: the merged tree complies with every sampled constraint — but the
constraint file was itself edited in-flight to agree with the implementation,
and no record distinguishes "checked against constraints" from "constraints
rewritten to match". Same self-amending-authority pattern as case 11 Q4, one
PR earlier: compliance is real, but the check is unrecorded and the yardstick
moved during the measurement.

**Operator confidence label:** **confirmed** (compliance sampled; sourced absence for the check)

---

### Q5 — what does the infra plan require, and is any of it deployable at cutoff?

**Operator's verbatim queries:**

```
head -60 infra/src/atlasInfraPlan.ts ; grep -n "terraform_files|aws_" infra/src/atlasInfraPlan.ts
grep -n "expect(" infra/src/atlasInfraPlan.test.ts
git ls-tree -r --name-only dc5c2016 | grep -E '\.tf$|cdk|serverless\.y|\.github'  → EMPTY
grep -rn "writeFile|fs\." infra/src/   → EMPTY ; grep -n scripts -A4 infra/package.json
ls context-layer/src/lambda/handler.ts portal/Dockerfile   → both exist
```

**Operator's final answer (verbatim):**

Answer: deployment is specified but unrealized — the "infra plan" is a typed,
tested description of infrastructure that nothing can apply: the HCL is
unreachable string data (no emitter, no .tf on disk, no deploy script, no CI).
The Lambda handler and container image are genuinely present, so the
deployable artifacts exist one layer below, but at cutoff there is no path
from the merged tree to running infrastructure except a human hand-copying
Terraform out of TypeScript string literals.

**Operator confidence label:** **confirmed**

---

