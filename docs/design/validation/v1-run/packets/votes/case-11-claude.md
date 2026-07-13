---
case: 11
voter: claude
date: 2026-07-12
---

# Case 11 (atlas#2) — claude vote

All reads pinned to a detached worktree at merge commit
`ee26e4f2afbaaca2de95bfc7b91420361388d1dc` (parents: base `dc5c2016`, PR head
`3b17ebf3`). GitHub API records checked against the cutoff
`2026-05-21T14:19:15Z`.

## Q1 — availability API consumers + does the debug test record a constraint?

**Score: correct (1.0)**

Both halves check out against the admissible tree. `grep availabilityQueryOptions
portal/src` returns exactly four route files that consume the one shared TanStack
query keyed `["availability"]` (`portal/src/api/queries.ts:18-21`):
`availability.index.tsx` (loader `ensureQueryData` + `useSuspenseQuery` at
lines 37/110, and the only site rendering `<MatrixView>` at 188), plus
`catalog.index.tsx:27`, `catalog.$topicId.tsx:43`, and `guidance.$topicId.tsx:42`
which preload via `ensureQueryData` — matching "four routes … matrix route renders
it, the catalog and guidance routes preload it." The debug harness
`portal/scripts/measure-availability-render-cost.debug.test.tsx` (188 lines)
contains zero `expect(`/assert calls (grep count 0); it only `console.log`s a
`[PERF-availability] … median/max ms` line (lines 27-30), encodes a dense
synthetic matrix (AWS 27 services × 12 regions, Azure 30 services — order ~300
cells), is explicitly excluded from `pnpm test` (`portal/package.json:25` =
`vitest run --exclude scripts/*.debug.test.tsx`), and no `.md` under docs/portal
records any threshold/number (grep for "render cost"/"PERF-availability" =
empty). "Perf concern, not perf contract" is accurate.

## Q2 — what design authority could a Codex build trace to at cutoff?

**Score: correct (1.0)**

The claimed pre-existing specs all exist in the base tree `dc5c2016` (authored in
PR #1, merged 2026-05-13, before this PR head). `git ls-tree dc5c2016 -- docs/`
lists `docs/architecture/catalog_design.md` (titled "Regional Availability Map
Design", defining the availability decision surface — `git grep -i availability`
returns 20+ hits incl. lines 5,24,47), its HTML prototype
`docs/architecture/catalog_availability_preview_v2.html`,
`docs/architecture/implementation_plan.md` (titled "Atlas V1 Implementation
Plan", scoping V1), and `docs/product/atlas_v1_design_status_snapshot.md`. Every
major surface in the diff traces to a written spec that predates the empty-bodied
PR, supporting "traceable, not maintainer's memory."

## Q3 — what automated verification existed at the 2026-05-21 cutoff?

**Score: correct (1.0)**

Sourced absence of CI confirmed and test content confirmed.
`git ls-tree -r ee26e4f2 -- .github/` is empty; `gh api …/check-runs` returns
total_count 0 for both head `3b17ebf3` and merge `ee26e4f2`;
`gh api actions/runs?head_sha=3b17ebf3` returns 0. PR timing (`gh api pulls/2`)
= created `2026-05-21T14:19:05Z`, merged `14:19:15Z` — a 10-second gap (both
≤ cutoff, admissible). Test content matches the "thin and mixed" characterization:
`availability-row-model.test.ts` (11 expects) calls `buildAvailabilityRowModel`
and asserts real output (rows/groups/domainOptions, lines 56-79);
`status-dot.test.tsx` (3 expects) renders via `renderToStaticMarkup` and asserts
aria-label/title/absence of tooltip slot — real coverage; but
`matrix-view.test.ts` (6 expects) only `readFile`s the component source and does
`toContain` string checks (lines 6-13) — a source-string containment test, not
behavioral; and the perf harness asserts nothing (Q1).

## Q4 — is DESIGN.md the recorded authority, and is self-amending it regulated?

**Score: correct (1.0)**

`git diff dc5c2016 3b17ebf3 -- DESIGN.md` shows the IBM Plex Sans → system-font
edit, and the code follows in lockstep: `globals.css` at base self-hosts IBM Plex
Sans, at head it uses a `--font-sans: system-ui, Roboto …` stack — so DESIGN.md
is a de-facto visual authority. Yet it is not the recorded authority:
`docs/README.md` doc-map lists `current_design.md`/`implementation_plan.md`/etc.
but omits DESIGN.md, and the only tree cross-reference,
`portal_frontend_design_plan.md:15`, states the repo "does not currently have
PRODUCT.md or DESIGN.md" and names `current_design.md` as the design context. The
recorded spec-first discipline — constraints #33 and #52
(`docs/architecture/constraints.md:87,129`) — governs `current_design.md` only,
so nothing at cutoff regulates amending DESIGN.md alongside the code that consumes
it. The "unregulated / can't distinguish spec-led from code-led" conclusion is a
correctly sourced absence.

## Q5 — what does the demo handoff doc require, and does the merged tree satisfy it?

**Score: correct (1.0)**

The question premise (that the doc lists things needed to run/demo) is legitimately
corrected from the source: `docs/demo_skills_routes_handoff.md` opens by declaring
its referenced files "no longer exist … because that implementation was reverted"
and to treat it as "continuation context, not current source truth," and closes
with a "Recommended Resume Path." Its referenced demo/skills artifacts are all
verifiably absent at `ee26e4f2` (`git cat-file -e` fails for
`context-layer/src/consumer/contextApiConsumer.ts`,
`portal/src/api/server/agentSkills.ts`, `portal/src/lib/skill-install.ts`,
`portal/public/.well-known/agent-skills/index.json`,
`.well-known/…/SKILL.md`, `agentSkillsDigest.ts`, `agent-skills.ts`), and there is
no `skills` route. The Dockerfile change is an internally-consistent pnpm pin:
`git diff … portal/Dockerfile` bumps `PNPM_VERSION 10.33.3 → 11.1.1`, matching
`package.json` `packageManager: "pnpm@11.1.1"`. Doc and tree are consistent and
nothing in the doc is falsified by the tree.
