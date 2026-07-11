---
status: active
review_after: 2026-08-08
note: design authority for the m3/rescope-claude track UI layer (packages/guide). Issued by the
  reviewer 2026-07-11 per maintainer instruction (frontend skills + .research inspiration).
  Arbitration order on conflict: M3-RESCOPE-BRIEF §3-§4 + PRODUCT-DESIGN LAW §3 > this doc >
  builder discretion. This doc changes NO contract, projection, route, or test - it governs
  tokens, components, layout, motion, and copy only.
---

# M3 Guide - Design Direction (Claude track)

## 0. Design read

Reading this as: a local, ephemeral **trust instrument** for one developer auditing what their
repo's knowledge graph believes - opened in a browser tab beside a dark editor, mid-task, at
night. Register: **product/tool** (design serves the task; earned familiarity over novelty).
The page's single job: let a human drill any rendered fact to its evidence and read its trust
state at a glance.

Scene sentence (theme-forcing): a maintainer pauses a review, runs `ctx guide`, and glances at
the tab the way they glance at a debugger - the surface must sit at editor luminance (no
flashbang), stay quiet, and make ONLY trust state glow. That forces: dark lead theme, neutral
chrome, instant load (no choreography), dense-capable.

## 1. The thesis (what makes this design non-template)

Both reference canvases (.research) encode node KIND with color - understand-anything ships a
13-hue kind palette, gitnexus a 40-hue one. **We invert this.** LAW §3 + brief §4 command:
color budget is spent ONLY on claim semantics. So:

- **Node kind = shape + icon + typography. Never hue.** A symbol, a doc, a memory note, a
  decision all sit on the same graphite chrome.
- **Claim status = the only saturated thing on screen.** Six status hues (below) plus one
  interaction accent. On a calm graphite field, a red `conflicting` mark is unmissable
  because nothing else competes.
- Signature element: the **Claim Legend** - a docked, always-visible legend (map convention:
  every serious map carries one) that doubles as a live filter. It teaches the glyph grammar,
  shows live counts per status, and clicking an entry highlights/filters the surface. One
  legend, all three surfaces.
- Second identity rule: **monospace = evidence.** IBM Plex Mono renders anchors, revisions,
  hashes, CLI commands, glyph expansions, and counts - nothing else. Seeing mono means "this
  string is evidence or an exact command". Chrome and prose are IBM Plex Sans.

The aesthetic risk: an almost colorless graph canvas. Justified because the product's value IS
the trust envelope; a kind-rainbow would spend the reader's attention on taxonomy instead.

## 2. Tokens (lead skin "instrument graphite" - dark)

All colors OKLCH. Fonts vendored as woff2 via @font-face + font-display swap (zero egress -
no Google Fonts, no CDN, ever).

```css
/* surfaces - slightly cool (hue 240), never pure black */
--bg:            oklch(0.17 0.012 240);   /* app field          */
--surface:       oklch(0.205 0.012 240);  /* panels, drawer     */
--surface-2:     oklch(0.24 0.012 240);   /* elevated, hover    */
--hairline:      oklch(0.32 0.012 240);   /* 1px borders        */
--ink:           oklch(0.93 0.005 240);   /* primary text       */
--ink-dim:       oklch(0.72 0.008 240);   /* secondary text (AA on --bg) */
--ink-faint:     oklch(0.55 0.008 240);   /* disabled only, never body   */

/* interaction accent - cobalt band (seed oklch(0.65 0.10 230)); selection,
   focus ring, primary action, active tab. NEVER decoration. */
--accent:        oklch(0.65 0.10 230);
--accent-hover:  oklch(0.70 0.10 230);

/* claim-status hues - the ONLY other saturated tokens in the system */
--st-resolved:     oklch(0.72 0.13 150);  /* green            */
--st-conflicting:  oklch(0.68 0.16 25);   /* red              */
--st-stale:        oklch(0.75 0.13 75);   /* amber            */
--st-unavailable:  oklch(0.60 0.015 240); /* neutral gray     */
--st-restricted:   oklch(0.65 0.11 300);  /* violet + lock    */
--st-unknown:      oklch(0.55 0.01 240);  /* gray + dashed    */
```

