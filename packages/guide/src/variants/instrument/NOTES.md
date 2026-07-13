# instrument variant - "Flight Instrument" (NOTES + deviation log)

## Rationale

An EFIS approach plate for a codebase, built for scanning under pressure. The core
mechanic is D9/D11/D15: activity is neutral LUMINANCE, not color. Panels are dark
steel wells that step brighter the closer they sit to the repo root; the eye reads
"where am I / how deep" from brightness alone, with zero color spent. Saturated color
is reserved entirely for the three claim statuses (conflict red, needs-review amber),
which land as a 2px perimeter tick on the top edge plus a readable two-letter mono code
(CF / NR) so the signal survives color-blind viewing and desaturated capture. IBM Plex
Mono leads every label, readout, and rail row with tabular numerals in fixed slots
(`HOP 1`, `+N MORE`); IBM Plex Sans is used only for the one multi-sentence legend note.

The Change Trace reads like an instrument annunciation: lit panels step up two luminance
stops and gain a 1.5px near-white edge, while everything else drops to 22% opacity so the
map stays present but recedes. The lit edge (near-white) is deliberately a different
channel from the conflict tick (red), so a lit conflicting file never reads ambiguously.
Edges route as orthogonal elbows with a 45-degree chamfered bend (approach-chart feel),
calls solid and imports long-dash, in neutral steel with a 2px square terminal tick and
no arrowheads. Motion is fast and mechanical (160ms, `cubic-bezier(0.2,0,0,1)`), and the
focus reticle snaps in with no easing; `prefers-reduced-motion` removes all transitions.

## Luminance-channel honesty note

The intended luminance channel is RECENCY: files touched recently should sit one to two
stops brighter. `NodeContentProps` carries no recency (and `node.status` is NOT recency),
so this variant encodes **depth** instead: shallower nodes read brighter, deeper folders
step darker (`inst-d0` .. `inst-d4`). Depth is the honest available channel; the legend
states plainly that recency is the intended-but-unavailable signal. When the substrate one
day passes recency into node props, swap the `inst-d{n}` selection for a recency bucket and
the whole design carries over unchanged.

## Token table (computed WCAG contrast ratios)

| Token | Value | Role | Contrast | Ratio |
|---|---|---|---|---|
| `--ink` | `#e8eaee` | primary label / readout | on `--panel-1` `#12151b` | 15.2:1 |
| `--ink` | `#e8eaee` | primary label / readout | on brightest panel `#262d38` (worst case) | 11.5:1 |
| `--ink-muted` | `#8a92a0` | unit caps, secondary | on `--cockpit-bg` `#0a0c10` | 6.2:1 |
| `--ink-dim` | `#6b7280` | rail path line (floor case) | on `--cockpit-bg` `#0a0c10` | 4.1:1 (>= 3:1 floor) |
| `--lit-border` | `#eef1f5` | Change Trace lit edge | on `--cockpit-bg` `#0a0c10` | 17.3:1 |
| `--status-conflict` | `#ff5a52` | CF code text | on `--panel-2` `#171b22` | 5.6:1 |
| `--status-needs-review` | `#ffb020` | NR code text | on `--panel-2` `#171b22` | 9.4:1 |
| `--status-active` | `#7f8896` | neutral (swatch border only) | not a saturated fill | n/a |
| `--reticle` | `#d7dce3` | focus corner brackets (graphic) | n/a (2px stroke, not text) | n/a |

All ink meets the brief: labels >= 7:1 on panels (worst case 11.5:1), dimmed readable-size
labels floor at 3:1 (4.1:1), lit border and status codes clear their thresholds. Numbers
were computed with the standard sRGB relative-luminance formula.

## Decisions (design left these open)

- **hudExtra omitted.** `ChromeSlots.hudExtra` is an `FC` with no props, so it cannot read
  live visible/logical counts without fabricating numbers (against the "never fabricate"
  principle), and the substrate `map-hud` footer already prints
  `visible X/Y nodes . V/L edges`. Both reasons point to omission; only `legend` is provided.
- **Depth as the luminance channel** (see honesty note) since recency is not in props.
- **React Flow Background dots** are substrate-owned. The "no decorative dots" ban is honored
  by driving the substrate's own `--xy-background-pattern-*-color-default` vars to a value one
  hair above the cockpit background, so the grid blends to near-invisibility rather than
  reading as decoration.

## Deviations (departed from the work order, and why)

1. **Sans font import path.** The work order said import bare
   `@fontsource-variable/ibm-plex-sans`; that specifier has no TypeScript declaration
   (`vite/client` only declares `*.css`), so it raised `TS2882`. Switched to the package's
   `.css` entry `@fontsource-variable/ibm-plex-sans/index.css` - same package, same variable
   weight axis, typechecks clean. The three mono weights import fine as explicit `.css` files.
   (The sibling `plat` and `atelier` variants hit the identical `TS2882` on the bare form.)
2. **Focus reticle via 4 bordered spans** rather than SVG or background-image gradients. The
   brief allowed "background-image linear-gradients or an inline SVG"; both distort at the
   variable node sizes React Flow assigns (SVG viewBox scaling, gradient percentage drift).
   Four absolutely-positioned corner spans with 2px L-borders draw the same "four corners,
   not a ring" crisply at any size. Within the stated intent.
3. **Deviation log location.** The house rule wants `implementation-notes.md` at the repo
   root, but the hard file contract forbids creating files outside `src/variants/instrument/`.
   The contract wins; the full log lives here.

## Adjacent-found (untouched)

- `src/ui/SpikeApp.tsx` fails typecheck (`zoomBucketIndex` unused, `onFirstInteractive` no
  longer on `GraphRendererProps`, two all-unused destructures). This is the concurrent
  substrate agent's in-progress work. Not touched.
- Sibling variants `atelier` and `plat` raise the same bare-`@fontsource-variable/*` `TS2882`
  as deviation 1. `transit` is missing `transit.css`, which breaks the shared `pnpm build`.
  All concurrent work; not touched.

## Seam gaps (blocking full end-to-end render)

- **EdgePath not wired.** The substrate `ReactFlowRenderer` still renders React Flow's built-in
  `"straight"` edges, not `variant.EdgePath`. My steel edge *color* still applies because those
  built-in edges read `--lit-outline` / `--region-border`, which I override. But the orthogonal
  45-degree routing, long-dash imports, and terminal tick only appear once the substrate calls
  `variant.EdgePath`.
- **ChromeSlots.legend not mounted.** `SpikeApp` does not render `ChromeSlots` yet, so the
  two-letter-code legend (the non-color accessibility key for CF/NR and the trace codes) is
  unavailable until the substrate wires it. The codes themselves render in the rail rows and on
  nodes regardless.
- **Full `pnpm build` / `dev` blocked** by the sibling `transit` missing `transit.css` (the
  registry bundles every variant together). This variant was verified instead by an isolated
  esbuild bundle of `src/variants/instrument/index.tsx`, which resolved all font + CSS imports
  cleanly (7 KB JS, 20 KB CSS, all woff2 emitted).

## Open questions

- Will the substrate pass `recency` into `NodeContentProps`? If so, flip the `inst-d{n}` depth
  bucket to a recency bucket to activate the intended channel.
- Should `hudExtra` receive live counts via props? If the substrate later hands counts to
  `hudExtra`, an instrument readout block (e.g. `N 900 / VIS 120`) becomes non-fabricated and
  worth adding.
