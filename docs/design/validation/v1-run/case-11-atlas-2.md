---
case: 11
pr: czync/atlas#2
title: "Codex atlas v1 implementation"
cutoff: 2026-05-21T14:19:15Z
cutoff_kind: merge-fallback
merge_commit: ee26e4f2afbaaca2de95bfc7b91420361388d1dc
base: main
status: operated
---

# Case 11 — atlas#2

Subject read before question-writing: PR title (a Codex-built v1
implementation), EMPTY body, 60-file list (portal/src 49 — availability API
+143, matrix-view +215, status-dot, a +188-line render-cost debug test;
docs/product business_value +432 and guidance_design +87; DESIGN.md font
migration IBM Plex → system; Dockerfile +1; demo handoff doc +109).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The new server-side `availability.ts` API and the `matrix-view` component land together with a dedicated render-cost DEBUG test (+188 lines). Which routes/components consume the availability API at cutoff, and does the debug test record a known scale/perf risk for the matrix that a reviewer should treat as a constraint? | yes |
| 2 | Ownership / routing | This is a model-built (Codex) implementation. What recorded design authority existed at cutoff for it to implement against (DESIGN.md, docs/product/*), and can a reviewer trace the v1 scope to a written source, or was the scope only in the (empty-bodied) PR itself? | yes |
| 3 | Verification-evidence | What automated verification existed at the 2026-05-21 cutoff — did ANY CI workflow exist in the repo (the CI pipeline PR #8 is dated a month later), did any checks run on this PR's head, and what do the in-PR tests (matrix-view, status-dot) actually assert? | yes |
| 4 | Convention / decision-context | The PR edits DESIGN.md (IBM Plex → system font) in the same change-set that implements UI against it. Was DESIGN.md the recorded design authority at cutoff, and does any recorded process govern changing the authority doc alongside the implementation — or is self-amending the spec unregulated here? | yes |
| 5 | Delivery-requirements | A demo handoff doc (`docs/demo_skills_routes_handoff.md`, +109) ships in-PR alongside a Dockerfile tweak. What does that handoff doc require to actually run/demo the thing, and is each requirement satisfied by the merged tree at cutoff (scripts exist, routes exist, container builds plausible)? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

Pinned to merge commit `ee26e4f2`; cutoff 2026-05-21T14:19:15Z. Base (first
parent) `dc5c2016` — itself the merge of atlas#1; PR head `3b17ebf3`.

### Q1 — availability API consumers + does the debug test record a constraint?

Queries executed:

```
grep -rn "fetchAvailability|availabilityQuery" portal/src (ts/tsx, excl. server file) @ee26e4f2
grep -rn "MatrixView" portal/src | grep -v matrix-view.t
sed -n '1,190p' portal/scripts/measure-availability-render-cost.debug.test.tsx
grep -n debug portal/package.json
grep -rln "render cost|PERF-availability" docs/ portal/ (*.md)  → EMPTY
```

Evidence (cited):

- Single fetch path: `fetchAvailability` (server fn, availability.ts:213) is
  consumed only via `availabilityQueryOptions` (queries.ts:20-22). Four routes
  use it at cutoff: `availability.index.tsx:37,110` (renders `MatrixView` at
  :188), plus loaders in `catalog.index.tsx:27`, `catalog.$topicId.tsx:43`,
  `guidance.$topicId.tsx:42` — one shared query key, so blast radius is every
  main content route.
- The debug test contains ZERO assertions — no `expect()` at all. It
  `renderToString`s MatrixView / status dots / cards over synthetic zones
  (AWS 27 services × 5 locations, Azure 30 × 10 ≈ 300 cells) and
  `console.log`s medians (`[PERF-availability] … median=…ms`).
- It is excluded from the gate: `portal/package.json:25` `"test": "vitest run
  --exclude scripts/*.debug.test.tsx"`; a dedicated script
  `measure:availability-render` (:23) runs it on demand.
- No doc records a measured result or threshold (grep across docs/ + portal
  *.md is empty).

Answer: consumers are four routes through one shared TanStack Query
(`["availability"]`) — the matrix route renders it, the catalog and guidance
routes preload it. The debug test is a measurement harness, not a recorded
constraint: it encodes the anticipated scale (dense ~300-cell matrix) but
asserts nothing, is excluded from `pnpm test`, and no threshold or measured
number is written down anywhere. A reviewer inherits the author's perf
*concern* but no perf *contract*.

Confidence: **confirmed**.

### Q2 — what design authority could a Codex build trace to at cutoff?

Queries executed:

```
git ls-tree --name-only dc5c2016 ; git ls-tree -r --name-only dc5c2016 -- docs/
git diff --stat dc5c2016 3b17ebf3 -- docs/ DESIGN.md AGENTS.md README.md
git show dc5c2016:docs/product/atlas_v1_design_status_snapshot.md | head -40
git grep -n -i "availability|matrix" dc5c2016 -- docs/ PRODUCT.md DESIGN.md
git show dc5c2016:AGENTS.md | head -30 ; git show dc5c2016:CLAUDE.md
```

Evidence (cited):

- The base tree (pre-PR) already carries a full written authority stack:
  root `DESIGN.md` + `PRODUCT.md`, `docs/architecture/` (current_design.md,
  implementation_plan.md, portal_frontend_design_plan.md, constraints.md),
  and `docs/product/atlas_v1_design_status_snapshot.md`, which names its own
  authority chain: "authoritative specs remain in `docs/architecture/*`,
  `docs/product/product_proposal.md`, `docs/product/guideline.md`, and
  `constraints.md`" and defines the V1 success criterion (narrow full loop).
- The PR's headline feature is spec'd pre-PR: `docs/architecture/
  catalog_design.md` ("Regional Availability Map Design" — a portal-native
  "availability decision surface") plus a working HTML prototype with a
  matrix view (`catalog_availability_preview_v2.html:340-716`, "Compact
  Matrix View", `renderMatrix()`).
- AGENTS.md at base is behavioral only (skill loading, commit conventions,
  "think before coding") — it does not route design authority.
- The PR body is empty (`gh api repos/czync/atlas/pulls/2` → `"body": null`),
  so the PR itself records nothing; but scope does not depend on it.

Answer: traceable — the v1 scope existed in writing before the PR: the
availability matrix is implemented against `catalog_design.md` and its HTML
prototype, and overall v1 scope against implementation_plan.md and the
design-status snapshot. The empty PR body means the PR adds no scope record
of its own, but a reviewer can trace every major surface in the diff to a
pre-existing spec document rather than to the maintainer's memory.

Confidence: **confirmed**.

### Q3 — what automated verification existed at the 2026-05-21 cutoff?

Queries executed:

```
git ls-tree -r --name-only ee26e4f2 -- .github/   → EMPTY
gh api repos/czync/atlas/pulls/2  (head sha, created_at, merged_at)
gh api repos/czync/atlas/commits/ee26e4f2/check-runs -q .total_count   → 0
gh api 'repos/czync/atlas/actions/runs?head_sha=3b17ebf3'  -q .total_count → 0
grep -c "expect(" matrix-view.test.ts status-dot.test.tsx availability-row-model.test.ts
sed -n '1,60p' portal/src/components/explore/matrix-view.test.ts ; cat status-dot.test.tsx
```

Evidence (cited):

- No `.github/` directory exists anywhere in the merge tree — zero workflows
  at cutoff (CI arrives with PR #8, 2026-06-20, a month later).
- Zero check runs on the merge commit and zero workflow runs on PR head
  `3b17ebf3`. The PR was created 14:19:05Z and merged 14:19:15Z — a
  10-second self-merge window in which nothing could have run anyway.
- In-PR tests, what they actually assert:
  - `matrix-view.test.ts` (6 expects) is NOT behavioral — it reads its own
    component source file (`readFile(new URL("./matrix-view.tsx", …))`) and
    asserts string containment (`useReactTable`, `flexRender`, …): a wiring
    check that passes even if the matrix renders garbage.
  - `status-dot.test.tsx` (3 expects) is behavioral: SSR render, asserts
    aria-label/title composition and absence of a tooltip slot.
  - `availability-row-model.test.ts` (11 expects) is behavioral: filtering,
    stable grouped row identity, selection-filtered-out semantics.

Answer: no automated verification existed — no workflows, no checks, no runs
on this PR's head; merge followed PR creation by 10 seconds. Verification, if
any, was local and unrecorded (the body is empty, so not even a "green
locally" claim exists). The in-PR suite is thin and mixed: real logic
coverage for the row model and status dot, but the matrix component's only
test is a source-string containment check, and the perf harness (Q1) asserts
nothing.

Confidence: **confirmed** (sourced absence for CI; test content confirmed).

### Q4 — is DESIGN.md the recorded authority, and is self-amending it regulated?

Queries executed:

```
git diff dc5c2016 3b17ebf3 -- DESIGN.md | grep "^[-+].*Plex|font|system"
git grep -n "DESIGN.md" ee26e4f2 -- '*.md' '*.json' '*.ts' '*.tsx'
git show ee26e4f2:docs/README.md | head -50
git show ee26e4f2:docs/architecture/constraints.md | grep -n -i "design|font"
sed -n '12,20p' portal/src/styles/globals.css ; git show dc5c2016:portal/src/styles/globals.css | grep -n Plex
```

Evidence (cited):

- The PR rewrites DESIGN.md's typography sections (IBM Plex Sans/Mono →
  system font stacks, ~76 lines) and changes the implementation to match in
  the same change-set: base globals.css self-hosts IBM Plex (@font-face);
  merged globals.css:13-21 declares system `--font-sans`/`--font-mono`.
  Spec and code move atomically — the spec is amended to say what the code
  now does.
- DESIGN.md's recorded status at cutoff is contradictory-to-absent: the ONLY
  reference to it in the entire merge tree is
  `docs/architecture/portal_frontend_design_plan.md:15` — "this repository
  does not currently have `PRODUCT.md` or `DESIGN.md`" (stale: both exist at
  root). `docs/README.md` (amended by this very PR) maps the doc hierarchy
  and does not list DESIGN.md at all.
- A design-change process DOES exist — but only for a different doc:
  constraints.md #33 and #52 require updating
  `docs/architecture/current_design.md` "first, then implement" for runtime
  and data-model changes. No constraint mentions DESIGN.md or visual/font
  changes.

Answer: DESIGN.md functioned as the de-facto visual authority (the code
follows it before and after) but was NOT the recorded authority at cutoff —
the doc map omits it and the only cross-reference denies it exists. The
repo's recorded spec-first discipline (constraints #33/#52) covers
current_design.md only, so amending DESIGN.md alongside the implementation
that consumes it is unregulated: nothing at cutoff distinguishes "the spec
changed, code followed" from "the code changed, spec was rewritten to
agree".

Confidence: **confirmed** (sourced absence for the process).

### Q5 — what does the demo handoff doc require, and does the merged tree satisfy it?

Queries executed:

```
cat docs/demo_skills_routes_handoff.md
for f in contextApiConsumer.ts agentSkills.ts skill-install.ts
  portal/public/.well-known/agent-skills/index.json:  git cat-file -e ee26e4f2:$f
git ls-tree --name-only ee26e4f2 -- portal/src/routes/ | grep -i skill  → EMPTY
git diff dc5c2016 3b17ebf3 -- portal/Dockerfile ; grep -n packageManager package.json
git log --format='%h %cI %s' dc5c2016..3b17ebf3 -- docs/demo_skills_routes_handoff.md
```

Evidence (cited):

- The question's premise inverts the doc's nature: it is not a "how to run
  the demo" doc but a **revert record** — "Some referenced files no longer
  exist in the current working tree because that implementation was
  reverted. Treat this as continuation context, not as current source
  truth." It captures demo/skills/route work that was built and then backed
  out, plus a 5-step resume path and named risks (scenario drift, route
  churn, registry drift).
- Its absence claims verify against the merged tree: all four spot-checked
  referenced files are ABSENT at `ee26e4f2` (contextApiConsumer.ts,
  agentSkills.ts, skill-install.ts, .well-known/agent-skills/index.json),
  and no `/skills` route exists in portal/src/routes/.
- The doc lands in the PR's final commit (`3b17ebf3`, 14:14:05Z, five
  minutes before merge) — written as the closing act of the change-set.
- The Dockerfile "+1" is a pnpm bump `10.33.3 → 11.1.1` (portal/Dockerfile:4)
  and is consistent with the same-PR `packageManager: "pnpm@11.1.1"`
  (package.json:4) — no version skew introduced.

Answer: the handoff doc requires nothing of the merged tree — by its own
declaration it describes code that is deliberately NOT in the tree. Checked
on its actual terms, it is accurate: every referenced demo/skills artifact is
verifiably absent at cutoff, so the doc and tree are consistent, and the
Dockerfile tweak is an unrelated, internally-consistent pnpm pin. What a
reviewer should take from it: the PR ships less than the branch once
contained, the revert is documented with a resume path, and nothing in the
doc is falsified by the tree.

Confidence: **confirmed** (question premise corrected from the source).
