---
status: active
review_after: 2026-08-14
note: M3 build work order v6 (clean-room rebuild). Supersedes M3-GOAL-PROMPT-V5.md and V4.
  V5 ordered a rebuild that REUSED the surviving packages/guide kernel; the maintainer ruled
  2026-07-14 that the kernel is rewritten too. The guide is built from zero on branch m3/v5,
  off the main line, with NO code copied or consulted from m3/v4-fable. Design authority
  (M3-UI-LAYOUT-BRIEF, D1-D41) is unchanged and binding; D34-D41 (relationship-first geometry)
  is new and is the spine of this order.
---

# M3 Build Goal v6 — `ctx guide`: clean-room build on the four-state canvas

You are an implementing agent for ctx M3. The reviewer (orchestrator) verifies every slice with
a live browser drive on the real corpus before it lands — green tests alone have twice coexisted
with an unusable product here; they no longer count as done.

## North star

> The Code Atlas's first job is to make the provable relationships between code **visible,
> walkable, and understandable**. Layout organizes the **relationships first** and places the
> code afterwards; directories provide supporting background only. Every relationship must be
> distinguishable at real zoom, and every key code name must be readable. Determinism, capacity
> limits, and directory information are CONSTRAINTS — they are not the point of the map.

## What this order is (read as negative space)

An earlier branch built this UI over six rounds and a triple adversarial audit killed it. That
code is NOT the starting point and is NOT to be read, ported, or consulted. Do not rebuild any
of the following — they are dead by ruling:

- **The persistent directory-position canvas (D26).** Directory-derived coordinates cannot carry
  a relationship graph: 94.7% of the world was empty paper; a 6x zoom dead-zone before the first
  readable label; median backbone edge 9.4% of the world diagonal with 12,189 crossings per 600
  edges; the flagship diff deep link drew ZERO lit edges at its own default viewport.
- **The file as the atomic node.** The atom has always been the declaration (D7, restated as
  D36). The old assumption A1 ("canvas grain stops at FILE level") is VOID and was never the
  ratified model. Measured: **51% of all `calls` links are intra-file** — a file-grain canvas
  silently discards half the call evidence.
- **Semantic-zoom LOD as a projection mechanism (D27).** Zoom scales geometry only. What is
  projected changes ONLY via explicit drill / expand / re-root.
- **The minimap (D26).** Tree + breadcrumb own orientation.
- **Compile-time truncation of the logical model (D33).** Display budgets live in the
  projection/render layers, never in the kernel.
- **Edge routing as post-processing (D37).** Straight center-to-center lines are retired.

## Binding authority (in order; do not re-decide)

1. `docs/design/M3-UI-LAYOUT-BRIEF.md`. **D34–D41 (relationship-first geometry) is the spine of
   this order and wins on any conflict.** Also binding: D26–D33 (four-state canvas, shell, trust
   rules); D1 (stack), D5 (code is the center), D7 (complete logical Atlas as the DATA MODEL),
   D8 + directory-rung amendment, D10 (viewport/generation), D12 (renderer seam + perf budgets),
   D14 (selection/find/keyboard), D15 (Subject + trust grammar), D16 (inspector/unanchored),
   D17 (export, one render path), D18 (M4 boundary), D19 (static reachability, never "impact"),
   D20 (anchor durability), D21 (gated annex), D22 (event projection primitive), D23 (Evidence
   Rail), D24 (naming gate), D25 (coordinate completeness + gap loop).
2. `PRODUCT-DESIGN.md` §3 (claim contract) + §11. An aggregate is never more confident than its
   weakest constituent — which is why D33 requires constituent claim IDs, not "count + first id".
3. The real store (`packages/core`) is the only data source. Every number the UI shows is a store
   fact with provenance, or it does not render.
4. `docs/codemap/impl/00-sources.md` — the source-guidance index. Copy from the research clones
   as it directs; obey its licence column (see "Copy discipline" below).

## Copy discipline (licence-bound; violating this is a release blocker)

Per `docs/codemap/impl/00-sources.md`:

| Clone | Licence | You may | You may NOT |
|---|---|---|---|
| `.research/understand-anything` | **MIT — copyable with attribution** | copy its two-stage lazy-expand, aggregate-edge, and ELK integration code, with an attribution comment | copy its 1,580-line god component's structure |
| `.research/gitnexus` | **PolyForm-NC — NOT distribution-safe** | read it for shape (one backend / N frontends, focusNode camera, honest status counts) | copy any of its code into ctx |
| `.research/codewiki` | no licence | read its self-contained inline-JSON HTML idea (our `SnapshotDataSource`) | copy verbatim — rewrite |
| `.research/graphify`, `deepwiki-open`, `opendeepwiki` | — | use as NEGATIVE samples only | — |

