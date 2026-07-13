---
case: 12
voter: codex
date: 2026-07-12
---

## Q1

**Score: correct (1.0)**

The answer is correct: the shared package defines the Source and Topic schemas (`packages/atlas-schema/src/index.ts:88-124`), `context-layer/src/contracts.ts:1-3` is only a type alias to `ContextBundleResponse`, and the workspace manifests show direct `@atlas/schema` dependencies from Portal, Context Layer, and Acceptance (`portal/package.json:26-32`, `context-layer/package.json:20-23`, `packages/atlas-acceptance/package.json:11-15`). The logged query `rg -n '"@atlas/schema"|from "@atlas/schema"' portal context-layer infra packages --glob '!**/node_modules/**'` found schema imports throughout Portal and Context Layer plus the acceptance test, none in infra, while the Portal's Topic/Source usages import those shared types rather than declaring a second topic/source response contract; therefore the posed topic/source drift surface was not present at cutoff.

## Q2

**Score: correct (1.0)**

The answer is correct for the four major surfaces asked about: the pre-PR plan explicitly assigns the shared schema and Context Layer (`git show HEAD^1:docs/architecture/implementation_plan.md | nl -ba | sed -n '56,269p'`), Portal and Ask Atlas (`git show HEAD^1:docs/architecture/implementation_plan.md | nl -ba | sed -n '271,350p'`), infrastructure (`git show HEAD^1:docs/architecture/implementation_plan.md | nl -ba | sed -n '352,386p'`), and V1 acceptance (`git show HEAD^1:docs/architecture/implementation_plan.md | nl -ba | sed -n '388,424p'`) to recorded phases, and its commit/review strategy names eight ordered units (`git show HEAD^1:docs/architecture/implementation_plan.md | nl -ba | sed -n '450,463p'`). The ancestry query `git log --format='%h %cI %s' --reverse HEAD^1..HEAD^2` shows the first implementation commits following that order, while the cutoff-filtered command `gh api repos/czync/atlas/pulls/1 --jq 'select(.created_at <= "2026-05-12T17:01:51Z") | {created_at,merged_at,commits,changed_files,additions,deletions}'` returned 88 commits, 247 files, +46,643/-125, opened at 16:08:53Z and merged at 17:01:51Z, supporting the distinction between fine-grained build commits and one roughly 53-minute PR review window.

## Q3

**Score: correct (1.0)**

The answer is correct: `git ls-tree -r --name-only HEAD -- .github` returned no files, and the cutoff-filtered GitHub queries `gh api "repos/czync/atlas/actions/runs?head_sha=80fe220b9c81bfe0270fb8b71149939c816c6634&per_page=100" --jq '[.workflow_runs[] | select(.created_at <= "2026-05-12T17:01:51Z")] | length'`, `gh api "repos/czync/atlas/commits/80fe220b9c81bfe0270fb8b71149939c816c6634/check-runs?per_page=100" --jq '[.check_runs[] | select(.created_at <= "2026-05-12T17:01:51Z")] | length'`, and the equivalent statuses query each returned 0; the cutoff-filtered PR body query records `Not run (not requested)`. The acceptance file invokes in-process `handleContextRequest`, parses seed-backed bundles, uses a stub `LlmAdapter`, and checks strings from rendering helpers (`packages/atlas-acceptance/src/v1Acceptance.test.ts:13-86`); those helpers merely construct HTML strings (`portal/src/views/portalViews.ts:25-38,58-84`), so the answer accurately characterizes the authored test as logic/plan-conformance coverage rather than evidence of a deployed or browser-run experience.

## Q4

**Score: correct (1.0)**

The answer is correct for the sampled constraints: the pinned tree has no Python, Go, Java, Ruby, Rust, PHP, C#, Kotlin, or Swift runtime files under the logged command `git ls-tree -r --name-only HEAD | rg '\.(py|go|java|rb|rs|php|cs|kt|swift)$'`; the merged constraints require TypeScript and no V1 authentication (`docs/architecture/constraints.md:85-93,119-129`), and the logged auth search found only OAuth token URLs in an LLM-provider test, not an application login flow. The field-order requirement also holds: `git log --reverse --format='%h %cI %s' HEAD^1..HEAD^2 -- docs/architecture/current_design.md packages/atlas-schema/src/index.ts` shows the design update `521c0188` at 00:59:45+08:00 defining separate Anchor and Feedback fields before schema commit `901c277c` at 01:44:31+08:00, and the final definitions align (`docs/architecture/current_design.md:131-145,186-197`; `packages/atlas-schema/src/index.ts:67-79,126-140`). At the same time, `git diff HEAD^1 HEAD^2 -- docs/architecture/constraints.md` shows the authority file changed during the implementation branch (including the no-auth rule), while searches of ancestry commit messages/bodies and cutoff-filtered PR comments found no recorded constraint check, so the operator's compliant-tree/unrecorded-check/moving-yardstick distinction is supported.

## Q5

**Score: partial (4/6)**

The answer gets four of six required material sub-claims right: (1) the plan requires a single Lambda/API deployment and handler code exists (`docs/architecture/implementation_plan.md:400-415`; `context-layer/src/lambda/handler.ts:1-38`); (2) no emitted `.tf`, deploy script, CI, or checked-in build artifact provides Lambda deployment wiring (`infra/package.json:6-10`, plus `git ls-tree -r --name-only HEAD | rg '(\.tf$|serverless\.(yml|yaml)$|(^|/)\.github/|(^|/)(dist|build|\.output)/)'`, which returned empty); (3) Portal hosting has a concrete Docker build recipe (`portal/Dockerfile:1-52`); and (4) the overall conclusion that no end-to-end apply path exists is correct because the Terraform is only returned as string data (`infra/src/atlasInfraPlan.ts:25-33,80-85,97-260`) and no emitter was found by `rg -n 'writeFile|writeFileSync|terraform (apply|plan)|cdk (deploy|synth)' infra`. It omits two required sub-claims: (5) the feedback table has an admissible design and repository backing requiring `ATLAS_FEEDBACK_TABLE` plus `gsi1` (`docs/architecture/dynamodb_feedback_table.md:5-12,30-41`; `context-layer/src/repositories/dynamoFeedbackRepository.ts:13-18,68-82`), and (6) the infra string does not deploy that design at all—it defines only `atlas_registry`, no GSI, and sets the unrelated `ATLAS_REGISTRY_TABLE` (`infra/src/atlasInfraPlan.ts:120-135,199-212`); similarly, its Portal "hosting" is only an unwired S3 bucket string (`infra/src/atlasInfraPlan.ts:241-243`). Thus the cautious overall verdict is sound, but the per-requirement accounting requested by the question is incomplete.
