---
status: active
review_after: 2026-08-08
note: Claude-track (m3/rescope-claude) implementation deviation log for the M3 dual-track build.
  Reviewer (Fable) reads this BEFORE the diff. Work order = docs/build/M3-GOAL-PROMPT-V2.md;
  ratified design = docs/build/M3-RESCOPE-BRIEF.md (wins on conflict).
---

# M3 Claude-track — implementation notes (deviation log)

Identity: CLAUDE track. Branch `m3/rescope-claude`. In-worktree build; never pushes.

## Build order status

| Slice | State |
|---|---|
| 3a projection kernel (core) | DONE — kernel + fixture + goldens + gates + C1–C10 green |
| 3a server (cli) | DONE — loopback+token+host-allowlist, idle/disconnect shutdown, export; G-loopback/G-egress/G-readonly/G-shutdown/C12 green |
| 3a Vite shell + glyph component | DONE — React 19 + Vite app builds; envelope glyph chip + claim legend |
| 3b canvas | DONE — React Flow field (elkjs layout), omnibox search, time/churn lenses, badges, side preview, legend dock |
| 3c subject | DONE — biography: facts+chips, decision chain, history/co-change table, bounded neighborhood, evidence drawer |
| 3d inspector | DONE — tabbed worklist (review/conflicts/push/memory/health), exact CLI copy-commands, verbatim push digest |
| 3e design variants | DONE (4 skins graphite/ledger/depth/signal, `?skin=`, runtime switch, C11 test green); craft-floor audit per skin = partial (see remaining) |
| 3f export | DONE — `ctx guide --export`, one-render-path via shared PROJECTION_ROUTES, C12 export-diff green |

### Lens ruling (3b records this for the open item, brief §9)
The **lens form suffices** for both time (supersession) and churn (co-change) on the fixture and
living repo: both render as bounded canvas overlays fed by their own `time-lens` / `churn-lens`
projections (each budget-disclosed). No standalone Decisions/History PAGE was needed — the Subject
surface already carries the subject-SCOPED decision chain + history, and the canvas lenses carry
the GLOBAL view. Recommendation to the maintainer: keep lenses, do not add standalone pages. This
is recorded evidence for the open ruling, not a unilateral close.

## Perf recorder — living-repo numbers (G-perf-recorded; recorded, never asserted)

Recorded on THIS checkout (docs+git ingested), 2026-07-11 (values drift with the repo; recorded only):

```
canvas:    26.69ms · nodes=70  · links=199 · omitted=5528 · bytes=167501
inspector:  4.26ms · nodes=4   · links=233 · omitted=0    · bytes=107073
search:    44.35ms · nodes=20  · links=0   · omitted=393  · bytes=25586
subject:    4.07ms · nodes=24  · links=44  · omitted=0    · bytes=32865
```

Fixture-tier perf is recorded per-run by the same `*WithPerf` recorders (deterministic store).
`canvas.omitted=5528` is the disclosed node-cap omission on the living repo (budget working as
designed — the canvas stays DOM-comfortable because the budget says so, not by luck).

## Decisions (choices the design left open)

- **Projection kernel location** — placed in `packages/core/src/guide/` (new module), exported
  through `packages/core/src/index.ts`. Rationale: the brief says the kernel is core-owned and the
  guide is a VIEW; core stays the single source of query truth.
- **Fixture generator location** — `packages/core/src/guide/fixture.ts`, exported from core, so the
  deterministic test tier (core golden transcripts), the CLI server smoke, and the Playwright smoke
  all build the SAME script-generated store. It is a deterministic demo/fixture builder, not a test
  double: it uses only the public store write API and a fixed clock, so ids/handles are stable.
- **Glyph grammar owned by core** — `packages/core/src/guide/glyphs.ts` promotes
  `renderEnvelopeTerse`'s 1-glyph-per-dimension grammar into a structured `EnvelopeGlyphs` DTO
  (glyph + human label + raw value per axis). The React component is a pure adapter over it, so the
  terse CLI render and the web render never fork (goal-prompt "never fork" rule).
