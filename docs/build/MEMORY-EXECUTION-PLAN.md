# Memory — Unified Execution Plan (research → implementation → sync re-architecture)

> **Why this file.** Three artifacts existed, disconnected: the research **verdict**
> (`docs/design/memory-research/REPORT-canonical.md` — what memory should be), a forward **sync
> design** (`docs/build/MEMORY-SYNC-GOAL-PROMPT.md` — how memory lives across people/branches), and no
> plan tying them. This is the plan. It sequences **two phases** and fixes the coupling that had the
> research's correctness fixes wrongly gated on a large architectural bet.
>
> **Load-bearing fact:** the two phases are **largely additive, not mutually superseding.** Phase 2
> reworks only *where memory is stored* (store-row → committed file + decision-log) and *adds*
> collaboration; almost every correctness mechanism Phase 1 builds (status filter, needs-review
> default, anchor-freshness, dedup-as-conflict, prewrite, the E-series) is **reused, not discarded**.
> So shipping Phase 1 first is not throwaway work.

## Phase 1 — Research Implementation (surgical, ships correctness, no big bets)

Directly implements `REPORT-canonical.md §5 "Must do now"`. **Independent of Phase 2**: it runs on the
current storage model (memory rows in `~/.ctx/…/store.sqlite`) and fixes the live correctness defects
now. Each item names the research decision it answers and the E-series task that guards it.

| # | Change | Surgical approach | Research decision | Eval guard |
|---|---|---|---|---|
| 1 | **Status gates pull** | Add a memory-`status` filter to selection (retired excluded, superseded down-ranked + surfaced via the conflicts section) — a filter in `select/`, alongside the existing `gen<=published_gen` check (`visibility.ts:44-52`). | D4, D6 | E3, E5 |
| 2 | **Host import → `needs-review` + wire it** | Flip `claudeImporter.ts:224` default `active`→`needs-review`; make memory `dirtyCheck` mtime-aware over the host memory dir so `sync`/`install` actually import (fixes the dead path + the false CLI text `cli.ts:242-245`). | D8, D3 | E6, EG-review |
| 3 | **Anchor-freshness pass** — **PARTIALLY LANDED by slice 2c.** `flagAnchorDrift` (`packages/core/src/ingest/code/incremental.ts:249-293`) detects reason-classed symbol-anchor drift on code re-ingest and flips anchored memory to `needs-review`. **Remaining = the E7 reconcile items** (`MEMORY-DECISIONS.md`): `body-changed` → down-rank only per A5 (today flips all three, line 279); drift must ALSO file a reason-classed `stale-suspect` **conflict** (`addConflict`), not just a `stale-reason` claim (today claim-only, lines 280-289); verify/add `file:`-anchor `target-removed` coverage. | D5, A5, E7 | E2 |
| 4 | **File `sameAsCandidate` as a conflict** | Importer (and future `remember` prewrite) calls `addConflict` so dedup is visible in both channels — today it writes only a low-confidence link (`claudeImporter.ts:236-263`). | D4, D2 | E4 |
| 5 | **`remember()` prewrite reconciliation** | Deterministic advisory over `dedup.ts`+FTS returning add / dup-candidate / supersede-candidate / needs-review; never auto-applies. Closes "manual writes silently duplicate". | D3 | E4 |
| 6 | **Keep `served_count` OUT of ranking** | Explicitly do not wire the latent `served_count`/`last_served` columns into `select/rank` or `push/rank`; usage is telemetry-only. | D6 | (regression: rank stable) |
| 7 | **Land the runnable E-series** | E1/E3/E4/E7/E0 + sentinel-half of E6 + budget-half of E5 as regression guards now; `test.todo` for the rest. | D10 | — |

**Phase 1 exit:** the two verified M1 bugs are closed, imports are reviewable, stale anchors surface,
dedup is visible, and the E-series guards them — all on the current storage model, shipped
independently.

## Phase 2 — Ownership & Sync Re-architecture (design-first, evolves storage + adds collaboration)

Full spec: **`docs/build/MEMORY-SYNC-GOAL-PROMPT.md`** (unified event model + S-items + slices). Do
**not** re-summarize it here; this section only states its relationship to Phase 1.

