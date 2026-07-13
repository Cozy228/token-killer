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
