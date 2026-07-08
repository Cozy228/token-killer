# docs/build — goal prompts, decisions & execution plans

Milestone acceptance bars, implementer goal prompts, and ratified decisions. Read in the order below.

## Authority docs (repo root — not here)

- `CONTEXA-DESIGN.md` · `CONTEXA-IMPL.md` · `FABLE-DECISION-LOG.md` — the settled Contexa design/impl/decisions.
- `VISION.md` — the aspirational vision layer (DCI / Atlas / CodeGraph / CodeWiki vocabulary is
  intentional; it is the north star, not the shipped product's naming).

## Milestones

- `M1-ACCEPTANCE.md` · `M1-GOAL-PROMPT.md` — M1 (memory + git + docs/decisions, 3 tools, push).
- `M2-ACCEPTANCE.md` · `M2-GOAL-PROMPT.md` — M2 (code source, symbols, anchor-drift).

## Memory line (read in this order)

1. **Research** — `../design/memory-research/REPORT-canonical.md` — the decision-anchored verdict
   (what memory should be: 11 decisions, current-ctx assessment, model, scope cut, eval). Backed by
   the two independent tracks (`REPORT-opus-4.8.md`, `REPORT-codex-5.5.md`) over five shared
   workstreams (`workstream-A…E-*.md`).
2. **Ratified decisions** — `MEMORY-DECISIONS.md` — the maintainer's rulings (B1/A1–A7/C1–C5/D1–D4, plus
   the second-round **E1–E8** from the code-verified review). **Source of truth** for every open
   question the research + sync design surfaced.
3. **Execution plan** — `MEMORY-EXECUTION-PLAN.md` — how the research implementation and the sync
   re-architecture relate (dependency structure, what's reused vs reworked).
4. **Sync/ownership design** — `MEMORY-SYNC-GOAL-PROMPT.md` — the decision-anchored change prompt for
   the committed-file / git-sync / per-carrier ownership model (S1–S10 + slices). Several S-items are
   settled by `MEMORY-DECISIONS.md`.
5. **Research goal prompt** — `MEMORY-RESEARCH-GOAL-PROMPT.md` — the original directive that produced
   the research in (1). Historical/context.
