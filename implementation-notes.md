# Implementation notes — M3 slice 5c (Atlas core), Fable track

Deviation log for the 5c build on branch `m3/v4-fable` (base tip `67039ca7` = 5a spike + 5b server +
presentation round). NOT committed (reviewer merges). Detailed slice write-up:
`packages/guide/SLICE-5C-NOTES.md`.

> This file previously held the o33b/drill-guards (GUARD-1/GUARD-2) notes for a now-merged core
> slice; that work is on `feat/1.0.0`. Repurposed here for the current slice's deviation log.

## Files changed

New:
- `packages/guide/src/atlas/lens.ts` — Recent-lens recency bucketing (pure).
- `packages/guide/src/atlas/persist.ts` — within-generation session persistence (injectable store).
- `packages/guide/src/ui/Minimap.tsx` — bottom-right folder minimap (DOM/SVG, no deps).
- `packages/guide/src/ui/GenerationPrompt.tsx` — dismissible generation switch prompt.
- Tests: `lod-5c.test.ts`, `lens.test.ts`, `persist.test.ts`, `minimap.test.tsx`,
  `generation.test.tsx`.

Extended:
- `packages/guide/src/atlas/lod.ts` — hysteresis levels (`ZOOM_UP`/`ZOOM_DOWN`, `nextZoomLevel`,
  `revealForLevel`), `computeSlice` `state` arg (revealLevel + pinnedIds), `hotspotViewport`.
- `packages/guide/src/atlas/types.ts` — `recency` on `AtlasNode`; `GenerationInfo` + `generationIdentity`.
- `packages/guide/src/atlas/compile.ts` — thread file `recency` onto file nodes.
- `packages/guide/src/data/source.ts` — `pollGeneration`, `generationInfoOf`, `corpusCounts`.
- `packages/guide/src/ui/GraphRenderer.tsx` — `centerOn` on `RendererApi`, `recencyBuckets` prop,
  `fileRecencyClassName`.
- `packages/guide/src/ui/ReactFlowRenderer.tsx` — `centerOn` impl + recency class on file wrappers.
- `packages/guide/src/ui/SpikeApp.tsx` — hysteresis+debounce, pinned reveal, hotspot cold-open,
  persistence, generation poll/switch, Recent lens, reading focus, minimap + prompt wiring, HUD lens.
- `packages/guide/src/styles.css` — recency ramp, minimap, gen-prompt, HUD lens tokens + rules.
- `packages/guide/tests/{spike-app,selection}.test.tsx?` — mock API `centerOn`; recency-class tests.
- `packages/cli/src/guide/corpus.ts` — `GuideGenerationInfo`, `buildGenerationInfo`, `generationJson`.
- `packages/cli/src/guide/server.ts` — `GET /api/generation` route.
- `packages/cli/tests/guide-server.test.ts` — generation-endpoint test + `generationJson` seam.

## Decisions (choices the design left open)

- **Hysteresis thresholds.** UP = historical boundaries `[0.35, 0.7, 1.2]`; DOWN = 0.8×UP =
  `[0.28, 0.56, 0.96]`. Chosen so a fresh (no-history) zoom→level map is byte-identical to the old
  `revealFor`, keeping all existing LOD tests green while adding the dead band.
- **Re-slice debounce = 180 ms** (inside the 150–250 ms band the order named).
- **Cold-open hotspot** = densest **top-level (depth-1)** folder region (most lit FILE lots), padded
  **0.25 per side**. Depth-1 gives a neighbourhood frame, not a single file. Ties → smallest region id.
- **Recency buckets.** `0` = event-window membership (anchorFiles + resolved touches — the precise
  "last 20 commits" set, no time heuristic); `1` = within ~30 days of the **newest commit epoch**
  (deterministic "now", not wall-clock); `2` = older; `3` = null.
- **Generation identity** = `"code.git.docs.memory"`. `/api/generation` also returns cheap
  `fileCount`/`declCount` so the prompt shows a genuine counts diff.
- **Persistence scope.** Saved for every generation; **restored only on a cold open** with a matching
  `projectionId + generation identity` key. Deep links always honor their projected viewport; a
  different generation identity never restores stale positions (D10).
