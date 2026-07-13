---
status: active
review_after: 2026-08-10
note: M3 build work order v5 (Fable track). Supersedes M3-GOAL-PROMPT-V4.md after the
  2026-07-13 triple-audit canvas verdict (M3-UI-LAYOUT-BRIEF D26-D33). V4's slices
  5a-5c were built and then the canvas model was killed by live drive + audits; this
  order rebuilds the canvas on the four-state model and re-slots the surviving V4
  slices. Any V4-based canvas work still in flight is VOID.
---

# M3 Build Goal v5 — `ctx guide`: four-state canvas rebuild

You are an implementing agent for ctx M3, Fable track. The reviewer (orchestrator)
verifies every slice with a live browser drive on the real corpus before it lands —
green tests alone have twice coexisted with an unusable product here; they no longer
count as done.

## What changed since v4 (read as negative space)

- The persistent directory-position canvas is DEAD (D26): 94.7% empty world, a 6x
  zoom dead-zone before the first readable label, median edge = 9.4% of the world
  diagonal, 12k crossings per 600 edges, zero lit edges at the flagship deep link's
  own viewport. Do not rebuild it, quiet it, or decorate it.
- Three mechanical P0s were found beneath the design failure and must die first
  (slice 6a): compile-time declaration truncation, event-viewport root pollution,
  first-claim-only aggregation.
- The FocusGraph ("Connections") mock and the Evidence Rail were judged the two
  defensible surfaces. They get promoted, not rebuilt.

## Binding authority (in order; do not re-decide)

1. docs/design/M3-UI-LAYOUT-BRIEF.md — D26-D33 (four-state canvas, shell, trust rules)
   override earlier sections on conflict; D7/D10/D12/D14/D15/D17/D24 stand.
2. PRODUCT-DESIGN.md §3 (claim contract) + §11.
3. Surviving code: packages/guide kernel data model (compile tree/decls MINUS packing-
   as-geometry), atlas/event.ts DTO + resolveEvent, FocusGraph.tsx, EvidenceRail.tsx,
   data/source.ts seam, packages/cli/src/guide server (auth/lifecycle/fixture), the
   test infra. Reuse; never fork.
4. .research/understand-anything dashboard — port its GEOMETRY paradigm (bounded
   per-view ELK layered layout, fixed readable cards, drill), not just its decorations.
   Its own gap: mergeElkPositions drops ELK edge sections — we DO consume routed
   sections (D33); do not copy that omission.

## Experience contracts (the definition of done for the whole rebuild)

E1 First 10 seconds: a cold open shows named module/package cards + a legible left
   tree. Zero unlabeled rectangles anywhere. A stranger can say what this repo
   contains without touching the mouse.
E2 Any zoom level: every visible node carries a readable name (screen-px >= 10px) or
   is an explicitly-counted aggregate ("+N", boundary node). Zoom NEVER changes what
   set of things is projected — only explicit drill/expand does.
E3 Connections: from any file/symbol (search, tree, card, rail), within two
   interactions the user sees who calls/imports it and what it calls/imports, with
   directions and counts, no line crossing another node's body, far ends always
   on-screen or named in a boundary node.
E4 Change Trace: opening a diff deep link lands on the event's own bounded projection
   (never whole-repo), the rail narrates in mechanical order, and clicking a rail
   group/step refocuses the canvas to that slice.
E5 Trust: every aggregate count can be expanded to its constituent claims; the top bar
   always shows revision/generation and live|snapshot|stale truthfully.

A slice is done when its experience contract lines hold in the reviewer's drive on the
real corpus — report your build against these lines, not against mechanism checklists.

## Build route

