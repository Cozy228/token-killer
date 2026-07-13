---
case: 10
voter: claude
date: 2026-07-12
---

# Case 10 (atlas#8) — claude vote

All reads pinned to a detached worktree at merge commit
`615db18aff9927378a0821e944146522ea87140b` in the atlas clone. GitHub API
records filtered to created_at <= cutoff 2026-06-20T08:21:37Z.

## Q1 — rename completeness: any capability split-brain?

**Score: correct**

Independently ran the operator's grep (`grep -rn -i capabilit` over
ts/tsx/json/md, excluding node_modules). The live product surfaces are clean:
the schema enum is `topicTypes = ["service", "landing-zone", "guardrail-area"]`
(`packages/atlas-schema/src/index.ts:9-13`) with no "capability" value; live
portal code branches on `topic_type === "service"`
(`portal/src/components/catalog/adopted.tsx:63`, `data.ts:141`); the route set
carries no `/capability` path (`portal/src/routes/` has catalog/availability/
guardrails/guidance, and `grep capabilit` over routes/routeTree/router is
empty); `context-layer/src` has zero hits. The purge is documented in the
authoritative CONTEXT.md, which points to the rename goal doc
(`CONTEXT.md:140-146`: "renamed from the former `capability`; goal
`goal_prompt_capability_to_service_rename.md`" and "_Avoid_: Capability
anywhere — the word is purged from live code, schema, and UI"). Every surviving
"capabilities" in code is the MCP JSON-RPC protocol field
(`portal/src/api/server/mcp/handler.ts:61`,
`portal/public/.well-known/mcp/server-card.json:14`), which is unrelated to the
domain concept. The material claim — no split-brain in live types/routes/data
manifests — is verified. Caveat: the operator's label "vendored non-product
content" is imprecise, since the old term does survive in the repo's OWN
throwaway design docs (`prototype/NOTES.md`, `prototype/redesign-goal-*.md`) and
`docs/archive/`, which are the repo's docs rather than vendored content;
however these are explicitly non-live/archived and the authoritative CONTEXT.md
flags the purge, so no reader consulting live surfaces or the canonical doc is
misled. The material answer stands.

## Q2 — who owns `codex/MVP-source-loop` and its review protocol

**Score: correct**

Replicated the operator's grep for "source-loop"/"source loop" over AGENTS.md
CLAUDE.md CONTEXT.md docs/*.md plans/*.md — empty. A broader `grep -rn -i
source-loop` across the whole tree (excluding node_modules and .git) is also
empty: the integration branch's name appears nowhere in the tracked repo at
cutoff. AGENTS.md and CLAUDE.md (94 lines each) are generic "behavioral
guidelines to reduce common LLM coding mistakes" with no branch-ownership,
review-protocol, or merge-authority content; there is no CODEOWNERS file
(`find -iname CODEOWNERS` empty). The only review-related records are (a) a
generic executor/reviewer dispatch pattern in the plans index
(`plans/001-verification-baseline-ci.md:7-8`, "unless a reviewer dispatched
you") and (b) archived docs describing CODEOWNERS/PR review as a *future*
target explicitly "Blocked in V1 by company Git automation constraints"
(`docs/archive/product/source_management_lifecycle.md:493`). Neither names who
owns or must approve a bundle-the-working-tree PR into this branch. The operator
affirmatively and correctly established a real, reachable absence — the answer
("unrecorded; authority lived in the maintainer's head") is the right answer,
not a lazy abstention.

## Q3 — did the pipeline prove itself pre-cutoff, and match the claimed gates?

**Score: correct**

`gh api repos/czync/atlas/pulls/8 -q .head.sha` = `ec765244a210...` (confirming
the operator's head SHA). Querying
`repos/czync/atlas/actions/runs?head_sha=ec765244...` returns exactly one CI run:
event `pull_request`, status `completed`, conclusion **success**,
created_at 2026-06-20T08:19:32Z, updated_at 08:20:49Z — i.e. green and finished
48s before the 08:21:37Z cutoff (all timestamps admissible, <= cutoff). Pulling
the run's jobs (run 27865436677) shows the single `verify` job success with
every gate step green: Typecheck, Lint, Test, "Build portal", "Build
context-layer Lambda bundle" (plus Install). This is a 1:1 match to the CI job
list in `.github/workflows/ci.yml:38-51`, which is itself the locally-claimed
gate set (typecheck, lint, test, portal build, lambda build). Both halves of
the operator's answer verified.

## Q4 — is the commit convention recorded beyond hooks, and did history conform?

**Score: correct**

Constraint #47 is real: `docs/architecture/constraints.md:117` — "47. Git
commits follow Conventional Commits. Every commit must have a type prefix
(`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)." — an architecture
constraints register that predates and is independent of the husky/commitlint
hooks this PR adds. On history conformance: `git log --format='%s' 615db18a~1`
(the branch tip before this squash; note 615db18a is a single-parent squash
commit, parent e35867c4) shows the branch already following Conventional
Commits — `feat(portal):`, `docs(plans):`, `chore(deps):`, etc. across the first
30+ subjects. The material sub-claims both hold: (1) convention recorded durably
beyond hooks — verified; (2) branch history conformed before enforcement —
verified. Minor caveat: one older subject uses a non-canonical type
`wip(portal): in-progress redesign...`, which follows the type(scope): shape but
`wip` is not in constraint #47's enumerated type list; this lone outlier does
not overturn "history already complied." The operator's framing — this PR
mechanizes an already-recorded, already-followed norm — is correct.

## Q5 — will the pipeline actually gate future work?

**Score: correct**

`.github/workflows/ci.yml:3-6` triggers on `push: branches: [main]` and a
bare `pull_request:` with NO branch filter. An unfiltered `pull_request`
trigger fires for PRs targeting any base branch, so it gates PRs into both main
and `codex/MVP-source-loop` (and any future branch) — exactly what the
source-loop flow needs; direct-push gating is limited to main, so non-main
direct-push "laxity" exists but is consistent with a PR-based flow. Frozen-
lockfile is satisfiable and single-field pinned: `pnpm-lock.yaml` is committed
(`git ls-files --error-unmatch pnpm-lock.yaml` succeeds), and the pnpm version
is pinned solely by root `package.json:4` `"packageManager": "pnpm@11.8.0"`;
the workflow's `pnpm/action-setup@v4` step declares no version input and thus
derives it from that one field (comment at ci.yml:25 confirms), with no
conflicting `engines.pnpm` pin anywhere. Empirically corroborated: the pre-
cutoff CI run's `Install` step (`pnpm install --frozen-lockfile`) passed green
(Q3). Both parts of the operator's answer verified.