- **`authority` compat-shadow disclosure** — every `EvidencePacket` carries `preRSlice: string[]`
  listing the envelope axes still null (derivation/confidence) so the UI can tag them `pre-R-slice`
  per R6, instead of fabricating a value.
- **No handle minting (G-readonly)** — `Store.internHandle` INSERTs into the `handles` table (a
  write). The projection kernel therefore NEVER calls it. Drill keys are the entity id itself
  (`resolveHandle`/`getEntity` accept the verbatim `kind:key` form, and `ctx recall`/`ctx memory`
  accept entity ids), and a short handle is surfaced only when a read already returns one
  (`listMemoryEntries` LEFT JOINs it for free). This keeps the guide airtight read-only with zero
  core-store change.

## Reviewer round — defects fixed (2026-07-11)

- **D1: reload / skin-switch killed the session (reproduced by reviewer).** `main.tsx` fires
  `navigator.sendBeacon("api/close")` on `pagehide`, which fires on EVERY navigation (F5, `?skin=`
  URL change), not just tab close — and the server closed IMMEDIATELY on `/api/close`. FIX: the
  beacon now SCHEDULES teardown after a grace window (`graceMs`, default 4s); ANY subsequent
  token-authorized request cancels the pending close (`cancelPendingClose()` runs after auth passes
  for every non-close route). A reload reconnects within the window and survives; a real tab close
  (nothing reconnects) still tears down within the window. Idle-timeout semantics unchanged.
  Tests: `guide-server.test.ts` now has "beacon with NO follow-up tears down after grace" and
  "beacon followed by a request within grace keeps the server up" (both green). `packages/cli/src/guide/server.ts`.
- **D2: React Flow MiniMap/Controls rendered default-light (white square on dark skins).** CHOICE:
  themed via tokens (not hidden) so the chrome FOLLOWS `data-skin` automatically — `maskColor`/
  node/background driven by `--bg`/`--surface`/`--hairline` in `app.css` (`.react-flow__minimap*`,
  `.react-flow__controls-button`). Chrome stays neutral (no status hues); one rule set covers all 4
  skins, which keeps the C11 design-layer-only invariant intact. Verified present in the built CSS.