| # | Slice | Lands |
|---|---|---|
| 6a | Data honesty P0s (no UI) | Kill MAX_DECLS_SHOWN in compile (all 4,205 decls + all resolvable calls in the model; display budgets move to projections; census numbers correct). Fix event projection: ancestors never in the lit set for viewport math; add direct observed 1-hop neighbor expansion (real, not anchor-induced subgraph); event viewport = projection bbox (root-pollution regression test). Claim-set aggregation per D33 (constituentClaimIds[] etc. through mapper -> compile -> projection; projectionId gains evidence identity). Surface live|snapshot|stale through the data seam; /api/generation reads current state. Update goldens; real-corpus replay tests assert completeness (5,729 nodes, 4,026 resolvable calls). |
| 6b | Shell + Overview | Four-state shell per D28 (top bar, left tree+attention+rail dock, center, right inspector; independent scroll owners with height budgets; perf HUD behind a dev flag; minimap deleted; spike chrome Scale/Variant/Sweep removed from product surface — variant system stays for theming only). Overview cards per D29 (deterministic content only). Left tree: full directory tree, Recent/event highlighting on rows, click -> Scope Graph. Narrow (<1100px): tree and inspector collapse to drawers. Title/copy: product naming, D24 gate. |
| 6c | Scope Graph | elkjs (D1 already sanctions it): async, cancellable, cached by (scopeId, generation). Bounded per-scope projection; ELK layered + LAYER_SWEEP; CONSUME routed sections/bend points into the edge renderer (ports explicit, labels on routed sections); cross-scope boundary nodes with counts; explicit expand; budgets + omission handles; anchors/lit always survive. Perf sanity recorded (not gate-blocking this phase, per maintainer priority). |
| 6d | Focused Connections promotion | FocusGraph becomes center mode 3 (not a modal): grouped rows for high-degree subjects (by relation kind/scope/status, per-group expand), keyboard nav + focus management (visible entry affordances; no hidden-shortcut-only paths), breadcrumb re-root, boundary aggregation, full claim-set provenance per connector, "show in scope"/"show in tree" round-trips. |
| 6e | Change Trace rebuild | D32: bounded event projection on the 6a kernel; rail docked left, drives the canvas (group/step click-focus); wide-diff behavior = rail narrates + canvas shows current group; per-step full provenance; ctx guide prints the deep link (kept from 5b/5i intent); G-event-determinism goldens updated; G-naming-gate re-verified. |
| 6f | Find + Subject (V4's 5d, re-slotted) | Omnibox per D14 (kind groups, counts, per-kind ranking, destinations: code -> Scope/Connections focus, multi-anchor fit+list, unanchored -> Subject); #/s/:kind/:id Subject dossier per D15 with renderEnvelopeTerse extension (additive, never fork); search results layer never occludes the just-focused target and clears on activation. |
| 6g+ | V4's 5e (core anchor ladder), 5f (knowledge+lenses+timeline), 5g (inspector tabs), 5h (export closer) | Re-issued after 6a-6f land, adapted to the four-state canvas; unchanged in product intent. |

## Process rules (bind every slice)

- One slice per builder run; the tree is left uncommitted; the REVIEWER drives the
  real corpus against the slice's experience-contract lines and only then commits.
- Test-blindness mitigations are part of each slice: readability assertions computed
  in screen px (label size = font x zoom math), real-corpus replay tests (never
  fixture-only for census/completeness claims), and a Playwright smoke (now sanctioned:
  headed/headless Chromium screenshots at fixed viewports for the reviewer's diff) —
  add playwright as a devDependency in 6b.
- Builders report outcomes against experience contracts; a mechanism implemented
  without its user-visible line demonstrated is not done.
- Repo rules unchanged: pnpm only; no new deps beyond elkjs + playwright without
  reviewer sign-off; erasable TS (Vite app exempt); conventional commits (reviewer
  commits); D24 naming gate; zero egress; non-mutating; TK_SHIM_DIR unset in tests.

## Explicitly OUT of scope

Everything M4 (LLM anchors, generated prose, role summaries on cards); Impact-Set /
Revision Compare / Serve Audit (D21 gate); token/savings pages; engines bumps; any
store write beyond the already-sanctioned 5e slice when it is re-issued.
