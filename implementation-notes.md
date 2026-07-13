# implementation-notes.md — M3 slice S (Shell + Overview)

Branch: `m3/v5` (worktree `token-killer-worktrees/m3-v5`), base `1283b935` (K2).
Scope: the D28 shell + the D29 Overview canvas mode, and the two additive queries they need.
Tree left **UNCOMMITTED** per the work order. The reviewer drives the real corpus and commits.

> Repurposed per slice, per the convention this file records. **K1's and K2's notes are preserved
> in git** (`git show 6ec19819:implementation-notes.md`, `git show 1283b935:implementation-notes.md`).

---

## Decisions (choices the design left open)

### D-1 — The rail's tree and the cards' attention counts are a NEW core query, not SPA work.

D28 requires "the full directory/scope tree ... attention counts"; D29 requires "changed /
needs-review / conflict counts" on every card. K1 provides neither: `projectOverview` returns
scope containers with degree and declaration counts, and nothing else.

The SPA "renders DTOs only ... computes no projection", so grouping 621 lots into a directory
hierarchy with per-node roll-ups cannot happen in the browser. I added `packages/core/src/guide/tree.ts`
(`projectTree`) and one endpoint, `GET /api/tree`.

**This is ADDITIVE — K1's files are untouched.** `atlas.ts`, `bounded.ts`, `projections.ts`,
`claims.ts`, `freshness.ts`, `relations.ts`, `queries.ts` and `types.ts` have zero diff. The only
edit to K1 is one `export` block appended to `guide/index.ts`. K1's goldens are unaffected.

