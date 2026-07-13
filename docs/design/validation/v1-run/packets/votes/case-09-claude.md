---
case: 9
voter: claude
date: 2026-07-12
---

# Case 9 (atlas#18) — claude vote

Adjudicated in a fresh session against a detached worktree pinned at merge commit
`6e9a4bdc125519b836c9bd7f4595f8b255390517`; GitHub API reads filtered `created_at <= 2026-06-30T18:00:33Z`.

## Q1 — can the mock seam leak into prod?

**Score: correct**

The operator's answer is accurate on every confident claim. The data-serving gate is `portal/vite.config.ts:64` — `plugins: command === "serve" ? ["./server/devMocks/start"] : []` — so the MSW boot plugin (`portal/server/devMocks/start.ts`) is registered only under `vite serve` and never in the prod build (`command === "build"`), exactly as the operator states. `shouldMockData` is invoked once at boot only (`start.ts:21`); grepping confirms no route handler re-derives the mode at request time (`grep -rn shouldMockData portal/ context-layer/` returns only `start.ts` and a doc comment). So `DEV_MOCKS=1` leaking into a prod env has no reader and "does nothing." The badge independently hard-gates to `'live'`: `portal/src/api/server/dataMode.ts:19` (`if (process.env.NODE_ENV === "production") return "live";`) plus the absent `DEV_DATA_MODE` marker (`dataMode.ts:20`). The "marker-vs-function source of truth" subtlety the operator cites is indeed documented in code (`shouldMock.ts:2-9`). Surface enumeration is lighter than the question invited (the seam intercepts all discovery-backed routes in dev, not just the badge), but the operator correctly bounds the blast radius to dev/E2E and states no wrong claim.

## Q2 — is 0.2.0's shape traceable to a recorded decision?

**Score: correct**

Independently confirmed. `docs/adr/0015-portal-resource-first-ia.md:3-4` records `Status: accepted — MVP done-bar reached 2026-06-27` with `Date: 2026-06-26 (proposed) · 2026-06-27 (accepted after a grilling pass)`; the header (lines 6-16) cites the 2026-06-27 grilling pass and links to the ADRs it revises (0012 §5, 0013 addressing) and builds on (0014). A dedicated execution plan exists (`plans/015-portal-resource-first-ia.md:1`, "ADR-0015 execution", plus follow-on `plans/020`). The root context doc cites it (`CONTEXT.md:142,147,150`). The ADR's Decision section (lines ~46 onward: `{kind}/{slug}` addressing, the three-way promotion rule) gives a reviewer a concrete target model to diff against. One minor imprecision — the operator's "supersession links to the three ADRs it revises" overstates: the ADR revises two (0012, 0013) and builds on one (0014), and the relationship is "revises," not supersession. This peripheral count does not touch the material verdict (traceable to a recorded, accepted decision), which is fully backed.

## Q3 — did the CI this PR exists for actually pass pre-cutoff?

**Score: correct**

Fully verified against admissible GitHub API records. PR#18 head sha is `b65bc3a35aae06bafc50b39ec2d196224204f2f4` (`gh api repos/czync/atlas/pulls/18`). Its sole CI run (`.../actions/runs?head_sha=b65bc3a3...`, run 28465016407, event `pull_request`) was `created_at 2026-06-30T17:54:48Z` and completed `success` at `updated_at 2026-06-30T17:59:18Z` — 75 seconds before the 18:00:33Z cutoff, matching the operator's "green 75s before cutoff." Its jobs (`.../runs/28465016407/jobs`) were `verify`, `e2e (ubuntu-latest)`, `e2e-smoke (prod build)`, and `e2e (windows-latest)`, all `success` — i.e. the previously-local-only cross-OS E2E matrix + prod smoke did run and pass. PR#19 (`fix(atlas): e2e CI green — drop video (no ffmpeg under zero-download)`) had base `feat/0.2.0` (PR#18's head branch), created 06:26:31Z, merged 06:42:29Z the same day — a same-day CI-fix loop that cleared the ffmpeg/video blocker on the branch before PR#18's run, exactly as the operator characterizes.

## Q4 — where "zero-download" is recorded and what it does instead

**Score: partial (2/3)**

The mechanism and recording are correct, but the operator did not identify the motivating constraint the question explicitly asks for. Sub-claims: (1) *what recorded constraint motivates zero-download* — NOT delivered: the operator says only "a recorded, deliberate design … not an ad-hoc CI hack," naming none of the candidates; the reachable answer from `plans/026-e2e-browser-testing.md` (title "zero browser download · Windows-friendly"; decision 2 "Runner images drift, so 'Edge is pre-installed' is verified each run") is Windows portability plus CI/install reliability — there is no recorded network-policy/corporate/air-gap rationale. (2) *where written at cutoff* — delivered: `plans/026-e2e-browser-testing.md` with acceptance gate `G-zero-download:78,204-206,308,316,336`. (3) *what E2E does instead* — delivered: drives a system-installed browser channel `PW_CHANNEL ?? (darwin ? 'chrome' : 'msedge')` and suppresses both the install-time (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`) and run-time download paths (plan 026 decision 2, WU2 doctor `scripts/doctor.mjs`), with PR#19's video-drop as its known cost. 2 of 3 material sub-claims backed.

## Q5 — doc-required delivery completeness

**Score: correct**

Independent sweep confirms the "delivery-complete within what the docs demand" verdict. The docs require: a dev path (`README.md:34`), a prod-server path (`README.md:63-64`, `build` then `start` on `.output`), the mock/live seam (`README.md:39-52`), and deployment assigned to `infra/` (`README.md:24`, "Deployment / infrastructure config"). Each is present: `infra/main.tf` is a real ECS-Fargate + ALB + VPC + DynamoDB + Secrets-Manager Terraform stack (not a stub), and a `portal/Dockerfile` supplies the `container_image` it consumes (`infra/variables.tf`). The `/releases` live path is wired in the merged state, not merely mocked: `portal/src/api/server/releaseNotes.ts:18-20` calls `resolveReleaseNotes`, which resolves through the real Confluence channel (`context-layer/src/releaseNotes/resolveReleaseNotes.ts:1-6,40+`), gated on `CONFLUENCE_*` creds + `CONFLUENCE_RELEASE_NOTES_PAGE_ID` and degrading to an honest-empty list when unconfigured. So the operator's claim that the live-Confluence path depends on out-of-repo creds/deployment (assigned to `infra/`) is accurate, and no doc-required piece is missing. The operator flagged their own missing-piece sweep as incomplete, but the conclusion holds against my independent check, so it is not false reassurance.