**What Phase 2 changes** (net-new, beyond the research): memory becomes an **immutable event log** in
one of three zones (committed Mainline `.ctx/` / gitignored personal overlay / external snapshot); the
store becomes a rebuildable materialized view (memory leaves the index-not-copy exception); git is the
**textual** sync layer only, with a **three-layer conflict model** (textual→git / identity→reindex /
semantic→post-merge reconcile, E1); lifecycle mutations become committed decision events with an
order-independent status fold (E2/E5); per-carrier ownership matrix governs every source; personal
overlay; host imports land in the overlay as `needs-review` and are promoted by human confirmation
(E3); a deterministic secret guard before the committed zone (E4); cross-source `unresolved-here`; a
`needs-review` ops contract (E8); an incrementality/perf budget (S10).

**New slice order (risk-ordered, per the revised sync prompt)** — the **event log lands before the
storage move** so the storage swap is mechanical: (1) docs + decision record; (2) event/decision log +
derived status **on current storage** (closes status-gate-pull); (3) storage-locus swap to committed
`.ctx/` files + migration; (4) memory-as-dirty-source + import→overlay→confirm pipeline (closes
import-unreachable + false CLI text); (5) personal overlay + three-tier scope; (6) collaboration eval
(incl. the merge-clean-but-contradictory case). Slice 3 is the only dual-track candidate.

**What Phase 2 REUSES from Phase 1** (the additive mapping — so Phase 1 is not wasted):

| Phase 1 mechanism | Phase 2 disposition |
|---|---|
| Status filter in `select` (item 1) | **Reused unchanged** — only the *source* of status changes (decision-log-derived instead of a mutable column). |
| Host-import `needs-review` + mtime dirtyCheck (item 2) | **Converges** — the mtime dirtyCheck is the seed of Phase 2's file-source model; import lands as `.ctx/memory/` files. |
| Anchor-freshness pass (item 3, **partially landed as `flagAnchorDrift` in 2c**) | **Reused + extended** with the E7 reconcile fixes (A5 `body-changed` down-rank, file a `stale-suspect` conflict, `file:`-target-removed), cross-branch semantics (S4), and the refresh-cycle trigger. |
| `sameAsCandidate` as conflict (item 4) | **Reused** — the resolution now also appends a committed decision. |
| Prewrite reconciliation (item 5) | **Reused** — same logic, writes a file instead of a store row. |
| `served_count` out of ranking (item 6) | **Reused unchanged.** |
| E-series (item 7) | **Reused + extended** with the two-working-copy collaboration dimension (slice 6). |

**The only true rework:** the *storage locus* — memory rows → committed files + decision-log. Phase 1's
correctness lives in the query/rank/lifecycle layer, which sits above the storage locus and survives
the swap.

## Sequencing & gates

1. **Phase 1 ships first, independently.** It does not wait on any Phase-2 decision. It is small,
   surgical, and fixes correctness now.
2. **Phase 2 is design-first.** Settle S1–S10 + reconcile the docs (VISION/CTX-DESIGN/CTX-IMPL +
   canonical Decision 11) **before** touching the storage layer.
3. **Phase 2 builds on Phase 1**, reusing the table above; it must not regress the E-series that
   Phase 1 greened, and must not regress the A11 perf gates (S10).

## Open decisions — now resolved by `MEMORY-DECISIONS.md`

The decisions this section once collected are **ruled** in `MEMORY-DECISIONS.md`: the research
divergences (superseded-in-pull, pin-vs-safety, import scope, agent lifecycle, `valid_from/to` timing)
→ **A-group / C-group**; the Phase-2 shape questions (file format, decision-log format, concepts,
per-carrier matrix) → **C-group**; the doc-organization items → **D-group**. The second, code-verified
review adds the **E-group** (E1 three-layer conflict model, E2 event order & `merge=union`, E3 import
landing zone + committed=human-authored/confirmed, E4 secret guard + default scope, E5
decision-collision fold, E6 logical-dump determinism, E7 2c reconciliation, E8 `needs-review` ops
contract). Only the residual *mechanics* stay open in the sync prompt (S1 detail-attachment, S3
migration, S4 cross-branch, S8 edge cases, S9 external, S10 cadence).
