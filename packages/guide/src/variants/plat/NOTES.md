# Variant `plat` — Surveyor's Plat

## Design rationale

The repo is drawn as a county land-registry plat map: folders are tracts, files are
lots, declarations are parcels. The identity is authority and record-keeping, so the
whole surface commits to cadastral drawing conventions rather than app-UI conventions.
Hierarchy is carried the way a real plat carries it: line weight, not shadow or radius.
Tracts get a 1.5px double-rule (outer border plus an inset rule), lots a 1px rule,
parcels a 0.5px hairline. There is not a single shadow or rounded corner in the variant
— every corner is sharp, every fill is flat. Depth is a barely-there cool blue tint step
per level, so nesting reads as land shading, with the tract backdrop showing in the
margins between the lots stacked on top of it. Folder names are set as map-sheet titles
(letterspaced all-small-caps, IBM Plex Sans), a deliberate and singular cartographic
convention; lot labels are sentence-case small; parcels are label-free below readable
size with a hover title kept for access. Motion is near-zero on purpose — the variant's
identity is registry stillness, so only 120ms opacity settles are allowed and
`prefers-reduced-motion` makes everything instant.

Color budget follows D9/D11/D15 strictly: activity is neutral luminance (the depth tint),
and the only saturated color in the entire variant is claim status — a registry-red stamp
tone for conflict, ochre for needs-review, neutral gray for active — rendered as a short
perimeter tick bar on the top edge (not a dot), with a C/R letterform glyph at readable
sizes for non-color access. The Change Trace (never named impact/affected/blast/risk per
D24) reads as a survey: lit lots get a full-strength ink rule plus an "under survey"
diagonal hatch fill (inline SVG data URI, ~6% ink); dimmed lots fade their *structure* to
35% ink while the paper fill stays put so the map never disappears; the focused lot gets a
double-rule ink outline plus surveyor corner ticks. The Evidence Rail is recast as a
register ledger: a mono hop ordinal, label, path, and provenance per row, with the focused
row taking a full box rule in ink over one-step-darker paper (a box rule, never a colored
side stripe).

## Token table

Scope: all tokens redefined inside `.variant-plat`. Paper is cool (slate-blue leaning),
explicitly not warm cream/beige.

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#f4f6f9` | base cool paper |
| `--paper-2` | `#eef2f7` | one step darker (focused rail row) |
| lot tints (files) | `#f6f8fb` .. `#d9e1ec` | 6-step depth tint |
| tract tints (folders) | `#e9eef5` .. `#c9d4e5` | 6-step depth tint |
| parcel fill (decls) | `#dbe3ef` | parcel lot |
| `--ink` | `#171c26` | blue-black ink |
| `--ink-muted` | `#5a6473` | secondary ink |
| `--edge-ink` | `#3b4658` | neutral survey-line ink |
| `--status-active` | `#8b8f97` | neutral gray tick |
| `--status-needs-review` | `#a9741a` | ochre stamp |
| `--status-conflict` | `#b02417` | registry-red stamp |
| `--lit-outline` | `#171c26` | full-strength ink for Change Trace |

### Contrast ratios (computed, WCAG relative luminance)

| Pair | Ratio | Threshold |
|---|---|---|
| label ink `#171c26` on lightest lot `#f6f8fb` | ~15.3:1 | >=4.5 |
| label ink `#171c26` on darkest lot `#d9e1ec` | ~12.9:1 | >=4.5 |
| sheet-title ink on darkest tract `#c9d4e5` | ~11.4:1 | >=4.5 |
| dimmed label `rgba(23,28,38,.62)` on base paper | ~4.4:1 | >=3 |
| dimmed label on darkest lot (worst case) | ~3.6:1 | >=3 |
| status glyph (paper) on conflict red | ~6.2:1 | (aid) |
| status glyph (paper) on ochre | ~3.7:1 | (aid) |

Dimming decouples structure from text: the *lot rule* fades to 35% ink (structure
recedes) while the *label* only fades to 62% ink, so dimmed labels stay >=3:1 at readable
size. This is why the variant does not use whole-node opacity for dimming (that would drag
the label below 3:1); it fades border + label colors independently and leaves the paper
fill intact.