Rules:
- Cobalt (230) and the status band never collide: blue is reserved for interaction, status
  owns green/red/amber/violet/gray. A selected conflicting node shows BOTH legibly
  (accent ring outside, red mark inside).
- Status colors appear only on claim marks, badges, legend, and status text - never as
  panel tints, button fills, or section backgrounds.
- Contrast floor: body text >= 4.5:1 against its surface (verify --ink-dim on --bg and
  --surface); large/bold >= 3:1; status marks >= 3:1 against node chrome.
- No pure #000/#fff anywhere.

Type:
- Families: **IBM Plex Sans** (chrome, prose, headings) + **IBM Plex Mono** (evidence rule
  above). Two families total; no display face - this is an instrument, headings are Plex
  Sans 600 with -0.01em tracking.
- Fixed rem scale, ratio ~1.2: 12 / 13 / 14 (body) / 16 / 19 / 23 / 28. Dense tables may use
  13; never below 12. Numbers in tables: mono, `font-variant-numeric: tabular-nums`.
- Prose (Subject facts, descriptions) capped at 72ch. Tables may run wide.

Shape and depth:
- Radius system (locked): 4px inputs/chips, 8px panels/cards, 12px drawer/modal, full-pill
  only for interactive filter chips. Nothing above 12px.
- Elevation: 1px hairline borders are the primary separator. Shadows only on floating
  layers (drawer, popover, omnibox results): soft and diffused, e.g.
  `0 8px 24px oklch(0 0 0 / 0.35)`, never harsh drop shadows, never border+big-shadow
  on the same element.
- z-index scale (documented constant, no arbitrary values): canvas-overlay 10, sticky-header
  20, drawer 30, popover 40, omnibox 50, toast 60.

## 3. The envelope glyph (the product-value component)

Web twin of `renderEnvelopeTerse` (`packages/core/src/serve/envelope.ts`) - extends its
grammar, never forks it. One compact chip per fact, five axes, each on its own visual channel:

| Axis | Channel | Encoding |
|---|---|---|
| derivation | mark SHAPE | OBSERVED = solid disc; DECLARED = 2px ring; INFERRED = dashed ring; null = hollow square with `?` |
| status | mark HUE | the six --st-* tokens |
| confidence | tick stack | 3 short vertical ticks right of the mark: CONFIRMED = 3 filled, LIKELY = 2, POSSIBLE = 1, null = 0 ticks + `?` |
| freshness | mark OPACITY | content-hash/fresh = 1.0; decay classes step down to 0.55; `unknown-until-reverified` = 0.55 + diagonal hatch |
| disclosure | trailing badge | lock glyph only when `restricted`; otherwise nothing collapsed (full value in expansion) |

Collapsed chip: `[mark][ticks]` + optional `@rev` in 12px mono, on a `--surface-2` pill,
hairline border. Total width well under 90px.

Hover/focus (150ms, ease-out) opens a popover:
- Line 1: the EXACT `renderEnvelopeTerse` string in mono (e.g.
  `<O.C.resolved.content-hash.local> git:abc123@deadbeef`) - the textual twin, verbatim.
- Then labeled rows: derivation / confidence / status / freshness / disclosure / observed_at,
  each value in mono.
- Footer: evidence anchor as a button ("Open evidence") -> the Evidence Drawer.

Honest-gap rendering (G-honest-gap, binding): a null axis renders `?` in its channel and the
word "unknown" in the popover - styled as a disclosed gap (dashed hairline), never omitted,
never guessed. The `authority` compatibility shadow renders its value with a visible
`compat shadow` tag chip. The DR-01 banner ("accelerator, not validated - ...") is a standing
one-line quiet bar (--surface, --ink-dim, 12px) at the top of every surface; not dismissible,
never colored, exact ACCELERATOR_DISCLOSURE text.

Keyboard/a11y: chip is focusable; popover opens on focus; every axis has an aria-label with
the spelled-out value ("derivation observed, confidence likely, ..."). Color is never the
only channel (shape/ticks/hatch/lock carry in grayscale).

## 4. Surface layouts

Overlay budget on canvas: MAX 3 floating anchors + minimap (gitnexus's 6 competing clusters
is the named anti-pattern).

