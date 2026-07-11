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
| 3a Vite shell + glyph component | embedded fallback shell DONE; full Vite app pending (3b+) |
| 3b canvas | see below |
| 3c subject | see below |
| 3d inspector | see below |
| 3e design variants | see below |
| 3f export | see below |

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

## Open questions

_(recorded as they occur)_
</content>
