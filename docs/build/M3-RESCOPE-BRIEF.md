---
status: frozen
review_after: 2026-08-08
note: RATIFIED 2026-07-11 (P39; R1–R9 incl. R9 export retained). O-25 closed — work order issued as
  docs/build/M3-GOAL-PROMPT-V2.md (handed verbatim to both implementers). Old M3-GOAL-PROMPT.md /
  M3-ACCEPTANCE.md stamped superseded (DR-16). Same-day amendment — the R-slice MERGED @162be034
  and the ClaimEnvelope landed (core/src/serve/envelope.ts incl. renderEnvelopeTerse glyphs): R6's
  "pre-R-slice proxy tag" narrows to "consume the landed envelope; disclose null/compat-shadow
  fields (authority) — never fake"; §8 merge gate simplified accordingly.
---

# M3 Re-scope Brief — the on-demand local render surface ("human twin")

Authority chain: `PRODUCT-DESIGN.md` LAW §3 (claim contract) + §11 amendment (P37: M3 recast,
retirement rejected) · `CONTEXA-IMPL.md` M-plan v2 (M3 lands AFTER the R-slice) · O-25 ·
maintainer rulings 2026-07-11 (captured in §1, this conversation).

## 1. Rulings captured (2026-07-11, maintainer)

- **R1 — non-mutating maintained.** FORK-1 / G-readonly re-affirmed. The server never writes
  the store. Curation actions are DISPLAYED with their exact CLI command
  (`ctx memory confirm|retire`, `ctx push pin|veto`), never executed by a route.
- **R2 — formal M3, not a throwaway prototype.** Work happens as the real `packages/guide` +
  the `ctx guide` server in `packages/cli`, on an M3 branch. Merge is gated (§8); the code is not.
- **R3 — entry surface = flat flow canvas** in the style of understand-anything / GitNexus:
  the whole graph state spread out as an interactive tiled canvas with an omnibox on top.
  Not a nav-menu site. (UA precedent verified: React Flow canvas + side detail panel.)
- **R4 — merge pages by category.** The old six pages survive as CONTENT OBLIGATIONS,
  redistributed into three surfaces (§3): understanding pages merge into one Subject surface;
  inspection pages merge into one Inspector surface.
- **R5 — the seven approved.** Six original pages + Impact-Set (gated, Artifact 2) all carry;
  none retired. Divergence set (§3.4) also approved.
- **R6 — real data + honest gap labels; no mock.** The guide renders this repo's live store
  through in-process core. Envelope fields the R-slice has not yet built (derivation/confidence
  split, disclosure, reason-classed freshness) render their current proxy (`authority`) visibly
  tagged `pre-R-slice`. No LLM narrative: structured claims ARE the answer (generative guide
  remains a gated follow-on, out of M3 core; zero egress stands).
- **R7 — stack: React 19 + Vite + @xyflow/react (React Flow)** in `packages/guide`.
  Rationale: agent fluency (builders are agents; UI rounds-per-defect is a tracked metric),
  React Flow maturity for the canvas + Impact-Set, component ecosystem for variant iteration.
  Svelte/Solid rejected on realized-advantage grounds, not capability. Erasable-TS exemption
  applies to the Vite-bundled app (core/cli unaffected).
- **R8 — design language by multi-model competition, no preset direction.** Input = this brief
  + LAW §3 only (product design, never an aesthetic direction). Producers: Claude builder
  agents ×3–4 variants AND Codex (GPT-5.6 sol-ultra) ×3–4 variants, same routes, same real
  projection data, differing only in the design-system layer. Maintainer adjudicates; graft
  best ideas; losing variants deleted. Old visual language (serif/white-card/cool-gray) is
  discarded; only `open.ts` discipline (detached-open, `CTX_NO_OPEN`, 0600) is inherited.
- **R9 — snapshot export retained** (ruled 2026-07-11 with ratification): `ctx guide --export <dir>`
  stays — form A returns as form B's export mode, self-contained HTML + inlined JSON rendered
  through the SAME components; the export-diff test (old C9, one-render-path) carries as a binding
  gate.

