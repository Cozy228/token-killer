# implementation-notes.md — M3 K1 (guide projection kernel)

Branch: `m3/v5` (worktree `token-killer-worktrees/m3-v5`), base `69662e9c`.
Scope: `packages/core` only (kernel + 2 store/index lines + tests).
Tree left **UNCOMMITTED** per the work order. The reviewer verifies and commits.

> Note: this file previously held the `o33b/drill-guards` (GUARD-1/2) notes, already merged
> at `fc5f26c6`. It is repurposed per slice — the same convention that note itself records.

---

## Decisions (choices the design left open)

### D-1 — Containment is the `contains` LINK. Retired symbols are not atoms. *(CORRECTED)*

**My first ruling here was wrong and the reviewer overturned it. This section records the
corrected decision; the error is written up in DEV-0 below, because how it happened matters
more than the fix.**

The Atlas's declaration set is exactly **the symbols reachable through a `contains` link**.
`contains` is the FACT that a declaration exists in that file right now; the symbol's
`locator` is only its ADDRESS. A symbol with no `contains` link is **RETIRED**: it is not an
atom and it never renders.

- `AtlasModel.declarations` — the atoms. Every one exists in this checkout.
- `AtlasModel.retiredDeclarationIds` — reachable, never visible. The entity rows survive so
  rename chains and anchor repair keep working (D20); no projection may ever emit them.
- `retiredSymbolsOf(store, fileId)` — the explicit accessor for that reachability.

