---
status: draft
review_after: 2026-08-01
note: Shape session 2026-07-11 — page & layout design for the M3 guide web UI. Sits under
  docs/build/M3-GOAL-PROMPT-V3.md (P40, R10-R16) and docs/build/M3-RESCOPE-BRIEF.md (P39).
  Stack was settled by the user before this session (see Decisions).
---

# M3 UI Layout Brief — every page and layout of `ctx guide`

## Intent

Design the complete information architecture, page inventory, and per-page layout for the
M3 `ctx guide` web UI (the "human twin" render surface), at real-store scale (9,588 entities,
21,668 claims — design for 10×). The v2 build's UI was rejected on a live drive (P40); the v3
work order (R10-R16) discards the v2 frontend and demands a designed-from-scratch IA serving
five jobs (J1 orient / J2 find / J3 understand / J4 review / J5 trust). [user]

Who is affected: the maintainer (primary user of the guide), the two v3 implementers
(Claude + Codex tracks), the reviewer who judges the tracks. [user]

## Goals & success signals

- Every page/surface and its layout is decided at fat-marker granularity — an implementer can
  build without inventing IA. [user]
- The design survives the v2 failure modes: no vacuous canvas, no dead search, no unreachable
  surfaces, real-data-first. [docs: M3-GOAL-PROMPT-V3.md "negative space"]
- Defensible at 9.6k entities and 10× that (bounded, local, budgeted views only). [docs: R14]

## Constraints

Hard (violating kills the design):
- C1 Kind-count group boxes must not be the primary view. [docs: R14]
- C2 No global layout over the full entity set — graph views bounded and local (ego-graph /
  cluster drill) with declared budgets. [docs: R14]
- C3 No skin system; ship ONE fully-realized design. [docs: R14/R16]
- C4 Five jobs J1-J5 each acceptance-scenario'd (S1-S10). [docs: R15]
- C5 Non-mutating: curation renders exact CLI commands, never executes. [docs: R1]
- C6 Envelope rendering: glyphs extend renderEnvelopeTerse; color budget spent ONLY on claim
  semantics; provenance-or-it-does-not-render; disclosed gaps. [docs: brief §4]
- C7 Zero egress; all assets bundled; loopback + token/cookie auth (R12); lifecycle R13. [docs]
- C8 Export mode renders the SAME components (one-render-path, R9); layout must work as a
  static snapshot too. [docs: R9]
- C9 Real store on startup (R10); empty state names `ctx sync`. [docs: R10]

Soft:
- C10 Search-first entry suggested "e.g. cmd-K" — form is designable. [docs: R15 J2]
- C11 Entry canvas "UA/GitNexus-style flow canvas" per R3, but R14 overrides its execution:
  bounded/local only. [docs: R3 + R14]

## Non-goals

- Aesthetic/visual design language (colors, type) — explicitly NOT pre-set; stays per-track
  (D3). This brief stops at IA + layout.
- Impact-Set, Revision Compare, Serve Audit pages (gated annex; O-36). [docs: brief §3.4]
- Token/savings dashboards. [docs: brief §3.4]
- Any `ctx sync`/schema/ingest change. [docs: V3 out-of-scope]

## References