## 2. Architecture (ruled earlier in the same round)

- **Form B — ephemeral in-process loopback server.** `ctx guide [ref]` binds `127.0.0.1` on a
  random free port with a **bearer token** (no route resolves without it — loopback alone does
  not stop localhost probing / DNS rebinding), opens the system browser detached, and
  auto-shuts-down on idle/disconnect. "On-demand, not a standing destination" is mechanical,
  not aspirational.
- **Core as in-process functions.** The server imports `@contexa/core` and calls
  `serveContext`/`serveSearch`/store reads directly. NEVER a per-request child process
  (Windows AV + cold-start tax; 0.3.2 Keystone lesson).
- **Projection kernel in core (carried, binding).** The private `diag` structs
  (`SelectionEnvelope`, `SectionResult`, `SearchResult`, `RefreshReport` — today the G-1..G-7
  test surface, "NEVER serialized to host") get promoted into typed public projection DTOs.
  These DTOs are **unified with the R-slice minimum claim envelope** (DR-07/31); the R-slice
  owns the envelope's field authority, M3 owns its terse rendering. Per-surface traversal
  budgets carried (profile-budget: declared edge predicates, depth, node caps, disclosed
  omissions).
- Rejected forms stand: A (compile-a-blob — no real-time; may return as an export mode, §9)
  and C (core-in-WASM in the browser — cannot read the local repo/store.sqlite).

## 3. Information architecture — three surfaces + a gated annex

### 3.1 Canvas (entry)
The whole graph, flat: React Flow tiled canvas of sources → entity clusters → hot areas, with
live badges (needs-review count, open conflicts, per-source freshness/coverage — absorbing old
**Overview**'s stats and the doctor/E8 signal). An **omnibox** on top (absorbing old **Search**:
cross-source, kind-filtered). Click/search anything → side panel preview → drill into Subject.
Global lenses on the canvas replace standalone pages: a *time lens* (decision/supersession
timeline overlay — old **Decisions**, global view) and a *churn lens* (hot areas + co-change
clusters — old **History**). Whether lenses suffice vs. standalone views is a variant-stage
question (§9).

### 3.2 Subject (understanding, merged)
Biography-of-anything: subject kinds = symbol / file / doc / memory note / decision. Sections:
facts with evidence drawer (old **Entity Biography**, the `context(ref)` human twin) ·
subject-scoped decision chain (old **Decisions**, scoped) · subject-scoped history/co-change
(old **History**, scoped) · bounded neighborhood mini-graph. Every fact carries the §3 envelope
(1-glyph, hover expands); provenance-or-it-does-not-render carried.

### 3.3 Inspector (inspection, merged)
One worklist surface, tabbed: **review queue** (needs-review + exact CLI commands) ·
**conflicts** (open conflicts as state, reason-classed, resolving commands shown) ·
**push preview** (verbatim would-be digest + size budget + pin/veto state) ·
**memory browser** (zones mainline/overlay/local, origin, lifecycle chains) ·
**health** (per-source gen/cursor state, E8 ops signals). Absorbs old **Knowledge** + the
divergence set's inspection pages.

### 3.4 Gated annex
- **Impact-Set** — decision-artifact; ships only WITH Artifact 2 (P37). Until then: reachable
  behind a banner "V1→V2 gated (Artifact 2)"; canvas real-graph rendering is allowed to
  pressure-test React Flow at this repo's real scale.