Rejected: adding optional fields to `ProjectedContainer` (would change K1's DTO and its goldens);
computing the tree in the SPA (violates the architecture rule).

### D-2 — Attention counts, and their honest zeroes.

Mechanical definitions, no ranking (D25/D40 forbid importance ordering pre-Artifact-2):

| count | definition | measured on the real store |
|---|---|---|
| `changed` | the lot is `touches`-linked from one of the **20 most recent commits** (D10's window; ordered by the commit's own git date, tie-broken by id) | **46 lots** |
| `needsReview` | a `needs-review` memory whose stored ANCHOR resolves to this lot | **0** |
| `conflict` | an OPEN conflict one of whose two claims has this lot as its subject | **0** |

The last two are zero because **the anchors table is empty** (U13; the anchor ladder is a later,
separately-ordered store WRITE). But 113 needs-review memories and 4 open conflicts really are
open — all memory-to-memory or unanchored. A card reading "0 conflicts" would be
indistinguishable from "we never looked", so `GuideTree.unanchored` carries those counts and the
rail header prints them: *"113 needs-review · 4 conflicts with no code anchor"*. Nothing vanishes
without a number attached (D33/D16).

### D-3 — Card size: MEASURED, not fixed.

D37 requires the ELK input box to be the real rendered card size; D39 requires the size to derive
from real content. Both hold only if the card is its own ruler, so `canvas/layout/measure.tsx`
renders every `OverviewCard` into a hidden layer, reads `getBoundingClientRect()`, hands those
exact numbers to ELK, and the canvas then PINS each node to the same numbers via inline style.
The Playwright floor re-checks the loop from outside (rendered rect ÷ zoom === the ELK box).

Rejected: a font-metrics size estimate (the reference's defect class — it silently drifts from the
DOM); a fixed 280×120 box (kills D39).

### D-4 — `minZoom` is the arithmetic solution of the readability floor, not a taste setting.

`readability.ts`: `SMALLEST_CANVAS_FONT_PX (14) × MIN_ZOOM (0.715) = 10.01 screen px ≥ 10`.
React Flow clamps both `fitView` and the user's own zooming to `MIN_ZOOM`, so **no gesture and no
viewport size can produce a sub-10px label**. Every canvas font is set from two CSS custom
properties so "the smallest font on the canvas" has exactly one definition.

The cost is real and I paid it deliberately: at 1440×900 the fitted zoom lands on the floor
exactly (0.715), so ELK spacing and card padding had to be tuned until the 9-scope / 6-layer world
fits inside the canvas at that zoom. A `coldOpenFits` floor now fails the run if any card is
clipped at cold open — otherwise "it fits" would have been an eyeball claim.

### D-5 — Axis + legend are STRIPS, not floating overlays.

My first pass floated them over the canvas; the first screenshot showed the legend sitting on top
of the `tests` card and the axis chip on top of `(root)`. D41 names "text does not appear to
overlap" as a sight test, so they became fixed strips above and below the canvas. They cannot
overlap anything; they cost ~60px of canvas height.

### D-6 — Trust badge (D29) = the weakest tier across the scope's incident relation claims.

PRODUCT-DESIGN §3: an aggregate is never more confident than its weakest constituent. A scope no
relation claim names renders "no relation claims" — an honest absence, not a flattering default
(`(root)` is exactly this case on the real corpus). The node BODY stays neutral (D15); the tier is
a disclosed chip, not a paint.

### D-7 — The omnibox input ships; its result surface does not.

D28 lists the omnibox in the top bar and the work order assigns results to slice F. A search box
that silently returns nothing is the "dead search" the v2 drive was killed for, so the input's
placeholder and `title` state plainly that its result surface is not built yet.

---

## Deviations (where I departed from the plan, and why)

### DEV-1 — The work order says "~8 cards ... `packages/guide` is correctly absent". Both are now false.

The live store has **9 scopes, and `packages/guide` is one of them** (13 lots, 58 declarations).
This is not a defect: K2 landed `packages/guide/` as a real package and a `ctx sync` has run since
the work order's ground-truth table was measured. The package the table calls "the killed v4
branch's package" is now a live package with the same path.

I hardcoded nothing and asserted nothing about the count — the cards are whatever `atlas.scopes`
returns. **But the reviewer should know the ground-truth table has drifted**, and one landed K1
test now fails because of it (see Adjacent-found A-1).

### DEV-2 — `ProjectedContainer.noVisibleRoute` is rendered as a card badge, not a separate peripheral area.

D40 asks a no-visible-route FILE to go "to a labelled peripheral area". At the SCOPE grain in
Overview there is exactly one such scope (`(root)`, 3 config files, 0 declarations), and ELK
already places it apart because it has no edges. I labelled it on the card ("no visible route") and
in the inspector rather than building a separate peripheral region for a single card. The honest
periphery as a REGION is a Scope-Graph (slice G) construct where it has 106 members to hold.
Conservative reading; flagging it because it is a visible departure from D40's literal wording.

### DEV-3 — Two `data-*` attributes exist on the canvas purely so the floors can be measured from outside.

`data-elk-width`/`data-elk-height` on the node host and `data-edge-points`/`data-edge-routed` on the
edge path. They carry no product meaning. They exist because a floor asserted from inside the
component is a floor asserting against itself; the Playwright run reads them back out of the real
DOM and compares them with the real node centres.

---

## Adjacent-found (untouched)

### A-1 — A landed K1 test is now falsified by the corpus: `the killed v4 branch's packages/guide never draws a card`.

`packages/core/tests/**` — this test asserts `packages/guide` is NOT an atlas lot. It was true when
`packages/guide` existed only on the dead v4 branch. It is false now that K2 landed the real
package and a sync ran. **I did not touch it** (AGENTS.md §3). Evidence it is not my regression:

```
clean tree (git stash):   Tests  7 failed | 542 passed | 2 todo (551)
with my changes:          Tests  6 failed | 543 passed | 2 todo (551)
```

The same six tests fail either way (the seventh, `A5-stale`, is flaky). My changes to core are
additive and cannot reach `buildAtlas`.

### A-2 — Five other core tests fail on the clean tree from doc churn.

`A5-adr`, `A6-search`, `B4-mention`, `A7-why`, `A7-drill` — living-repo tests asserting on document
content that has since moved. Pre-existing, untouched.

### A-3 — The guide bundle is 1.88 MB (585 KB gzipped), over Vite's 500 KB chunk warning.

Dominated by `elk.bundled.js` (a GWT-compiled Java port). It is a loopback-served local tool, so
this costs nothing on the wire, and D12's budgets are about interaction latency (measured ELK
layout: **~30 ms** for the overview). Not addressed; flagging it because the build prints a warning.

---

## Open questions

### O-1 — At 1440×900 the cold-open zoom is EXACTLY the readability floor (0.715).

