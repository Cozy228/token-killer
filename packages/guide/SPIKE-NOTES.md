# M3 slice 5a — `ctx guide` perf spike (Fable track) — SPIKE-NOTES

Throwaway perf-spike probe (M3-GOAL-PROMPT-V4 slice 5a). Proves the ratified design
(M3-UI-LAYOUT-BRIEF D7–D25) meets D12 budgets on the real store and 10× synthetic, and
renders ONE real diff event as a lit **Change Trace** over a dimmed Atlas. No production
routes / Subject / Inspector (explicitly out of scope for 5a).

This file is the deviation log for the spike (the reviewer reads it before the diff).
The repo-root `implementation-notes.md` belongs to a different, already-merged slice
(o33b/drill-guards) and was intentionally left untouched.

---

## Fix log — reviewer drive round 1 (items 1–8)

The reviewer's Chrome drive of the production build found the kernel/rail solid but flagged
8 defects. All fixed below. Node-side numbers re-measured; the browser-side fps /
first-interactive / expand-commit numbers are for the reviewer's re-drive (I cannot launch a
GUI browser here). Files touched: `src/perf.ts`, `src/atlas/{types,lod}.ts`,
`src/ui/{GraphRenderer,ReactFlowRenderer,SpikeApp,StateScreen}.tsx`,
`src/variants/wireframe/wireframe.css`, `src/styles.css`, `src/fonts.d.ts` (new),
`tests/lod.test.ts`. No sibling variant folder was edited.