Do not reinvent what a permissive clone already solves. Every copied block carries an attribution
comment naming source file and licence.

### The reference's three defects — verified in its source 2026-07-14; do NOT reproduce

- `mergeElkPositions` (`utils/layout.ts:231-266`) reads only `children[].{x,y,w,h}` and never
  touches `positioned.edges`. It sets `elk.edgeRouting: "ORTHOGONAL"`, lets ELK route every edge,
  and then **discards every routed section**, letting React Flow draw default center-to-center
  curves. We CONSUME routed sections (D33/D37).
- It feeds ELK fixed 280x120 boxes while the DOM card is `min-w-180/max-w-220` with auto height,
  and never feeds real size back. Our ELK input node size MUST be the real rendered card size
  (D37/D39).
- It auto-expands containers at zoom > 1.0. D27 forbids this outright.

## Ground truth (measured 2026-07-14 against the real store; re-verify, never assume)

Store: `~/.contexa/projects/9cd2e7eab8b4/store.sqlite`. The shard key derives from
`git rev-parse --git-common-dir`, so **every worktree of this repo shares ONE store**.

Measured after a `ctx sync` from THIS worktree (store: 11,082 entities · 20,475 links · 49,082
claims). **These figures drift with every sync. Never hardcode one of them in an assertion** — see
the census gate in K1.

