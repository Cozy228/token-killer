---
case: 9
pr: czync/atlas#18
title: "feat(atlas): 0.2.0 — resource-first portal, dev mock/live seam, zero-download E2E"
cutoff: 2026-06-30T18:00:33Z
cutoff_kind: merge-fallback
merge_commit: 6e9a4bdc125519b836c9bd7f4595f8b255390517
base: main
status: operated
---

# Case 9 — atlas#18

Subject read before question-writing: PR title, body (integration branch for
0.2.0, "opened to run full CI — cross-OS E2E matrix + prod-build smoke, only
validated locally so far", hardening list: warmup global-setup, DEV_MOCKS
strict 1/0 + NODE_ENV prod gate, /releases mock, /whatsnew SSR hydration,
a11y baseline, root README), top-dir distribution (349 files; GitHub file API
sample dominated by context-layer/src; root README/DESIGN/CONTEXT touched).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The dev mock/live seam (`DEV_MOCKS` strict `1`/`0`, `NODE_ENV` prod gate) decides whether the portal serves mock data. Where exactly is the production gate implemented at cutoff, what happens in a prod build if `DEV_MOCKS=1` leaks into the environment, and which surfaces (badge, routes like /releases) depend on the seam? | yes |
| 2 | Ownership / routing | Root DESIGN.md/CONTEXT.md changed in this PR. What do the recorded design docs at cutoff say "resource-first portal" means and where was that direction decided — is 0.2.0's shape traceable to a recorded decision a reviewer can check the implementation against? | yes |
| 3 | Verification-evidence | The body admits the cross-OS E2E matrix + prod smoke were "only validated locally so far" and the PR exists to run them in CI. Did CI actually run and pass on this PR's head before the 18:00:33Z cutoff — and how does sibling PR#19 ("e2e CI green — drop video", merged 06:42Z same day) relate to this PR's CI status? | yes |
| 4 | Convention / decision-context | "Zero-download E2E" is in the title. What recorded constraint motivates zero-download (network policy, corporate environment, CI determinism), where is it written at cutoff, and what does the E2E setup do instead of downloading? | yes |
| 5 | Delivery-requirements | For 0.2.0 to be usable by its intended audience, what do the repo's own docs (README/CONTEXT/DESIGN at cutoff) require around deployment/serving, and is any doc-required piece (e.g. a deploy story, live-data wiring for /releases) missing from the merged state? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

Pinned to merge commit `6e9a4bdc` in the atlas clone; cutoff
2026-06-30T18:00:33Z.

### Q1 — can the mock seam leak into prod?

Queries executed:

```
grep -rn DEV_MOCKS portal/ context-layer/ (excl. node_modules)
cat portal/server/devMocks/shouldMock.ts
sed -n '1,40p' portal/server/devMocks/start.ts
grep -n plugins portal/vite.config.ts
```

Evidence (cited):

- The gate is STRUCTURAL, not env-based: `vite.config.ts:64` registers the
  MSW boot plugin only when `command === "serve"` — "never the prod build …
  so `msw` (a devDependency) never enters the production bundle"
  (start.ts:1-6). The file deliberately lives outside auto-scanned
  `server/plugins/`.