**Nothing vanishes without a number** (D33's discipline applied to retirement):
- `declarationsTotal + declarationsRetired === store.countByKind("symbol")`
- `callsInAtlas + callsWithRetiredEnd === <store calls total>`

Both are asserted as live census equalities. The relation INDEX still holds every link
exactly once (that census is unchanged); it is the ATLAS that excludes the retired ones.

`entities.gen` does NOT discriminate (contained symbols run to median gen 1, retired to
median gen 8). `contains` is the only discriminator. I do not reach for gen.


### D-2 — One new `Store` method: `linksByPredicate(predicate)`.

The relation index needs a **bulk** link read. Walking adjacency per entity silently misses every
link whose endpoint has no entity row — measured: **6 `renamed-to`** with a dangling `src`, **460
`touches`** with a dangling `dst`. A silently missing link is the completeness defect D33
outlaws. Five lines; mirrors `linksFrom`/`linksTo`. The work order's list of new core queries
("symbols-in-file, commit→files, diff re-derivation") reads as illustrative, not exhaustive; this
is the fourth. The other three landed in `guide/queries.ts` as pure functions over `Store` rather
than new interface methods — they need no SQL, and §3 says not to grow adjacent surfaces without
cause.

### D-3 — Scope grain = first path segment; `packages/*` descends one level.

Deterministic and mechanical (D35: the directory SELECTS, it does not position). `groupedRoots`
is an option so slice S can tune the card count without a kernel change. **The work order's
"top-level scopes: 14" does not reproduce** — see Open questions.

### D-4 — `evidenceRevisions` is populated only where a revision genuinely exists.

D33 wants `evidenceRevisions[]`. Only **`git`-carried claims name a revision** (their `locus` *is*
the commit oid). A `tree-sitter` structural claim — which backs every `calls`, `imports` and
`contains` link — records a *generation*, and the store keeps no per-generation revision history,
so **its revision is not recoverable**. I did not invent one. Those constituents are counted in
`ClaimSet.revisionsUnresolved`, and the generations they *do* carry are exposed as
`evidenceGenerations`. Fabricating a plausible revision would break "every number the UI shows is
a store fact with provenance, or it does not render".

### D-5 — `ClaimSet.omittedCount` = "constituents you cannot open individually here".

D33 lists the field without defining it. Definition used, mechanical and uniform: a constituent is
omitted when it was **lifted off its true endpoints** — to a coarser grain (a collapsed container)
or into a boundary node. `0` when every constituent is individually reachable.

### D-6 — `contains` is never drawn as an edge.

It is spatial (D11/D25) and already expressed by the compound grain. So "a visible route" means a
`calls`/`imports` relation — exactly D40's wording. `contains` is still in the relation index and
still pinned by the census.

### D-7 — Focused Connections emits no boundary nodes.

The 1-hop set is *closed* around the subject: every relation incident to it already has both ends
in bounds. A relation from a *neighbour* out to a 2-hop node answers a different question, and
re-rooting on that neighbour is how D31 says the user asks it. Collapsing those into boundaries
would fill "what connects to THIS thing" with things that do not.

### D-8 — Relation groups are components over ATOMS, not over all drawn nodes.

An **expanded** lot contributes its declarations; a **collapsed** lot is itself the atom (D36).
Grouping an expanded lot *alongside its own children* put a container in a different component
from its own children — geometric nonsense for D34's "independent relationship groups are laid out
separately and then arranged as wholes". Boundary nodes are excluded entirely: they are aggregate
stand-ins, and letting them join would fuse unrelated groups through a shared out-of-scope
neighbour. Found by reading the generated golden; fixed; regression-tested.

---

## Deviations (departures from the work order / design)

### DEV-0 — I put phantom code on the map, and the reviewer caught it. *(the important one)*

My first ruling derived containment from the symbol's **locator** instead of the `contains`
link. The evidence I gathered was real: every `contains` link's src is exactly
`file:<dst.locator.path>` (3,809/3,809, zero exceptions). **The inference from it was invalid.**
That consistency proves `contains` never *contradicts* the locator. It does not prove the
locator can *substitute* for it. A locator is an ADDRESS; `contains` is the FACT of present
existence. **Addresses get reused; facts do not.**

What my Atlas therefore contained, measured on the real store:

| | |
|---|---|
| declarations of code **not in this checkout at all** | **506** — incl. the killed v4 branch's `packages/guide/**` (all worktrees share one shard) |
| declarations whose path exists but which are **no longer in that file** | **183** |
| the most damning instance | the dead kernel's `CanvasCluster` / `CanvasHotArea` / `CanvasBadges`, located at `packages/core/src/guide/types.ts` — **a path that exists only because I created a file there** |

A phantom map is a worse failure than truncation: truncation is at least honest about being
incomplete. The corrected model is D-1.

**How the error survived my own gate.** The work order's census read
`model.declarations.length === store.countByKind("symbol")`. `countByKind` counts retired
symbols too, so the ONLY way to go green was to put ghosts in the model. I optimised to the
gate instead of to the truth, and my "689 recovered exactly!" result read as *confirmation*
when it was the defect reporting itself. The gate was mis-specified (the reviewer owns that),
but I had the disconfirming evidence in hand — I had personally observed that
`packages/guide/**` symbols were in the store from a branch I was forbidden to read — and I
filed it as a colourful footnote instead of as a contradiction. **A number that reproduces a
"measured" figure exactly is not thereby validated; it may just mean both sides share the
same mistake.** The corrected census is now an equality the ghosts cannot satisfy.

### DEV-1 — The golden runs on a FIXTURE corpus, not on the real corpus. *(ACCEPTED by reviewer)*

The work order asks for "golden projection JSON **on the real corpus**". I did not do that, and I
want this seen rather than buried.

A golden frozen against the real corpus **invalidates itself at the next `ctx sync`** — every
commit to this repo changes declarations and calls, hence the projection. The only way to keep it
green is to regenerate it, and a golden that is routinely regenerated is a rubber stamp. That is
precisely the failure mode the census gate exists to prevent: *"a hardcoded total would drift at
the next `ctx sync` and start lying."* A drifting golden lies the same way — and stays green while
doing it.

So I split the two jobs and weakened neither:

| Claim | Where it runs | How it resists drift |
|---|---|---|
| **census + completeness** | **real corpus** (`k1-guide-kernel.test.ts`) | both sides computed live from the store; **zero frozen numbers in the file** |
| **determinism** (D34) | **real corpus** | atlas + projections built twice, compared |
| **DTO shape** | fixture (`k1-guide-golden.test.ts`) | byte-exact golden JSON; `UPDATE_GOLDEN=1` regenerates |

The work order's rule — *"a fixture-only test may never back a census or completeness claim"* — is
fully honoured: **no census or completeness claim is made on the fixture.** The fixture backs a
*schema* claim (the DTO contract K2 and the SPA code against), and a fixture is the correct — and
the only stable — place to make that claim.

If the reviewer wants a frozen real-corpus golden anyway, say so and I will add one. But it will
need a regeneration ritual, and I believe the ritual is the thing that rots.

### DEV-2 — File-grain phantoms: RESOLVED by the reviewer's ruling. *(my second miss)*

I reported that the store held no re-asserted liveness fact for files, and framed it as D25
gap-loop input (missing evidence). **Wrong again, and the same shape of error as DEV-0: I
searched `links`, found nothing, and concluded the fact did not exist.** It exists — in
`cursors.position` for `source='code'`: a 209 KB JSON manifest of every file the code ingest
saw at the published generation, each entry carrying a content hash. It is a store row, so
the kernel still never stats the filesystem. **That was a retrieval failure, not an evidence
gap** — explicitly NOT gap-loop input, which requires the cause to be missing evidence rather
than retrieval.

Implemented per the ruling:

1. **`liveCodeFiles(store)`** (`guide/queries.ts`) — the ONE seam that parses the cursor JSON.
   If the ingest ever promotes this into a table, only this function changes.
2. **A lot is a file in that manifest.** File entities outside it are `nonAtlasLotIds`:
   excluded from every projection, reachable as entities, counted. Census:
   `lotsInAtlas (591) + lotsOutsideAtlas (815) === fileEntitiesInStore (1,406)`.
3. **`FileLot.contentHash`** carries the manifest's hash — the lot's evidence anchor, so D15's
   trust grammar and D33's provenance have something real to render instead of a bare path.
4. **`packages/guide` no longer draws a card**, asserted; and the PHANTOM=0 family now covers
   the LOT grain as well as the declaration grain.
5. **The kernel never stats the filesystem.** The manifest is the oracle; the tests use the
   filesystem only to validate the oracle.

Naming note: the ruling called these "retired lots". I named them `nonAtlasLotIds` /
`lotsOutsideAtlas` because 506 of the 815 are live-but-non-code files (docs, config) that were
never retired — D5 rules the canvas renders the CODE structure graph only, so they were never
lots in the first place. Calling a live `docs/*.md` "retired" would be exactly the kind of name
that lies. Same semantics, same equality; rename it if you disagree.

Freshness: if the generation identity is mismatched, the manifest is stale along with every
other row. That is coherent, and the `live | snapshot | stale` badge discloses it. **No second
freshness mechanism for lots** — encoded as a comment, not a mechanism, per the ruling.

### DEV-2b — A real consequence: a docs-only commit now has ZERO code anchors.

Lots are code-only, so a commit touching only documentation projects an empty canvas. That is
correct (D5), but the old omission note said "N touched entities are **not in the store**" —
which became a lie: they ARE in the store, they are simply not code. Split into two counters
with two honest messages ("N touched files are not code — find them in search" vs. genuinely
absent entities), and regression-tested. Surfaced only because the manifest change made the
latest commit in the corpus a docs-only one.


### DEV-3 — Two defects found by DRIVING the real corpus, not by the tests.

Both were green under my first test pass. I caught them only by running the projections against the
real store and reading the numbers. Recording them because they say something about what tests miss:

1. **Orphan nodes in relation groups.** The container budget was applied *after* the per-container
   declaration budget, so declarations of budget-dropped containers stayed in `drawnDeclarations`
   and entered the components as phantom nodes. Symptom on the real corpus: a 482-declaration
   commit produced **666 groups over 425 nodes**. Budgets now cut containers first.
2. **The container budget cut in path order, not by degree.** D40/D25 require omission selection to
   be **mechanical (degree in the current projection)**. Path order is neither. Now sorted by degree.

Both regression-tested. A third issue surfaced by the fix: because the degree cut hits degree-0
**first**, the honest periphery became the first thing destroyed, folded into a generic "247 more".
D40 forbids that, so `NoVisibleRoute.omittedContainerCount` now carries the periphery's exact count
as its own `+N more (no visible route)` handle at the container grain.

### DEV-4 — `amends` / `supersedes` are not modelled.

The store carries **9** link predicates, not 7: D25's seven plus `amends` (3) and `supersedes` (1),
both `decision → decision`. D25 stratifies exactly seven kinds and the gap loop governs new ones, so
I did not invent an eighth layer. They are **counted and disclosed** in
`AtlasDisclosure.excludedRelationKinds` so the omission is on the record rather than invisible.

---

## Adjacent-found (untouched)

- **6 tests were already failing on `m3/v5` before I touched anything.** Baseline captured by
  stashing my work and running the suite: `1e-docs` A5-adr + A5-stale, `1f-selection` A6-search,
  `1g-serve` A7-why + A7-drill, `2d-callgraph` B4-mention. All are living-repo assertions that
  depend on the repo's own docs/symbols and drift as the repo changes. The **previous slice's own
  implementation-notes independently documents 5 of these same 6** as pre-existing. Not mine, not
  touched. After my changes the same suite fails **5** — a strict subset (A5-stale flipped green on
  its own; it is order/timing sensitive). **My changes introduce zero new failures.**
- My earlier "**574 vs 496** decl-bearing files" claim was **wrong** — it was the phantom set.
  The honest figure is **496**, and the 78 "extra" files it counted were lots whose only
  declarations were retired ghosts. Likewise `store.ts` holds **76** declarations, not the 116
  I reported (40 were ghosts) — 76 is exactly the work order's own ground-truth figure.
- **472 links in the real store have a dangling endpoint** (460 `touches` dst, 6+6 `renamed-to`).
  The kernel keeps and counts them; it does not repair them. Whether the ingest *should* produce
  them is an ingest question, not a K1 one.
- `store.ts` is ~1,300 lines and holds the entire `Store` implementation. Not refactored (§3).

---

## Open questions (for the reviewer)

1. **Event-projection boundary nodes are keyed by SCOPE**, producing edges like
   `boundary:packages/cli → file:packages/cli/src/mcp.ts` — a boundary sharing a scope with an
   in-bounds container. Honest ("the rest of `packages/cli`, not lit by this event") and re-rootable,
   but slice T may prefer a file-grain boundary. Kernel change would be small.
3. **`ClaimSet.disclosure` is always `local`.** The store has no per-claim disclosure column;
   structural code/git evidence is local-facet by default (LAW §4). The field is wired as a
   weakest-wins aggregation so a future restricted carrier narrows the aggregate correctly, but today
   it cannot vary. Flagged so nobody reads it as a live signal yet.
4. **D31's "group by claim status"** is not a kernel axis. Grouping by relation kind and by scope is
   (per-kind aggregate edges; scope-keyed boundaries). Claim *status* is derivable by the renderer
   from the claim set the kernel already hands it, so I left it to slice C rather than adding an axis
   nobody has asked for (§2).
