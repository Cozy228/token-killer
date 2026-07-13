---
case: 12
voter: claude
date: 2026-07-12
---

# Case 12 (atlas#1) — claude vote

All reads pinned to a detached worktree at merge commit
`dc5c20168e13a8a4cedf949bc39f9394d8a19984` (parents ^1 base `2add5ce2`,
^2 head `80fe220b`). GitHub API records confirmed `created_at <= cutoff`
(cutoff = 2026-05-12T17:01:51Z = the merge itself).

## Q1 — is the shared contract single-sourced, and who consumes it?

**Score: correct (1.0)**

Independently verified. `packages/atlas-schema/src/index.ts:55-280` is the
single zod source of truth (SourceSchema, TopicSchema,
ContextBundleResponseSchema, etc. plus inferred types). Three workspaces
declare it as a dependency — `context-layer/package.json:21`,
`portal/package.json:31`, `packages/atlas-acceptance/package.json:14`
(all `@atlas/schema: workspace:*`); infra does not consume it. The
`context-layer/src/contracts.ts` file is a two-line re-export
(`import type { ContextBundleResponse } from "@atlas/schema"; export type
ContextLayerContract = ContextBundleResponse;`) — an alias, not a duplicate.
`portal/src/contracts.test.ts:2` imports `ContextBundleResponseSchema` from
`@atlas/schema` and parses against it. A sweep of portal-local
`export type/interface`/`z.object` declarations returned only UI-component
prop types (ComponentProps<...>), route-tree gen types, ask-flow types, and a
display-only `WarningCategory` union — no re-declaration of the
topic/source/bundle/anchor/warning data contract. The operator's answer
("single-sourced; contracts.ts is an alias; no copied response types on the
portal side; the posited drift surface does not exist") matches the evidence.

## Q2 — does the 247-file founding diff trace to a written order?

**Score: correct (1.0)**

Verified. `git show dc5c2016^1:docs/architecture/implementation_plan.md` (489
lines) enumerates Phase 0 Workspace Foundation, Phase 1 Schema-First API
Contract, Phases 2-4 Context Layer data model / anchor resolver / bundle API,
Phases 5-6 Portal Core + Ask Atlas, Phase 7 Infrastructure, Phase 8 V1
Acceptance — plus a "Commit and Review Strategy" listing the same 8 units. The
diff's four named surfaces each map to a phase: context-layer API → P2-4,
portal app → P5-6, infra plan → P7, acceptance package → P8 (schema → P1,
foundation → P0). Base tree (`git ls-tree -r --name-only dc5c2016^1`) is 10
docs-only files; `git rev-list --count dc5c2016^1..dc5c2016^2` = 88 commits;
merge is a single 2-parent commit. The "53-minute" review-collapse claim is
correct read as the PR open→merge window: `gh api repos/czync/atlas/pulls/1`
gives created_at 2026-05-12T16:08:53Z, merged_at 2026-05-12T17:01:51Z = 52m58s
(both ≤ cutoff), 88 commits / +46,643 / 247 files — while the 88 commits were
authored across 2026-05-06..05-13. So the written order governed the build but
the eight sequenced review units collapsed into one merge, exactly as stated.
The non-plan additions (root guidance-doc refresh, .agents/skills bundle) are
tooling/"guidance updates," not one of the four material surfaces the question
enumerates; all four trace cleanly. Correct.

## Q3 — what verification evidence existed at cutoff, and what does acceptance assert?

**Score: correct (1.0)**

Verified on all legs. Zero CI: `git ls-tree -r --name-only dc5c2016` contains
no `.github/` or workflow files anywhere; `gh api
.../actions/runs?head_sha=80fe220b...` total_count 0; check-runs on both the
merge commit and head 80fe220b total_count 0. The body's "Not run (not
requested)" disclaimer (per the packet's subject read) is thus the only status.
`packages/atlas-acceptance/src/v1Acceptance.test.ts` (87 lines) calls
`handleContextRequest(...)` in-process against seed topics
(aws-textract, central-landing-zone, regulated-landing-zone, etc.), parses
with `ContextBundleResponseSchema`, feeds a hand-written stub `LlmAdapter`
(inline `answer()` at lines 43-58), and asserts governed-bundle behavior:
citation-only answers (`answer.claims` length 1, `rejected_claims` length 1),
and visible failure modes (`restricted_source`, `broken_anchor`,
`no_registered_source`). "Portal" is a string stand-in:
`portal/src/views/portalViews.ts:25` `renderCapabilityDetail(bundle):
string` returns concatenated HTML, asserted via `toContain`. So the suite
proves plan-conformance of the logic against seed data with a stubbed LLM, not
deployed behavior — matching the operator's answer. (Minor immaterial
imprecision: `renderCapabilityDetail` is also re-exported in
`portal/src/index.ts` and used by the acceptance test, not "portalViews.ts +
its test only" — does not affect the conclusion.) Correct.

