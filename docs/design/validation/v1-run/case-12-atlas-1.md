---
case: 12
pr: czync/atlas#1
title: "Implement Atlas V1 context layer, infra plan, and guidance updates"
cutoff: 2026-05-12T17:01:51Z
cutoff_kind: merge-fallback
merge_commit: dc5c20168e13a8a4cedf949bc39f9394d8a19984
base: main
status: operated
---

# Case 12 — atlas#1

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

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The PR introduces a shared workspace package `packages/atlas-schema` alongside context-layer `contracts.ts`. At cutoff, which workspaces consume the shared schema, and is the topic/source data contract single-sourced or duplicated between portal and context-layer — a drift surface a reviewer must check? | yes |
| 2 | Ownership / routing | This founding PR converts a docs-only repo into 247 files in one merge. Pre-PR main carried an implementation plan with subgoals and do/don't rules. Can each major surface in the diff (context-layer API, portal app, infra plan, acceptance package) be traced to a recorded subgoal, or did the build exceed its written order? | yes |
| 3 | Verification-evidence | The body claims "expanded unit coverage" but states tests were "Not run (not requested)". What verification evidence existed at the 2026-05-12 cutoff — CI/checks on the head, any recorded run anywhere — and what does the acceptance package (`v1Acceptance.test.ts`) actually assert: runtime behavior or plan-conformance? | yes |
| 4 | Convention / decision-context | Pre-PR `constraints.md` demands every code change be checked against its constraints before committing. Sampling its hard constraints at cutoff (TypeScript-only runtime, data-model fields defined in `current_design.md` first, no V1 auth): does the merged tree comply, and does any record show the check actually happened? | yes |
| 5 | Delivery-requirements | "Infra planning" lands as TypeScript (`infra/src/atlasInfraPlan.ts` + test), not as IaC. What does the plan require for V1 deployment (Lambda, DynamoDB feedback table, hosting), and for each requirement is there deployable backing at cutoff (handler code, table design, any actual IaC or deploy script) — or is deployment entirely unrealized? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

Pinned to merge commit `dc5c2016`; cutoff 2026-05-12T17:01:51Z. Base (first
parent) `2add5ce2` — a 10-file docs-only tree; PR head `80fe220b` (88 commits).

### Q1 — is the shared contract single-sourced, and who consumes it?

Queries executed:

```
head -30 packages/atlas-schema/src/index.ts   @dc5c2016
grep -rln "@atlas/schema" portal/src context-layer/src infra/src packages/*/src | dir-count
grep -n "@atlas/schema" portal/package.json context-layer/package.json atlas-acceptance/package.json
cat context-layer/src/contracts.ts ; cat portal/src/contracts.test.ts
```

Evidence (cited):

- `@atlas/schema` (zod) is consumed by **36 context-layer files, 33 portal
  files, and the acceptance package**, each declaring `"@atlas/schema":
  "workspace:*"`. Infra consumes none (it is a plan module, no data contract).
- `context-layer/src/contracts.ts` is 3 lines — a pure re-export alias
  (`export type ContextLayerContract = ContextBundleResponse` from
  `@atlas/schema`), not a second definition.
- Portal has a dedicated boundary test (`portal/src/contracts.test.ts`)
  that parses a bundle through the shared `ContextBundleResponseSchema` —
  the portal side pins itself to the shared schema rather than local types.

Answer: single-sourced — one zod schema package is the contract for both
sides plus acceptance; contracts.ts is an alias, not a duplicate; no copied
response types were found on the portal side. The drift surface the question
posits does not exist at cutoff.

Confidence: **confirmed**.

### Q2 — does the 247-file founding diff trace to a written order?

Queries executed:

```
git show dc5c2016^1:docs/architecture/implementation_plan.md  (489 lines; phase list, module table, commit strategy)
git ls-tree -r --name-only dc5c2016^1   → 10 files, docs-only
git log --format='%h %cI %s' dc5c2016^1..dc5c2016^2 ; git rev-list --count …  → 88
```