- **Revision Compare** (claims changed rev A→B) — decision-artifact adjacent; same gate.
- **Serve Audit** ("what did the agent just see": replay recent `context()`/`search()` packs +
  envelopes) — approved direction; BLOCKED on a serve-log write path in core (serve writes the
  log, guide stays read-only; O-07's half-built `served_count` is the seam). Needs its own
  small work order.
- Explicitly NOT a page: token/savings dashboards — measurement belongs to the E-ladder (P38);
  review/verification moment is not a surface (P27).

## 4. Envelope rendering (the product-value core)

Claim envelope per LAW §3, rendered 1-glyph-per-dimension (DR-07 spirit), hover for detail:
`status` (resolved | conflicting | stale | unavailable | restricted | unknown) ·
`derivation` (OBSERVED | DECLARED | INFERRED) · `confidence` (CONFIRMED | LIKELY | POSSIBLE) ·
`freshness` (per-source decay class + re-verification trigger) · `disclosure` (permission
class) · evidence anchor (URI + revision/hash) · `observed_at`. Color budget is spent ONLY on
claim semantics; all other chrome stays neutral — trust marks must not compete with decoration.
Suggested glyph grammar (variant stage may propose better): derivation as shape
(solid/outline/dashed), status as hue, freshness as decay/opacity. Pre-R-slice fields: render
the `authority` proxy with a visible `pre-R-slice` tag (R6). The accelerator-not-validated
banner (DR-01) is standing pre-V1.

## 5. Design-language variant competition (R8 protocol)

1. Scaffold first: routes, projections, one unstyled-but-complete rendering of all three
   surfaces on this repo's real data.
2. Input pack per producer: this brief §3–§4 + LAW §3. No aesthetic direction, no reference
   screenshots, no named styles.
3. Tracks: Claude builder agents produce 3–4 variants; Codex produces 3–4 variants
   (model pinned explicitly to GPT-5.6 sol-ultra — config default is NOT it; pre-install deps;
   Codex cannot commit in linked worktrees — reviewer commits and attributes).
4. Variants = design-system layer only (tokens + component skins) over identical routes/data.
5. Maintainer adjudicates on the same real pages side by side; graft; delete losers.

## 6. Discipline (conforming gates, carried)

G-readonly (non-mutating, R1) · G-loopback (127.0.0.1 + random port + **bearer token**) ·
zero egress (`assertNoEgress` armed; no CDN/fonts/telemetry — all assets bundled) ·
profile-budget per surface · provenance-or-no-render · `CTX_NO_OPEN` headless + detached-open +
0600 · idle auto-shutdown · living-repo test robustness (assert presence/drillability, never
ranking/position) · pnpm only · Node floor per R-slice (22.18) · conventional commits,
lowercase subject.

## 7. Testing shape

Golden JSON projection transcripts (kernel = the main test surface) · component tests
(vitest + happy-dom) · one Playwright smoke (headless, generous timeouts per M2 CI lesson) ·
projection perf recorder per surface (latency, node/link counts, omitted counts, JSON size) on
a script-generated fixture store + recorded-not-asserted on the living repo.

## 8. Sequencing & merge gates

1. **DONE 2026-07-11**: ratified → P39 registered; old M3 docs stamped superseded; O-25 closed by
   issuing `docs/build/M3-GOAL-PROMPT-V2.md` (handed verbatim to both implementers).
2. **Build now** (the R-slice precondition is already satisfied — merged @162be034): scaffold
   `packages/guide` + projection kernel consuming the landed `ClaimEnvelope`; run the variant
   competition (§5).
3. **Merge gate**: acceptance green + envelope consumption verified (null/compat-shadow fields
   disclosed, never faked) + comprehension quiz per repo ritual. Merge → push in one go.
4. **Post-gate**: Impact-Set with Artifact 2; Serve Audit after the serve-log work order.

## 9. Open items (not yet ruled)

- ~~Snapshot export~~ — RULED RETAINED 2026-07-11 (R9): form A returns as B's export mode.
- Canvas lenses vs. standalone Decisions/History views — decide on variant evidence (slice 3b
  records whether the lens form suffices).
- Serve-log write path (enables Serve Audit; O-07 `served_count` is the seam) — registered as O-36,
  needs its own small work order.
- Node-floor mismatch: root engines `>=22.18.0` (R-slice bump) vs `packages/core`+`cli` `>=22.16` —
  registered as O-37, reconcile intentionally (M1 verified the FTS5 floor at 22.16).
- O-24 remaining ③ (extend the terse envelope to the human `context()` text) — separate maintainer
  call; M3 is the human render of the same envelope either way.
