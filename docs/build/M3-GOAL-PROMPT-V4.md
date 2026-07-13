---
status: superseded
review_after: 2026-08-09
note: SUPERSEDED 2026-07-13 by M3-GOAL-PROMPT-V5.md after the triple-audit canvas verdict (M3-UI-LAYOUT-BRIEF D26-D33). Original note: M3 build work order v4 (P43), amended 2026-07-12 evening per P44 (D22-D25 — Event
  Projection, Evidence Rail, Change Trace naming gate, coordinate-system completeness).
  Supersedes M3-GOAL-PROMPT-V3.md — the v3 IA competition is OVER (D2): the information
  architecture is now RATIFIED in docs/design/M3-UI-LAYOUT-BRIEF.md (D1-D25) and both
  implementers build the SAME design, competing on implementation quality only. Any v3
  order still in an implementer's hands is VOID. This EXACT text is handed verbatim to
  both implementers (dual-track, not orchestrated).
---

# M3 Build Goal v4 — `ctx guide`: one ratified design, two implementations

You are an implementing agent for **ctx** M3. Two implementers receive this same order and
build independently; the reviewer judges both, merges the winner (or grafts), and owns the
acceptance bar — you make it green, you never weaken it.

## What changed since v3 (read as negative space)

- v2 died on a live drive (P40): fixture-green proved nothing; canvas was vacuous; search was
  dead. Its lessons (R10-R13 data/auth/lifecycle fixes, real-drive acceptance) carry verbatim.
- v3 asked you to design the IA yourself. That competition is over: the IA was designed and
  ratified separately (P42/P43). **You no longer design the information architecture — you
  execute it.** Deviating from the ratified design is a spec violation, not creativity.
- P40's R14 ban on "any global layout over the full entity set" is formally AMENDED (P43): a
  complete persistent **code** Atlas is required — as a LOGICAL model. The renderer must only
  ever receive an LOD-bounded visible slice (D7/D12). The bans that remain: a mixed
  seven-kind global graph; mounting the full logical set in React Flow; kind-count-box
  canvases; any skin system.

## Binding design authority (read in this order; do not re-decide)

1. `docs/design/M3-UI-LAYOUT-BRIEF.md` — THE design: D1-D25 including the 2026-07-12
   reconciliation amendments (D8 ladder, D19 reachability view, D20 anchor durability, D21
   gated annex) AND the 2026-07-12 evening amendment (D22 hard-anchor event projection, D23
   Evidence Rail, D24 naming gate, D25 edge stratification). Stack (D1), code-center canvas
   (D5), quantized directory Atlas (D9), viewport/generation behavior (D10), edges/lenses
   (D11), renderer seam + merge-blocking budgets (D12), shell/routes (D13),
   selection/search/keyboard (D14), Subject/trust grammar (D15), Inspector (D16), export
   (D17). "Remaining implementation decisions" listed there are yours; everything else is
   fixed.
2. `PRODUCT-DESIGN.md` §3 (claim contract — the ONLY status/derivation/confidence vocabulary
   you may render) + §11 (what M3 is allowed to be).
3. `packages/core/src/serve/` (`envelope.ts`: extend `renderEnvelopeTerse`'s glyph grammar,
   never fork it), `packages/core/src/select/`, `packages/core/src/ingest/` (`RefreshEngine`
   for the R10 startup catch-up).
4. Reference checkouts under `.research/` (understand-anything two-stage layout, gitnexus
   negative result). Lift ideas, not code.

## Hard guardrails (carried from v3 verbatim, still binding)

- Non-mutating: no route writes the store; curation renders exact copyable CLI commands.
- Loopback + cookie auth (R12) + zero egress; all assets bundled; `assertNoEgress` armed.
- Lifecycle (R13): no beacon teardown; Ctrl-C + idle backstop (default 2 h, `--idle-ms`).
- Data-first (R10): real store on startup with budgeted refresh catch-up; empty state names
  `ctx sync`; `--fixture` NEVER touches the real store.
- Fixture-verification ban (R11): acceptance includes a cold real-repo drive.
- In-process core; projection kernel with core-owned typed DTOs embedding `ClaimEnvelope`;
  golden JSON transcripts; declared budgets + disclosed omissions in every projection.
