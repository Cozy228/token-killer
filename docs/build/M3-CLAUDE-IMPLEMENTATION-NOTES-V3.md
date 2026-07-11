---
status: active
review_after: 2026-08-11
note: M3 UI-rework (P40 / V3) deviation log — Claude track. Built on branch m3/rescope-claude
  (continuation of the rejected v2 build: kernel/goldens/export/server-skeleton kept, frontend +
  auth + lifecycle rebuilt). Reviewer reads this before the diff.
---

# M3 V3 — Claude-track implementation notes (deviation log)

Work order: `docs/build/M3-GOAL-PROMPT-V3.md` (amended @ff143ff3). Branch `m3/rescope-claude`,
rebased onto `origin/feat/1.0.0`. Workspace switched per the maintainer's mid-task direction from
the (now removed) `m3-ui-rework-claude` worktree to this one — **confirmed**.

## What was kept vs. rebuilt (P40 R14/R16)

Kept (served the order, reused as-is or lightly reshaped):
- `packages/core/src/guide/{types,glyphs,builders,perf,index,fixture}.ts` — the projection kernel
  (core-owned DTOs embedding `ClaimEnvelope`, golden transcripts, perf recorder).
- `packages/cli/src/guide/{routes,export,open}.ts` — the single route table (one-render-path seam),
  the export renderer, detached browser open.
- The security spine of `server.ts`: loopback bind + random port, `assertNoEgress`, Host allowlist
  (DNS-rebinding), strict CSP, in-process core calls, traversal-guarded static serving, HttpOnly
  cookie bearer token gating every route.

Rebuilt / torn down (the order rejects these):
- The entire `packages/guide` frontend and its three-surface (`Canvas`/`Subject`/`Inspector`) +
  skin execution — replaced with a job-first IA (below).
- Auth UX: token-in-URL as the *ongoing* carrier → R12 cookie-first (token is a one-time bootstrap,
  stripped from the address bar client-side).
- Lifecycle: pagehide/`sendBeacon('/api/close')` grace-window teardown + 10-min aggressive idle →
  R13 (Ctrl-C graceful close + long idle backstop, default 2 h, reset by any authorized request).
- `--fixture` wrote demo rows into the developer's REAL store → R10 isolated temp-home fixture.

## Reference findings (required by V3 "Read first" item 5)

Studied `/Users/ziyu/Workspace/token-killer/.research/{understand-anything,gitnexus,davia}`.

### understand-anything (UA) — graph at scale
- **TOOK:** "never lay out the global graph." UA's overview is a small set of *drillable* cluster
  portals (not terminal counts), and only the expanded subgraph is ever laid out (two-stage lazy
  ELK). The load-bearing invariant: **topology (where things are) is rare/async/cached; visual
  state (selection/hover/highlight) is a cheap synchronous overlay that never triggers relayout.**
- **TOOK:** search is annotation/targeting over a stable layout, never a re-query that rebuilds
  the canvas.
- **REJECTED:** dagre row-sprawl and ELK compound (`INCLUDE_CHILDREN`) layout; laying out the whole
  entity set. This is precisely the wall the v2 canvas ("7 kind-count boxes at 9,588 entities")
  died on.
- **HOW IT SHAPED THIS BUILD:** I went further than UA and made the **entry surface not a canvas at
  all.** A global graph over 9.6k entities has no honest legible overview, so Orient is an
  orientation *dashboard* (repo identity, per-source freshness/coverage, attention counts, hot
  areas). Graph rendering appears ONLY bounded inside a Subject as a depth-1 ego-network
  (`nodeCap` 24) with a declared budget — exactly UA's "bound what the layout sees," applied as
  "the only graph you ever see is one subject's neighborhood." Since I never render >24 nodes, I do
  not need ELK/two-stage/containers; a hand-computed radial layout in React Flow suffices and is
  defensible at 10× (the bound is on the projection, not the viewport).