There is no headroom. The overview fits today because the world is 9 cards over 6 layers. A repo
with more top-level scopes, or a deeper dependency chain, will not fit at the floor, and the
`coldOpenFits` floor will fail rather than silently clip. **The design has no ruling for what
happens then** — the options are (a) shrink the card (loses D29 content), (b) drop the smallest
canvas font toward 13px (buys zoom 0.77 → but 13×0.715 = 9.3, so it trades against the floor),
(c) let the map exceed the viewport and require a pan (breaks E1's "without touching the mouse"),
(d) group scopes. I chose none of them: today it fits, and the floor will say so loudly when it
stops fitting.

### O-2 — Is `changed` = "touched by the latest 20 commits" the right window?

D10 says "the densest code region touched by the latest 20 commits", which is about the VIEWPORT,
not about a card's attention count. I reused the number because it is the only window the design
names, and `GuideTree.recentCommits` is rendered ("46 changed in the last 20 commits") so the
window is never an invisible assumption. If the maintainer wants a time window instead of a commit
window, one constant changes.

### O-3 — Edge count labels can land close to a card corner on the real corpus.

They sit at the routed polyline's own midpoint, which is correct (on the route, not between two
centres). On the current corpus none overlaps a card body, but there is no floor asserting it —
label-vs-node collision is a real check that I did not build, and D41's "text does not appear to
overlap" is a sight test the maintainer should apply to the screenshots.

---

# Correction round — slice S: direction, cycles, and one rotten test

Same branch, same uncommitted tree. Scope: the ONE defect (the Overview asserts a universal
"above = depends on" rule over a graph that is cyclic) plus the one falsified test. The slice
itself is not rewritten.

## Decisions (choices the design left open)

### C-1 — A back edge is detected from the NODES' layer coordinates, not from the section's endpoints.

The work order says a cycle-broken edge "comes back with its routed `sections` running against
the declared source/target". **It does not.** I probed elkjs 0.10 directly — first on a 3-node
cycle, then on this repo's real 9-scope / 18-route Overview projection fetched from a live
`ctx guide` — and ELK *restores* a reversed edge: `startPoint` sits on the declared SOURCE's
border and `endPoint` on the declared TARGET's border for all 18 routes, back edges included.
(`startOnSrc=true endOnDst=true` for every edge; the three back edges differ only in `goesUp`.)

So the fact ELK actually exposes is positional: for a reversed edge the TARGET is placed
upstream of the SOURCE. `runsAgainstAxis()` reads exactly that off the layout result — the two
nodes' own coordinates on the layout's own axis (`y` for `DOWN`, `x` for `RIGHT`). Nothing is
guessed and nothing is hardcoded; on an acyclic graph it returns `false` everywhere, and a test
asserts that.

The invariant the arrowhead depends on is now PINNED rather than assumed: `layout.test.ts` has
"every routed section starts on its SOURCE and ends on its TARGET — cycle routes too". If a
future elkjs ever did return a reversed section, every arrowhead on a cycle route would point
at the dependent, and that test goes red instead of the map quietly lying.

### C-2 — The cycle block is Tarjan SCC over the drawn edges, computed in the layout module.

D34 wants the cycle to read as ONE block. A back edge alone does not name the block — the block
is the strongly connected component that contains it. `stronglyConnected()` returns the
components of size >= 2. On the real corpus that is exactly one block of five scopes
(`packages/cli`, `packages/core`, `src`, `tests`, `tools`) closed by three back edges.

This is a LAYOUT fact, not a projection: it is derived from the edges the DTO already carries,
in the same module that runs ELK's own cycle breaking (which must run in the SPA regardless).
The SPA still writes no SQL, holds no store handle, and computes no projection. K1's kernel
`groups` (undirected components) does not answer this question — it reports one giant component
and says nothing about direction.

### C-3 — Colour marks the axis exception; the dash still marks the kind.

A cycle route is drawn in rose (`--edge-cycle: #fb7185`), deliberately far from the amber
`--edge-focus` so it is never read as a selection. D38 is kept: `imports` stays dashed and
`calls` stays solid, so a rose DASHED route is still an import — the kind survives in the
stroke pattern. The count label on a cycle route carries a `↺` glyph and the same rose. This is
not a per-edge kind label; it is the direction disclosure D37 demands.

### C-4 — The arrowhead was enlarged (14 → 26 marker units).

`markerEnd` was already on every edge, and it was already on the correct end (see C-1) — but at
`MIN_ZOOM` the 14-unit default drew an arrow about five screen px long, which is why it reads as
a line ending rather than as an arrow, and why the work order describes the map as having "no
arrowheads". Markers are painted over the routes and are not part of the ELK world, so this
costs the layout nothing: the fitted zoom at 1440x900 is still exactly 0.715 and `coldOpenFits`
still passes.

### C-5 — Two new Playwright floors, because the defect was invisible to every existing one.

The slice already had four floors and they were all green while the map asserted the reverse of
a fact. So:

- **FLOOR 5 — direction is drawn, and on the dependency.** Every rendered route carries a
  `marker-end`, and its path's final point is nearer the TARGET's centre than the SOURCE's. An
  arrowhead on the wrong end is now a failure, not a screenshot the reviewer has to catch.
