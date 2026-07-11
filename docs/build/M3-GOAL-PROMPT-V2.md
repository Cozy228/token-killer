---
status: superseded
superseded_by: M3-GOAL-PROMPT-V3.md (P40, 2026-07-11 — first build's UI/UX and data story
  rejected on live drive; data layer ratified, UI reworked from scratch)
review_after: 2026-08-08
note: re-scoped M3 work order (P39; O-25 closed). This EXACT text is handed to two independent
  implementers (Claude builder agent AND Codex GPT-5.6 sol-ultra) — dual-track, not orchestrated.
  On conflict, docs/build/M3-RESCOPE-BRIEF.md (ratified design) wins over this prompt.
---

# M3 Build Goal v2 — `ctx guide`, the on-demand local render surface

You are an implementing agent for **ctx** M3. Two implementers receive this same order and build
independently; the reviewer (Fable) judges both, merges the winner (or grafts), and owns the
acceptance bar — you make it green, you never weaken it. M1 (base), M2 (code graph), the memory
slices, and the **R-slice** (claim-serving integrity, merged @162be034 — the `ClaimEnvelope` is
live in core) are all on `feat/1.0.0`.

**M3 is the HUMAN twin of `context()`**: an on-demand, runtime-created, LOCAL, READ-ONLY render
surface over the same graph and the same claim envelopes. It is not a standing destination — it
starts on command, serves one human, and tears itself down.

## Read first (in this order)
1. `docs/build/M3-RESCOPE-BRIEF.md` — the ratified design (P39, R1–R9): three-surface IA
   (Canvas / Subject / Inspector + gated annex), envelope rendering rules, variant-competition
   protocol, discipline gates. It is authoritative; this prompt operationalizes it.
2. `PRODUCT-DESIGN.md` §3 (claim contract — the ONLY status/derivation/confidence vocabulary you
   may render) + §11 (P37 amendment: what M3 is allowed to be).
3. `packages/core/src/serve/` — `envelope.ts` (`ClaimEnvelope`, `claimEnvelopeFor`,
   `renderEnvelopeTerse` — the landed 1-glyph grammar you extend to the web, never fork),
   `serve.ts` (`serveContext`/`serveSearch` + `diag`: `SelectionEnvelope`, `SectionResult`,
   `SearchResult`, `RefreshReport` — the private structs you promote into public projections),
   and `packages/core/src/select/` (selection engine — the guide projects from it, never
   re-implements it).
4. References in `.research/` (lift ideas, not code; this design wins):
   `understand-anything` — React Flow canvas + side panel; their `graph-layout-scaling` plan
   (dagre→ELK, container nodes, two-stage lazy layout) is the proven answer when node counts grow.
   `gitnexus` — canvas-first repo IA. `davia/web.ts` — port-detect / open-browser / graceful
   shutdown. Legacy `src/report/open.ts` — inherit ONLY the discipline (detached open,
   `CTX_NO_OPEN` headless fallback, 0600); the old visual language is DISCARDED (R8).

## Hard guardrails (binding)
- **Greenfield**: new `packages/guide` (React 19 + Vite + `@xyflow/react` + `elkjs`) + the guide
  server inside `packages/cli`. NEVER import from or modify legacy `src/`, root configs, or
  shipping behavior. `core` stays the single source of query truth — the guide is a VIEW.
- **Non-mutating (R1)**: no route writes the store. Curation actions render their exact CLI
  command (`ctx memory confirm|retire <id>`, `ctx push pin|veto`) as copyable text, never execute.
- **Loopback + token + zero egress**: bind `127.0.0.1`, random free port, bearer token — no route
  (including assets) resolves without the token (localhost probing / DNS rebinding is the threat).
  `assertNoEgress` stays armed; ZERO external requests — no CDN, fonts, or telemetry; all assets
  Vite-bundled. Idle/disconnect auto-shutdown proves "not a standing destination" in code.
- **In-process core**: the server calls core as functions. NEVER a per-request child process
  (Windows AV + cold-start tax — distributed-field rule).
- **Real data, honest gaps (R6)**: the guide renders the live store of the repo it runs in.
  Consume the landed `ClaimEnvelope`; a field that is null or a compatibility shadow (`authority`)
  renders as a disclosed gap — never fabricate, never fake. NO LLM narrative or generation
  anywhere (gated follow-on, out of scope): structured claims ARE the answer.
- **Projection kernel first**: core-owned typed DTOs (`CanvasProjection`, `SubjectProjection`,
  `InspectorProjection`, `SearchProjection`, `EvidencePacket`) promoted from the diag shapes and
  embedding `ClaimEnvelope` per fact. Golden JSON transcripts are the primary test surface; React
  components are adapters. Missing field → extend the DTO + golden first, then consume.
- **Profile budgets**: every projection declares edge predicates, depth, node caps, render budgets;
  omissions are disclosed IN the payload. The canvas stays in DOM-comfortable node counts because
  the budgets say so, not by luck.
- **Canvas seam**: the flow canvas sits behind one component boundary (renderer swappable; Sigma/
  WebGL is the named fallback if a dense lens is ever ruled in — do not build it now). Layout =
  `elkjs`; adopt container/two-stage lazy layout if fixture scale demands (UA precedent).
- **Envelope rendering**: 1-glyph per dimension extending `renderEnvelopeTerse`'s grammar; hover
  expands to the full envelope + evidence anchor; color budget is spent ONLY on claim semantics —
  all other chrome neutral. Provenance-or-it-does-not-render: every fact resolves to its evidence
  anchor via the drawer. The `accelerator — not validated` banner (DR-01) is standing pre-V1.