### 4.1 Canvas (entry)
```
+------------------------------------------------------------------+
| DR-01 quiet bar                                                  |
| [omnibox - floating top-center, max-w 560px, Cmd+K]              |
|                                                                  |
|          ~ full-bleed React Flow field on --bg ~                 |
|   [source cluster]   [cluster]        [preview panel     ]      |
|      (containers, neutral tint,       [slides in right,  ]      |
|       badges colored by status)       [280->320->360px   ]      |
|                                                                  |
| [Claim Legend dock - bottom-left]            [minimap b-r]      |
+------------------------------------------------------------------+
```
- Node chrome: `--surface` cards, hairline border, 8px radius; kind icon (top-left) + name;
  status mark per node; log2-scaled edge widths (UA precedent); edges `--hairline` at 40%,
  dimmed to 8% when unrelated to selection.
- Containers/clusters: tint on border+title ONLY, never body fill (UA rule) - and the tint
  is a neutral lightness step, not a hue.
- Selection state matrix (UA-lifted): selected = accent ring + neighbor faint ring +
  unrelated at opacity 0.2; search hits = accent ring intensity by score; lens-inactive =
  opacity 0.3.
- Live badges (needs-review count, open conflicts, freshness, E8): small pills on cluster
  headers, hue = the status they count, mono numerals.
