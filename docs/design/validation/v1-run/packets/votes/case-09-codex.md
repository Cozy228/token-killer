---
case: 9
voter: codex
date: 2026-07-12
---

## Q1

Score: `partial` (2/3)

The required material sub-claims are: (1) the production mock-prevention gate and leaked-env behavior, correctly answered—the Nitro mock plugin is registered only for `command === "serve"`, not a production build (`portal/vite.config.ts:57-64`), so `DEV_MOCKS=1` alone cannot start MSW in production; (2) the badge behavior, correctly answered—the independent `NODE_ENV === "production"` gate forces `live` (`portal/src/api/server/dataMode.ts:15-20`), while the boot marker is set only by the dev plugin (`portal/server/devMocks/start.ts:21-36`); and (3) the seam's dependent surfaces, not answered—the root loader and shell consume the badge signal (`portal/src/routes/__root.tsx:72,111-119`; `portal/src/components/portal-shell.tsx:61-86`), while the same mocked Confluence channel supplies What's New and release-detail data (`portal/src/routes/whatsnew.tsx:48-103`; `portal/src/routes/releases.$releaseId.tsx:33-53`; `context-layer/src/releaseNotes/resolveReleaseNotes.ts:15-24,38-68`) as well as the other source-backed routes. The confident statement that the blast radius is merely “confined to dev/E2E” is directionally true but does not identify the requested surfaces.

## Q2

Score: `partial` (1/2)

The required material sub-claims are: (1) what “resource-first” means, not answered—the accepted model makes Resource the primary `{kind}/{slug}` content object, demotes Topic to Resource/Facet/Decompose dispositions, and unifies human and agent addressing (`docs/adr/0015-portal-resource-first-ia.md:39-87`; `CONTEXT.md:137-168`); and (2) whether the shape is traceable to a recorded decision, correctly answered—ADR-0015 is explicitly accepted after a dated grilling pass and points to its execution plan (`docs/adr/0015-portal-resource-first-ia.md:1-15`; `plans/015-portal-resource-first-ia.md:1-32`), and the root context cites it (`CONTEXT.md:141-150`). The answer also overstates the relationship as “the three ADRs it revises”: ADR-0015 says it builds on ADR-0014 but revises ADR-0012 and ADR-0013 (`docs/adr/0015-portal-resource-first-ia.md:6-15`); that does not defeat traceability, but it is not an accurate account of the links.

## Q3

Score: `correct`

The cutoff-filtered GitHub evidence confirms the answer: `gh api "repos/czync/atlas/actions/runs?head_sha=b65bc3a35aae06bafc50b39ec2d196224204f2f4&per_page=100" | jq --arg cutoff '2026-06-30T18:00:33Z' '.workflow_runs[] | select(.created_at <= $cutoff)'` returned CI run `28465016407`, created `17:54:48Z`, completed successfully at `17:59:18Z`; `gh api 'repos/czync/atlas/actions/runs/28465016407/jobs?per_page=100'` showed successful `verify`, `e2e (ubuntu-latest)`, `e2e (windows-latest)`, and `e2e-smoke (prod build)` jobs, all completed before cutoff, with the Windows leg ending exactly 75 seconds early. The cutoff-filtered `gh api repos/czync/atlas/pulls/19` record says PR#19 targeted `feat/0.2.0`, was merged at `06:42:29Z`, and dropped video because zero-download supplied no ffmpeg; `git merge-base --is-ancestor b41dc70c1dc9794f614374ef14cdd75affd269d0 b65bc3a35aae06bafc50b39ec2d196224204f2f4` exited 0, proving its squash commit was incorporated into PR#18's tested head.

## Q4

Score: `partial` (2/3)

The required material sub-claims are: (1) the motivating constraint, not answered—the recorded rationale says bundled-browser download is “pure waste” because a system browser is already used (`.npmrc:2-6`), while server-side fixture determinism is documented as a separate design rule (`packages/atlas-e2e/README.md:3-10`); the admissible sources checked do not record a corporate-network or network-policy constraint for zero-download; (2) where the decision is recorded, correctly answered in plan 026 and its acceptance gate (`plans/026-e2e-browser-testing.md:74-80,248-259,314-322`); and (3) what the setup does instead, correctly answered—it selects an installed Chrome/Edge channel via `PW_CHANNEL`, suppresses install-time downloads, and runs a launch/close doctor (`packages/atlas-e2e/README.md:24-43`; `packages/atlas-e2e/scripts/doctor.mjs:3-22`). The stated video cost is also supported: video is disabled because the skipped Playwright ffmpeg makes recording fail (`packages/atlas-e2e/playwright.config.ts:23-30`), matching the cutoff-admissible PR#19 body returned by `gh api repos/czync/atlas/pulls/19 | jq --arg cutoff '2026-06-30T18:00:33Z' 'select(.created_at <= $cutoff)'`.

## Q5

Score: `false-reassurance`

The answer presents delivery as complete on a material usability question, but the pinned state lacks the production live-data wiring its own contract needs: README defines the intended portal as a live, source-backed self-service catalog and documents build/start plus `infra/` as deployment configuration (`README.md:3-12,18-24,60-65`), while CONTEXT requires live Confluence resolution with a server-side token fallback (`CONTEXT.md:29-34,59-63`). Release notes specifically require `CONFLUENCE_BASE_URL`, a token, and `CONFLUENCE_RELEASE_NOTES_PAGE_ID`, otherwise returning `not_configured` (`context-layer/src/releaseNotes/resolveReleaseNotes.ts:22-49`), and the env template records that page-id requirement (`portal/.env.example:19-38`). Yet the ECS task environment contains only `NODE_ENV`, `PORT`, `PORTAL_ORIGIN`, `FEEDBACK_TABLE`, and a `RUNTIME_SECRET` name (`infra/main.tf:299-328`); the logged query `rg -n 'RUNTIME_SECRET' infra portal context-layer` found no application consumer, and there is no ECS `secrets` injection for the Confluence variables. Therefore credentials may be out-of-repo values, but the mechanism that delivers them to the app—and thus live `/whatsnew` and `/releases/$releaseId` data—is missing; calling this “delivery-complete” would reassure a reviewer into shipping a production portal whose documented live release surface is unconfigured.