- **Repo rules**: pnpm ONLY (never npm/npx). Node: respect existing `engines` — do NOT change any
  engines field (the 22.18/22.16 mismatch is O-37, not yours). Erasable-TS in `core`/`cli` (the
  Vite app is exempt). Conventional commits, lowercase subject. The `.wasm`/`.scm`/`.sql` asset
  step untouched. `TK_SHIM_DIR` unset in tests; EBUSY-safe temp cleanup; generous CI timeouts.
- **Living-repo tests**: assert presence/drillability/resolvability — NEVER ranking, ordering, or
  render position (doc churn shifts them). Deterministic tier uses a script-generated fixture
  store; living-repo tier records values without asserting them.

## Branch / worktree rules (dual-track)
- Fresh worktree from **latest** `origin/feat/1.0.0` (re-fetch first — parallel sessions are
  active). Branch: `m3/rescope-claude` or `m3/rescope-codex` per your identity.
- NEVER push `feat/1.0.0`; the reviewer merges. Codex track: dependencies are pre-installed by the
  reviewer; do not attempt commits in a linked worktree — leave the tree clean and report; the
  reviewer commits and attributes.

## Build route (slices in dependency order; 3a pins every contract)
| # | Slice | Lands |
|---|---|---|
| **3a** | Projection kernel + server + shell | Typed projections + golden transcripts + per-projection perf recorder (latency, node/link counts, omitted counts, JSON bytes); loopback server (token, idle shutdown, detached open, `CTX_NO_OPEN`); Vite shell + router + the envelope glyph component. Wires ALL scenarios below as todo (acceptance-first, M2's 2a pattern). |
| **3b** | Canvas (entry) | Whole-graph tiled flow: sources → clusters → hot areas; live badges (needs-review count, open conflicts, per-source freshness/coverage, E8 signal); omnibox (cross-source, kind-filtered search) + side preview panel; **time lens** (decision/supersession overlay) + **churn lens** (co-change heat). Record in the deviation log whether the lens form suffices vs standalone pages — this feeds an open ruling. |
| **3c** | Subject | Biography-of-anything (subject kinds: symbol / file / doc / memory note / decision): facts + evidence drawer, subject-scoped decision chain, subject-scoped history/co-change, bounded neighborhood mini-graph. |
| **3d** | Inspector | One tabbed worklist: review queue (needs-review + exact CLI commands) · conflicts (reason-classed, state-not-events) · push preview (verbatim would-be digest + size budget + pin/veto) · memory browser (zones mainline/overlay/local, origin, lifecycle chains) · health (gen/cursor state, freshness, E8). |
| **3e** | Design variants (R8) | 3–4 COMPLETE skins, design-system layer only (tokens + component skins) over identical routes and live data, runtime-switchable (`?skin=`). Input = brief §3–§4 + LAW §3 ONLY — invent freely; no reference to old tk report styling; do not converge your variants on each other. |
| **3f** | Export (closer, R9) | `ctx guide --export <dir>` → self-contained HTML + inlined JSON through the SAME components; the export-diff test (live ≡ export) closes one-render-path; re-run the smoke + provenance sweep. |

## Acceptance checklist (reviewer-owned; make green, never weaken)
Gates:
- **G-readonly** — route-table sweep proves no mutating endpoint; an attempted write path test.
- **G-loopback** — binds 127.0.0.1 only; requests without the bearer token → 401 on EVERY route.
- **G-egress** — zero external requests (assertNoEgress + bundle audit: no CDN/font/telemetry URLs).
- **G-shutdown** — idle timeout and browser-disconnect teardown proven by test.
- **G-provenance** — sweep over all three surfaces on the fixture store: every rendered fact
  resolves to an evidence anchor through the drawer.
- **G-honest-gap** — null/compat-shadow envelope fields render as disclosed gaps (snapshot test);
  no fabricated value anywhere.
- **G-budget** — every projection declares its budget and discloses omissions in the payload
  (golden transcripts assert both).
- **G-one-render-path** — export-diff test green (R9).
- **G-perf-recorded** — per-projection perf recorded on fixture AND living repo (recorded, never
  asserted as a threshold).
Scenarios (wired todo in 3a, flipped green by their slice):
- C1 canvas renders sources + badges from the fixture store; C2 omnibox finds a doc, a symbol, and
  a memory note, each drillable to Subject; C3 Subject(symbol) shows facts with anchors + glyph
  envelopes; C4 Subject(memory note) shows zone + lifecycle chain; C5 time lens overlays a
  supersession chain; C6 churn lens shows co-change clusters; C7 review queue lists needs-review
  entries WITH their exact CLI command strings; C8 conflicts tab groups by reason class; C9 push
  preview shows the verbatim would-be digest + budget; C10 health shows per-source gen/cursor +
  freshness; C11 skin switch changes ONLY the design-system layer (data/DOM-structure diff clean);
  C12 export-diff (live ≡ export).
Suites: full `core` + `cli` suites stay green; component tests (vitest + happy-dom or equivalent);
one Playwright smoke (headless, generous timeouts). Fixture store is self-contained — never pin
assertions to THIS repo's live content.

## Deliverables
Working tree on your branch + **deviation log** (`implementation-notes` in your worktree's
docs/build/ area or inline) — every spec deviation recorded; self-verify the checklist item by
item in it before returning. The perf recorder's living-repo numbers are part of the deliverable.

## Explicitly OUT of scope
LLM generation of any kind · Impact-Set decision-artifact page (Artifact 2 gate — the canvas may
render the real graph; a gated-banner placeholder route is allowed, non-default) · Revision
Compare · Serve Audit (blocked on O-36 serve-log) · measurement/savings pages (P27/P38) · engines
bumps (O-37) · MCP tool changes · any write to the store.