- **Reading-focus zooms.** decl = 3.2 (≥1.6, above the label threshold); file = `max(1.0,
  200/(side·14))` (~200 px lot); folder = frame the region. Canvas clicks keep the gentle `revealNode`.
- **Poll cadence** default 30 s (`DEFAULT_POLL_MS`), overridable via `pollMs` (tests use small values).

## Deviations (departures from the plan, with rationale)

- **`computeSlice` signature.** Added an optional 7th `state: { revealLevel?, pinnedIds? }` arg rather
  than folding into `LodOptions` (which is the *static* budget). Per-frame state stays separate and
  backward compatible — every existing call site passes no 7th arg.
- **Recency "classes present in render" verified via the pure composition, not a full-RF DOM
  assertion.** React Flow does not mount in happy-dom without a measured pane (`clientWidth = 0`) —
  which is exactly why the pre-existing `spike-app.test.tsx` mocks the renderer. Proven instead
  through `fileRecencyClassName` (the exact class the renderer stamps) + its wiring + the `styles.css`
  rules. The true visual is the reviewer's browser re-drive.
- **`GuideCorpusResult` gained a required `generationJson` field.** The one test seam constructing it
  (`guide-server.test.ts`) was updated in the same change; no production caller omits it.
- **Generation detection is frontend-polling only.** The 5b server serves a static per-run corpus, so
  the identity does not actually change within one process; the full mechanism (endpoint + poll +
  prompt + switch/reload + selection preservation) is built and tested against a mock source. Live
  store re-refresh is out of 5c scope.

## Adjacent-found (untouched)

- The 180 ms debounce delays the *first* user-driven re-slice after a gesture by up to 180 ms —
  acceptable under "presentation-first, performance-last". Not optimized.
- Minimap viewport-drag uses pointer events; its feel across all four variants at real scale is not
  GUI-tested here (reviewer re-drive). Left as-is.
- Search-mark density on the minimap is uncapped (fine for current + 10× fixtures).

## Open questions

- Should a cold open that *restored* a session still raise the "New generation" prompt when a newer
  generation is detected mid-read? Current behavior: yes (restore and live-poll are independent).
- Whether reading-focus decl zoom (3.2) is the maintainer's preferred "reading" density vs. the
  literal ≥1.6 floor — I chose 3.2 to also cross the decl-label threshold.

## Self-verify (acceptance, item by item)

| Acceptance item | Result | Evidence |
|---|---|---|
| Hysteresis: up/down crossing → no flap; down<up asserted | PASS | `lod-5c.test.ts` "semantic-zoom hysteresis" (4) |
| Pinned reveal: click-pin reveals children at far zoom, Esc clears | PASS | `lod-5c.test.ts` "pinned reveal" (3) |
| Minimap: top-level regions only, viewport rect, region-click pans, search marks, lens marks | PASS | `minimap.test.tsx` (6) |
| Cold-open hotspot = densest-region bbox; no-activity = fit repo | PASS | `lod-5c.test.ts` "cold-open hotspot" (3) |
| Persistence restored same-gen; NOT across gen identity | PASS | `persist.test.ts` (6) |
| Generation switch: prompt on identity change, map unchanged until confirm, selection preserved | PASS | `generation.test.tsx` (2) |
| Recency ramp: bucket classification + classes present in render | PASS | `lens.test.ts` + `selection.test.ts` (`fileRecencyClassName`) |
| CLI `/api/generation` endpoint + test | PASS | `guide-server.test.ts` "GET /api/generation …" |
| Naming gate still green | PASS | `naming-gate.test.ts` |
| Existing suites green (guide 65 → 99, cli 43 → 44 + 16 todo) | PASS | guide 99 pass; cli 44 pass + 16 todo |
| `pnpm -r typecheck` | PASS | core + cli + guide clean |
| build | PASS | `pnpm --filter @contexa/guide build` succeeds |

## What I did NOT do

- Did not touch the four design-variant folders (off-limits); substrate + wireframe + additive
  types/CSS hooks only.
