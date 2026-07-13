# atelier : Museum Atlas (design notes)

## Rationale

The codebase is curated as a museum wing. Folders are recessed matte gallery
walls; files are floated plates hung on them; declarations are engraved cells.
The signature is editorial typography (Source Serif 4 exhibit-wall titles) and
generous air, so the floor stays calm enough that the only saturated ink on
screen : the three claim-status ticks : reads instantly (D9/D11/D15: color is
spent on claim status, never activity).

Depth is the storytelling mechanic for the Change Trace. Rather than recolor,
the trace works in the third dimension: plates in the trace **lift** (deeper
shadow, full opacity, a 1px ink outline) and plates off the trace **flatten**
(45% opacity, shadow removed entirely). Physical depth = evidence weight. This
is the one variant permitted shadows, and it earns them by making shadow the
carrier of meaning rather than decoration.

## Token table (computed contrast ratios, WCAG 2.x)

| Token | Value | Role |
|---|---|---|
| `--ink` | `#1d1d1b` | deep neutral ink (titles, labels) |
| `--ink-muted` | `#6a6a66` | captions, paths, meta |
| `--gallery-bg` | `#f7f7f6` | gallery off-white floor (chroma ~0) |
| `--plate-fill` | `#fdfdfc` | floated file plate |
| `--region-fill` | `#eeeeec` | recessed matte folder wall (1 step darker) |
| `--decl-border` | `rgba(29,29,27,.20)` | engraved decl cell border |
| `--status-conflict` | `#8f2d1e` | deep oxide red (claim tick, letter C) |
| `--status-needs-review` | `#7a5423` | raw umber (claim tick, letter R) |
| `--status-active` | `#8a8880` | warm gray, neutral (recessive tick) |
| `--lit-outline` | `#1d1d1b` | lit/focus outline ink |
| `--radius` | `2px` | single radius system (max) |

### Required contrast measurements

| Pair | Foreground | Background | Ratio | Verdict |
|---|---|---|---|---|
| label-on-plate | `#1d1d1b` file label | `#fdfdfc` plate | **16.6:1** | AAA |
| serif-title-on-bg | `#1d1d1b` region title | `#eeeeec` matte wall | **14.5:1** | AAA |
| dim-label-on-bg | ink @45% ≈ `rgb(149,149,147)` | `#f7f7f6` floor | **2.8:1** | intentional |

Additional: `--status-conflict` `#8f2d1e` on `#fdfdfc` ≈ 7.6:1; `--status-needs-review`
`#7a5423` on `#fdfdfc` ≈ 7.4:1 (letterforms C/R are AAA-legible for non-color access).

The **dim-label-on-bg 2.8:1** is deliberate: the flattened state is the
"not part of this change" state : receded on purpose, not primary reading text.
Lit/focused labels always return to 16.6:1.

## Shadow spec table

| State | box-shadow | blur | notes |
|---|---|---|---|
| plate (rest) | `0 1px 3px rgba(29,29,27,.08)` | 3px | soft, tinted to bg hue |
| plate (lift/lit) | `0 3px 8px rgba(29,29,27,.14)` | 8px (max) | one step deeper |
| plate (flat/dimmed) | `none` | : | shadow removed entirely |
| folder (wall) | `none` | : | walls don't float |
| decl (engraved) | `none` | : | border-only cell |

All shadows tinted to the bg hue (ink alpha), never harsh black, never > 8px blur.

## Motion

- Lift/flatten: `600ms cubic-bezier(0.22,1,0.36,1)` on box-shadow + opacity + outline-color.
- Rail cards settle once on event load: `atelier-settle` (translateY 6px + opacity),
  520ms, staggered 60ms via `.rail-steps li:nth-child(1..8)` (capped at 8; 9+ share
  the 420ms delay). Focus changes keep the same React key, so the settle does not replay.
- `prefers-reduced-motion: reduce` → crossfade only (opacity, no transforms); stagger removed.

## Deviations

1. **Font import specifier.** The brief says `import '@fontsource-variable/public-sans'`
   (bare). Under this repo's `moduleResolution: "bundler"` + `verbatimModuleSyntax`,
   a bare side-effect import of a CSS-only package raises TS2882 (no type declaration)
   unless a substrate ambient shim (`declare module '@fontsource-variable/*'`) exists :
   which it currently does not, and which is substrate-owned (the sibling variants
   plat/instrument/transit hit the identical error). To stay self-contained and green
   without touching substrate, I import the explicit `/index.css` subpath
   (`@fontsource-variable/public-sans/index.css`). This resolves to the package's `.`
   export target (`index.css`) : byte-identical CSS, the same variable font-faces : and
   is matched by `vite/client`'s `declare module '*.css'`. Conservative, reversible if
   the substrate later adds the shim.

2. **Active-status tick shown on files only.** The brief lists `active = warm gray
   (neutral)` as a perimeter tick. Rendering a tick on every active decl and folder
   would clutter the calmest-density variant, so I render the neutral active tick on
   file plates only (at 50% opacity, no letterform). Conflict/needs-review ticks render
   on all node kinds with C/R letterforms. Keeps color budget honest and the floor calm.

3. **hudExtra omitted.** The brief permits omission "unless you find something
   non-redundant." The substrate HUD already carries repo, revision, generation counts,
   scale, variant selector, fit, and sweep. A gallery-styled duplicate adds nothing, so
   `ChromeSlots.hudExtra` is intentionally not provided (only `legend`).

## Seam gaps (substrate does not yet consume these)

- **ChromeSlots.legend / EdgePath / RailStep are not wired by the current substrate.**
  `src/ui/SpikeApp.tsx` renders `variant.themeClass` + `variant.NodeContent` (and
  `EvidenceRail` consumes `variant.RailStep`), but it does **not** render
  `ChromeSlots.legend`/`hudExtra`, and `ReactFlowRenderer.tsx` draws edges with its own
  inline styles rather than calling `variant.EdgePath`. All three are exported per the
  `VariantSpec` contract and are correct; they will light up once the substrate fix wires
  them. Reviewer: legend + custom edges won't appear until then. `RailStep` **is** wired
  and will render.
- **EdgePath receives no lit flag.** The contract signature is `(edge, geometry)` with no
  lit/dimmed state, so `EdgePath` draws the faint backbone curve keyed by edge kind
  (calls solid, imports dashed) and exposes a `.atelier-edge.lit` / `.lit .atelier-edge`
  CSS hook for the substrate to mark lit edges full-ink. Full-ink emphasis depends on the
  substrate applying that class.
- **Full `pnpm build` and dev are red due to concurrent sibling work**, not this variant.
  The eager registry glob (`import.meta.glob('./*/index.tsx', { eager: true })`) imports
  every sibling; `src/variants/transit/index.tsx` imports a not-yet-written `./transit.css`,
  which fails the whole bundle. `src/ui/SpikeApp.tsx` also has in-flight type errors from
  the substrate fixer. This variant's own subtree bundles clean in isolation (esbuild,
  exit 0; all three variable fonts + atelier.css resolve) and `pnpm --filter @contexa/guide
  test` + a scoped typecheck of `src/variants/atelier/**` are green.