- Lenses (time/churn): toggle group top-right (anchor #3). Churn heat = OPACITY/lightness
  ramp on neutral, never a new hue. Supersession chains in time lens draw accent-dashed
  edges with decision nodes.
- Layout: elkjs layered, DOWN, orthogonal routing; UA's proven params
  (nodeNodeBetweenLayers 80, nodeNode 60, padding [40,20,20,20]) as starting values; adopt
  two-stage lazy layout + container size memory if fixture scale demands; relayout shows
  "Computing layout..." scrim OVER the stale layout (never blank). Zoom-dependent labels;
  hide edge labels while panning on dense graphs.
- Omnibox: input with `/` and Cmd+K to focus, kbd hint rendered; dropdown rows = kind icon +
  name + kind label + status mark; arrows/enter navigate; enter -> side preview; enter again
  or click -> Subject.

### 4.2 Subject
Reading surface. Sticky header: kind icon + subject name (mono if a code ref) + its envelope
chip + "Open evidence". Sections in one scrolling column (72ch prose cap, tables wide):
facts (each row: fact prose + chip + anchor link) -> decision chain (typed vertical list,
this is a real sequence so ordered markers are earned here) -> history/co-change (table,
mono numerics) -> neighborhood mini-graph (bounded, same node chrome, non-interactive except
click-to-navigate). Evidence Drawer: right side, 12px radius, shows anchor URI/revision/hash
in mono + resolved content excerpt when the projection provides it + the copyable exact
`ctx` command where curation applies. ONE drawer pattern reused everywhere.

### 4.3 Inspector
Dense worklist, tabs across the top (review queue / conflicts / push preview / memory /
health). Tables: 13px, hairline row separators (single bottom border, sparse), mono for
counts/ids/revs, status marks lead each row. Every actionable row renders its EXACT CLI
command in a mono copy-block (click = copy + toast "Copied") - commands are never buttons
that execute (R1). Push preview renders the verbatim would-be digest in a mono block with
the size budget as `used/budget` mono figures. Health tab: per-source gen/cursor as a
definition table, freshness as status marks, E8 signals as quiet rows - no gauges, no
donut charts.

## 5. Motion

Product register: motion conveys state, 150-250ms, no load choreography, no scroll reveals.
- Curve: `cubic-bezier(0.32, 0.72, 0, 1)` for enters; plain ease-out for exits. Never
  linear, never bounce.
- Chip popover 150ms fade+2px rise; drawer 220ms slide; tab underline 150ms; legend filter
  application 200ms opacity transitions on affected nodes; canvas fit-view uses React Flow's
  animated viewport (<=300ms).
- `prefers-reduced-motion`: every transition collapses to instant; canvas fit-view jumps.
- Animate transform/opacity only. blur/backdrop-filter only on fixed overlays (omnibox
  results, drawer scrim) if used at all.

## 6. States and copy

- Loading: skeletons matching final layout shape (rows in Inspector, node ghosts on canvas);
  never centered spinners inside content.
- Empty states teach: empty store -> "No graph yet. Index this repo first:" + mono copyable
  `ctx init` block. Empty review queue -> "Review queue is clear." + count of confirmed
  claims. Every empty state names the action, in the interface's voice.
- Errors: inline, cause-first ("Store not found at .contexa/store.sqlite"), never apologetic,
  never vague. Server-gone (idle shutdown) -> full-screen quiet card: "Session ended. Run
  ctx guide to start a new one." (mono command, copyable).
- Copy register: sentence case everywhere; buttons verb+object ("Copy command", "Open
  evidence"); one label per intent across all surfaces; status vocabulary EXACTLY LAW §3's
  six words - never synonyms ("outdated", "broken" are banned; it is "stale", "conflicting").
- Zero em-dashes in rendered UI text (taste-skill hard ban; use commas/colons/parens).
  No marketing verbs. No fake numbers: every figure on screen comes from a projection.

## 7. Craft floor (applies to every skin, non-negotiable)

WCAG AA contrast verified on real token pairs; visible focus ring (accent, 2px, offset 2px)
on ALL interactive elements; full keyboard path (omnibox -> canvas nodes -> preview -> drawer);
aria-labels spell out glyph meanings; reduced-motion honored; theme lock per skin (no
mid-surface theme flips); shape lock (radius system above); z-index scale respected; all
component states shipped (default/hover/focus/active/disabled/loading/error); icons from ONE
family at one stroke width (Phosphor, light/regular, npm-bundled - never hand-rolled SVG
paths, never mixed sets); no CDN/font/telemetry URLs anywhere in the bundle (G-egress).

## 8. Variant protocol (slice 3e)

Fixed across ALL variants (data/DOM-structure diff must be clean - C11): routes, projections,
DOM structure, component tree, glyph GRAMMAR (axis->channel mapping: shape=derivation,
hue=status, opacity=freshness, ticks=confidence), a11y floor, copy, craft floor (§7).

Free per variant (design-system layer only): full token set (palette incl. polarity,
radius scale within lock discipline, type families incl. swapping Plex for other BUNDLED
open faces, spacing density, hairline vs shadow language, legend/dock skin, node-card skin).

Seeds - one line each, deliberately divergent axes; builder invents the rest and does NOT
converge them:
- V1 `graphite` - this document's lead skin (dark, cobalt, Plex, hairlines).
- V2 `ledger` - light, true off-white chroma-0 field, near-black ink, radius-0 sharp,
  hairline-ruled like a survey/ledger sheet; status hues recalibrated darker for light bg.
- V3 `depth` - dark but soft: no visible borders, elevation entirely via layered soft
  shadows and lightness steps, 12px radii, calmer 13px base.
- V4 (optional) `signal` - near-monochrome extreme: chrome fully grayscale, status marks
  the ONLY color, one size larger, for maximum trust-mark salience.

Each variant must pass §7 and re-verify contrast for ITS palette. `?skin=` switches at
runtime; skins are token files + component-skin css only.

## 9. Reference intelligence (lifted ideas - never code)

From understand-anything: ELK layered params + two-stage lazy layout + container size
memory; border+title-only container tint; selection/dim state matrix; "Computing layout..."
scrim over stale layout; telescoping panel widths; log2 edge widths; zoom-expand hysteresis
(expand >1.0, collapse <0.6, debounced).
From gitnexus: zoom-dependent label LOD (threshold ~8px, density 0.1, hide edges on move);
deliberately-muted "noise" entity treatment; floating selection pill; Cmd+K omnibox with kbd
hints; "load anyway" escape hatch for huge graphs (as an IN-APP dialog, never
window.confirm).
Named anti-patterns (do not ship): kind-rainbow palettes; violet-on-void default accent
(gitnexus+davia both ship #7c3aed - it is the current template tell); marketing chrome in
the shell; >3 floating overlay clusters; noise/grain overlays; heavy glassmorphism;
serif-luxury framing; native browser dialogs; decorative dots (our dots are ALWAYS semantic
status, which is the allowed case).