- **D3: Claim Legend count nondeterminism (reviewer saw conflicting 1 → 3).** ROOT CAUSE: the
  legend was fed `data.badges.openConflicts` — the store's count of conflict ROWS — as its
  `conflicting` number (and NOTHING populated the other five statuses). That number (a) has a
  different semantic than the status glyphs the legend teaches (envelope status, not conflict rows),
  and (b) is store-history dependent: conflicts/claims are append-only, and BOTH subjects of a
  contradiction feed row-based reasoning, so re-seeding the fixture store or re-navigating drifted
  it upward. PINNED SEMANTIC (now documented in the legend's caption + aria/title): the legend
  counts "entities whose claim envelope has status X on the CURRENT surface's projection", derived
  from the projection's evidence packets via `statusCounts(data)` — the same projection in always
  yields the same counts out, independent of navigation/fetch order, and matches the glyph grammar
  the legend teaches. Ground truth verified: the canvas projection has EXACTLY ONE conflicting
  envelope (`mem:retry-note`); `statusCounts` returns `conflicting: 1`. Tests:
  `packages/guide/tests/legend.test.tsx` (determinism across repeated calls + two fresh mounts;
  count equals conflicting-envelope count and is decoupled from `openConflicts`) and a core-source
  determinism assertion in `3a-guide.test.ts` ("D3: canvas per-status envelope counts are
  deterministic + match ground truth"). Files: `Canvas.tsx`, `ClaimLegend.tsx`, `app.css`.

## Deviations (departures from the plan + why)

- **Design authority adopted mid-3a (2026-07-11)** — the reviewer added
  `docs/build/M3-CLAUDE-DESIGN.md` (binding for the `packages/guide` UI layer only; arbitration
  order RESCOPE-BRIEF §3-§4 + LAW §3 > design doc > discretion). Adopted. It changes NO projection
  contract, route, test, or acceptance item, so the committed 3a core kernel and the CLI server are
  unaffected. Alignment notes for when I build the UI:
  - The core `EnvelopeGlyphs` DTO (glyphs.ts) already carries per-axis `{glyph,label,value,gap}`,
    which is exactly the adapter input the design's §3 glyph chip needs (shape=derivation,
    hue=status, opacity=freshness, ticks=confidence, lock=restricted). No DTO change required.
  - Minor redundancy (not a conflict): core `envelopeGlyphs` also assigns a status *glyph char*
    (●◆○△▢?). The UI encodes status by HUE (design §3), so the UI adapter reads the axis VALUE,
    not that char. The char stays as a harmless text-only fallback (keeps the terse grammar intact).
  - Fonts (IBM Plex Sans/Mono) + Phosphor icons must be VENDORED/npm-bundled (zero egress) when I
    reach the UI — reinforces G-egress.

## Adjacent-found (untouched)

- O-37 engines mismatch (root `>=22.18.0` vs core/cli `>=22.16`) — pre-existing, left untouched per
  guardrail ("do NOT change any engines field").
- **5 pre-existing living-repo test failures (NOT mine, untouched)** — `1e-docs A5-adr`,
  `1f-selection A6-search`, `1g-serve A7-why` + `A7-drill`, `2d-callgraph B4-mention`. These are
  living-repo ranking/edge assertions (the "fragile to doc-churn" class flagged in repo memory).
  Verified they fail IDENTICALLY at the base commit `3730192d` (origin/feat/1.0.0) with none of my
  changes present — I created a detached worktree at that SHA and ran the four files: same 5 red,
  13 passed. So they are red on the base branch, not a regression from the guide work. My additions
  are purely additive (new `packages/core/src/guide/**`, `packages/cli/src/guide/**`, tests, docs);
  I did not touch ingest/select/serve logic. Left untouched (out of scope; not my defect to fix).

## Acceptance checklist — item-by-item self-verification

Gates (evidence = the named test, all run green with `TK_SHIM_DIR` unset):
- **G-readonly** — PASS. `packages/cli/tests/guide-server.test.ts` "G-readonly: … a write method → 405; store unchanged": sweeps every projection path, asserts POST/PUT/DELETE/PATCH → 405 and `store.entityCount()` unchanged. Kernel never calls `internHandle` (the only store-write on a read path) — drill keys are entity ids.
- **G-loopback** — PASS. Same suite: binds `127.0.0.1` only; EVERY route (`/`, api, assets, unknown) → 401 without the bearer token; token via header/query/cookie resolves; non-loopback Host → 403 (DNS-rebinding).
- **G-egress** — PASS. Server suite (no external URLs in shell/export html + strict CSP `connect-src 'self'` + guard throws on `ANTHROPIC_API_KEY`); `packages/guide/tests/egress.test.ts` (disclosure mirror == core; built `dist/` has no CDN/font/telemetry host); fonts vendored via `@fontsource` woff2; no wasm/CDN in bundle.
- **G-shutdown** — PASS. Server suite: idle-timeout teardown + `/api/close` disconnect beacon both resolve `server.closed`.
- **G-provenance** — PASS. `packages/core/tests/acceptance/3a-guide.test.ts` "G-provenance": sweeps canvas/subject×2/inspector/search, every evidence packet's `envelope.evidence.uri` is non-empty and appears in its terse render.
- **G-honest-gap** — PASS. Core test "G-honest-gap" (null axes → `preRSlice` + `?` glyph, never fabricated) + `packages/guide/tests/envelope-chip.test.tsx` (null derivation/confidence render `?` + "unknown" + `compat shadow` tag).
- **G-budget** — PASS. Core test "G-budget": every projection declares `budget{edgePredicates,depth,nodeCap}` and `omitted == sum(omittedByReason)`; golden transcripts assert the full payload.
- **G-one-render-path** — PASS. `packages/cli/tests/guide-server.test.ts` C12: exported `canvas.json` deep-equals both the live `/api/canvas` response and the direct builder output (shared `PROJECTION_ROUTES`).
- **G-perf-recorded** — PASS. Core perf recorder records fixture + living-repo numbers (recorded, never asserted). Living numbers in the section above.

Scenarios:
- **C1** canvas sources+badges — PASS (core C1 + server "serves canvas projection" + Canvas surface).
- **C2** omnibox finds doc/symbol/memory note, drillable — PASS (core C2; omnibox in Canvas.tsx drills to Subject by entityId).
- **C3** subject(symbol) facts+anchors+glyphs — PASS (core C3; Subject.tsx renders chips per fact).
- **C4** subject(memory note) zone+lifecycle — PASS (core C4).
- **C5** time lens supersession — PASS (core C5; LensOverlay).
- **C6** churn lens co-change — PASS (core C6; LensOverlay).
- **C7** review queue + exact CLI commands — PASS (core C7; Inspector copy-commands).
- **C8** conflicts grouped by reason class — PASS (core C8; Inspector conflicts tab).
- **C9** push preview verbatim digest + budget — PASS (core C9; Inspector push tab).
- **C10** health per-source gen/cursor — PASS (core C10; Inspector health tab).
- **C11** skin switch changes only the design layer — PASS (`packages/guide/tests/skin.test.tsx`: chip + legend DOM byte-identical across all 4 skins, only `data-skin` differs).
- **C12** export-diff (live ≡ export) — PASS (server suite, above).

Suites: core (516 pass / 5 pre-existing living-repo fails — see Adjacent-found, red on base), cli (all pass incl. 13 guide-server), guide (9 pass). Final numbers reported to the reviewer.

## Remaining / not done (honest gaps for the reviewer)

- **Playwright browser smoke** — NOT DONE as a real browser run. Playwright + browser binaries are
  not installed (network/binary weight). Substituted with an HTTP-level built-app smoke (server
  serves the real hashed Vite bundle, token-gated, in `guide-server.test.ts`) + happy-dom component
  tests. A `@playwright/test` headless smoke that boots the server and asserts the canvas renders is
  the one remaining test-surface item; the app is structured for it (stable roles/labels).
- **Craft-floor §7 per-skin contrast re-verification** — the 4 skins are built to the token spec and
  the C11 structural-invariance test is green, but automated WCAG-AA contrast verification per skin
  is not wired (design §7 asks for it). Tokens were chosen to the doc's stated ratios; a contrast
  assertion test per skin remains.
- **elkjs bundle weight** — the guide JS bundle is ~1.8MB (elkjs is ~1.5MB). Acceptable for a local
  loopback tool (no network fetch), but a lazy `import()` of the layout module would trim first
  paint. Not done; noted.
- **`ctx guide --project <dir>`** — the guide command reads the project dir from the CLI `RunIo`
  (cwd default), not a `--project` flag (only `mcp` parses `--project`). `--fixture`/`--export`
  work; wiring `--project` for guide is a one-line follow-up if wanted.

## Accepted behavior (recorded for the maintainer, no action)

- **Idle-timeout kills an OPEN-but-unused tab after >10min (no client keepalive).** By design:
  "on demand, not a standing destination" (brief §2) — the guide is meant to be transient. There is
  no heartbeat/keepalive, so a tab left open and idle past `idleMs` (default 10 min) sees the server
  self-shut; the empty-state copy tells the user to re-run `ctx guide`. Considered and kept as the
  intended ephemerality; flagging it so the maintainer sees it was a deliberate choice, not an
  oversight. (Any authorized request — including the reload reconnect from D1 — resets the idle
  timer, so an actively-used tab never hits this.)

## Open questions

- Canvas member preview is bounded to the projection's per-cluster `nodeCap` (12); on a large repo
  the canvas shows cluster cards, not every node. Whether the maintainer wants a denser WebGL lens
  (Sigma, the named fallback) is explicitly out of scope now (guardrail) — flagging that the DOM
  React Flow field is comfortable at fixture + this-repo scale, per the recorded perf.
</content>