### gitnexus — canvas-first repo IA
- **TOOK:** the "where do I start" answer is a **home screen, not the hairball** — gitnexus opens on
  a recent-repos launcher, the graph comes after. My Orient is that home screen. Also took the
  reducer-as-overlay pattern (dim/annotate, don't rebuild) and search = highlight-with-LIMIT.
- **TOOK (conceptually):** ego-network N-hop bound × type filter as a bounding lever — my Subject
  neighborhood is the depth-1 ego bound; kind filters live in cmd-K search.
- **REJECTED:** one global ForceAtlas2 over the whole graph as the primary scaling strategy (leans
  on WebGL/LOD tricks and gives a less legible "structure at a glance"); Sigma/WebGL (awkward for
  the DOM-rich node cards + side panels this trust-first UI needs). Also rejected LLM cluster naming
  (M3 bans LLM generation; zero egress).
- **WHY:** gitnexus proves the *interaction* layer (filter/highlight/dim) tames scale independently
  of layout — but its whole-graph layout instinct is exactly what the v2 build's "global layout"
  resembled, so I took its filters/reducers, not its layout model.

### davia — local-server ergonomics
- **TOOK:** the process stays alive purely because a listening socket holds the event loop open (no
  keepalive hack needed); signal-only graceful shutdown with an `isShuttingDown` re-entrancy guard;
  open the browser detached only after the server is confirmed listening.
- **ADDED what davia lacks:** davia has NO idle backstop and a no-op cleanup that can't
  `server.close()`. R13 wants a *long* idle backstop and a graceful close, so I keep a closable
  server handle and a `.unref()`'d idle timer (default 2 h) that never itself keeps the process
  alive. This is the R13 shape: manual start, Ctrl-C stop, generous backstop — not aggressive
  teardown.

## Decisions (design left these open)

- **D-ENTRY (entry surface is a dashboard, not a canvas).** R3/§3.1 of the brief described a "flat
  flow canvas" entry; P40 R14 discards the v2 execution and hands me the IA, banning any global
  layout over the full entity set. Per the reference study a global canvas over 9.6k entities is
  the v2 failure mode, so Orient is an orientation dashboard and all graph rendering is a bounded
  ego-graph inside a Subject. Conservative reading of R14's ban; recorded here.
- **D-CLUSTERS (kind clusters demoted).** `buildCanvasProjection` still returns by-kind `clusters`
  (kernel unchanged → goldens stable), but the frontend NEVER renders them as the primary view
  (R14 hard ban). Orient uses `sources` + `badges` + `hotAreas`; kind counts appear only as a thin
  secondary composition strip, clearly labelled, never as group boxes.
- **D-GRAPH-LIB (React Flow, no ELK).** Bounded neighborhood uses `@xyflow/react` with a
  hand-computed radial layout. `elkjs` stays an (unused) dependency to avoid lockfile churn; I do
  not import it — depth-1 ≤24-node ego graphs need no layout engine.
- **D-COOKIE-BOOTSTRAP (R12).** The printed URL keeps `?token=…` as the *one-time bootstrap*; the
  server sets the HttpOnly/SameSite=Strict cookie on the first authorized shell hit and the app
  strips the token via `history.replaceState`. Query-token remains an accepted carrier ONLY so the
  bootstrap resolves; F5/deep-link/new-tab thereafter ride the cookie. This is the sanctioned R12
  flow, distinct from the rejected v2 "token is the ongoing carrier."
- **D-READWRITE-STORE.** The server opens a read-write store (`openStore`) so the R10 startup
  `RefreshEngine` catch-up can ingest; every HTTP route is still read-only (G-readonly route sweep).
  `internHandle` is never called by a projection (drill keys are entity ids), so no route mutates
  domain data. Index/handle bookkeeping parity with the MCP serve path.
- **D-REFRESH-BUDGET.** R10 startup catch-up runs `RefreshEngine.refresh()` over a 5 s budget
  (serve path uses 3 s; the guide is a foreground human session so a slightly larger gate is
  acceptable) and lets the remainder drain in the background of the process lifetime.

## Deviations (departures from the plan)

- **DV-EMBEDDED-SHELL.** The v2 `EMBEDDED_SHELL` fallback (token-from-URL + pagehide beacon) is
  rejected. I replaced it with a minimal honest fallback page (no beacon, no app auth logic) served
  only when `packages/guide/dist` is absent (dev without a build). The real product serves the
  built bundle. G-egress test updated to assert on the new shell.
- **DV-SHUTDOWN-TESTS.** The v2 `G-shutdown` tests asserted the beacon/grace-window teardown (now
  removed). Rewritten to R13: idle backstop fires when idle and is reset by any authorized request;
  no `/api/close` route exists; `server.close()` is graceful. Added G-auth-ux, G-fixture-isolation,
  G-empty-state suites.

## Adjacent-found (untouched)

- O-36 (serve-log write path → Serve Audit) and O-37 (engines floor mismatch 22.16 vs 22.18) remain
  open and out of scope; not touched.

## Open questions

- (to be filled during build/drive)

## Acceptance self-verification

- (filled item-by-item in the closer slice)

## Real-repo drive (S1–S10)

- (filled in the closer slice, with real values + perf numbers)