| Fact | Value | Why it binds the design |
|---|---|---|
| entities | symbol 4,498 · doc_section 3,504 · file 1,406 · concept 1,055 · commit 456 · memory 112 · decision 51 | |
| links | touches 8,927 · calls 4,446 · contains 3,809 · co-changed 1,305 · references 1,254 · imports 571 · renamed-to 159 | |
| `calls` intra-file | **1,918 / 4,446 = 43%** | a file-grain canvas silently discards ~half the call evidence → D36 compound grain |
| **symbols with no `contains` link** | **689** (symbols 4,498 vs `contains` 3,809); **578 calls have an end on one** | **They are RETIRED symbols from prior generations — not atoms.** Verified 2026-07-14: 506 of them live at paths that do not exist in this checkout at all (193 under `packages/guide/src` — the package of the KILLED v4 branch; all worktrees share one shard, so the dead branch's symbols sit in our store), and of the 183 whose file does exist, 149 no longer appear anywhere in that file. `entities.gen` does NOT discriminate (contained symbols have median gen 1, retired ones median 8). **`contains` is the only discriminator: it is the fact that a declaration exists in a file right now; the locator is merely an address, and addresses get reused.** Retired symbols stay reachable as entities (rename-chain history, D20) but must NEVER enter a projection. Every `calls` link with a retired endpoint is EXCLUDED from the atlas and COUNTED — nothing vanishes without a number attached |
| **file entities naming a path not in this checkout** | **309 of 1,406** (incl. all 56 of `packages/guide` — the killed v4 branch's package) | **Retired lots.** The liveness fact is NOT in `links` — it is the `code` source's ingest manifest in `cursors.position`: `{files: {"<path>": {size, mtimeMs, hash, fp}}}`, the ingest's own record of every file it saw at this generation, each entry carrying a content hash. Validated against the filesystem: 591 live · 309 dead · **0 false positives** · 506 "false negatives" that are all NON-CODE files (`.gitignore`, CI configs) which D5 already excludes from the canvas. **An Atlas lot is a file in the code manifest at the published generation.** Retired lots are excluded, reachable, and COUNTED. The kernel reads the manifest; it must never stat the filesystem (export must work with no checkout). This was a retrieval failure, not an evidence gap — explicitly NOT D25 gap-loop input |
| parallel sym→sym call links | **0** — every pair has exactly one | "stacked calls lines" were never parallel edges; they were distinct edges sharing one channel → D37, not fake multiplicity |
| relation-graph components (file grain) | **3; the giant one holds 402/410 = 98.0%** | a relationship cluster cannot bound a projection → D35: the directory selects |
| cyclic SCCs (file grain) | 5 SCCs, 17 files (3.8%), largest = 6 | the graph is ~96% a DAG → layering by dependency direction is well-defined nearly everywhere |
| declaration fan-in | median 1 · p99 13 · **max 359** | no lane scheme makes 359 edges separable → D40: grouping is a precondition |
| declarations per file | median 5 · p90 16 · **max 76 (`store.ts`)** | an expanded dense file cannot show everything → D40's `+N more (no visible route)` handle |
| decl-bearing files with zero visible relation | **101 / 496 = 20%** | the honest periphery is real and sizeable → D40 |
| top-level scopes | 14 | Overview is ~14 named cards → E1 |

**The generation trap — CONFIRMED, not hypothetical (2026-07-14).** The generation identity is
`(repoRev, worktreeDigest, schemaVersion, policyVersion)` and `worktreeDigest`'s own doc comment
reads *"distinguishes worktrees that share one shard"* (`packages/core/src/store/generation.ts`).
The shard is keyed on `git rev-parse --git-common-dir`, so **all worktrees of this repo share ONE
store while each invalidates the others' generations**: running `ctx sync` from this worktree moved
the identity from `60cd4ec3…` to `540c0fe7…`, and `publishedGen(source)` now returns 0 — an empty
store — for every other worktree until it syncs again.

This is a first-class product fact, not a bug to route around. The guide MUST render it honestly:
the `live | snapshot | stale` badge (D28) exists for exactly this. Never fake data, never silently
fall back to a snapshot, and never present a mismatched generation as live. Make it a test.

## Architecture (settled; do not re-decide)

```
packages/core/src/guide/    projection kernel — pure functions over the store.
                            Complete logical model (D7/D33): no compile-time truncation.
                            Emits bounded projection DTOs + claim-set aggregates.
        |
packages/cli/src/guide/     node:http loopback server (D1). Serves DTOs over /api/*.
                            Also the export snapshot builder (D17: ONE render path).
        |
packages/guide/             Vite 8 + React 19 SPA. Renders DTOs. Writes no SQL, holds no
                            store handle, computes no projection.
```

The kernel lives in core because (a) D17 requires live and export to share one projection path,
(b) D12 requires the renderer to receive an already-bounded slice, and (c) the store's read API is
missing the queries the guide needs, and those gaps belong in core.

## Experience contracts (the definition of done)

E1 First 10 seconds: a cold open shows named module/package cards **laid out by dependency
   direction** + a legible left tree. Zero unlabeled rectangles anywhere. A stranger can say what
   this repo contains without touching the mouse.
E2 Any zoom level: every visible node carries a readable name (screen-px >= 10px) or is an
   explicitly-counted aggregate ("+N", boundary node). Zoom NEVER changes what set of things is
   projected — only explicit drill/expand does.
E3 Connections: from any file/symbol (search, tree, card, rail), within two interactions the user
   sees who calls/imports it and what it calls/imports, with directions and counts, no line
   crossing another node's body, far ends always on-screen or named in a boundary node.
E4 Change Trace: opening a diff deep link lands on the event's own bounded projection (never
   whole-repo), the rail narrates in mechanical order, and clicking a rail group/step refocuses
   the canvas to that slice.
E5 Trust: every aggregate count can be expanded to its constituent claims; the top bar always
   shows revision/generation and live|snapshot|stale truthfully.
E6 **Relationship legibility (D34–D41).** On a real page at real zoom, on the real corpus:
   dependency direction is visible as spatial direction; routes are visually separable (they do
   not share a channel); text does not appear to overlap; a user can follow one route with their
   eyes; a genuinely dense real file (`store.ts`, 115 declarations) stays readable; files and
   declarations with no visible route sit in an honest, labelled periphery rather than in the
   centre or in a silent void.

A slice is done when its experience-contract lines hold **in the reviewer's live drive on the real
corpus**. Report your build against these lines, not against mechanism checklists.

**D41 — acceptance is human sight, not arithmetic.** Differing path arrays, differing label
anchors, non-intersecting rectangles, and deterministic reproducibility are FLOORS, not gates. The
gate is the maintainer looking at a real screenshot.

## Build route

| # | Slice | Lands | Contract |
|---|---|---|---|
| **K1** | Core projection kernel (no UI, no server) | `packages/core/src/guide/`. Complete logical atlas: every file + **every declaration as an atom** (D36) — ZERO compile-time truncation. **Census gate — no magic numbers, and no ghosts** (corrected 2026-07-14 after the first K1 round satisfied the letter of a mis-specified gate by putting retired code on the map). Both sides of every equality are computed from the live store at run time; a hardcoded count would drift at the next `ctx sync` and start lying.

- The atlas declaration set is exactly **the symbols reachable through a `contains` link at the published generation**. Assert `model.declarations.length === <distinct symbol dst of contains links>`. Do NOT use `countByKind("symbol")` — it counts retired symbols, and satisfying that equality means rendering code that no longer exists.
- Assert **zero** atlas declarations lack a container. An atom with no lot is a contradiction, not a category.
- Every `calls`/`imports`/`contains` link in the store appears exactly once in the relation index. A `calls` link with a retired endpoint is excluded from the atlas and **counted**: assert `atlasCalls + callsWithRetiredEnd === store calls total`. **Nothing may vanish without a number attached to it** — that is D33's discipline applied to retirement.
- Assert **no projected declaration references a file absent from the current generation.** Relation index over the 7 link kinds, stratified per D25. The four projections (overview / scope / connections / event), each emitting a BOUNDED **compound** DTO: file containers + declaration children, aggregate edges with counts, boundary nodes, explicit `omitted` counts. Each projection must classify **no-visible-route** members (degree 0 within the bounded set) at BOTH grains (D40) and expose relation groups (connected components) — the renderer cannot invent these. Claim-set aggregation per D33 (`{relationKind, count, constituentClaimIds[], evidenceRevisions[], derivations[], confidenceSummary, freshness, disclosure, omittedCount}`). Generation/freshness resolution (answer the generation trap, with a test). New core store queries: symbols-in-file, commit→files, diff re-derivation via the existing `gitCli`/`diffHunks` helpers. Export `openStoreReadOnly` from core's index (implemented today but unexported). Golden projection JSON on the real corpus + completeness replay tests. | No E-line. Gate = census assertions on the real store + goldens. |
| **K2** | `ctx guide` server + data seam + state screens | `packages/cli/src/guide/`: a `case "guide"` arm in the CLI switch (`cli.ts:391-442`); `node:http` bound to 127.0.0.1 on a random free port; bearer token in the printed URL, exchanged once for an HttpOnly cookie; **no route resolves without it** (G-loopback); serve until Ctrl-C; `assertNoEgress` armed; `/api/*` serves K1's DTOs; `/api/generation` reports CURRENT state, never a startup snapshot. `packages/guide/`: Vite 8 + React 19 + TS + Tailwind 4 scaffold, hash router, one typed `GuideDataSource` seam with `LiveDataSource` (HTTP) and `SnapshotDataSource` (inlined JSON). Ships only the shared interaction states (D28): loading · empty-store with exact `ctx sync` guidance · auth failure · stale/mismatched generation. Asset shipping follows the `packages/core/scripts/copy-assets.mjs` precedent. | E5 partial: the badge tells the truth on a real launch, including the mismatched-generation empty case. |
| **S** | Shell + Overview | D28 shell: top bar (repo · revision · generation · live\|snapshot\|stale · omnibox · mode — nothing else); left rail = directory/scope tree (DOM text, always legible) + attention counts + rail dock + nav history; centre = the four-state canvas host; right = inspector. Rail and inspector are INDEPENDENT scroll owners with reserved height budgets — never one flex column. D29 Overview: ~14 module/package cards, **positioned by aggregate dependency direction, not in a directory grid** (E1); deterministic content only — name, path + counts, changed/needs-review/conflict counts, aggregate in/out counts, trust badge; NO generated prose. Narrow (<1100px): tree + inspector become drawers. Perf HUD behind a dev flag. D24 naming gate on all copy. Playwright smoke lands here (fixed-viewport screenshots for the reviewer's diff). | E1 in full. |
| **G** | Scope Graph — the heart of this order | elkjs, async + cancellable + cached by `(scopeId, generation)`. **Hierarchical layout** (`hierarchyHandling: INCLUDE_CHILDREN`): file containers laid out by dependency direction (`layered`, `LAYER_SWEEP`), declaration children laid out inside them (D36). The directory SELECTS the bounded set; **relationships decide every position** (D34/D35). Folder identity survives only as a weak background hull that never moves an atom and never obstructs routing. **CONSUME ELK's routed sections/bend points** into the edge renderer — explicit ports, fan-out at the source, fan-in at the target, stable separate lanes, deterministic lane order (D37). ELK input node size = the real rendered card size (D37/D39). Node size derives from real name length and real child count; no font shrinking, no fixed lots (D39). Edge stroke distinguishes `calls` from `imports`; no permanent per-edge kind label — label on focus/hover (D38). Cross-scope relations collapse into boundary nodes with counts; clicking one re-roots. Cycles (17 files, 5 SCCs) lay out as one block with no fabricated ordering. Budgets + disclosed omission handles; **no-visible-route periphery at both grains** (D40): a relevant file with no visible relation goes to a labelled peripheral area; a declaration inside an expanded file with no visible relation collapses into `+N more (no visible route)`. Omission selection is MECHANICAL (degree in the current projection), never an importance judgment (D25). | E2 in full; **E6 in full**; E3 partial. |
| **C** | Focused Connections | Centre mode 3 (a canvas mode, NOT a modal): inbound \| subject \| outbound, 1-hop default, self-describing cards, count-labelled connectors, direction always explicit. High-degree subjects (measured max fan-in **358**) group by relation kind / scope / claim status with per-group expansion — **grouping is a precondition of readability, not a polish step** (D40). Boundary aggregation + breadcrumb re-root + keyboard nav with real focus management and visible entry affordances. Full claim-set provenance per connector. "Show in scope" / "show in tree" round-trips. | E3 in full. |
| **T** | Change Trace | D32: `project(event)` = changed anchors + observed anchor-to-anchor paths + direct observed 1-hop neighbours (a real expansion, not the anchor-induced subgraph) + boundary aggregates. Ancestors NEVER enter the lit set for viewport math; the event viewport is the projection's own bbox — root pollution is a defect class, regression-test it. Diff hunks are NOT persisted: re-derive via core's `gitCli`/`diffHunks` behind a K1 query. Evidence Rail docked left, the primary narrative, and it DRIVES the canvas. Wide diffs: rail narrates, canvas shows the current group, tree shows repo-wide location. Every rail step carries constituent claim IDs, source revision, observed_at, derivation, confidence, freshness, disclosure, omitted/aggregated counts. `ctx guide` prints the deep link. Event-determinism goldens; D24 naming gate re-verified. | E4 + E5 in full. |
| **F** | Find + Subject | Omnibox per D14 over core's existing FTS5 + `search()`: results grouped by kind with per-group counts; ranking only WITHIN a kind, never across kinds. Destinations: code → Scope/Connections focus; multi-anchor → fit all proven anchors and list them; unanchored → Subject. `#/s/:kind/:id` Subject dossier per D15: sticky identity/trust header, claim-backed sections, relationships in the right rail, bounded local graph as a drill module and never the page hero. Extends `renderEnvelopeTerse` additively, never forks it. The results layer must not occlude the just-focused target and clears on activation. | E3 entry paths complete. |
| **+** | Re-issued after the above land | Anchor ladder (D6/D8 — the one sanctioned store WRITE; needs its own order); lenses + timeline; inspector tabs (D16); export closer (D17). | — |

## Process rules (bind every slice)

- One slice per builder run; the builder leaves the tree **UNCOMMITTED**. The REVIEWER drives the
  real corpus against the slice's experience-contract lines and only then commits.
- Test-blindness mitigations are part of each slice, not an afterthought:
  - readability assertions computed in **screen px** (label size = font size x zoom), never in
    world units; lane separation likewise in screen px;
  - **real-corpus replay tests** — a fixture-only test may never back a census or completeness
    claim;
  - a Playwright smoke (headed/headless Chromium screenshots at fixed viewports) from slice S on.
    The screenshots exist so the maintainer can exercise D41.
- Builders report outcomes against experience contracts. A mechanism implemented without its
  user-visible line demonstrated is NOT done.
- No code is copied from, or consulted in, `m3/v4-fable`. If a problem there was already solved,
  solve it again from the design, the research clones, and the store.
- Repo rules: pnpm only. Node engines untouched (the 22.16/22.18 mismatch is O-37, not yours).
  `erasableSyntaxOnly` holds in core + cli (the Vite app is exempt — no enums/namespaces/
  parameter-properties in core or cli). Conventional commits, lowercase (the reviewer commits).
  D24 naming gate: never `impact / affected / blast radius / risk / breaks` in code or copy.
  Zero egress — `assertNoEgress` armed; no CDN, no remote fonts, no telemetry; all assets bundled.
  Non-mutating: curation renders exact copyable CLI commands, never executes them. Tests sandbox
  `CONTEXA_HOME` into a temp dir; `TK_SHIM_DIR` unset. AGENTS.md §2/§3 hold: no features beyond
  the slice; do not refactor adjacent code.
- Dependencies allowed without further sign-off: the D1 stack (react, react-dom, @xyflow/react,
  elkjs, zustand, react-router, tailwind 4, radix Tooltip/Tabs/Dialog/Drawer), vite, vitest,
  @testing-library, happy-dom, playwright. Anything else needs reviewer sign-off.

## Explicitly OUT of scope

Everything M4 (LLM anchors, generated prose, role summaries on cards). Impact-Set / Revision
Compare / Serve Audit (D21 gate). Token/savings dashboards. Engines bumps. Any store WRITE before
the anchor-ladder slice is separately issued.
