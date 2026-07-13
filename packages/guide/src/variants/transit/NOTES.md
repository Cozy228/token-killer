# transit — "Transit Diagram" (Fable track, M3 5a spike)

## Rationale

A change event is a *route* through the codebase, so the map is a metro network:
files are station markers, folders are districts, and the Change Trace literally
draws transit lines from anchor to hop. Wayfinding is the whole visual grammar —
condensed signage plates for region names (Archivo width axis), tabular mono for
paths and hop codes (JetBrains Mono), and a confident, orthogonal geometry with
45° chamfered bends so a reader can follow one route at a time. The field is a
deep mid-dark slate (never pure black), which lets a single lit route read as a
bright ribbon over dimmed, de-saturated districts.

The one rule that shapes every color choice: **transit lines stay neutral.** A
colorful metro palette (one hue per line) is exactly the anti-pattern here,
because saturated ink is the scarce budget reserved for claim status. Lines
differentiate by *luminance, width, and dash pattern* only (calls = solid,
imports = dash-dot, backbone = thin hairline); the sole saturated marks on the
map are the conflict (red C) and needs-review (amber R) status chips. Everything
else — stop dots, lit rings, route lines — is neutral white-on-slate.

## Color-budget note (D11/D15) — line neutrality

- Routes (`--lit-outline` #e8edf2), stop dots, and lit station rings are all
  **neutral near-white**. No line carries a hue.
- Differentiation between edge kinds is carried by `stroke-dasharray` (imports
  dash-dot) and `stroke-width` (lit route heavier than backbone hairline), not color.
- The only saturated pixels are the two status chips: conflict `#e5484d`,
  needs-review `#f4a52a`. `active` uses a **neutral gray** tick (`#8b98a6`) — no
  saturation, no letterform.

## Token table (computed WCAG contrast)

| Token | Value | Role | Contrast (pair) |
|---|---|---|---|
| `--tr-slate` | `#141a22` | canvas field (mid-dark, not #000) | — |
| `--ink` (signage) | `#eef1f4` | station / plate / rail signage | **15.4:1** on slate; 12.5:1 on lot; 16.2:1 on plate |
| `--ink-muted` | `#a6b3c0` | dim path sublines | **7.5:1** on shallow district; 6.6:1 on deepest district |
| `--lit-outline` (ring/line) | `#e8edf2` | lit route + white stop ring | **14.9:1** on slate |
| `--tr-lot` | `#212c3a` | station marker fill | — |
| `--tr-ring-neutral` | `#46586c` | station ring (neutral, unsaturated) | 1.9:1 vs lot (graphic ring, not text) |
| `--status-conflict` | `#e5484d` | conflict chip | 3.6:1 vs lot (graphic ≥3:1 ✓); letter `#2a0708` on chip = **4.7:1** |
| `--status-needs-review` | `#f4a52a` | needs-review chip | 6.9:1 vs lot; letter `#1b1206` on chip = **9.0:1** |
| `--status-active` | `#8b98a6` | active tick (neutral) | 4.8:1 vs lot (graphic) |

Dim-label-on-district: a **dimmed** district is grayscale + 30% opacity by
design, so its label drops to ~1.8:1 effective — this is intentional
de-emphasis (the route is what should read), not a legibility target. The
non-dim (lit / at-rest) district label is the 7.5:1 `--ink-muted` figure above.

Signage-on-slate **15.4:1**, dim-label(lit)-on-district **7.5:1**,
ring-on-slate **14.9:1** — all clear the ≥7:1 signage bar.

## Radius system (exact 3 steps — no mixing)

| Radius | Element | CSS |
|---|---|---|
| **6px** | file station lots | `.tr-file { border-radius: 6px }` |
| **4px** | region / station-board plates, legend plate, chips outer | `.tr-plate`, `.tr-legend`, `.tr-chip` corner |
| **2px** | decl platform cells | `.tr-decl { border-radius: 2px }` |

(The district region body uses 8px — it is the *ground plane*, not a marker; kept
distinct from the 3-step marker system on purpose and documented here so it is
not read as radius drift.)

## Motion

- **Route-draw** (`@keyframes tr-route-wipe`): lit routes appear once via a
  600ms ease-out clip-path wipe; stop dots fade in after the line (`tr-dot-in`,
  250ms, +600ms delay). A clip wipe (not `stroke-dashoffset`) is used so the
  dash-dot import pattern can keep `stroke-dasharray` for the dots.
- `prefers-reduced-motion: reduce` disables both — routes appear instantly.
- All other transitions are 250–350ms transform/opacity/filter glides.

## Fonts

- `@fontsource-variable/archivo/wdth.css` — imported for its **weight + width**
  axes (the woff2 carries both `font-weight: 100 900` and `font-stretch: 62% 125%`).
  Station-board plates use `font-stretch: 82%; font-weight: 600` (condensed signage);
  file labels `font-weight: 450`.
- `@fontsource-variable/jetbrains-mono/wght.css` — paths, hop codes, provenance;
  `font-variant-numeric: tabular-nums` throughout.
- Imported as **direct `.css` paths** (typed by `vite/client`) rather than the
  package entry, to avoid an ambient `declare module` that would collide with
  sibling variants importing the same fonts.

## Deviations from the brief

1. **"has decls" signal for the interchange ring.** `AtlasNode` carries no decl
   count; decls are separate child nodes not visible to `NodeContent`. Used
   `node.footprint > 1` as the non-invented proxy for "file carries decls"
   (bold 2px interchange ring); footprint 1 → 1px halt ring. No degree data invented.
2. **Stop-dot stagger.** The brief asks stop dots to fade in with 100ms stagger
   (max 10). `NodeContent`/`EdgePath` receive no ordinal index, so per-node
   staggering is not expressible at this seam. Simplified to a single
   post-line reveal (dots fade 600ms after their line). Left as a seam gap below.
3. **District ground-plane radius (8px)** documented above — deliberate, outside
   the 3-step marker radius system.

## Seam gaps (substrate not yet wired at read-time)

- **`EdgePath` lit/dim state.** The ratified `VariantSpec.EdgePath` signature is
  `(edge, geometry) => ReactNode` — it receives **no lit flag**. At read-time
  `ReactFlowRenderer.tsx` does **not** call `EdgePath` at all (it renders straight
  React-Flow edges styled inline via `--lit-outline` / `--region-border`, which
  this variant overrides to neutral values so the fallback already looks
  transit-correct). When the substrate wires `EdgePath`, this variant draws the
  chamfered routes + stop dots; the heavy 4px lit weight is gated on a CSS hook
  (`.tr-lit-edges .tr-line`, `.react-flow__edge.lit .tr-line`) that the substrate
  must supply, since lit state cannot reach `EdgePath` through the current
  contract. **The reliable Change-Trace read is carried by the node lit ring**
  (`NodeContent` *does* receive `lit`) + dimmed districts — that renders today.
- **`ChromeSlots.legend` / `hudExtra`.** No substrate call site consumes
  `ChromeSlots` at read-time (not referenced in `SpikeApp.tsx`). The `legend`
  plate is provided per contract and will render when the shell mounts the slot;
  `hudExtra` is intentionally omitted (the HUD gen/rev/counts are already legible
  on the slate theme — a duplicate plate would be redundant chrome).
- **Stop-dot stagger index** (see Deviation 2) needs an ordinal from the
  substrate to restore the 100ms/max-10 cascade.