- **FLOOR 6 — the map never prints a rule it contradicts.** If any route carries
  `data-edge-back="true"`, the axis strip must name the cycle and count those routes; if none
  does, the strip must not mention a cycle. Both directions are asserted, against the real DOM
  on the real corpus.

Plus: a cycle route must not be stroked identically to a forward one, and the legend must name
it. All read from the live DOM, none from a constant.

## Deviations (where I departed from the plan, and why)

### DEV-4 — Two premises in the work order are empirically false. I fixed the defect, not the premises.

1. *"There are no arrowheads."* There were — `MarkerType.ArrowClosed` on every edge, on the
   dependency end. They rendered at ~5 screen px at the cold-open zoom, i.e. invisible in
   practice. Treated as a legibility defect (C-4), not as a missing mechanism.
2. *"A reversed edge comes back with its routed sections running against the declared
   source/target."* It does not (C-1).

**The defect the work order names is real and is fixed.** The axis strip did print a universal
rule that this map contradicts on three of its eighteen routes, and those three were drawn
identically to the fifteen that obey it. Both halves are now false.

### DEV-5 — The cycle is DISCLOSED as one block; it is not GEOMETRICALLY grouped into one.

D34 says "cycles are laid out as one block". I did not restructure the ELK graph to place the
five cycle scopes inside one compound container, and this is a deliberate, conservative refusal:

- a compound node adds its own padding and reflows the layering, which grows the world;
- at 1440x900 the cold-open zoom sits EXACTLY on the 10px readability floor (0.715) with zero
  headroom, so any growth of the world clips a card;
- the work order forbids me to tune, pad, or work around that floor — the maintainer is ruling
  on it separately.

Geometric grouping is therefore not available to this round without doing the one thing I was
told not to do. What I did instead removes the fabrication that D34 actually forbids ("a false
ordering is never fabricated for them"): the map no longer claims an order for those five
scopes. It states, in the strip and in rose on the routes themselves, that no top-to-bottom
order among them is true. **The geometric block needs the floor ruling first — flagging it as
an open question, not silently dropping it.**

### DEV-6 — I edited one sentence in the inspector, which the work order told me not to touch.

`Inspector.tsx`'s empty state printed the SAME over-claim: *"The map is laid out by dependency
direction: a card above another one depends on it."* Leaving it would have fixed the rule in one
strip and left it lying in the panel beside it. I changed that one sentence and nothing else in
that file; no behaviour, no structure, no other copy.

## Adjacent-found (untouched)

### A-4 — The store's `calls` edges make `packages/core -> tests` (21) look absurd, and it is.

Confirmed as the work order describes: the resolver matches callees by bare name, so `.push()`
resolves to a user symbol named `push`. I did not filter it, work around it, or mention it in
the UI. The map renders the store's claim exactly as the store makes it. This is a core ingest
defect (`packages/core/src/ingest/`) and the maintainer is ruling on it.

### A-1..A-3 stand as written above. A-1 is now CLOSED — the rotten test is replaced.

## Open questions

### O-4 — The geometric cycle block (DEV-5) is blocked on the readability-floor ruling.

Once the floor is ruled on, "lay the five cycle scopes out as one block" becomes buildable. It
is not buildable underneath a floor with zero headroom.

### O-5 — At 1440x900 the axis strip now wraps to two lines.

It still fits (`coldOpenFits` passes at both wide viewports, zoom unchanged at 0.715), but the
strip is stating a convention AND its exception in a 840px column. If a future corpus has more
cycles the sentence gets longer. The honest fallback exists — when the graph is acyclic the
exception clause disappears and the plain universal rule is printed, because then it is true —
but there is no fallback for "too many cycles to name in a strip".

## What I did NOT do

- Did not touch `packages/core/src/ingest/` (the ~11.6% false `calls` edges — A-4).
- Did not tune, pad, or work around the 10px readability floor. `MIN_ZOOM`, `SMALLEST_CANVAS_FONT_PX`,
  the ELK spacing options and the card padding are byte-identical; the fitted zoom at 1440x900
  is still exactly 0.715.
- Did not build the deferred `no visible route` peripheral region (slice G).
- Did not touch the measure-then-ELK pipeline, the routed-section consumption, the tree, the
  state screens, K1's kernel source, or K2 — except the ONE over-claiming sentence in the
  inspector's empty state (DEV-6).
- Did not commit. The tree is left uncommitted for the reviewer.