Evidence (cited):

- Pre-PR main is 10 doc files, including the 489-line implementation plan:
  Phases 0–8 (workspace foundation → schema-first contract → repositories →
  anchor resolvers → context bundle API → portal core → Ask Atlas → infra &
  deployment path → V1 acceptance), a target module table naming
  `context-layer` / `portal` / `infra`, and a definition of done.
- Every major surface in the diff maps 1:1 to a phase: packages/atlas-schema
  (Phase 1), context-layer repositories/resolvers/bundle API (Phases 2–4),
  portal (Phases 5–6), infra/src/atlasInfraPlan.ts (Phase 7),
  packages/atlas-acceptance (Phase 8).
- The plan's "Commit and Review Strategy" (:450) prescribes "small, logically
  isolated commits" in 8 ordered units. The branch's 88 commits ARE small,
  conventional, and scoped (feat(portal)/feat(context-layer)/build/perf,
  sampled verbatim) — but all 88 arrived in ONE PR, opened 16:08:53Z and
  merged 17:01:51Z (53 minutes, self-merged).

Answer: fully traceable — nothing in the diff exceeds the written order; each
surface implements a named phase of the pre-existing plan, and the commit
granularity follows the plan's own strategy. What collapsed is the review
granularity: the plan's 8 sequenced review units were delivered as a single
53-minute, 46k-line merge, so the written order governed the build but not
the review.

Confidence: **confirmed**.

### Q3 — what verification evidence existed at cutoff, and what does acceptance assert?

Queries executed:

```
git ls-tree -r --name-only dc5c2016 -- .github/   → EMPTY
gh api 'repos/czync/atlas/actions/runs?head_sha=80fe220b' -q .total_count  → 0
gh api repos/czync/atlas/commits/dc5c2016/check-runs -q .total_count      → 0
sed -n '1,87p' packages/atlas-acceptance/src/v1Acceptance.test.ts
grep -rn "renderCapabilityDetail" portal/src  → views/portalViews.ts + its test only
```

Evidence (cited):

- No `.github/` in the merge tree; 0 workflow runs on head `80fe220b`; 0
  check runs on the merge commit. The PR body itself states: "Testing —
  Not run (not requested)." The only verification claim at cutoff is thus an
  explicit disclaimer of verification.
- The acceptance test is real behavioral code but **in-process and stubbed**:
  it calls `handleContextRequest()` directly (no HTTP/Lambda), stubs the LLM
  with an inline fake adapter, and asserts the citation-gating loop (1 claim
  accepted, 1 uncited claim rejected), bundle shape, and warning visibility.
- Its "Portal rendering" is a parallel path: `renderCapabilityDetail` /
  `renderLandingZoneNavigator` live in `portal/src/views/portalViews.ts`,
  exported via index.ts, and are consumed ONLY by their own test and the
  acceptance test — no route or component in the real TanStack UI uses them.

Answer: zero verification evidence at cutoff — no CI existed, nothing ran on
the head, and the body affirmatively records that the authored test suite was
never executed. The acceptance package asserts the product loop's core rules
(governed bundle shape, citation-only answers, visible failure modes) but
in-process against seed data, with a stubbed LLM and a string-rendering stand-
in for the Portal — so even if someone had run it, it would prove plan
conformance of the logic, not the deployed experience. 46,643 lines merged on
an unexecuted test suite.