- Did not add dependencies (minimap is DOM/SVG).
- Did not optimize performance (presentation-first priority).
- Did not implement the other lenses (Churn/Co-change/Review/Conflict — slice 5f); HUD shows a static
  "Lens: Recent" label only.
- Did not commit (reviewer merges).

---

# Implementation notes — M3 v4 Fable "Connections view" (THROWAWAY SHOW)

Scope: SHOW mock proving the hybrid model (atlas = orientation, focus graph = reading). No commit.
Guide package only. Base worktree tip `6cd2f3e7`.

## Files changed / added
- `packages/guide/src/ui/FocusGraph.tsx` (NEW) — overlay + pure `buildFocusModel`.
- `packages/guide/src/styles.css` — focus-graph styles, HUD quiet toggle, `.fe-connections` button,
  dark-variant surface overrides (substrate-scoped; variant folders untouched).
- `packages/guide/src/ui/FocusedEvidence.tsx` — optional `onOpenConnections` + "Connections" button.
- `packages/guide/src/ui/SpikeApp.tsx` — connections state, quiet-edges state + HUD toggle, `v` key,
  double-click branching, open-on-map, overlay render.
- `packages/guide/src/ui/GraphRenderer.tsx` — additive `quietEdges?` prop on the seam.
- `packages/guide/src/ui/ReactFlowRenderer.tsx` — quiet-mode edge filter (EdgeLayer) + decl-cell
  filter (Inner nodes memo), additive.
- `packages/guide/tests/focus-graph.test.tsx` (NEW) — derivation + render test.

## Decisions (design left these open)
- **Package boundary.** `packageOf(path)` = `packages/<pkg>` for monorepo paths, else the file's
  immediate parent directory. The real corpus (token-killer) is a monorepo, so cross-package
  counterparts become boundary pills as intended; the parent-dir fallback keeps boundary-pill
  behaviour meaningful for non-monorepo paths (and the fixture test).
- **Pill = one boundary node, not an aggregated package.** The work order says a pill re-roots "on
  that node". Folders carry no call/import edges, so re-rooting on a folder would show an empty view.
  Each pill therefore represents a single out-of-package (or overflow) file/decl counterpart; its
  label is that node's path and it re-roots on it. Overflow beyond the card cap also spills to pills;
  a "+N more" expander reveals the rest (PILL_SHOW = 6).
- **Counterpart aggregation (file subject).** One card per counterpart file; calls + imports summed
  into `callCount`/`importCount`; chip shows "N calls · M imports"; connector relation = calls if any
  calls else imports (solid vs dashed). Decl-level call pairs (from `edges.sym`) hang off the card as
  an expandable nested list carrying claim_id provenance.
- **Card cap.** CARD_CAP = 8 in-package counterparts per column; the rest spill to pills.
- **`v` key + double-click.** `v` opens Connections for the current selection (ignored while a text
  field is focused). Double-click: folders keep the existing drill/fit (R4-6); files/decls open
  Connections (the "rewire double-click-fit to only apply on folders" instruction).
- **Esc ownership.** The overlay owns Escape while mounted (capture listener: pop a hop, else close);
  SpikeApp's global Esc early-returns whenever `connectionsRootId != null`.
- **Dark-variant surfaces.** New `--fg-surface*` tokens (light defaults) with overrides scoped to the
  two dark themeClasses (`.variant-instrument`, `.variant-transit`) in the SUBSTRATE styles.css. The
  substrate already references variant tokens; variant folders were not touched.
- **CSS location.** Put focus-graph CSS in `src/styles.css` (allowed) rather than a separate imported
  `.css`, to avoid CSS-import-in-vitest ambiguity and match the existing pattern.

## Deviations (departures from the plan)
- **`.fe-connections` frame colour.** First used `--lit-outline` for the entry button's border; in
  the instrument dark variant that token falls back to near-black and the frame vanished against the
  dark panel (verified in-browser). Changed to `--ink-muted` + font-weight 600 so the entry button
  reads in both themes. The overlay itself was always readable.