## Deviations

- **Deviation-log location.** The hard file contract restricts me to `src/variants/plat/`,
  which forbids the root `implementation-notes.md` my standing rules would otherwise
  require. The deviation log therefore lives in this NOTES.md (this section) rather than at
  the worktree root. Conservative reading of the stricter (task-specific) contract wins.
- **Font import path.** The work order specified `import '@fontsource-variable/ibm-plex-sans'`.
  Under this package's `tsconfig` (`moduleResolution: bundler`, `types: ["vite/client"]`),
  the bare specifier resolves to a CSS file with no `.css` suffix and TypeScript raises
  `TS2882` (no ambient declaration) — the sibling `instrument` variant hits the identical
  error. I import `@fontsource-variable/ibm-plex-sans/index.css` instead: same already-installed
  package, same variable font (full 100..700 wght range in one face), but the `.css` suffix
  matches vite/client's `declare module '*.css'`, so my file typechecks clean without
  editing substrate to add an ambient declaration.
- **Rail ordinal = hop.** The design asks for a mono "row number = real traversal order".
  The substrate's `RailStep` contract passes only `{ step, focused, onFocus }` — no
  sequential index. I use `step.hop` (zero-padded) as the ledger ordinal, which IS the real
  traversal metric the rail is ordered by (EvidenceRail groups by hop distance from
  anchors). A true 1..N sequential index would require the rail to pass an index prop
  (substrate change, out of scope).
- **Parcel-count annotation = overflow.** `AtlasNode` (files) does not carry a total
  `declCount`; it carries `overflow` (the disclosed "+N" of decls beyond lot capacity). The
  corner parcel-number annotation therefore shows `+N` overflow when present, not a total
  decl count. A true count would need a field on `AtlasNode` (substrate change).
- **hudExtra kept minimal + non-fabricating.** Generation and revision already read in the
  substrate HUD, and `ChromeSlots.hudExtra` is typed `FC` (no props), so I cannot source
  real gen/rev values. Per the work order's "keep minimal or omit, your call", it renders a
  plain mono cartographic caption ("Cadastral projection") that fabricates no numbers.
- **Focused corner ticks via solid-fill linear-gradients.** Shadows are banned (this
  variant: none at all) and `outline` cannot draw corner-only L-marks, so the focused
  corner ticks are drawn with `linear-gradient(ink, ink)` line-fills (both stops identical =
  a flat ink shape, not a visual/decorative gradient). This is not gradient text and not a
  glassmorphism effect; it is the standard technique for crisp fixed-size CSS tick marks.

## Adjacent-found (untouched)

- The aggregate `pnpm --filter @contexa/guide build` and `typecheck` are currently red from
  concurrent, in-flight work outside my contract: `src/variants/transit/index.tsx` imports a
  not-yet-written `./transit.css` (breaks the whole build, since the registry eagerly globs
  every variant); `src/variants/atelier/index.tsx` imports font packages with the same
  `TS2882` pattern; and `src/ui/SpikeApp.tsx` has unused-symbol errors plus an
  `onFirstInteractive` prop mismatch. All left untouched.

## Seam gaps (contract fields the current substrate does not yet consume)

- `VariantSpec.EdgePath`, `ChromeSlots.hudExtra`, and `ChromeSlots.legend` are declared in
  `types.ts` but the current substrate (`ReactFlowRenderer`, `SpikeApp`) does not render
  them — the renderer draws edges itself and the shell has no hud/legend slot yet. I
  implemented all three per the contract so they light up when the concurrent substrate
  agent wires the slots. Only `NodeContent` and `RailStep` render on the current substrate;
  those are what the reviewer will screenshot at `?variant=plat`.

## Verification

- `pnpm --filter @contexa/guide test` — green (38/38; the D24 naming-gate scans this
  variant's strings).
- `pnpm exec tsc --noEmit` filtered to `src/variants/plat` — zero errors (aggregate red is
  concurrent siblings/substrate, listed above).
- Isolated bundle of `src/variants/plat/index.tsx` via esbuild (css + font + jsx resolved) —
  OK, JS 5.7 KiB + CSS 596.8 KiB (embedded IBM Plex Sans variable + Mono 400/500/600).