Confidence: **confirmed** (sourced absence + body's own disclaimer).

### Q4 — do the pre-PR constraints hold in the merged tree, and was the check recorded?

Queries executed:

```
git show dc5c2016^1:docs/architecture/constraints.md | grep -n -i "typescript|auth|field|first"
git ls-tree -r --name-only dc5c2016 | grep -E '\.(py|go|java|rb)$'   → EMPTY
grep -rn -i "login|signin|sso" portal/src context-layer/src   → false positives only (authority_level, aria-label)
grep -n "source_class|steward|authority_level" packages/atlas-schema/src/index.ts
git diff dc5c2016^1 dc5c2016^2 -- docs/architecture/constraints.md   (32 lines)
git log --format='%s' dc5c2016^1..dc5c2016^2 | grep -i "constraint"  → 0 hits
```

Evidence (cited):

- Sampled hard constraints hold: TypeScript-only (#33 — no other runtime
  files anywhere); no V1 auth (#50-equivalent — every "auth" grep hit is
  `authority_level`/`authority_scope` vocabulary, no login/SSO surface);
  schema-first shared contract (#6/#36 — established in Q1); Source required
  fields (#11 — zod schema enforces `source_class`, `steward` min(1),
  `authority_scope` min(1), `authority_level` enum).
- But the PR **amends constraints.md itself (32 lines) and current_design.md
  (112 lines) in the same change-set** it implements against. Sampled
  amendments track the implementation: #8 gains `anchor_references` as a
  required bundle field (which the code returns), #28's rate-limit rule is
  softened to "If Portal provides hosted AI invocation…", #7 renames "access
  denied" → "source restricted".
- No record shows the prescribed pre-commit constraint check happened: zero
  of 88 commit messages mention constraints, and the PR body doesn't either.

Answer: the merged tree complies with every sampled constraint — but the
constraint file was itself edited in-flight to agree with the implementation,
and no record distinguishes "checked against constraints" from "constraints
rewritten to match". Same self-amending-authority pattern as case 11 Q4, one
PR earlier: compliance is real, but the check is unrecorded and the yardstick
moved during the measurement.

Confidence: **confirmed** (compliance sampled; sourced absence for the check).

### Q5 — what does the infra plan require, and is any of it deployable at cutoff?

Queries executed:

```
head -60 infra/src/atlasInfraPlan.ts ; grep -n "terraform_files|aws_" infra/src/atlasInfraPlan.ts
grep -n "expect(" infra/src/atlasInfraPlan.test.ts
git ls-tree -r --name-only dc5c2016 | grep -E '\.tf$|cdk|serverless\.y|\.github'  → EMPTY
grep -rn "writeFile|fs\." infra/src/   → EMPTY ; grep -n scripts -A4 infra/package.json
ls context-layer/src/lambda/handler.ts portal/Dockerfile   → both exist
```

Evidence (cited):

- The plan requires (as typed resource list): dynamodb-table, lambda-function,
  api-gateway, secrets-manager-secret, iam-role, portal-hosting, cloudwatch
  log group + metrics; it also encodes a forbidden-services list (sqs, step
  functions, opensearch, kendra, bedrock-kb) and per-environment secret refs.
- The Terraform exists only as **string literals inside the TS module**
  (`terraform_files[].content`, embedding `resource "aws_dynamodb_table"…`,
  `aws_lambda_function`, `aws_apigatewayv2` blocks). Not one `.tf` file exists
  in the tree, nothing in infra/src writes the strings to disk (no fs usage),
  and infra/package.json has only lint/typecheck/test scripts — no emit, no
  plan, no deploy. Its test asserts the in-memory plan's shape (resource
  ordering, forbidden exclusions, string containment of HCL).
- Partial real backing exists at the edges: `context-layer/src/lambda/
  handler.ts` (the code the plan's Lambda would run) and `portal/Dockerfile`
  (lambda-web-adapter image) are real; `docs/architecture/
  dynamodb_feedback_table.md` records the table key design.

Answer: deployment is specified but unrealized — the "infra plan" is a typed,
tested description of infrastructure that nothing can apply: the HCL is
unreachable string data (no emitter, no .tf on disk, no deploy script, no CI).
The Lambda handler and container image are genuinely present, so the
deployable artifacts exist one layer below, but at cutoff there is no path
from the merged tree to running infrastructure except a human hand-copying
Terraform out of TypeScript string literals.

Confidence: **confirmed**.