## Adjacent-found (untouched)
- The FocusedEvidence "Connections" entry button inherits no variant styling; other rail buttons in
  the instrument variant are explicitly themed but this new one relies on substrate tokens. Left
  substrate-only (throwaway); noted for awareness.
- `.spike-shell` is not `position: relative`; the overlay's `position:absolute; inset:0` resolves
  against the initial containing block and still covers the viewport correctly in every variant
  tested. Not changed (works; out of scope).

## Open questions
- Pill "N connections" counts connections crossing the boundary to the current subject (the edge
  count), not the counterpart's total degree. Either is defensible for a SHOW; chose the edge-count
  reading because it is the honest number we already have.

## Verification (real drive)
- `pnpm build` (guide) OK; `pnpm exec vite preview --port 4319` → `/` 200, `/generated/corpus.json` 200.
- Drove the real token-killer corpus (5578 nodes) in Chrome: Connections button, `v` key, and
  double-click all open the overlay; re-root via card and via boundary pill (breadcrumb + Back);
  decl-pair expansion shows claim_id provenance; "Open on map" + × present; quiet toggle flips
  quiet↔all (all reveals decl cells + edges). Verified in wireframe and instrument (dark) variants;
  no console errors.
- `pnpm test` (guide) 109 passed (was 99; +10). `pnpm test` (cli) 44 passed | 16 todo. `pnpm -r
  typecheck` clean. Naming gate green.

---

# Implementation notes — M3 v4 Fable "Option A formalization" (Connections view → first-class)

Scope: promote the throwaway FocusGraph SHOW into the real model. The maintainer ruled the
old canvas (map that also answered "what connects") unreadable. Option A splits the two
questions: the MAP answers "where" (folders + files only); the CONNECTIONS VIEW answers "what
connects" (the 3-column FocusGraph). Declarations never render on the map again. Built ON the
uncommitted SHOW state (promoted, not discarded). Guide package only. No commit.

## The model shift (what changed conceptually)
- One self-describing grain per view. Map grain = folders + files. Connections grain = one
  subject + its inbound/outbound counterparts. Decl atoms stay in the KERNEL model
  (addressable / searchable / lit-able) but are never emitted to the renderer.
- The map is quiet at rest — the only mode. Structural edges draw only when (a) lit Change
  Trace trunk, (b) selection-adjacent, (c) hover pre-highlight. The Connections view is where
  connection *reading* happens now.

## What was REMOVED
- **Decl reveal level** from the LOD ladder. `REVEAL_BY_LEVEL` went 4→3 levels (folders≤1 →
  folders≤2 → files). `ZOOM_UP`/`ZOOM_DOWN` dropped their 4th entry; MAX_LEVEL is now 2.
  Hysteresis (dead band) is unchanged in shape.
- **Decl-label machinery**: `declLabelsVisibleAt`, `DECL_LABEL_MIN_PX`, `Reveal.showDecls`,
  `VisibleSlice.declLabelsVisible`, and the renderer's `showDeclLabel` node-data field + the
  quiet-mode decl-cell filter. Decls simply never enter `slice.nodes`.
- **The "Map edges: quiet/all" HUD toggle** and its `quietEdges` state/prop/CSS. Quiet is the
  only mode. `GraphRendererProps.quietEdges`, `EdgeLayer`'s `quietEdges` param, and
  `.hud-quiet-toggle` are gone.
- **Overview noise-floor** (`AtlasEdge.belowFloor`, the belowFloor marking + its omission +
  `.edge-belowfloor` CSS). The quiet map doesn't draw those edges at all, so a slice-level
  floor is moot.
- **Edge relation labels / faded / dimmed edge states.** Every map edge is an aggregated
  file/folder edge now (raw sym→sym pairs live only in the Connections view), so the
  `!aggregated` relation-label branch and the faded/dimmed classes are dead — removed.

## What was ADDED / promoted
- `AtlasNode.declCount` (files only) threaded from compile → the self-describing file lot chip.
- Wireframe file lot: name (middle-truncated) + "N decls" mono chip; the text block fades out
  below the readable zoom via CSS (`--zoom` on the graph wrapper), leaving tick / lit / recency
  as the overview signal. Folders unchanged. Decl branch removed. NodeContentProps contract
  (incl. optional `showDeclLabel`) left intact for the four design variants.