1. **firstInteractive semantics.** Was marked from React Flow `onInit` and read the time to
   first user click. Now `SpikeApp` marks it via **double-rAF after the first slice mounts**
   (first paint), independent of input. Hidden-tab robust: if `document.hidden` at first
   paint, it defers to `visibilitychange` + rAF and records a diagnostic note (surfaced in
   the Perf HUD, `window.__GUIDE_PERF__.notes`). Removed the `onFirstInteractive` prop and
   the `onInit` `fitView` (which also fought the event viewport — see #4).
2. **Sweep fps tour.** `runViewportSweep` now animates a visible tour — pans ±35%/±28% of the
   pane and oscillates zoom +40% over ~3 s via rAF `setViewport`, sampling fps only across
   the animation (200 ms windows). `SpikeApp.runSweep` clears stale fps samples first
   (`perf.clearFps()`), and the button is disabled while running (`Sweeping…`).
3. **expand ≤100 ms (renderer-side).** Three changes: (a) `AtlasNodeComp` is now `React.memo`
   with a field comparator (atlas/lit/dimmed/focused/render), (b) a stable-identity node
   cache in `ReactFlowRenderer` reuses the exact node object when nothing render-affecting
   changed, so a focus change re-renders ~2 nodes not 900, (c) slice-recompute **hysteresis**
   in `onViewportChange` — a focus-only camera nudge within the same zoom bucket + viewport
   tile does not re-slice. Node-side slice is unchanged (~6 ms current / ~43 ms 10×); the
   900-node React commit cost is what these cut — re-measure in-browser.
4. **Default event viewport.** A once-per-projection effect applies `project().viewport` as
   soon as both the renderer API and the projection are ready (deep-link and default event),
   and seeds the slice viewport/zoom to a files/decls-revealing level so the map opens on the
   lit region instead of a whole-map fit. The competing `onInit` fitView was removed.
5. **Search-result camera focus.** `focusNode` now seeds the slice viewport at a zoom that
   REVEALS the target's kind (decl 1.6 / file 1.0 / folder 0.6) AND moves the camera via the
   API, so a code result opens its hit path and the camera lands on it (D14/D9).
6. **Lit legibility at far zoom.** `computeSlice` takes the raw lit set: lit nodes are
   force-kept (survive the cap), and a lit atom hidden by the current zoom promotes its
   nearest REVEALED ancestor to a **lit aggregation** — the slice returns `litVisibleIds`
   (used by the renderer). At overview zoom the 127-node real Change Trace aggregates onto ~3
   top-level folder regions (the road-network read). Wireframe lit contrast bumped
   (dim-opacity 0.28→0.12, 3px outline + white fill + glow); saturated color stays reserved
   for status ticks.
7. **VariantSpec.EdgePath + edge classes.** Edges now render through a custom `AtlasEdgeComp`
   (`edgeTypes.atlas`). It delegates to `variant.EdgePath(edge, geometry)` when present, else
   a straight path, and **always puts `atlas-edge edge-<kind> edge-lit|edge-dimmed` classes on
   the edge SVG element** (`<g>` wrapping the variant path, or the fallback `<path>`), so a
   variant's CSS (e.g. atelier) can hook lit/dim signal. Base class-driven edge CSS added to
   `styles.css` using variant CSS variables.
8. **ChromeSlots mounted.** `variant.ChromeSlots.hudExtra` renders in the top HUD tools row;
   `variant.ChromeSlots.legend` renders as a collapsible overlay in the canvas column.

**Font-import shim (reviewer note a).** Added `src/fonts.d.ts` — a two-line ambient
`declare module "@fontsource-variable/*" / "@fontsource/*"` shim so variants can use **bare**
`import "@fontsource-variable/x"` without TS2882 under this tsconfig (they currently work via
`/index.css` subpaths; the shim makes bare imports clean). Substrate-owned; touches no variant
file.

**Re-measured node-side (real corpus / 10×):** compile 19.8 / 137.9 ms · slice 6.1 / 43.3 ms ·
slice+lit-protection 5.8 / 57.5 ms · lit@overview aggregates 127 lit nodes → 3 folder regions.
`pnpm --filter @contexa/guide test` → 8 files / 41 tests pass; typecheck clean; `pnpm build`
succeeds with all four sibling variant folders present.

**Sibling-variant status:** substrate + `wireframe` are green. The full typecheck/build passed
with `plat/instrument/atelier/transit` present as of this round; if a later sibling edit breaks
the shared build, that is a variant-folder issue to report, not a substrate regression.

---

## Fix log — reviewer drive round 2 (edges never rendered)

**Root cause.** React Flow v12 will not route an edge until BOTH endpoint nodes expose measured
`Handle` bounds. Our custom lot/decl nodes have no handles, so RF silently dropped every edge
(0 `.react-flow__edge` in the DOM at all zooms) even though the slice reported 88 edges. The
"road network vs hairball" SHOW depends on the backbone being visible.

**Fix (custom SVG layer — the preferred route).** Edges are no longer RF edges. A single
`<EdgeLayer>` `<svg>` is rendered inside `<ViewportPortal>` (so it pans/zooms with the map) and
draws every `slice.edges` segment from rect-center geometry. Consequences:

- **DOM edge count == slice edge count** at every zoom — locked by a new test
  (`tests/edge-layer.test.tsx`): one `.atlas-edge` element per slice edge across 5 zoom levels.
- **Non-scaling strokes** (`vector-effect: non-scaling-stroke`) — edges stay legible at
  overview zoom (scale 0.13) instead of collapsing to sub-pixel.
- **Lit trace reads clearly** — `edge-lit` edges are thicker (2.5 + log2(count)) and full ink;
  `imports` are dashed, `calls` solid; `edge-dimmed` drops to 0.12 opacity.
- **`variant.EdgePath` is fed** — when a variant supplies `EdgePath` (transit's whole identity),
  it is called per edge and its output is wrapped in `<g class="atlas-edge edge-<kind>
  edge-lit|edge-dimmed">` so variant CSS hooks the lit/dim signal. Verified by test (EdgePath
  called `slice.edges.length` times; classes land on the `<g>`).
- One SVG element tree, not N React components — faster than RF's per-edge components.

RF now receives `edges={[]}`; `AtlasEdgeComp`/`edgeTypes` from round 1 were removed. The D12
seam is intact (still the only `@xyflow/react` importer).

**Lit legibility at far zoom (round-2 sub-item).** In addition to non-scaling edges, the SVG
layer paints a **lit region overlay** (`.atlas-lit-region`) for every `litVisibleIds` node — a
neutral ink-wash fill (`--lit-tint`, no saturated hue, honoring D15's color budget) plus a 2px
non-scaling outline. At overview the real 127-node trace aggregates onto ~3 top-level folder
regions, now drawn as unmistakable lit rects.

**Node mount census (round-2 sub-item).** The slice-vs-DOM node gap (52 vs 14) was React Flow's
own viewport culling; set `onlyRenderVisibleElements={false}` so every slice node mounts. Note:
the lit-protection path already force-keeps ONLY lit nodes that are *revealed candidates* at the
current zoom — a lit file/decl hidden at far zoom is handled by **ancestor promotion**
(`litVisibleIds`), never by force-mounting a sub-6px atom. So no invisible atoms are mounted;
the aggregated folder region carries the lit signal.

**Verify:** `pnpm --filter @contexa/guide test` → 9 files / **45 tests** pass (added
`edge-layer.test.tsx`, 4 cases); typecheck clean; `pnpm build` succeeds with all four sibling
variants present. Browser DOM edge/lit rendering is for the reviewer's re-drive.

---

## Fix log — reviewer drive round 3 (integration wiring)

Round-2 edge layer confirmed working after cache-bust (88 `.atlas-edge`, 7 `.atlas-lit-region`).
Four integration defects fixed, plus a SpikeApp integration smoke so this unit-green/browser-dead
class is caught in CI. Files: `src/atlas/{types,lod}.ts`, `src/ui/{GraphRenderer,ReactFlowRenderer,
SpikeApp}.tsx`, `tests/{lod,edge-layer,spike-app}.test.tsx`. No variant folder touched.

1. **Event viewport race → deterministic `defaultViewport`.** The old
   `api.setViewport→fitBounds` raced RF init (sometimes left identity `scale(1)`). Now the seam
   takes an `initialViewport` (world bbox); `ReactFlowRenderer` measures the pane (ref +
   `ResizeObserver`) and **only mounts React Flow once the size is known**, passing a
   `defaultViewport` computed from the event bbox + pane (`worldToTransform`). RF's `onInit`
   re-applies `fitBounds(initialViewport, {duration:0})` as belt-and-braces, then syncs app
   state in one pass. Identity scale is impossible when a projection exists.
2. **Lit edges survive aggregation.** `AtlasEdge` gained a `lit` flag. `computeSlice` now takes
   the atom-level lit edge-key set and marks an aggregated edge `lit` iff ANY constituent atom
   edge is lit — so a lit `sym→sym` call that collapses to `file→file` (or `folder→folder`)
   still lights. The renderer reads `edge.lit` (not an atom-key match). New lod test: at
   file-aggregation zoom a lit atom edge produces a lit aggregated `file→file` edge.
3. **Footer single-source.** The shell is now gated until the event viewport is seeded
   (`seededKey === projectionKey`); the renderer and the footer both bind to the SAME event
   slice — never an earlier whole-map state. (The prior stale `14/5578` was the pre-seed
   provisional slice leaking to the footer during the race.)
4. **Long task on load.** Collapsed the mount to one pass: the event viewport + its slice are
   computed BEFORE React Flow mounts, and RF's first paint uses the fitted `defaultViewport`, so
   it renders the event-region slice at the correct zoom — never the whole 5,578-node world at
   identity scale (the source of the 655 ms task). Reviewer to confirm
   `window.__GUIDE_PERF__.longTasks` max < 500 in-browser.

**New integration smoke (`tests/spike-app.test.tsx`).** Mounts `SpikeApp` with the fixture
corpus + default event (renderer seam replaced by a double that renders the REAL `EdgeLayer` and
captures props). Asserts: (a) DOM `.atlas-edge` count == `slice.edges.length`, (b) ≥1
`.atlas-edge.edge-lit` at the initial zoom, (c) the renderer received a non-identity initial
viewport (the 28×35 event bbox, not the 100×100 placeholder), (d) the footer text binds to the
same slice's visible-node count. This catches the exact "unit-green, browser-dead" break class.

**Verify:** `pnpm --filter @contexa/guide test` → 10 files / **48 tests** pass; typecheck clean;
`pnpm build` succeeds with all four sibling variants present. Browser transform/long-task
readings are for the reviewer's re-drive.

---

## Fix log — reviewer drive round 4 (presentation / standard)

Maintainer priority: presentation first, performance last (no gross regression). Live verdict:
edges unreadable (no meaning/direction/from-to), decl cells dense+unlabeled, click gave no
reaction. UA (understand-anything) studied for reusable facts. Built additively on the 5b tree
(`GuideDataSource` seam untouched). All new type fields are optional/additive; variant folders
untouched (substrate + wireframe + additive CSS hooks only). Files:
`src/atlas/{geometry.ts(new),types.ts,lod.ts,compile.ts}`,
`src/ui/{GraphRenderer,ReactFlowRenderer,SpikeApp}.tsx`, `src/ui/FocusedEvidence.tsx (new)`,
`src/variants/wireframe/{index.tsx,wireframe.css}`, `src/styles.css`, and tests.

- **R4-1 Selection emphasis (D11).** Click a node → its direct edges get `edge-selected`
  (full ink, width 2.5, opacity 0.85); all other edges `edge-faded` (0.08); endpoint neighbors
  `node-neighbor` (dim ring), all other nodes `node-faded` (0.22); 200 ms opacity transitions.
  Selection emphasis wins over event dim while active. Node classes live on the React Flow node
  WRAPPER (`nodeSelectionClassName`), so every variant inherits the treatment from substrate CSS
  with no variant edit. Pane click / Esc clears. Camera: `RendererApi.revealNode` moves ONLY if
  the node is offscreen or its on-screen width < 24 px (duration 400, padding 0.3, maxZoom
  max(currentZoom, 1.2)); an already-visible node just gets emphasized (no camera churn).
- **R4-2 Edge legibility.** (a) Endpoints are clipped to the rect BOUNDARY both ends
  (`geometry.ts` `clipEdge`), never center-through-body. (b) Aggregated (file/folder) edges carry
  an always-on `edge-count` plate (counter-scaled via `--zoom` so it reads ~11 px at any zoom);
  raw sym-sym edges show a relation-kind label (`edge-relation`) only when selection-adjacent.
  (c) A dst-end arrowhead marker renders ONLY on emphasized edges (`edge-selected`/`edge-lit`) —
  quiet by default like UA. `EdgeGeometry` extended additively with
  `clipped*/mid*/count/direction`. (d) Overview noise floor: at folder LOD an aggregated edge with
  count < 2 and not lit is marked `belowFloor`, hidden by default (revealed when
  selection/hover-adjacent), and the count is disclosed in omissions.
- **R4-3 Focused-evidence panel** (`FocusedEvidence.tsx`, right column above the rail,
  collapsible/hidden when nothing is selected). Shows kind + claim-status badge, name, path; for a
  FILE a "Declared here (n)" decl list; for any node "Connections (n)" directional-verb rows
  ("calls →" / "← called by" / "imports →" / "← imported by") built from the logical edges, each
  row click-focuses the endpoint and carries provenance (`claim_id=…`). Rows capped at 12 with
  "+N more". Copy passes the D24 gate.
- **R4-4 Hover identity.** `.react-flow__node` gets `cursor:pointer` + a thin `:hover` outline
  (all variants). A single fixed hover readout line (bottom-left, above the counts) shows
  "kind · name · path"; the hovered node's edges get `edge-hover` (weaker than selection). Hover
  state is renderer-local so it never re-slices.
- **R4-5 Decl labels.** `declLabelsVisibleAt(zoom)` (44 px / 14 px-per-unit ≈ 3.14 render zoom) is
  surfaced on the slice as `declLabelsVisible`; the renderer passes it to `NodeContent`, and
  wireframe renders the decl name (middle-truncated > 24 chars) only above the threshold.
- **R4-6 Drill / back-out.** Double-click a folder region → fit to it (single click stays
  select-only). Esc first clears selection; a second Esc backs the fit out to the parent region of
  the last drill.

UA facts reused (paths under `.research/…/dashboard/`): directed one-edge-per-container-pair
aggregation with always-on count label (`edgeAggregation.ts`, `GraphView.tsx:594`), selection
emphasis values (`GraphView.tsx:1290`, `CustomNode.tsx:111`), `fitView` reveal
(`GraphView.tsx:210`), pane-click deselect (`:1518`), NodeInfo directional-verb rows
(`NodeInfo.tsx:526`). Like UA: no default arrowheads, no edge hover — direction via directed
aggregation + the panel verbs; the arrowhead appears only on emphasized edges.

**Tests added/updated (all pass):** `geometry.test.ts` (boundary clipping both ends);
`lod.test.ts` (+noise-floor marking/omission, +decl-label threshold + slice flag);
`edge-layer.test.tsx` (+clipped `EdgeGeometry` passed to `EdgePath`, +count-label-only-on-aggregated,
+selection emphasis edge-selected/edge-faded partition, +relation label on selected sym-sym);
`focused-evidence.test.tsx` (directional verbs + click-focus + provenance); `selection.test.ts`
(`nodeSelectionClassName`); `spike-app.test.tsx` (+click → edge-selected + evidence panel verbs).
Naming gate re-scans the new panel strings — green.

**Verify:** `pnpm --filter @contexa/guide test` → 13 files / **65 tests** pass; `pnpm -r typecheck`
clean (core + cli + guide); `pnpm build` succeeds with all four variants; `pnpm gen` unchanged
(1327 KiB); cli suite still 43 pass. Node-side no gross regression: compile 18.9 ms, slice worst
8.9 ms at real scale (clipping/labels are renderer-side). Browser rendering is for the reviewer's
re-drive.

---

## What was built

`packages/guide/` — new package `@contexa/guide` (private, not published).

Pure kernel (no DOM, fully tested):
- `src/atlas/types.ts` — DTO contract (field names are the contract).
- `src/atlas/compile.ts` — quantized directory packing (D9): `CorpusInput → AtlasModel`,
  deterministic, parent-local repack.
- `src/atlas/lod.ts` — LOD/spatial slice (D7/D12): the ONLY path to the renderer; hard
  caps (900 nodes / 1400 edges) with deterministic drop order + disclosed omissions.
- `src/atlas/event.ts` — Event Projection kernel (D22/D23/D25): `project(event, atlas)`,
  hard-anchor-only, deterministic; `resolveEvent` rejects open-concept queries.
- `src/atlas/synthetic.ts` — deterministic 10× expansion (seeded mulberry32).
- `src/perf.ts` — perf recorder + D12 budget table (`window.__GUIDE_PERF__`).

Renderer seam (D12):
- `src/ui/GraphRenderer.tsx` — the seam contract (`UNIT`, `LitState`, `RendererApi`).
- `src/ui/ReactFlowRenderer.tsx` — the ONLY module importing `@xyflow/react`.

SHOW shell + surfaces:
- `src/ui/SpikeApp.tsx`, `EvidenceRail.tsx`, `StateScreen.tsx`, `main.tsx`, `styles.css`.
- `src/variants/` — VariantSpec seam + auto-registry + the `wireframe` default variant.

Extractor:
- `tools/corpus-mapper.ts` — pure row→corpus mapper + scrub guard (testable, no sqlite).
- `tools/extract-corpus.ts` — read-only sqlite runtime (re-exports the mapper).

Tests: `tests/*.test.ts(x)` (10 suites, 38 tests) + `tests/fixtures/corpus.ts` +
`tests/golden/event-projection.json`.

---

## Measured numbers (self-verified)

Corpus (real store `9cd2e7eab8b4`, generated by `pnpm gen`):
- **1,327 KiB** JSON · 1,332 files · 4,205 decls · 4,228 calls · 693 imports.
- generations code=10 git=5 docs=6 memory=14 · rev `3730192d42e9`.
- default event = **latest 20 commits `132cc921beef..a9f62be5e064`**, 36 anchor files /
  227 anchor syms; the projected Change Trace lights **127 nodes** with a **127-step**
  mechanical Evidence Rail.

Node-side compile/LOD/project timing (pre-browser evidence — the compiler/LOD seam, which
is the merge-blocking bottleneck; React Flow paint is the remaining browser variable):

| stage | current corpus | 10× synthetic |
|---|---:|---:|
| logical nodes | 5,578 | 55,780 |
| compile | **13.7 ms** | **141.3 ms** |
| slice (worst, across 5 zooms) | **6.3 ms** | **40.0 ms** |
| project event | 2.8 ms | 12.7 ms |
| slice visible cap @1.5× zoom | 900 / 5,578 | 900 / 55,780 |

The slice ALWAYS caps to ≤900 nodes / ≤1400 edges (enforced in `lod.ts`, tested at 10×).
Compile (once) + slice (per expand) sit far under D12's `first interactive ≤1 s / ≤3 s`
and `expand ≤100 ms / ≤250 ms`. The browser-side first-interactive / pan-zoom fps must
be read from `window.__GUIDE_PERF__` in a real Chrome drive (see "Delegated to reviewer").

Build: `vite build` → 395 KB JS (gzip 127 KB) + 21 KB CSS, 404 ms. Preview: `/` → 200,
`/generated/corpus.json` → 200. Scrub: `grep -c /Users/ public/generated/corpus.json` → 0.

---

## Decisions (choices the design left open — "Remaining implementation decisions")

- **Footprint buckets (D9):** 0→1×1, 1–4→2×2, 5–9→3×3, 10–16→4×4, 17–25→5×5, >25→6×6.
  Decl display cap `MAX_DECLS_SHOWN = 34`; extra decls become a disclosed `+N` overflow
  marker on the lot (an omission disclosure, never a fake node).
- **Shelf packing:** strict lexicographic path order (folders-first NOT required), 1-unit
  gutters, 1-unit folder header row, target aspect ≈1.4 via
  `targetWidth = max(maxItemW, ceil(sqrt(totalArea·1.4)))`. Region layout is computed
  purely from a folder's own subtree → adding a file repacks only that parent locally
  (parent-local stability tested on `dir:src`, `dir:src/util`).
- **`projectionId`:** FNV-1a hex over canonical (array-sorted) JSON of the input — the
  "simplest" option the work order offered. Same input, even shuffled arrays → same id.
- **LOD zoom buckets:** `<0.35` folders≤depth1 · `<0.7` folders≤depth2 · `<1.2` +files ·
  `≥1.2` +decls. Overscan 1.5×. Cap drop order: shallowest + nearest-center kept; deepest,
  then farthest dropped (deterministic). Edge cap drops lowest-count first.
- **Node status → claim contract (PRODUCT-DESIGN §3):** the Guide render statuses
  `active | needs-review | conflict` derive as: entity is party to an OPEN store conflict
  → `conflict`; else a needs-review memory anchors to it → `needs-review`; else `active`.
  Saturated color is spent only on these three (D11/D15). Real store: `conflict` fires on
  `file:FABLE-DECISION-LOG.md` and `file:OPEN.md`; the `anchors` table is EMPTY (0 rows),
  so `needs-review` never fires on the real corpus (wired + exercised only by the fixture).
- **Evidence Rail step granularity:** `calls`/`imports` steps are keyed on the far (dst)
  endpoint node and deduped by node with min-hop; multiple lit edges to the same callee
  collapse to one step. Mechanical order (anchors→contains→calls→imports, hop asc, path
  asc) is preserved. Flagged below for review — an edge-keyed variant is possible.
- **Default event range:** union of touches over the latest 20 commits by `attrs.date`
  (`from = oldest`, `to = newest`); `--diff <from>..<to>` overrides.
- **Corpus scope (D25):** `co-changed` and `references` edges are excluded to keep the
  payload lean; `touches` are carried only for the event commit range. All three facts are
  in `corpus.disclosures` and rendered in the map HUD.

## Deviations (departures from the file layout / plan, with rationale)

- **Added `tools/corpus-mapper.ts`.** The work order lists a single `tools/extract-corpus.ts`.
  Vite/vitest cannot bundle the `node:sqlite` builtin, so importing the extractor into a
  test failed. I split the PURE mapper + scrub guard into `corpus-mapper.ts` (no sqlite)
  and left the sqlite runtime in `extract-corpus.ts`, which re-exports the mapper surface
  (`buildCorpus`, `assertScrubbed`, `ExtractInput`, …). The public entry name is unchanged;
  the scrub test imports the mapper directly. Conservative interpretation of "export it
  pure".
- **TypeScript "rc" + `@types/node ^25`** to match the sibling `packages/core` (the root
  `.` package pins TS `^7.0.2` / `@types/node ^22`). Guide is a new workspace package next
  to core, so I followed core's toolchain, not the legacy root's.
- **No Playwright smoke in 5a.** The v4 "Playwright smoke covers G-auth-ux + S2→S3" line
  depends on the 5b server + cookie auth, which does not exist yet. 5a is a headless perf
  spike; component/kernel tests cover it. Deferred to 5b, not weakened.
- **Slice recompute is measured as an `expand` action** (in `SpikeApp`), including the
  first slice. The first sample therefore reflects initial compute; subsequent samples are
  true viewport-change expands. `compileMs` is measured separately.

## Adjacent-found (untouched)

- `packages/cli` references a `guide/assets.ts` and `copy-guide-assets.mjs` (seen in the
  store's code cursor) — prior guide scaffolding in the CLI package. 5a is a standalone
  package and does not wire into the CLI (`ctx guide` deep-link printing is slice 5i/5h).
  Not touched.
- The repo-root `implementation-notes.md` is a stale log from the merged o33b slice. Out of
  scope; left as-is.

## Open questions

- **Evidence Rail step granularity** (node-keyed vs edge-keyed) — see Decisions. Which is
  more faithful to D23's "each step click-focuses the canvas and carries edge type +
  provenance"? Current node-keyed form loses the caller identity when two edges share a
  callee.
- **10× cross-clone edge count** (200 seeded imports) is a plausibility figure, not a
  measured real cross-package fan-out. Adequate to prove the cap/aggregation path; not a
  claim about real-world density.

## Delegated to the reviewer

- **G-perf-budget browser half.** The compiler/LOD seam clearly meets budget (numbers
  above). The remaining merge-blocking items — `first interactive`, `pan/zoom ≥50 fps`,
  `no >500 ms long task` — are React-Flow paint costs that must be read from a real Chrome
  drive. The spike ships the instrumentation: `window.__GUIDE_PERF__` (live record), the
  Perf HUD table (measured vs D12), and a **Sweep** button that runs a scripted 3 s
  viewport tour recording fps. I cannot launch a GUI browser in this environment, so the
  fps/first-interactive readings are for the reviewer (or a Playwright driver) to capture.
- **WebGL fallback ruling (D12).** Not needed on the node-side evidence; only relevant if
  the browser pan/zoom fps fails at the far folder/file level. The `GraphRenderer` seam is
  stable, so swapping the far-level impl requires no upstream change.

---

## VariantSpec contract changes

**None.** The `VariantSpec` interface is implemented exactly as specified
(`id/label/description/themeClass/NodeContent/EdgePath?/RailStep?/ChromeSlots?`). The
`wireframe` variant uses only `NodeContent` + `themeClass`; the registry auto-discovers
`src/variants/*/index.tsx` via `import.meta.glob(..., { eager: true })`; `?variant=<id>`
selects, default = first alphabetically. A design variant can be added under
`src/variants/<slug>/` with zero substrate edits.

---

## Commands

```bash
# from repo root (single install; lockfile updates once)
pnpm install

# from packages/guide
pnpm gen        # real store (READ-ONLY) -> public/generated/corpus.json
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run (10 suites, 38 tests)
pnpm build      # vite production build -> dist/
pnpm preview --port 4188   # then curl / and /generated/corpus.json (expect 200)
pnpm dev        # live spike shell

# deep links (primary entry, D22): open the dev/preview URL with a hash query
#   #/?diff=132cc921beef..a9f62be5e064    -> Change Trace over the real diff event
#   #/?sym=sym:packages/cli/src/cli.ts#run  -> symbol event (hit path only)
#   #/?q=how%20does%20X%20work            -> rejected as a non-event (guided to search)
#   #/?scale=10x                          -> 10× synthetic scale (built on demand)
#   #/?variant=wireframe                  -> variant select

# regenerate the golden transcript if event.ts logic intentionally changes:
#   node/tsx script: compile(makeFixtureCorpus()) -> project(resolveEvent({}, corpus)) ->
#   JSON.stringify(_, null, 2)+"\n" into tests/golden/event-projection.json
```

## Variant deviation logs

Per-variant design rationale, token/contrast tables, and deviation logs live in
`src/variants/<slug>/NOTES.md` (plat / instrument / atelier / transit). Two root-level
pointer copies (`implementation-notes.{atelier,transit}.md`) were folded here and removed
by the reviewer — the variant builders' file contract keeps all variant artifacts inside
their own folder.