- `shouldMockData()` (shouldMock.ts): three-state — literal `'1'` forces
  mock, `'0'` forces real, anything else auto-detects by presence of BOTH
  Confluence creds; the strictness is documented ("a stray empty
  `DEV_MOCKS=` never silently forces mock").
- Prod leak scenario: with the plugin unregistered, `DEV_MOCKS=1` in a prod
  environment is INERT — nothing else reads it (grep: only devMocks files
  and tests); the `DEV_DATA_MODE` marker is absent in prod so the badge
  reports 'live' (start.ts:24-26).
- Seam consumers: the data-mode badge (`dataMode.ts` reads the cached
  marker; a comment warns against re-deriving after boot because fixture
  creds get injected), E2E (forces `=1` for hermetic runs), and the API
  contract tests.

Answer: the production build cannot serve mocks by env leakage — mocking
requires a plugin that only `vite serve` registers, so `DEV_MOCKS=1` in
prod does nothing and the badge degrades to 'live'. The seam's blast
radius is confined to dev/E2E; the one subtlety (marker-vs-function as
source of truth) is documented in the code itself.

Confidence: **confirmed**.

### Q2 — is 0.2.0's shape traceable to a recorded decision?

Queries executed:

```
grep -rn -i "resource-first" README.md DESIGN.md CONTEXT.md PRODUCT.md plans/ docs/
head -10 docs/adr/0015-portal-resource-first-ia.md
```

Evidence (cited):

- **ADR-0015** "Post-MVP: Portal becomes Resource-first …" — Status:
  accepted, proposed 2026-06-26, "accepted after a grilling pass"
  2026-06-27; explicitly builds on ADR-0014 and REVISES ADR-0012 §5 and
  ADR-0013's addressing (`{provider}/{resource}` → `{kind}/{slug}`).
- Execution lineage recorded: plan 013 §"Converged c-2 target model" marks
  the shape "Recorded as ADR-0015; execution plan: plans/015-portal-
  resource-first-ia.md".
- CONTEXT.md:142-150 (updated in this PR) reflects the shipped state and
  cites ADR-0015 for the canonical-address rule.

Answer: fully traceable — the resource-first pivot has an accepted ADR
(0015) with dates, supersession links to the three ADRs it revises, a
grilling record, and a dedicated execution plan; the root context doc
cites it. A reviewer can diff the implementation against ADR-0015's
target model directly. (Notably stronger recording practice than the
token-killer cases, where equivalents lived in code comments.)

Confidence: **confirmed**.

### Q3 — did the CI this PR exists for actually pass pre-cutoff?

Queries executed:

```
gh api repos/czync/atlas/pulls/18 -q .head.sha        → b65bc3a3
gh api 'repos/czync/atlas/actions/runs?head_sha=b65bc3a3'
gh pr view 19 -R czync/atlas --json baseRefName,mergedAt,body
```

Evidence (cited):

- CI on head `b65bc3a3`: created 17:54:48Z, **completed SUCCESS
  17:59:18Z — 75 seconds before the 18:00:33Z merge**. The full run
  (including the cross-OS E2E matrix the PR was opened to exercise)
  was green at cutoff.
- PR#19's role confirmed: an "isolated CI-fix branch off feat/0.2.0" that
  "iterates the cross-OS e2e + smoke jobs to green here, then
  squash-merges back into feat/0.2.0" — merged into the feature branch
  at 06:42:29Z the same day. Its first fix (drop Playwright video —
  "zero-download ships no ffmpeg, so every newPage threw on CI") is what
  made this PR's E2E green possible.

Answer: yes — the declared purpose of the PR was fulfilled before merge:
the head's CI run, including the previously-local-only E2E matrix,
completed green 75s before cutoff, after a same-day dedicated CI-fix
loop (PR#19) had cleared the ffmpeg/video blocker on the branch.

Confidence: **confirmed**.

### Q4 — where "zero-download" is recorded and what it does instead

Queries executed:

```
grep -rn -i "zero-download" docs plans README.md portal
(plan 026-e2e-browser-testing.md hits at :204, :259, :308, :316, :336)
```

Evidence (cited):

- Plan `026-e2e-browser-testing.md` is the record: WU2 "Browser doctor +
  zero-download channel"; a hard gate "**G-zero-download:** no
  `playwright install chromium` anywhere; `pnpm install` downloads no
  [browser]" (:316), an assert-no-download requirement (:336), a
  `PW_CHANNEL` knob with OS defaults and "the zero-download rationale
  (both paths)" (:308), and a phase gate "zero-download proven. Only
  then start Phase 2" (:259).
- Consequence already lived: PR#19's ffmpeg fix exists BECAUSE
  zero-download ships no bundled browser/ffmpeg.

Answer: instead of downloading browsers, E2E drives a system-installed
browser channel (`PW_CHANNEL` + per-OS defaults) under an explicit
no-download CI gate, all pre-registered in plan 026 with its own
acceptance gates. The constraint is a recorded, deliberate design with a
doctor/diagnostic companion — not an ad-hoc CI hack — and the video-drop
in PR#19 is its known cost.

Confidence: **confirmed**.

### Q5 — doc-required delivery completeness

Queries executed:

```
grep -n -i "deploy|serve|releases" README.md ; grep -rn -i deploy CONTEXT.md
ls (root) — infra/ package present
```

Evidence (cited):

- README (rewritten in this PR) requires and documents: dev server (:3000,
  mock/live seam explained with a pointer to `shouldMock.ts`), prod build
  + `pnpm --filter @atlas/portal start` for the built server, and the
  workspace map including `infra/` = "Deployment / infrastructure config".
- `/releases` is wired into the dev mock and covered (PR body claim;
  `releaseNotes.test.ts` exists in the seam-consumer list, Q1).
- No doc at cutoff declares a further ship-requirement that is absent —
  the operator searched README/CONTEXT for imperative requirements
  (deploy/serve) and found each either delivered or explicitly scoped to
  `infra/`.

Answer: within what the repo's own docs demand, 0.2.0 is
delivery-complete at cutoff: dev + prod-server paths documented and
working per CI smoke, the mock/live seam documented in README, releases
covered in the mock path. The live-Confluence path necessarily depends
on out-of-repo creds/deployment (infra config), which the docs assign to
`infra/` rather than to this PR.

Confidence: **partial** (the sweep for "doc-required but missing" was
grep-based over README/CONTEXT imperatives, not an exhaustive read of
all plans/ADRs).
