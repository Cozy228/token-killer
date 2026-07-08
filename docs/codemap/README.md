> **[2026-07-04 P28/P29] AUTHORITY NOTE** — this directory documents the **June codemap contract**, amended by the ctx redesign: decision/route authority = repo-root `CONTEXA-DESIGN.md` (§9 amendment register) + `CONTEXA-IMPL.md`. This directory is the product's permanent **detail layer** (P29 reference-not-copy: Contexa docs decide and route; detail lives HERE and is referenced, never restated). `DESIGN.md` = the amended contract, still the authoritative text of every carried D-item. `IMPLEMENTATION.md` remains the index into `impl/`; `RUNBOOK.md`'s per-slice workflow discipline carries over — only their #59–#84 slice ordering is retired (P26). Read-back map: `CONTEXA-IMPL.md` §12.

# codemap docs

This directory keeps only the active codemap design and implementation entry points at the top level.

## Read first

1. [`DESIGN.md`](DESIGN.md) — binding product and architecture contract.
2. [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — implementation index, dependency order, and issue map.
3. [`RUNBOOK.md`](RUNBOOK.md) — execution checklist for the vertical implementation slices.

The design describes one complete bounded product. The implementation plan is incremental execution order, not
product phasing: slices exist to make the work testable and reviewable, not to ship an incomplete MVP.

## By Surface

- **Agent surface / codemap** — design: [`DESIGN.md`](DESIGN.md#10-agent-surface); implementation:
  [`impl/F-agent-surface.md`](impl/F-agent-surface.md), [`impl/G-output-economy.md`](impl/G-output-economy.md).
- **Human surface / codeguide** — design: [`DESIGN.md`](DESIGN.md#11-codeguide); implementation:
  [`impl/H-codeguide-surface.md`](impl/H-codeguide-surface.md), with collaboration constraints in
  [`impl/I-collaboration.md`](impl/I-collaboration.md).

## Implementation details

- [`impl/`](impl/) — detailed implementation dossier, split by capability area A-M.
- [`impl/schema-draft.sql`](impl/schema-draft.sql) — current serving-tier schema draft for the early codemap slices.

## Archive

[`archive/`](archive/) contains superseded designs, research inputs, generated HTML, and old execution prompts.
Do not treat archived files as binding unless an active document explicitly cites them as evidence.