- FocusGraph first-class: cycle-safe breadcrumb (revisiting a crumb truncates forward history);
  keyboard nav (↑/↓ within a column, ←/→ between columns, Enter re-roots, Backspace pops, Esc
  closes — arrow keys move real DOM focus so the focus ring is visible); zero-connection state
  ("No observed calls or imports" + the subject's decl list); store-absent endpoints rendered as
  non-rooting "not in index" pills instead of broken cards.
- FocusedEvidence: the "Connections" entry button is now visually primary (solid accent), and
  each connection row carries a "view" reverse affordance opening the Connections view rooted on
  the other endpoint. Existing "Open on map" (Connections → map) unchanged.

## Files changed
- `src/atlas/types.ts` — `AtlasNode.declCount`; removed `AtlasEdge.belowFloor` +
  `VisibleSlice.declLabelsVisible`.
- `src/atlas/lod.ts` — 3-level ladder; removed `showDecls`, decl-label helpers, decl candidates,
  belowFloor, decl-hidden omission.
- `src/atlas/compile.ts` — thread `declCount` onto file nodes.
- `src/ui/GraphRenderer.tsx` — dropped `quietEdges` from the seam contract.
- `src/ui/ReactFlowRenderer.tsx` — EdgeLayer always-quiet (lit/sel/hover only), count plate only
  on lit/sel; removed decl-cell filter, `showDeclLabel`, relation label.
- `src/ui/SpikeApp.tsx` — removed `quietEdges` state/toggle/prop.
- `src/ui/FocusGraph.tsx` — cycle-safe reroot, keyboard nav + focus registry, absent-endpoint
  pills, subject decl list + zero-connection state, `hasConnections`.
- `src/ui/FocusedEvidence.tsx` — per-row "view" affordance.
- `src/variants/wireframe/{index.tsx,wireframe.css}` — self-describing file lot + zoom fade.
- `src/styles.css` — primary Connections button, row-view, focus rings, absent pill,
  zero-connection block; removed toggle/belowfloor/faded/dimmed/relation CSS.
- Tests: `lod.test.ts` (decl-invariant incl. 10x + quiet-edge regime, replaced noise-floor &
  decl-label), `lod-5c.test.ts` (3-level ladder), `edge-layer.test.tsx` (quiet-by-default
  census), `spike-app.test.tsx` (at rest DOM edges == lit trunk), `focus-graph.test.tsx`
  (keyboard, Backspace, cycle, zero-connection, provenance, decl subject, not-in-index),
  `focused-evidence.test.tsx` (primary button + reverse view affordance).

## Decisions (design left open)
- **File-label readable-zoom gate = CSS `--zoom` opacity fade**, not a slice flag. The old
  `declLabelsVisible` slice flag is gone; rather than reintroduce a `fileLabelsVisible` flag and
  thread a new prop, the wireframe fades `.wf-file-meta` in over zoom 0.7→1.05 using the `--zoom`
  var already set on the graph wrapper. Zero new props; keeps NodeContentProps intact. Visual
  only (reviewer drive), not unit-tested.
- **Decls are not a map "omission".** They are structurally not part of the map grain, so I did
  NOT keep a "N declarations hidden" disclosure — the file lot's "N decls" chip is the honest
  self-description. (Conservative: the honest count still shows, just per-lot.)
- **Keyboard column layout**: ←=inbound, →=outbound, ↑/↓ within a column; store-absent pills are
  not focusable (nothing to root on). First ↑/↓ from no selection lands on the first entry.
- **Absent-pill count** = the boundary edge count to the current subject (same reading the SHOW
  used for boundary pills).

## Deviations (departures from the plan)
- **Removed edge relation labels + faded/dimmed edge classes** (not just "simplified"). Under
  the slim-down, decls never reach the slice, so `nearestVisible` always resolves sym endpoints
  to a file/folder — every map edge is aggregated and `!aggregated` never holds. The relation
  label and faded/dimmed states became unreachable, so I deleted them rather than leave dead
  branches. Conservative: no behavior a user could reach was lost.

## Adjacent-found (untouched)
- The four design-variant folders (atelier/instrument/plat/transit) still read `showDeclLabel`
  and (in some) may draw decl cells in their own NodeContent. Per the work order they are
  off-limits and will be re-audited later; the substrate no longer sends decl nodes, so their
  decl branches are simply dead — not broken. Left as-is.
- `.spike-shell` is still not `position: relative` (SHOW note carried over); the overlay covers
  the viewport correctly in every variant tested. Not changed.

## Open questions
- Should the file-label fade band (0.7→1.05) be tuned per variant, or is a substrate default
  enough? Left as one substrate default (reviewer drives the feel).
- Keyboard: should Enter on a store-absent pill do anything (e.g. a toast)? Currently absent
  pills are inert and unfocusable. Left inert.

## Self-verify (acceptance, item by item)
| Item | Result | Evidence |
|---|---|---|
| 1 MAP: slice never emits decl nodes (10x too) | PASS | `lod.test.ts` "declarations never reach the renderer" (current zooms 0.2..4 + 10x) |
| 1 MAP: decl-label machinery + decl reveal level removed | PASS | typecheck clean after removing `declLabelsVisible*`/`showDecls`; `lod-5c.test.ts` 3-level ladder |
| 1 MAP: lit decls light their FILE lot | PASS | `lod.test.ts` "keeps a lit decl legible by aggregating onto its FILE lot" |
| 1 MAP: file lot self-describing (name+decl chip); NodeContentProps intact | PASS | `wireframe/index.tsx`; `variants/types.ts` unchanged (`showDeclLabel?` kept) |
| 1 MAP: quiet is the only mode; toggle deleted; lit/sel/hover only | PASS | `edge-layer.test.tsx` quiet census; bundle has no "Map edges" |
| 1 MAP: count labels only on lit/sel edges; noise floor simplified | PASS | `edge-layer.test.tsx` count-plate test; belowFloor removed |
| 1 MAP: Evidence Rail + trace trunk unchanged | PASS | rail/event tests untouched & green; trunk = edge-lit still drawn |
| 2 CONN: keyboard (arrows/Enter/Backspace/Esc), focus ring | PASS | `focus-graph.test.tsx` arrow+Enter, Backspace |
| 2 CONN: cycle-safe breadcrumb; decl+file subject solid | PASS | `focus-graph.test.tsx` cycle test; decl-subject test |
| 2 CONN: zero-connection line + decl list | PASS | `focus-graph.test.tsx` zero-connection (config.ts) |
| 2 CONN: store-absent → "not in index" pill | PASS | `focus-graph.test.tsx` not-in-index test |
| 2 CONN: provenance rows; naming gate | PASS | provenance test; `naming-gate.test.ts` green |
| 2 CONN: reverse "view" affordance on evidence rows | PASS | `focused-evidence.test.tsx` reverse affordance |
| 3 INT: Connections button primary; dbl-click file = Connections | PASS | CSS `.fe-connections` accent; SpikeApp `onDoubleClickNode` unchanged |
| 3 INT: search/rail focus map unchanged; minimap unchanged | PASS | untouched code paths; suites green |
| 4 CLEANUP: decl-label/noise-floor/spike-smoke tests updated | PASS | see files above |
| Suites green (guide) | PASS | guide 118 pass (was 109) |
| cli 44 + 16 todo | PASS | `pnpm --filter @contexa/cli test` 44 pass / 16 todo |
| `pnpm -r typecheck` | PASS | core + cli + guide clean |
| build | PASS | `pnpm --filter @contexa/guide build` OK; preview `/`=200, corpus=200 (real token-killer 1332 files) |

## What I did NOT do
- Did not touch the four design-variant folders (atelier/instrument/plat/transit).
- Did not commit (reviewer merges).
- Did not optimize performance (presentation-first).
- Did not GUI-drive the browser (curl + bundle-string verification only; the reviewer drives).

---

# Option A — reviewer browser re-drive: two regressions fixed

The coordinator's Chrome drive confirmed the file cards + quiet map, but flagged two regressions.
Both fixed; guide suite 118 → **121**.

## R1 — programmatic focus didn't re-slice (blank viewport until manual Fit/zoom)
A rail/search/connections reveal moved the camera to the target but left the slice at folder LOD
(footer 14/5578) → blank until the user manually zoomed. Root cause: every reveal routed through
the same onMoveEnd → 180 ms debounce → hysteresis path meant to damp USER pan/zoom, which
suppressed the recompute (same-bucket, or the programmatic camera move never re-committed the
slice state).

Fix: `SpikeApp.commitSlice(rect, zoom)` — a PROGRAMMATIC reveal now forces an immediate slice
recompute, centered on the target at a FRESH zoom bucket (`nextZoomLevel(0, z)`, no hysteresis
dead-band), cancelling any pending user-move debounce. Wired into `focusReading` (rail / search /
click-focus), `drillNode` (double-click folder), `panToRegion` + `minimapPan` (minimap), and
`openOnMap` (Connections → map, switched from `focusNode` to `focusReading` so the target is
centered AND re-sliced). Decls have no map cell under Option A, so focusing a decl reveals its
FILE lot (`node.parent`). Hysteresis still damps genuine user pan/zoom (`commitViewport` unchanged).
- Slice viewport is sized from a nominal pane (1400×900) — the renderer animates the real camera
  from its measured pane; the nominal box only needs to be generous enough that the target lands
  inside the recomputed slice (overscan covers the rest).
- Test: `spike-app.test.tsx` "programmatic focus … forces an immediate re-slice centered on the
  target" — search-activate a file far from the hotspot; the very next renderer input (no manual
  event) is a slice re-centered on it AND containing its node.