- Envelope rendering: color budget spent ONLY on claim semantics; provenance-or-no-render;
  disclosed gaps; NO LLM narrative; DR-01 accelerator banner standing.
- Repo rules: pnpm only; engines untouched (O-37 not yours); erasable-TS in core/cli (Vite
  app exempt); conventional commits lowercase; living-repo tests assert presence/drillability
  never ranking; `TK_SHIM_DIR` unset in tests; EBUSY-safe cleanup; generous CI timeouts.

## Real-scale input

Design for the real store (~9.6k entities / 21.7k claims / 19.7k links at 2026-07-11 sync;
1,332 files, 535 with declarations at the 07-12 snapshot — re-query before hardcoding) AND
for 10× synthetic. D12's budgets are MERGE-BLOCKING on both.

## Build route (slices in dependency order)

| # | Slice | Lands |
|---|---|---|
| **5a** | Perf spike (gate) | Throwaway probe: quantized-Atlas projection + React Flow behind `GraphRenderer`, fed real projection JSON and 10× synthetic. Meets D12 budgets or reports the WebGL far-level fallback decision with numbers. PLUS (D22/D25 amendment): render ONE real diff event of this repo as a lit route on the dimmed Atlas — a SHOW page for the maintainer's "road network vs hairball" ruling. NO production UI before this gate is green (M3 brief readiness gate 5). |
| **5b** | Server + data | V3's 4a verbatim: cookie auth + clean URL (R12); lifecycle (R13); startup refresh + empty state + `--fixture` isolation (R10); acceptance wired as todos. |
| **5c** | Atlas core | LOD/spatial compiler (quantized directory regions, footprint buckets, stable packing), bounded visible slice, semantic zoom + hysteresis, minimap, viewport/generation behavior (D10), Recent lens default, `Fit repo`. |
| **5d** | Find + Subject | Omnibox (kind-grouped, map-first destinations, multi-anchor rule), keyboard Navigator, Subject dossier for all seven kinds with evidence drill as inspector push/pop stack (D14/D15). |
| **5e** | Attachment persistence (D6/D8/D20) | The narrow core amendment, folded in from D6: persist deterministic doc-mention→code links, memory anchors, decision→code — via the amended three-rung ladder (symbol → file → explicit directory; ambiguity stays Unanchored; LLM/similarity NEVER selects); anchor records carry evidence (path/span + rev); per-sync repair pass; unrepairable → needs-review. This is the ONLY sanctioned store-schema change; everything else in ingest stays untouchable. |
| **5f** | Knowledge + lenses + Timeline | Attachment badges (kind-glyph/count, at their anchor's region level, aggregate upward), unanchored shelf (queue-only, never fake nodes), remaining lenses (Churn/Co-change/Review/Conflict), D19 reachability view (labeled NOT-impact), `#/timeline` (D13). |
| **5g** | Inspector + trust | Virtualized workbench tabs (Needs Review / Conflicts / Unanchored / Push Preview / Health), exact CLI command copy, trust legend overlay (D15/D16). |
| **5i** | Event projection + Evidence Rail (D22/D23/D24) | Hard-anchor events carried in the URL (`#/?diff=…`, `#/?sym=…`, `#/?q=…`; open-concept queries are NOT events); a pure deterministic core kernel `project(event, atlas)` → typed DTO (lit nodes, lit observed paths, viewport, lens) with golden JSON transcripts — same event + same generation = identical projection; everything outside the projection dims, the map stays present; the diff-event surface is named **Change Trace**; the Evidence Rail is a narrow event-scoped ordered rail — MECHANICAL traversal order only (hop distance from anchors, grouped by edge kind: anchors → contains → calls/imports → k-hop reachability → touches/references toggle), each step click-focuses the canvas and carries edge type + provenance; `ctx guide` accepts event flags and prints the matching deep link (deep links are the PRIMARY entry; cold `#/` stays D10's recent-hotspot). Rail never contains behavior summaries, test-gap inference, importance ranking, or generated prose. |
| **5h** | Export + closer | Three export purposes (`full`/`focus`/`archive`) through one `ExportSpec` + one snapshot builder; browser dialog + CLI wizard equivalence; export-diff green (D17); perf numbers recorded on real + 10×; the cold real-repo drive written up scenario by scenario (5h remains the LAST slice; 5i lands before it). |

## Acceptance

All v3 gates carry unchanged: G-readonly · G-loopback · G-auth-ux · G-lifecycle ·
G-empty-state · G-fixture-isolation · G-egress · G-provenance · G-honest-gap · G-budget ·
G-one-render-path · G-perf-recorded. New/changed:

- **G-perf-budget (NEW, merge-blocking)** — D12's table on a fixed production build: first
  interactive ≤1 s current / ≤3 s at 10×; expand ≤100 ms / ≤250 ms; search ≤75 ms / ≤150 ms;
  pan/zoom ≥50 fps; no >500 ms main-thread long task. Measured from projection availability;
  real store AND 10× synthetic.
- **G-anchor-hygiene (NEW)** — 5e's ladder golden tests: exact citations attach at the most
  precise supported rung; ambiguity lands Unanchored; repair pass migrates a scripted rename
  and queues an unrepairable one.
- **G-naming-gate (NEW, D24)** — a grep-able copy test over all UI strings: no
  `impact / affected / blast radius / risk / breaks` wording anywhere pre-Artifact-2; the
  diff surface is labeled **Change Trace**; the D19 view is labeled **Static
  Reachability**; `co-changed` copy reads "historically co-changed" (correlation, never
  causal). Vocabulary is part of the gate — a wording violation is a spec violation.
- **G-event-determinism (NEW, D22)** — golden tests: the same event URL against the same
  generation yields byte-identical projection JSON; an open-concept query is rejected as an
  event with a disclosed reason (guided to plain search), never silently half-projected.
- Scenarios on THIS repo's real store (drive evidence in the deviation log): v3's S1-S10
  carry, reinterpreted onto the ratified surfaces, plus: **S11** zoom-out shows the full
  quantized Atlas with stable positions across two sessions of the same generation; **S12**
  a new generation during reading pins the current view and offers a switch prompt; **S13**
  the reachability view from `claimEnvelopeFor` renders k-hop with derivation labels and the
  not-impact disclosure; **S14** `#/timeline` filters by kind and navigates to a code anchor;
  **S15** a deterministically anchored memory shows its badge at the right region level and
  drills to provenance; **S16** a real diff-range deep link opens Change Trace: touched
  nodes + observed paths light up, the rest dims, the Evidence Rail lists steps in
  mechanical order and each step click-focuses the canvas with edge type + provenance;
  **S17** a symbol/exact-text event deep link projects its hit path only (no container
  flood); **S18** a wide fan-out diff (20+ files) stays navigable via the rail even where
  the lit map is dense; narrow-viewport mode keeps search/Subject/Timeline/Inspector
  usable.
- Suites: core + cli stay green; component tests; Playwright smoke covers G-auth-ux + S2→S3.

## Branch / worktree rules (dual-track)

Fresh worktree from **latest** `origin/feat/1.0.0` (re-fetch first). Branch:
`m3/v4-claude` or `m3/v4-codex` per your identity. NEVER push `feat/1.0.0`; the reviewer
merges. Codex track: no commits in linked worktrees — leave the tree clean and report.

## Deliverables

Working tree + deviation log (every spec deviation vs the M3 brief recorded with rationale;
acceptance self-verified item by item; real-repo drive writeup; perf recorder numbers real +
10×; reference-findings note for UA/gitnexus).

## Explicitly OUT of scope

Everything M4 (`M4-PROJECT-UNDERSTANDING-BRIEF.md`): connectors, behavior IR, generation,
anchor PROPOSALS (slice 3a — LLM-suggested anchors are M4; you build only the deterministic
ladder) · Impact-Set / Revision Compare / Serve Audit (D21 gated annex) · LLM anything ·
token/savings pages · engines bumps · MCP tool changes · any store write beyond 5e's
sanctioned schema slice. From the D22-D25 amendment, additionally out: open-concept events
("how does X work" → M4 Event Compiler) · auto main-route / importance ordering ·
behavior-change summaries · test-gap inference · architecture-violation detection · any
NEW edge kind beyond the existing seven (D25 gap loop only — a V0-confirmed missing-
evidence gap is the sole entry ticket).