## Q4 — do the pre-PR constraints hold in the merged tree, and was the check recorded?

**Score: correct (1.0)**

Verified. Sampled hard constraints from `dc5c2016^1:docs/architecture/
constraints.md`: (33) TypeScript-only runtime — `git ls-tree -r
--name-only dc5c2016 | grep -E '\.(py|go|java|rb)$'` is empty, compliant;
(50) no V1 auth — grep for login/signin/sso/password in portal/src +
context-layer/src returns only false positives (route names like
"SourcesSourceId" matching "sso", an aria-label), compliant; (52) data-model
fields defined in current_design.md first — the schema fields
`source_class`/`steward`/`authority_level`/`authority_scope`
(`packages/atlas-schema/src/index.ts:92-97`) all appear in base
`dc5c2016^1:docs/architecture/current_design.md:103-108`, compliant. But the
yardstick moved during the build: `git diff dc5c2016^1 dc5c2016^2 --
docs/architecture/constraints.md` shows ~32 lines edited, softening rules to
match the implementation (e.g. constraint 3 "lives in `portal`" → "lives in
the consumer layer"; 7 "access denied" → "source restricted"; 8 adds
"anchors or anchor_references"; 28 adds "Local agent consumers may own their
own invocation policy"; 29/30 add SPA-mode / Portal-hosting allowances), and
current_design.md was also edited in-flight (+77/-35). No record
distinguishes "checked" from "rewritten to match": `git log --format='%s'
dc5c2016^1..dc5c2016^2 | grep -i constraint` = 0 hits. The operator's answer
(compliance real, check unrecorded, constraint file self-amended) is exactly
supported.

## Q5 — what does the infra plan require, and is any of it deployable at cutoff?

**Score: correct (1.0)**

Verified. `infra/src/atlasInfraPlan.ts` (260 lines) builds a typed
`AtlasInfraPlan` object whose `terraform_files[].content` is HCL emitted as a
template string by `buildMainTerraform(...)` (DynamoDB `atlas-registry`
single-table, Lambda `nodejs22.x` handler.handler, API Gateway HTTP,
Secrets Manager, IAM role/policy, S3 portal bucket, CloudWatch log group +
metric alarm; `forbiddenV1Services` guards SQS/Step Functions/etc.). The
plan is only described and asserted, never applied: `atlasInfraPlan.test.ts`
uses `toContain('resource "aws_dynamodb_table"')` string checks; `grep -rn
writeFile|fs\. infra/src` is empty (no emitter); infra `package.json` scripts
are lint/typecheck/test only (no deploy/apply); and `git ls-tree -r
dc5c2016 | grep -iE '\.tf$|cdk|serverless\.ya?ml|\.github/'` is empty (no IaC
on disk, no CI). The deployable artifacts one layer below do exist:
`context-layer/src/lambda/handler.ts` is a genuine API-Gateway-HTTP handler
delegating to `handleHttpRequest`, and `portal/Dockerfile` is a real
multi-stage Lambda-Web-Adapter build. So deployment is specified but
unrealized — no path from the merged tree to running infrastructure except a
human hand-copying Terraform out of TypeScript string literals, exactly as
the operator answered.