## R2 — selection edges rendered as giant black bands + off-screen lines shot across
Selection/lit edges drew 15–30px world-scaled diagonals at deep zoom, and edges to off-viewport
endpoints shot long lines across the map.

Fix (substrate `EdgeLayer`):
- `edgeStrokeWidth(count, selected)` = `min(6, min(5, 1+log2(count+1)) + (selected ? 1.5 : 0))` —
  on-screen width hard-capped ≤6px. Replaces the old constant/uncapped widths.
- `vector-effect: non-scaling-stroke` on the fallback line AND (belt-and-braces via CSS
  `.atlas-edge line, .atlas-edge path`) on any variant EdgePath, so strokes stay screen-space at
  any zoom regardless of variant.
- Off-viewport endpoint → short direction STUB: the `EdgeLayer` now takes the committed world
  `viewport`; when a drawn edge has one endpoint outside it, the segment is clipped to a bounded
  stub (`0.12 × min(viewport span)` toward the target) with a faded `.edge-stub` class; both
  endpoints outside → not drawn. The Connections view is where those are read; the map only hints
  direction. Count plate suppressed on stubs.
- Tests: `edge-layer.test.tsx` "keeps every drawn edge screen-space (non-scaling-stroke,
  strokeWidth ≤ 6) at deep zoom" and "renders a selection edge to an OFF-viewport endpoint as a
  short bounded stub".

## Files touched (delta)
- `src/ui/SpikeApp.tsx` — `commitSlice` + `fitZoomFor`; reveal paths re-slice immediately; pass
  `viewport` to the renderer; drop the now-unused `READING_ZOOM_DECL`.
- `src/ui/GraphRenderer.tsx` — added optional `viewport` to the seam contract.
- `src/ui/ReactFlowRenderer.tsx` — `edgeStrokeWidth`, off-viewport stub, capped width, threaded
  `viewport` to `EdgeLayer`.
- `src/styles.css` — force `non-scaling-stroke` on all edge geometry; `.edge-stub` fade.
- Tests: `spike-app.test.tsx`, `edge-layer.test.tsx`.

## Verify (delta)
- guide `pnpm test` **121 passed** (was 118). cli 44 pass / 16 todo. `pnpm -r typecheck` clean.
  `pnpm --filter @contexa/guide build` OK; preview `/`=200, corpus=200; bundle contains
  `edge-stub` + `non-scaling-stroke`. Browser re-drive is the reviewer's.
