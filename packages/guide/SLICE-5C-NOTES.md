# Slice 5c — Atlas core (semantic zoom, minimap, viewport/generation, Recent lens)

Fable track, branch `m3/v4-fable`. Built additively on the 5a spike + 5b server tree. Substrate +
wireframe + additive types only; the four design-variant folders (atelier/instrument/plat/transit)
were NOT touched. Maintainer priority for this phase: presentation / correct behavior first,
performance last (no gross regression, no optimization work).

## What 5c delivers (per the work order)

### 1. Semantic zoom + hysteresis (D9)
`src/atlas/lod.ts` — the fresh single-boundary zoom→bucket mapping was replaced by four discrete
**semantic-zoom levels** with hysteresis bands:
- `ZOOM_UP = [0, 0.35, 0.7, 1.2]` (zoom needed to REVEAL a level — equal to the historical
  boundaries, so a fresh/no-history map is byte-identical to the old `revealFor`).
- `ZOOM_DOWN = [0, 0.28, 0.56, 0.96]` (the LOWER zoom needed to DROP out of a level = 0.8× the up
  threshold).
- `nextZoomLevel(current, zoom)` climbs only past an UP threshold and drops only below a DOWN
  threshold → a zoom hovering near a boundary cannot flap (proven in `lod-5c.test.ts`).
- `computeSlice` gained an optional 7th `state` arg `{ revealLevel?, pinnedIds? }`. `SpikeApp`
  carries the level in a ref (`levelRef`) across frames, and re-slices are **debounced ~180 ms** on
  the onMove-end path (`commitViewport`), only committing when the level changes or the viewport
  centre moves >30%.
- **Pinned reveal** (D9 "click pins an expansion"): a pinned folder's direct children are revealed
  at any zoom via `state.pinnedIds`. Clicking a folder whose children are hidden at the current
  level adds it to `pinnedIds`; Esc/deselect (`clearSelection`) clears the set. Slice caps + lit
  protection stay intact (the pin only affects the `isRevealed` gate).

### 2. Minimap (D9 verbatim) — `src/ui/Minimap.tsx` (new substrate component)
Bottom-right, always available, collapsible. DOM/SVG only, **no libraries**. Draws **top-level
folder regions only** (never files/decls), tinted by depth, plus: the **live viewport rectangle**
(draggable via pointer events → pans the canvas through `RendererApi.setViewport`), **search-hit
marks** (dots at matched nodes' world centres), and **active-lens marks** (lit regions get
`minimap-region-lit`). Clicking a region pans the camera to it. All styling is structural CSS +
`--minimap-*` tokens exposed in `styles.css` so variants can restyle without a substrate edit.

### 3. Viewport & generation behavior (D10)
- **Cold open** (no `diff=`/`sym=` deep link): `hotspotViewport(model, litNodeIds)` frames the
  **densest single region** — the top-level (depth-1) folder containing the most lit FILE lots,
  padded 25% per side — NOT the whole-repo lit bbox (which opened the map at ~0.13). No lit files →
  `fitViewport` (fit repo).
- **Explicit deep-link events** keep their projected viewport (`projection.p.viewport`) as-is.
- **Within one generation**: viewport + zoom + selection + pinned reveals persist to `localStorage`
  keyed by `projectionId + generation identity` (`src/atlas/persist.ts`, injectable store). A cold
  open restores a matching-key session; a different generation identity never restores stale state.
- **New generation while reading** (live source): the map is NOT swapped. `SpikeApp` polls
  `source.pollGeneration()` every ~30 s (injectable `pollMs`); a changed `identity` raises a
  dismissible `GenerationPrompt` (D10) with a real counts diff (`+files · +declarations`). Only an
  explicit **Switch** reloads the corpus, re-compiles, preserves a still-existing selection, and
  moves to the new recent hotspot. Dismiss remembers the identity so it does not re-prompt.
  - CLI: new `GET /api/generation` route (`packages/cli/src/guide/server.ts`) returns
    `{ generations, identity, fileCount, declCount }` WITHOUT the full corpus body
    (`buildGenerationInfo` in `corpus.ts`). Same loopback + cookie auth as every route. `cli` test
    added (`guide-server.test.ts`).
- **Fit repo** button unchanged; Esc back-out unchanged and plays nice with restored viewports
  (the seed path sets `openViewport` before the shell un-gates).

### 4. Recent lens (default, D11) — `src/atlas/lens.ts` (new)
File lots carry `recency` (epoch/null, threaded onto the file `AtlasNode` in `compile.ts`).
`recencyBuckets(model, corpus)` classifies each file into a **neutral** ramp:
`0` in the event window (precise "last 20 commits" via anchorFiles + resolved touches) · `1` within
~30 days of the newest commit · `2` older · `3` never. Rendered as a `recency-0..3` class on the
FILE-lot wrapper (`fileRecencyClassName`), styled in `styles.css` as an inset border-weight/neutral
-ink ramp (box-shadow, so it stacks with selection opacity + lit/dim and never fights the lot bg).
**No saturated color, no effect on claim-status ticks.** A static HUD label "Lens: Recent" (the
other lenses are 5f) — not a switcher.

### 5. Fold-in: deterministic reading focus
`RendererApi.centerOn(rect, targetZoom)` (new) always centres a target at a fixed reading zoom.
Rail / search / minimap destinations use `focusReading`: decl → 3.2 (≥1.6 and crosses the label
threshold), file → `max(1.0, 200 / (side·14))` so the lot is ~200 px, folder → frame the region.
Canvas node clicks keep the gentle `revealNode` (no camera churn on already-visible nodes).

## Tests added (guide 65 → 99; cli 43 → 44)
- `lod-5c.test.ts` — hysteresis (down<up, no-flap dead band, hold-until-lower-threshold, bounded
  sweep), pinned reveal (children hidden without pin / revealed with pin / re-collapse on clear),
  cold-open hotspot (densest region frame, per-region counting, fit-repo on no activity).
- `lens.test.ts` — recency bucket classification + `recentFileSet` + `recencyBuckets` over a model.
- `persist.test.ts` — same-generation restore, cross-generation NON-restore, malformed guards.
- `minimap.test.tsx` — top-level regions only, viewport rect, region-click spy, search marks, lens
  marks, collapse.
- `generation.test.tsx` — prompt on identity change without a map swap, switch reloads + preserves
  selection, dismiss does not re-prompt.
- `selection.test.ts` — `fileRecencyClassName` composition (the exact class the renderer stamps).
- `guide-server.test.ts` (cli) — `GET /api/generation` returns cheap metadata, not the corpus.
- Naming gate (`naming-gate.test.ts`) re-scans all new UI copy — green.

## Verify (self-run)
- `pnpm --filter @contexa/guide test` → 18 files / **99 tests** pass.
- `pnpm --filter @contexa/cli test` → **44 pass** / 16 todo.
- `pnpm -r typecheck` → clean (core + cli + guide).
- `pnpm --filter @contexa/guide build` → succeeds (all four variants).
- `pnpm --filter @contexa/guide gen` → 1332 files / 4205 decls; 967 files carry recency (Recent lens
  has real data).
- Preview smoke: `vite preview` serves `/` (200), `/generated/corpus.json` (200, 1.36 MB), JS
  bundle (200). Full GUI drive is the reviewer's re-drive.
