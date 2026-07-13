---
case: 10
voter: codex
date: 2026-07-12
---

## Q1 — Rename completeness: any capability split-brain?

**Score:** false-reassurance

The implementation-side migration is real: `packages/atlas-schema/src/index.ts:9-13` defines `service`, `data/topics.yaml:4-29` uses `topic_type: service`, `data/guidance/new-app-onboarding.yaml:24-28` uses `applies_to.services`, and `portal/src/api/server/mcp/tools.ts:102` exposes `atlas_search_service`; however, the non-archived `docs/architecture/goal_prompt_agent_readiness.md:41-44` still prescribes `atlas_search_capability`, while `docs/architecture/agent_readiness.md:87-93` prescribes `atlas_search_service`. That is a live-document split-brain a later reader could follow, so the confirmed claim that every surviving old-domain use is harmless is materially wrong and would reassure a reviewer that the migration was complete.

## Q2 — Ownership of `codex/MVP-source-loop` and review protocol

**Score:** correct

The operator's core answer is supported: the exact pinned-tree query `rg -n -i 'source[- ]loop' AGENTS.md CLAUDE.md CONTEXT.md docs plans` returned no matches, and `AGENTS.md:79-94` records only general public-safety rules rather than branch ownership or approval roles. The cutoff-filtered command `gh api repos/czync/atlas/pulls/8 --jq 'select(.created_at <= "2026-06-20T08:21:37Z") | {created_at,body,user:.user.login,base:.base.ref,head:.head.ref,requested_reviewers:[.requested_reviewers[].login]}'` established only the author `czync`, base `codex/MVP-source-loop`, the PR's self-declared squash-after-green process, and no requested reviewers; it supplied no repo-recorded owner or mandatory approver. Thus "unrecorded" is the reachable answer, with the maintainer-head wording understood as an inference from that documented absence rather than a separately established fact.

## Q3 — Pre-cutoff CI proof and gate parity

**Score:** correct

The cutoff-filtered command `gh api 'repos/czync/atlas/actions/runs?head_sha=ec765244a210e4f69c9e4c135e2b004278e9e91e&per_page=100' --jq '{total_count, admissible:[.workflow_runs[] | select(.created_at <= "2026-06-20T08:21:37Z") | {id,status,conclusion,head_sha,created_at,updated_at}]}'` returned the sole run, ID `27865436677`, with `conclusion: success`, created at `08:19:32Z` and updated at `08:20:49Z`, 48 seconds before cutoff. `gh api repos/czync/atlas/actions/runs/27865436677/jobs` showed the `verify` job and each of Typecheck, Lint, Test, portal build, and context-layer Lambda build completing successfully by `08:20:40Z`; those steps match `.github/workflows/ci.yml:38-51` one-for-one and match the five gates in the cutoff-filtered PR body.

## Q4 — Durable commit convention and prior-history conformity

**Score:** false-reassurance

The durable-record half is correct because `docs/architecture/constraints.md:113-117` requires Conventional Commits and enumerates the allowed prefixes, and the hook/config implementation is visible at `.husky/commit-msg:1-8` and `commitlint.config.cjs:1-4`. The history half is not: the pinned-ancestry command `git log 615db18aff9927378a0821e944146522ea87140b^ --format='%h%x09%s' | awk -F '\t' '$2 !~ /^(feat|fix|refactor|test|docs|chore)(\([^)]*\))?!?: / {print}'` returned, among others, `32d105a8 wip(portal): ...`, `980de683 design(atlas): ...`, and `ee26e4f2 Merge pull request #2 ...`. Therefore the confirmed statement that branch history already complied and the PR merely mechanized existing practice is materially wrong and falsely reassures a reviewer that enforcement introduces no convention mismatch.

## Q5 — Trigger coverage and frozen-lockfile viability

**Score:** correct

`.github/workflows/ci.yml:3-7` limits direct pushes to `main` but leaves `pull_request` unfiltered, so PRs into both `main` and `codex/MVP-source-loop` (and any other base) are covered; `.github/workflows/ci.yml:24-36` installs pnpm from the package-manager declaration and runs `pnpm install --frozen-lockfile`. The required inputs are present and consistent: `package.json:1-4` pins `pnpm@11.8.0`, `pnpm-lock.yaml:1-5` is committed with lockfile version 9, and the exact pinned-tree query `rg -n '"packageManager"|pnpm-version|pnpm@' -g 'package.json' -g '*.yml' -g '*.yaml' .github . --glob '!node_modules/**'` found no competing pnpm version declaration.