Studied 2026-07-11 by three Explore agents (UA+gitnexus / wiki-family / graph-family); file
paths verified in their reports. [code: .research/*]

- `.research/understand-anything` — SAME STACK as D1 (React Flow + ELK + Zustand + Tailwind 4).
  COPY: two-stage lazy layout (Stage-1 ELK on containers only; Stage-2 per-container on
  expand, cached by (graphHash, containerId), >20% size deviation re-runs Stage-1); folder-
  first container grouping with Louvain fallback (<3 folder buckets or >60% concentration);
  cross-container edge aggregation (one edge per pair, log2 width, count label); zoom
  auto-expand with hysteresis (>1.0 expand, <0.6 collapse, 200ms debounce); search hit →
  drill into containing layer → select WITHOUT auto-expanding; `repairElkInput` + GraphIssue
  warning banner (strict in dev); perf budgets (Stage-1 <100ms, expand <100ms, cache <5ms);
  shell = header + search bar + canvas + 360px right sidebar (Info/Files tabs).
  DON'T COPY: no URL routes (Zustand state-machine nav — breaks our deep links C8/S10);
  main-thread elk (D1 rules async/cancellable); separate mobile layout (U7 deferred).
- `.research/gitnexus` — NEGATIVE RESULT, empirical proof of C2: Sigma + ForceAtlas2 GLOBAL
  layout of the whole graph, 20–45s wall-clock at 10k nodes, hangs on large repos (their
  issue #2178) → patched to "skip graph entirely above 25k nodes, chat-only mode". Depth
  filter hides nodes AFTER paying full layout. COPY only: repo-landing entry framing (indexed
  stats cards), focusNode camera animation, honest StatusBar counts.
- `.research/graphify` — second negative sample: vis-network, hard cap 5k nodes, above it
  auto-collapses to a community meta-graph. COPY: single-file static HTML export with inline
  JSON (R9 precedent — but theirs uses CDN, ours must not); community legend checkboxes
  toggling visibility; labels only above a degree threshold; tree view max-children 200 with
  synthetic "(+N more)" leaf. DON'T COPY: whole-graph physics, CDN deps.
- `.research/opendeepwiki` — best shell of the wiki family. COPY: RepoShell (persistent left
  tree w-72 + main content + right ToC rail xl:w-64 + bottom "Sources" chips); standalone
  graph routes (/mindmap) living INSIDE the persistent shell. DON'T COPY: catalog-only search
  (no in-repo content search), unvirtualized tree with an unused virtualization dep.
- `.research/deepwiki-open` — COPY: importance-dot annotations on the nav tree; inline
  mermaid + svg-pan-zoom pattern. DON'T COPY: no search at all; client-LLM-generated page
  structure.
- `.research/codewiki` — COPY: its static GitHub-Pages export variant = a mini-SPA with
  inline MODULE_TREE JSON + client-side fetch per doc + link interception — direct precedent
  for `SnapshotDataSource`. DON'T COPY: server MPA with full page reload per doc.
- `.research/codegraph`, `.research/openwiki`, repodoc/repoagent/repomaster/tree-sitter-
  analyzer — no web UI worth copying (CLI/MCP/static-book/Streamlit-chat only).
- Cross-cutting: NONE of the 8 references implements in-content full-text search — J2's
  FTS-backed omnibox over 7 entity kinds exceeds every reference; UA's search-drill is the
  only in-canvas precedent.
- `.research/davia` `web.ts` — local-server ergonomics. Mostly settled by R12/R13 already.
- Discarded `m3/rescope-claude` — projection-kernel pattern + export plumbing ONLY; its
  frontend/auth/lifecycle rejected. [docs: V3 read-first #4]

## Decisions

- D6 Attachment edges get a small core work order (U15 = option a, 2026-07-12): persist
  doc-mention→code links, memory anchors, and decision→code where derivable — amending the
  O-16 V1 gate and V3's "data layer untouchable" for this narrow slice. Rationale [user]:
  canvas annotations need real edges (G-provenance); the knowledge-on-code proposition is a
  store-level truth M3 merely exposes; MCP serve benefits equally. Rejected: honest-empty
  badge slots (b), code-only canvas (c). Work order to be drafted at freeze, separate from v4.
- D5 CODE IS THE CENTER (U2/U4 SHOW round, 2026-07-12): the canvas renders the CODE structure
  graph only — containers = folder structure, nodes = code. memory / decision / commit /
  doc_section / concept NEVER appear as peer top-level containers; they attach to code nodes
  as annotations (badges, selection attachment panel, lenses). All 7 kinds keep full search
  presence (J2) and Subject pages (S5/S6 no-dead-ends). Non-code entities with no code anchor
  stay reachable via search/queues and a disclosed "unanchored" shelf — never faked onto the
  canvas. Because [user]: "code node is the center of every other data type — memory,
  decisions, commits all anchor to it; that IS the product's position." Avoid [user]: a
  summarized mixed-kind container soup as the first paint.
- D4 Shell = A-base with C's chrome grafted (U2/U4 SHOW round, 2026-07-12): canvas-first
  entry (A) + persistent left attention rail and right inspector panel (from C), around a
  PERMANENT canvas center at `#/` — the center never swaps stages. Subject stays a separate
  full route page; omnibox stays persistent in the top bar (A). Routes: `#/` canvas ·
  `#/s/:kind/:id` subject · `#/inspect/:tab` (review | conflicts | push | health).
  Because [user]: "canvas is the core." Avoid [user]: "workbench feel" — the canvas must not
  become one swappable stage among many. Rejected: B (Ledger-first; would also have required
  revising R3), C wholesale (center-swap workbench). [user]
- D2 This brief SUPERSEDES the v3 design competition (U1, 2026-07-11): IA and layout are
  ratified here; a v4 work order hands the SAME design to both tracks, which compete on
  implementation quality only. Requires a formal P40 amendment revising R14 ("you design the
  IA") and R16 ("dual-track IS the variant competition") — record in FABLE-DECISION-LOG at
  ratification. Rejected: feed-Claude-track-only (keeps design competition), rubric-only
  (design not handed to implementers), single-track. [user]
- D3 Brief scope = IA + layout ONLY (U9, 2026-07-11): visual design language (palette, type,
  density, glyph aesthetics) stays per-track in v4 — the residual value of the retired R8/R16
  design competition lives at the implementation layer. Envelope glyph SEMANTICS and the
  color-budget rule (C6) are product rules, not aesthetics, and stay binding on both tracks.
  Rejected: lock-visual-tokens-too, direction-locked-tokens-free. [user]
- D1 Stack settled (pre-session, user): React 19 + TS; Vite 8 pure SPA (no Next); @xyflow/react
  behind a `GraphRenderer` boundary; elkjs async/cancellable/cached-by-projection-identity;
  Zustand for view state only (selection, lens, drawer, expanded container, viewport); React
  Router + Hash Router (Live and offline HTML share routes); Tailwind CSS 4 + CSS variables,
  Radix only for Tooltip/Tabs/Dialog/Drawer; one typed `GuideDataSource` with `LiveDataSource`
  + `SnapshotDataSource`; local server = `node:http` in `packages/cli`; testing = golden
  projection JSON + Vitest/Testing Library/happy-dom + one Playwright smoke; export = same
  Vite bundle, same components, inlined JS/CSS/projection, zero CDN. [user]

## Design

(to be synthesized — page inventory, app shell, per-page layout)

## Assumptions

- A1 [inferred] Canvas grain stops at FILE level: folder containers expand to file nodes;
  symbols (3,943) never render as canvas nodes — symbol drill happens in the Subject page /
  right inspector. Invalidation signal: the U12 spike or a live drive shows file grain too
  coarse (files with 50+ symbols make the inspector the real navigation surface), or file
  count per container regularly exceeds Stage-2 budgets.

## Unknowns

- U1: relationship of this design to the O-38 dual-track competition → ASK
  [closed → D2: supersede the competition; issue a v4 work order]
- U2: what exactly does the entry surface render at t0? → REOPENED 2026-07-12 (user rejected
  both "folder containers" AND Fable's "bounded recent-activity subgraph"): user position =
  FULL code-graph map (all nodes laid out, persistent space), default viewport focused on
  recent changes, zoom out to see everything — challenges C2's no-global-layout wording.
  Under grilling; sub-decisions: grain, 10× LOD ladder, edge visibility policy, layout
  engine/locus, default-viewport mechanics, C2 rewrite. → ASK [active, grilling]
- U13: which link predicates exist in the store — what can the canvas legally draw? →
  LOOKUP [closed, 2026-07-12, real store query [tested: sqlite shard 9cd2e7eab8b4]]:
  links = calls sym→sym 4,228 · contains file→sym 4,205 · touches commit→sym 6,282 +
  commit→file 2,066 · co-changed file→file 1,302 · references 1,083 · imports file→file 693 ·
  renamed-to 145 · amends/supersedes decision→decision 4. Claims by subject: file 23,366 /
  symbol 10,876 / commit 8,929 / concept 1,238 (all `defines`) / decision 84 / memory 6.
  CRITICAL NEGATIVE: doc_section (2,963 entities) has ZERO claims and ZERO links; concept
  (977) and memory (104, anchors table EMPTY in this store) have ZERO links to code. The
  "everything anchors to code" model is real for code+commits, NOT yet real for the
  knowledge kinds — consistent with O-16 (doc mentions dropped, persistence gated on V1).
- U15: knowledge-kind attachment edges (doc→code mentions, memory anchors, decision→code)
  do not exist in the store and their persistence is scope-gated (O-16 → ladder V1; V3 says
  data layer ratified). Canvas annotation badges for these kinds therefore have nothing to
  render. Amend scope with a small core work order, ship honest-empty badge slots, or keep
  the canvas pure code+commit? → ASK [active]
- U14: presentation of non-code entities that lack a code anchor (the "unanchored" shelf) →
  open (mechanical; synthesize stage)
- U3: UA/GitNexus layout & IA mechanics → LOOKUP [closed → References; two-stage container
  layout is the only proven same-stack route; global layout died in both negative samples]
- U4: route/page inventory + app shell → SHOW [closed → D4: A-base + C chrome; 3 routes;
  persistent omnibox; Inspector = one tabbed route]
- U5: Subject page layout — one template across 7 entity kinds or per-kind variants? how are
  the blocks (claims / history / neighborhood / decision chain) arranged? → SHOW [active]
- U6: time/churn lenses as canvas overlays or standalone views? → DEFER [safe default =
  overlay-only first; risk = missing global view if lenses fall short; trigger = a live drive
  where J1 orient cannot answer "what changed lately"; M3-RESCOPE-BRIEF §9 already left this
  to variant evidence]
- U7: responsive/mobile scope? → DEFER [safe default = desktop-first, single breakpoint floor
  (~1100px), no mobile layouts — local dev tool opened from a terminal; risk = tablet/split-
  screen reading degraded; trigger = a real drive on a narrow viewport fails a J1-J5 job]
- U8: page forms for empty state / auth landing / export mode → open (mostly mechanical;
  handle at synthesize)
- U9: lock visual design language or not → ASK [closed → D3: IA+layout only; visuals stay
  per-track]
- U10: wiki-family reference IA → LOOKUP [closed → References; opendeepwiki RepoShell +
  codewiki static-export variant most useful; the whole family lacks content search]
- U11: remaining graph-family references → LOOKUP [closed → References; graphify = second
  negative sample (5k hard cap) + R9 export precedent; codegraph etc. have no web UI]
- U12: does the two-stage container canvas hit UA's budget class on our real store (9.6k)
  and on 10× synthetic data (Stage-1 ~100ms class, expand <300ms, no hang at 10×)? → TEST
  [active; probe = React Flow + elkjs spike page fed real projection JSON; run before
  ratification. Note: D2/D3 were challenged once by the user on 2026-07-11 ("lock tokens,
  free IA instead?") and re-affirmed after argument — IA exploration already happens inside
  shape's SHOW rounds at mockup cost; runtime risk is hedged by this spike; user delegated
  the ruling to Fable.]

## Readiness

not-ready — U2/U4/U5 block the Design section; U12 spike must run before ratification.

---

## Ratified continuation — 2026-07-12

This section records the continuation grilling represented by
`/private/tmp/m3-web-design-grilling-handoff-2026-07-12.md`. It is append-only: the earlier
decision/unknown history remains above, while this section supersedes the stale `Design`
placeholder, assumption A1, the active state of U2/U5/U6/U7/U8, and the old `Readiness` line.

The remaining implementation questions are listed at the end. Business-logic understanding and LLM
generation are not unresolved M3 questions; they are designed separately in
`docs/design/M4-PROJECT-UNDERSTANDING-BRIEF.md`.

### Decisions D7-D18

#### D7 — Full persistent logical code Atlas

M3 has one complete, persistent **code** Atlas. This requires a formal amendment to P40/R14; it does
not revive the rejected seven-kind global graph.

- Every extracted declaration of kind `function`, `method`, `class`, or `const` is a logical code
  node.
- Local definitions and raw syntax nodes are not Atlas atoms.
- Every code file is a selectable spatial lot. A file with declarations contains them; a file with
  no live declaration becomes the fallback atom.
- The logical Atlas contains the complete code space, but the renderer receives only an LOD-bounded
  visible slice. "Full map" never means mounting every logical node in React Flow.
- Non-code entities are annotations attached by deterministic evidence. They never become peer
  top-level Atlas nodes.

At the design snapshot, the store contained 1,332 files, 535 with live declarations. Re-query these
counts before using them as an implementation baseline.

#### D8 — Deterministic attachment ladder

Knowledge-to-code attachment uses this strict precedence:

```text
exact symbol -> exact file -> Unanchored
```

Accepted evidence is limited to:

- explicit entity ID;
- exact path/span;
- unique qualified symbol;
- existing memory anchor;
- commit touch.

Ambiguous matches remain Unanchored. Ranking, semantic similarity, or an LLM never chooses a factual
primary anchor.

D6's small Core amendment remains required: persist doc-mention-to-code links, memory anchors, and
decision-to-code links where deterministic evidence exists. The amendment benefits both Guide and
MCP serving; it is not a UI-only cache.

#### D9 — Quantized directory spatial model

Atlas positions come from real hierarchy, not call/import force:

```text
repo -> recursive folder -> file -> AST outline
```

- Folders are recursively nested quantized regions with stable edge corridors.
- Files use discrete footprint buckets and stable path order.
- A change may repack one parent region locally; it must not wash the whole Atlas.
- Inside a file, class/type containers own methods; top-level functions and consts follow source
  order.
- Users cannot drag nodes. Live, export, and different users see the same spatial model.
- Semantic zoom reveals a hierarchy level only when readable.
- Click pins an expansion.
- Search opens only the selected hit path temporarily.
- Zoom hysteresis prevents repeated expand/collapse flapping.

The bottom-right folder minimap is always available and contains region summaries, viewport, search
marks, and active-lens marks. It does not reproduce declaration-level detail.

#### D10 — Viewport and generation behavior

- A new session or new generation focuses the densest code region touched by the latest 20 commits.
- If there is no code activity, fit the repository.
- `Fit repo` is always available.
- Within one generation, persist viewport, selection, and pinned regions.
- On a new generation, preserve only a still-existing selection and return to the recent hotspot.
- If a generation appears while a user is reading, keep the current generation pinned and show a
  switch prompt with a change summary. Never refresh the map underneath the reader.

#### D11 — Edge and lens semantics

Collapsed regions show aggregated edges. Expansion replaces incident aggregates with the next-level
real edges. Selection emphasizes direct edges and fades unrelated content without relayout.

Default backbone:

```text
calls + imports
```

`contains` is spatial. Co-change, commit touches, knowledge attachments, and history do not enter the
default backbone.

Only one primary lens is active at a time:

- Recent (default);
- Churn;
- Co-change;
- Review;
- Conflict.

Trust ticks, search hits, and selection are orthogonal overlays rather than additional primary
lenses. Activity uses neutral size, luminance, border, and texture. Saturated color remains reserved
for claim status.

Review/Conflict behavior:

- deterministically anchored items appear as node/region count badges;
- the primary lens dims unrelated regions;
- a conflict line appears only when both claims resolve to distinct code anchors;
- unanchored review/conflict items remain queue-only.

#### D12 — Renderer seam and merge-blocking performance

Keep React Flow behind `GraphRenderer`, after the LOD/spatial compiler has produced a bounded visible
slice. React Flow must never receive the full current or 10x logical set.

If the 10x spike fails, only the distant folder/file level may move to a WebGL renderer. Declaration-
level interaction remains React Flow, and the `GraphRenderer` contract remains stable.

Production-build browser budgets, measured after projection availability:

| Interaction | Current corpus | 10x corpus |
|---|---:|---:|
| first interactive | <=1 s | <=3 s |
| expand | <=100 ms | <=250 ms |
| search | <=75 ms | <=150 ms |
| continuous pan/zoom | >=50 fps | >=50 fps |

No main-thread long task may exceed 500 ms. Real-store and 10x results are merge-blocking.

Support current Chrome/Edge, Firefox, and Safari. CI locks Chromium visuals and runs Firefox/WebKit
critical smoke tests.

#### D13 — Shell and route inventory

Desktop full-map shell starts at 1100 px:

```text
+---------------------------------------------------------------+
| Repo HUD + generation/freshness + omnibox                    |
+-----------+-----------------------------------+---------------+
| attention | Atlas or route page               | inspector     |
| / nav rail|                                   | stack         |
|           |                                   | (resizable)   |
|           |                           minimap |               |
+-----------+-----------------------------------+---------------+
| trust legend (collapsible Atlas overlay)                       |
+---------------------------------------------------------------+
```

Routes:

| Route | Purpose |
|---|---|
| `#/` | persistent Code Atlas |
| `#/s/:kind/:id` | Subject evidence dossier |
| `#/inspect/:tab` | operational workbench |
| `#/timeline` | unified chronological history/decisions |

`#/inspect/:tab` supports Needs Review, Conflicts, Unanchored, Push Preview, and Health.

The Repo HUD stays compact:

- repo, generation, and freshness in top chrome;
- needs-review, conflict, and unanchored counts in the rail;
- current scope, omissions, and lens in the map HUD.

There is no dashboard that covers the Atlas on entry.

Narrow mode keeps omnibox search, Subject, Timeline, and Inspector; the right inspector becomes a
drawer. The Atlas requests a wider viewport rather than pretending to provide a phone-sized map.

#### D14 — Selection, comparison, search, and keyboard

- Single click selects a code node and previews it in the inspector.
- Double-click, Enter, or the explicit open action navigates to Subject.
- State contains one primary selection plus at most four pinned comparison nodes.
- Inspector, `Fit`, highlighted edges, and Focus export consume the same selection set.
- Omnibox results are grouped by entity kind, with one count per group.
- Existing ranking applies only within a kind; it does not compare incomparable kinds globally.
- Code results focus their declaration/file.
- A non-code result with one anchor focuses that anchor.
- A non-code result with several anchors fits all proven anchors and lists them side-by-side.
- An unanchored result opens Subject rather than inventing a map location.
- Search marks results without expanding many containers; activating a result opens/focuses only its
  hit path.

Keyboard navigation uses a synchronized hierarchy:

```text
folder -> file -> declaration
```

The product does not put tens of thousands of logical graph nodes in the tab order.

#### D15 — Subject, evidence drill, and trust grammar

Subject has one shared evidence-dossier skeleton with kind-specific modules for symbol, file, commit,
decision, doc section, memory, and concept.

Layout:

1. sticky identity/trust header;
2. claim-backed main sections;
3. relationships and attachments in the right rail;
4. bounded local graph as a drill module, never the page hero.

Evidence drill reuses the right inspector as a push/pop stack. It does not open a second drawer or
navigate away.

Node bodies remain neutral. Segmented perimeter ticks summarize statuses in the current claim scope.
The entity is never painted by a synthetic "worst" or "majority" status.

Non-code attachments render as a compact kind-glyph/count stack. Expanding it shows exact items and
provenance in the inspector. The trust legend is a compact, default-open, collapsible Atlas overlay
and reports counts for the current projection.

Each implementation track ships one complete theme. There is no theme toggle or skin system. Color,
type, and motion may differ by track, but claim semantics and non-color status accessibility are
identical.

#### D16 — Inspector and Unanchored content

Inspector uses a dense virtualized table plus a right-side detail pane. Shared tabs are Needs Review,
Conflicts, Unanchored, Push Preview, and Health.

Every curation action renders an exact copyable CLI command and never executes it.

Unanchored entities remain reachable through:

- attention rail;
- Inspector queue;
- omnibox search;
- Subject route.

They never become fake Atlas nodes.

At the 2026-07-12 snapshot, 104 needs-review memories had no persisted anchor; five open stale-
suspect conflicts were file-to-file and three sameAsCandidate conflicts were memory-to-memory. These
are drift-prone observations, not design constants; query them again during implementation.

#### D17 — Export purposes and one render path

End users choose an export purpose:

- `full`: complete offline repository exploration;
- `focus`: selected investigation bundle;
- `archive`: complete repository snapshot plus proof manifest.

Browser Export dialog/direct download and the interactive CLI wizard compile to one typed
`ExportSpec` and one Core snapshot builder. Scripted CLI flags remain equivalent.

`focus` contains:

- one or more selected entities;
- AST ancestors;
- one-hop calls/imports;
- all permitted attachments and evidence;
- explicit budget omissions.

`archive` adds revision/generation, scope, budgets, omissions, projection hashes, acceptance evidence,
and performance records.

All profiles use the same components and `SnapshotDataSource`. The browser must not invent another
projection or renderer. All assets are bundled; no CDN, remote fonts, or telemetry.

#### D18 — Business understanding and LLM move to M4

M3 remains deterministic and read-only. It does not add business-use-case synthesis, domain grouping,
LLM narrative, reviewable generation, or model egress.

Those capabilities are specified in `docs/design/M4-PROJECT-UNDERSTANDING-BRIEF.md`. M3 provides the
landed Guide shell, Code Atlas, Subject/evidence contracts, renderer seam, and live/snapshot/export
parity that M4 later extends.

### Synthesized page inventory

#### Code Atlas `#/`

Primary job: orient in the code space, find a code atom, see supported context on code, and move into
evidence or operational work.

First paint:

- Repo HUD and live generation state;
- recent-hotspot viewport or fit-repo fallback;
- quantized folder/file regions at readable LOD;
- Recent lens;
- attention counts;
- trust legend;
- folder minimap.

No count-card landing page or mixed-kind overview precedes the Atlas.

#### Subject `#/s/:kind/:id`

Primary job: understand one entity as a claim-backed dossier.

The skeleton is shared, while module order and content vary by kind. Every factual section either
contains claim envelopes/citations or renders an explicit gap. A local graph is bounded to the
subject's neighborhood and is subordinate to evidence.

#### Inspector `#/inspect/:tab`

Primary job: review operational queues without mutating the project in the browser.

The table virtualizes large lists, retains filters/sort in the URL or view state, and opens details in
the shared inspector stack. Actions explain and copy CLI commands.

#### Timeline `#/timeline`

Primary job: answer the chronological form of "what happened and why" across commits, decisions,
docs, and memory.

It provides kind/source filters, generation identity, code-anchor navigation, and a bounded event
window. Timeline does not become a second global graph and does not duplicate Subject evidence.

### Shared interaction states

All routes need explicit forms for:

- loading and index catch-up;
- empty repository with exact `ctx sync` guidance;
- authentication/bootstrap failure;
- source unavailable/restricted;
- projection omissions and budget exceeded;
- layout failure with keyboard Navigator fallback;
- stale generation and generation-switch prompt;
- export compilation/progress/failure.

The loopback server, one-time token-to-HttpOnly-cookie bootstrap, protected routes, server-until-
Ctrl-C lifecycle, and clean URL contract remain inherited hard constraints.

### Remaining implementation decisions

The product and IA choices above are closed. Implementation must still specify and verify:

- quantized file-footprint bucket thresholds and stable parent-local packing;
- LOD thresholds, viewport overscan, and maximum visible-slice sizes;
- exact Atlas projection DTOs: manifest, regions, spatial index, aggregate edges, attachment
  summaries, lens payloads, and generation identity;
- exact kind-specific Subject module order;
- Timeline event DTO and filter representation;
- Inspector column sets, default sorts, detail schemas, and copy feedback;
- export compression/loading, archive manifest schema, browser streaming, and full-snapshot budget;
- exact browser/version baseline and benchmark machine/corpus;
- state-screen copy and Navigator fallback details.

These are engineering specifications inside the locked product shape. They must not reopen the
full-map, code-centered, route, renderer, lens, or export decisions.

### Revised readiness

**Design recorded, implementation not yet authorized.** Before production implementation:

1. formally amend P40/R14 for the complete logical code Atlas;
2. amend D6/O-16 for deterministic knowledge-to-code persistence;
3. amend the route contract for Timeline;
4. issue a v4 work order replacing the v3 IA competition language;
5. run the real-store and 10x `GraphRenderer`/LOD performance spike and meet D12's budgets.

After those gates, implementers should consume this brief rather than make new IA choices.

---

## Reconciliation amendments — 2026-07-12 (ratified; absorbed from M3-M4-RECONCILIATION-BRIEF)

Ratified by the maintainer 2026-07-12 after evidence probes (store `9cd2e7eab8b4` counts; an
8-memory blinded LLM anchoring test: 5/5 proposals correct, 0 guesses). These amend the
sections above in place; on conflict, this section wins.

### D8 amendment — deterministic ladder gains a directory rung; repo level is human-only

The automatic ladder becomes:

```text
exact symbol -> exact file -> explicit directory path -> Unanchored
```

- Evidence classes are UNCHANGED (explicit entity ID, exact path/span, unique qualified
  symbol, existing memory anchor, commit touch); ranking/similarity/LLM still never select a
  factual anchor.
- Directory-rung boundary: a cited path first attempts unique file resolution; if it instead
  matches an existing directory, it anchors at directory level; if neither, Unanchored.
- Repo-level anchors exist but are HUMAN-DECLARED only — absence of a path is not evidence of
  repo scope. Humans may declare an anchor at any level during review.
- The deterministic evidence rule is kind-agnostic: an exact citation attaches to the cited
  entity whatever its kind (doc_section, decision, commit included).
- Evidence: 95/104 memories cite file paths (auto-anchorable); ~9% carry only directory-level
  paths that two-level D8 would strand; 59% of decision-log entries cite no file path at all
  (the human-declared levels' constituency). Single-repo counts; re-check on a second corpus
  before treating the ratios as product constants.

### D19 — deterministic reachability view (NOT an impact page)

From a selected declaration, the Atlas offers a k-hop expansion along `calls + imports` with
`co-changed` as labeled corroborating evidence. Every edge carries its derivation label; the
view states explicitly: static reachability, NOT impact analysis; runtime/semantic coupling
is DARK. This view may upgrade into the real Impact page only after Artifact 2 (Impact Set,
PRODUCT-DESIGN.md §5.2) clears its §8 validation ladder. Building an impact-labeled view
before that gate remains forbidden (kill-grade under LAW §6 R3).

### D20 — anchor durability

Anchor records store their deterministic evidence (path/span + source revision) beside the
target entity id. Every `ctx sync` generation runs an anchor repair pass (follow `renamed-to`
links — 145 exist in the current store — and re-resolve evidence). Unrepairable anchors move
to the needs-review/Unanchored queue with a reason: never silently dropped, never silently
retargeted. Rationale: entity ids are path-derived and this repo has already relocated cited
files once (docs/ → docs/archive/).

### D21 — gated annex (absorbed from M3-RESCOPE-BRIEF §3.4, P39; last live clause)

Three surfaces remain approved but gated, outside this brief's build scope:

- **Impact-Set** ships only WITH Artifact 2 (P37/LAW §11). Pre-gate, D19's reachability view
  is the only permitted neighbor; an impact-labeled surface stays forbidden.
- **Revision Compare** (claims changed rev A→B) — same Artifact 2 gate.
- **Serve Audit** ("what did the agent just see") — approved direction, BLOCKED on the
  serve-log write path (O-36); needs its own small work order when unblocked.
- Still not a page: token/savings dashboards (E-ladder territory, P38/P27).

All other M3-RESCOPE-BRIEF clauses are absorbed by P40 (R10-R16), the v4 work order, or
D1-D20; the brief itself is archived (P43).

---

## Amendment 2026-07-12 (evening) — Event Projection + Evidence Navigation (D22–D25)

Second convergence round (maintainer + Fable + heterogeneous second opinion, two rounds;
FABLE-DECISION-LOG P44). Contracted thesis: **what M3 builds is Event Projection +
Evidence Navigation — not a Route Compiler, and not an Impact Product.** The long-term
metaphor (events project onto a stable Atlas; the relevant roads light up) stands; the
currently claimable capability is "observed relationships" only.

### D22 — Event Projection primitive (hard anchors only)

An **event** is the unit that drives the Atlas. Stage-1 events must carry hard anchors;
open-concept queries are NOT events (U13: concept/doc_section/memory have zero links to
code; semantic compilation is M4, post-V0).

- Accepted anchors: diff/PR range · exact file · exact symbol · exact-text search hit ·
  user-selected node set.
- Event schema: `Trigger + Anchors + Time` (generation / diff range). `Intent` and `Role`
  are DEFERRED — a local tool cannot observe them; reintroduce only if V0 shows answers
  depend on them.
- Mechanics: the URL carries the event (`#/?diff=…`, `#/?sym=…`, `#/?q=…`); a pure
  deterministic kernel `project(event, atlas) → { lit nodes, lit observed paths, viewport,
  lens }`; everything else dims — the map stays present.
- Entry: deep links printed at the tail of CLI output and agent reports are the PRIMARY
  entry. Cold-open `#/` = D10's recent-hotspot viewport (the default event is "what
  changed recently"). D13's no-dashboard rule is unchanged.
- Every lit element renders only store claims/links, each with derivation label and
  provenance (P37: guide renders its own claims).
- Anchor-first ruling: U13 killed Concept→Code routes, NOT Search→Canvas projection —
  symbol/file/path/exact-text search landing on hard anchors and projecting them is legal
  M3 navigation.

### D23 — Evidence Rail (the map's subtitles, not a second product)

A narrow, event-scoped, ORDERED rail beside the Atlas. Each step click-focuses the canvas
and carries its edge type + provenance.

- Step order is **mechanical traversal order** — hop distance from event anchors, grouped
  by edge kind: anchors → containing modules (`contains`) → direct `calls`/`imports` →
  k-hop static reachability (user-expanded) → `touches`/`references` corroboration
  (separate toggle).
- Mechanical ordering is legal (derived from graph structure alone). Importance ranking
  ("most significant first") is a judgment and stays behind the Artifact-2 gate.
- The rail is also the degradation path: when a 40-file agent diff fans out into an
  unreadable hairball on the map, the rail still narrates the evidence in walkable order.
- Never in the rail: behavior summaries, test-gap inference, architecture-violation
  verdicts, generated prose.

### D24 — Naming gate: the diff surface is **Change Trace**

Vocabulary is part of the Artifact-2 gate. Pre-gate, the diff-event surface and all UI
copy MUST NOT use `impact / affected / blast radius / risk / breaks`.

- The diff-event surface is named **Change Trace** (maintainer pick, 2026-07-12).
- D19's k-hop view keeps its literal name **Static Reachability**.
- `co-changed` is labeled "historically co-changed" — correlation wording only, never
  causal.
- **Evidence Route** (defined term): a path composed of existing observed edges that the
  user is currently walking — a navigation object, never a system-generated causal
  conclusion.
- Renaming Change Trace to a real Impact page is the D19/D21 upgrade path, and doubles as
  the public signal that Artifact 2 cleared its §8 validation ladder.

### D25 — Coordinate-system completeness + gap-driven data expansion

**What is complete is the coordinate system, not the knowledge.** The Atlas is
complete/stable/addressable over evidence we already have, and explicitly incomplete
about system reality (freshness/confidence disclosed).

Edge-role stratification of the existing 7 kinds (consistent with D11):

| Layer | Edges | Role |
|---|---|---|
| Backbone | `contains` (spatial) + `calls` + `imports` | default lit structure |
| Event evidence | `touches` + `references` | lit under an event / toggle |
| Historical correlation | `co-changed` | separate labeled layer, never default |
| Identity / evolution | `renamed` | anchor repair (D20), timeline |

New edge kinds enter ONLY via the gap loop:

```text
a V0 question class repeatedly unanswerable
→ confirmed cause = missing evidence (not UI / retrieval / operator failure)
→ smallest deterministic, provenance-carrying source
→ add exactly ONE relation kind that closes the gap
```

REJECTED: the up-front "Canonical Map" data wishlist (data flow, event flow, deploy
dependencies, queues, config, permission boundaries, runtime traces, CODEOWNERS, incident
records) — supply-side cathedral; every item may only enter via the gap loop.

Implementation notes (not new decisions): the U12 spike gains one item — render ONE real
diff event as a lit route on the real store (SHOW page: "road network vs hairball") before
v4 visuals freeze. Visual grammar: lit = evidence-backed only; pre-gate there is no dashed
"inferred" style because nothing inferred is rendered at all; additions respect D15's
color budget. Legal navigation ops in M3: show change set · expand direct
callers/callees · expand imports · N-hop static reachability · find observed path A→B ·
toggle layers by edge kind · pin nodes to the current investigation · copy/save an
Evidence Route · back to previous anchor. NOT provided in M3: auto main-route · importance
ordering · behavior summaries · test-gap inference · architecture-violation detection ·
concept→code narrative.

---

## Amendment 2026-07-13 — Canvas verdict + four-state model (D26–D33)

Triple adversarial audit (Opus pipeline replay · Opus presentation census · Codex source
attribution with recomputation, all on the real corpus @ 34ce9ec6) converged on one
verdict after six build/fix rounds: **directory-derived coordinates cannot carry a
relationship graph at repository scale.** Directory layout optimizes containment and
path stability; relationship layout optimizes adjacency, rank, and crossing
minimization; D9 forbade the second goal from moving the first's coordinates, and the
two have no common solution. Evidence (replayed, not estimated): 94.7% of the world is
empty paper; folder area/file-count spread 21x; cold-open zoom 0.17 vs first readable
label at 1.0 (a ~6x dead zone); file-level backbone edges median 9.4% of the world
diagonal with 12,189 crossings per 600 edges; the flagship diff deep link drew ZERO lit
edges at its own default viewport. On conflict with earlier sections, THIS section wins.

### D26 — Verdict and supersession

- **D7 STANDS** as the data model: the complete, addressable, provable logical Atlas
  (every declaration a logical node — see D33 kernel-completeness rule).
- **D9 is RETIRED as canvas geometry.** Quantized directory packing no longer decides
  any relationship-canvas position. Directory semantics survive as: grouping, the scope
  tree, breadcrumbs, and overview counts. "Stable spatial identity" is carried by stable
  IDs + the tree, not by persistent XY.
- D10 (viewport/generation), D12 budgets, D14 find rules, D15 trust grammar, D17 export,
  D24 naming gate: STAND, reinterpreted onto the four-state canvas.
- D13's shell is REPLACED by D28. D11's edges-on-the-persistent-map and D22/D25's
  "lit routes on the map" metaphor are RETIRED (the data shows it is always the
  hairball); events light the tree + drive a bounded projection instead (D32).
- The minimap is retired; tree + breadcrumb take over orientation.

### D27 — Four-state canvas

One center canvas, four projection modes; NO permanent all-repo node projection exists
in any mode. Zoom only scales geometry; WHAT is projected changes only via explicit
drill/expand/re-root, never via zoom thresholds.

| Mode | Question it answers | Projection |
|---|---|---|
| Overview | what is this repo | module/package cards (D29) |
| Scope Graph | what is inside this scope and how does it hang together | one scope's files/symbols, ELK layered (D30) |
| Focused Connections | what connects to THIS thing | inbound / subject / outbound, 1-hop default (D31) |
| Change Trace | what does this event touch | bounded event projection driven by the rail (D32) |

### D28 — Shell

- Top: repo · revision · generation · **live | snapshot | stale** badge · omnibox ·
  current mode. Nothing else.
- Left rail: directory/scope tree (DOM text, always legible; Recent lens + event
  lighting render HERE as row highlights), attention counts, Change Trace rail (expands
  in review), navigation history.
- Center: the four-state canvas.
- Right: inspector (subject identity + claim envelopes + declarations + connection
  summaries + omission/expansion handles). The inspector and the rail are INDEPENDENT
  scroll owners with reserved height budgets — never one flex column.
- Perf HUD becomes dev-only (flag/route). The spike shell (Scale/Variant/Sweep chrome)
  is retired from the product surface.

### D29 — Overview cards

Small set of module/package cards (fixed, screen-readable size; name, deterministic
role line — path + counts only, NO generated prose pre-M4), file count,
changed/needs-review/conflict counts, aggregate in/out counts, trust/freshness badge.
Directory determines grouping only. Clicking a card enters its Scope Graph.

### D30 — Scope Graph

- Projects ONE scope's members; connectivity of the current bounded set goes through
  ELK layered (crossing minimization). Cross-scope relations collapse into boundary
  nodes carrying counts; clicking a boundary node re-roots/drills.
- Explicit expand (click a container/group) changes content; budgets + disclosed
  omissions per D12 discipline; anchor/lit members always survive budgets.

### D31 — Focused Connections (promoted from the FocusGraph mock)

The center-mode reading surface for "what connects": inbound | subject | outbound,
1-hop default, self-describing cards, count-labeled short connectors, direction always
explicit. High-degree subjects group rows by relation kind / scope / claim status with
per-group expansion (never 187 edges at once). Boundary aggregation + breadcrumb
re-root + keyboard navigation + real dialog/focus management (when modal-less, it IS
the canvas mode; no hidden-shortcut-only entry).

### D32 — Change Trace as bounded event projection

- project(event) yields: changed anchors + observed anchor-to-anchor paths + direct
  observed 1-hop neighbors (real expansion, not the anchor-induced subgraph) + boundary
  aggregates. Ancestors NEVER enter the lit set for viewport math; the event viewport
  is the projection's own bbox (root pollution is a defect class, now tested).
- The rail is the primary narrative and DRIVES the canvas: selecting a rail group/step
  focuses that slice of the projection. Wide diffs: rail narrates; the canvas shows the
  current group only; the tree shows repo-wide location.
- Every rail step carries constituent claim IDs, source revision, observed_at,
  derivation, confidence, freshness, disclosure, omitted/aggregated counts.

### D33 — Trust + kernel completeness + routing rules

- **Kernel completeness:** display budgets may exist ONLY in projection/render layers.
  Compile-time truncation (the MAX_DECLS_SHOWN=34 defect: 151 declarations + 333 calls
  silently deleted) is a D7 violation — the logical model is always complete.
- **Aggregate trust:** an aggregated edge/step carries {relationKind, count,
  constituentClaimIds[], evidenceRevisions[], derivations[], confidenceSummary,
  freshness, disclosure, omittedCount} — never "count + first claim id". Projection
  identity includes evidence identity (or splits structural/evidence ids). Until this
  lands, canvas aggregates must not be presented as claim-backed.
- **Data-state honesty:** live-vs-snapshot fallback is surfaced, never silent;
  /api/generation reports current state, not the startup snapshot.
- **Edge routing:** routed sections/bend points from the layout engine are consumed and
  drawn (ports explicit, labels on routed sections); aggregate edges show kind + count
  and expansion replaces them with constituents. Straight center-to-center lines are
  retired everywhere.

---

## Amendment 2026-07-14 — Relationship-first geometry (D34–D41)

Maintainer ruling after the D26 canvas verdict, ratified against fresh measurements of the
real store (queries replayed 2026-07-14; every number below was produced by a query, not
carried from a document). This section states HOW the four-state canvas is laid out. On
conflict with any earlier section, THIS section wins.

**North star (maintainer, verbatim intent):** the Code Atlas's first job is to make the
provable relationships between code visible, walkable, and understandable. Layout organizes
the relationships FIRST and places the files afterwards; directories provide supporting
background only. Every relationship must be distinguishable at real zoom, and every key code
name must be readable. Determinism, capacity limits, and directory information are
CONSTRAINTS — they are not the point of the map.

### Measured ground truth this amendment rests on

| Measurement | Value | Consequence |
|---|---|---|
| connected components of the file relation graph (imports + lifted calls) | **3; the giant one holds 439/447 = 98.2%** | "relationship cluster" is NOT a scoping primitive — there is exactly one cluster |
| cyclic SCCs at file grain | **5 SCCs, 17 files (3.8%); largest = 6 files** | the dependency graph is 96% a DAG — layering by dependency direction is well-defined nearly everywhere |
| `calls` links that are intra-file | **2,153 / 4,228 = 51%** | a file-grain-only canvas discards half the call evidence |
| declarations in one scope (`packages/core/src`) | **1,093** | a declaration-only canvas of a scope is unreadable |
| cross-scope vs in-scope decl edges (`packages/core/src/store`) | **228 vs 58** | boundary aggregation dominates; it is structural, not decorative |
| declaration fan-in | median 1 · p99 12 · **max 358 (`push`)** | no lane-separation scheme makes 358 edges distinguishable; grouping is a precondition, not a polish step |
| parallel sym→sym call links | **0 (every pair has exactly one)** | overlapping "calls" lines were never parallel edges — they were distinct edges sharing one channel |
| decl-bearing files with zero visible relation | **106 / 535 = 20%** | the "no visible route" set is real and sizeable; it must be honest, not hidden |

### D34 — Relationship-first layout

Positions are decided by relationships, not by paths. The layout engine organizes the
relationship skeleton first and then places code atoms where they best explain that skeleton.
Alphabetical path order, directory nesting, and quantized lots may NOT drive primary
coordinates. (This is the positive statement of what D26 killed.)

- Space direction expresses dependency direction: callers/importers upstream, callees/imported
  downstream, along one consistent axis.
- Cycles are laid out as one block; a false ordering is never fabricated for them. Only 17
  files are cyclic — this is a small, explicit case, not the general one.
- Independent relationship groups are laid out separately and then arranged as wholes.
- Determinism is retained as a CONSTRAINT: identical data yields an identical layout; input
  array order never changes the result; focus/search/hover never re-layout; adding parallel
  evidence never moves an atom. Relationship-first layout must ALSO be deterministic — but
  determinism is never bought back by returning to a directory grid.

### D35 — Directory selects; relationships position

The scope (a directory) is a SELECTOR: it decides WHICH atoms enter the bounded projection.
It has no authority over WHERE they sit. This resolves the apparent conflict with the north
star: there is only one relationship cluster in this repo (98.2%), so relationship clusters
cannot bound a projection; directories can.

Folder identity survives as a WEAK BACKGROUND HULL only:

- a hull is drawn only where same-directory atoms happen to land adjacent after the
  relationship layout;
- same-directory atoms that the relationship layout separates are NOT dragged back together,
  and no giant box is stretched across the map to contain them;
- a hull never moves an atom, never obstructs edge routing, and never decides whether a
  relationship may be drawn;
- full paths remain available on the card, in the inspector, and in the Evidence Rail.

### D36 — Compound grain: the declaration is the atom, the file is a container lot

Restates and enforces D7 (the superseded assumption A1, "canvas grain stops at FILE level",
is void — it was never the ratified model).

- The atom is the declaration (`function | method | class | const`); a file with no live
  declaration is its own fallback atom.
- A file is a CONTAINER LOT, not an atom. Collapsed, it presents aggregate edges with counts.
  Expanded, it reveals its declarations and the real symbol→symbol edges among them.
- Layout is hierarchical (ELK `hierarchyHandling: INCLUDE_CHILDREN`): file containers are laid
  out by dependency direction; declaration children are laid out inside them; cross-container
  edges are routed through the hierarchy.
- This is what preserves the 51% of call evidence that is intra-file: it is not discarded, it
  is revealed on explicit expansion.

### D37 — Routing IS layout, not post-processing

Edges are not decoration applied after coordinates are frozen. Node placement, port
assignment, and edge channels are computed by ONE process.

- The layout engine's routed edge sections / bend points are CONSUMED and drawn (D33). A
  reference implementation that computes orthogonal routing and then discards it, drawing
  center-to-center curves instead, is the failure mode — do not reproduce it.
- Ports are explicit: edges fan out from the source and fan in to the target as separate
  approaches, not as one merged trunk.
- Edges that share a trunk get stable, separate lanes; lane order is deterministic across
  refreshes and input reorderings.
- ELK input node size MUST be the real rendered card size. Feeding the engine a fixed box
  while rendering a different one silently corrupts every spacing guarantee.

### D38 — Edge labeling economy

- `calls` and `imports` are distinguished by stroke, not by a permanently printed word.
- A relation-kind label is NOT printed on every edge by default; a dense region must not become
  a pile of the word "calls".
- On focus/hover of a route, that route's label, kind, count, and provenance appear. One
  relationship is highlighted for reading at a time.
- Aggregate edges show kind + count; expansion replaces the aggregate with its constituents.
  Parallel evidence is aggregated into ONE relationship — visual multiplicity is never
  fabricated (measured: there are zero parallel symbol→symbol call links; any perceived
  "stacked calls lines" were distinct edges sharing a channel, which D37 fixes).

### D39 — Readable node sizing

- Node size is derived from the real content: actual name length and actual child count. Fixed
  lots/atoms are retired.
- Declaration names (`function`/`const`/`class`/`method`) are readable first. Long names may be
  ellipsized or wrapped under control, never chopped into unrecognizable fragments.
- Full content survives in `title`, the inspector, and the accessibility label.
- File name, full path, declaration kind and declaration name carry a clear visual hierarchy.
- Dense files get real internal spacing. Shrinking the font or compressing the card to force
  content in is forbidden.

### D40 — Bounded first, readable second (and the honest periphery)

The promise "every route is distinguishable and every name readable" applies to the set that
SURVIVES budgeting — it is not a promise to display everything. Aggregation, grouping and
budgets are therefore preconditions of readability, not optional polish. With a measured
max fan-in of 358, this is arithmetic, not preference.

- High-degree subjects group by relation kind / scope / claim status, with per-group expansion
  (D31). Grouping is mandatory above the budget, not a nice-to-have.
- Every omission is disclosed with an exact count and an expansion handle. A silently truncated
  view is a defect of the same class as compile-time truncation (D33).
- **No visible route, honestly placed** — the same rule at both grains:
  - a FILE that is relevant to the current projection but carries no visible `calls`/`imports`
    relation goes to a labelled peripheral "no visible route" area — never stuffed into the
    centre as an isolated lot, never silently dropped (measured: 106 of 535 decl-bearing files);
  - a DECLARATION inside an expanded file that carries no visible relation in this projection
    collapses into a `+N more (no visible route)` handle rather than being rendered as an
    isolated card (measured: `store.ts` holds 115 declarations — no ordering could make them all
    readable, and importance ranking is forbidden pre-Artifact-2 by D25).
  - Both remain reachable via search, the Evidence Rail, and the inspector.
- The selection of what is omitted is MECHANICAL (degree in the current projection), never a
  judgment of importance. Importance ranking stays behind the Artifact-2 gate (D19/D24/D25).

### D41 — Acceptance is human sight, not arithmetic

"The data differs" does not mean "the picture is readable". None of the following, alone or
together, constitutes acceptance:

- routed path arrays differ between edges;
- label anchor points differ;
- node rectangles do not mathematically intersect;
- the result is deterministically reproducible.

Those are FLOORS. The gate is: on a real page, at a real zoom, on the real corpus — routes are
visually separable, text does not appear to overlap, a user can follow a route with their eyes,
and a genuinely dense real file remains readable. Screenshots at fixed viewports (current corpus
and the 10x class) are reviewed by the maintainer; the maintainer's sight is the final arbiter.
Mechanical assertions (screen-px label size floor, minimum lane separation in screen px) are
necessary and never sufficient.
