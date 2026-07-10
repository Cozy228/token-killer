---
status: active
review_after: 2026-07-24
purpose: goal prompt — audit the implementation against PRODUCT-DESIGN.md, re-plan the M-route, and produce new CONTEXA-DESIGN.md + CONTEXA-IMPL.md
executor: Fable session (coordination/analysis/arbitration ONLY) + sonnet collectors + opus analysts/drafters + Codex CLI (gpt-5.6-sol ultra) cross-review
---

# Goal Prompt — Design Reconciliation: implementation vs PRODUCT-DESIGN.md

## Mission

`PRODUCT-DESIGN.md` (repo root, LAW, ratified 2026-07-10) is now the final product
authority. The implementation registers `CONTEXA-DESIGN.md` / `CONTEXA-IMPL.md` predate
it, and the codebase (M1/M2 merged on `feat/1.0.0`, M3 in progress) was built against
the old registers. Your job:

1. **Audit** the current implementation against the contract — find every drift.
2. **Re-plan** the milestone route (M1/M2 built; M3+ planned) under the contract's
   rulings and validation-ladder gates.
3. **Produce** a new `CONTEXA-DESIGN.md` and `CONTEXA-IMPL.md` at repo root, fully
   reconciled to the LAW, replacing the old ones.

This is a **docs-and-planning** task. Do not modify product source code. Code defects
found along the way are reported (OPEN.md candidates), never fixed here.

## Role contract (hard)

- **Fable (you, the main loop):** coordination, drift arbitration, synthesis, final
  editorial pass, and cross-review dialogue with Codex. You do NOT bulk-read source
  files, grep the tree yourself, or draft long documents from scratch. If you catch
  yourself reading a third source file in a row, stop and delegate.
- **Sonnet subagents (collectors):** all inventory and evidence gathering.
  Record-don't-judge: facts, counts, file:line citations, verbatim quotes. No
  recommendations.
- **Opus subagents (analysts/drafters):** deep code reading, per-subsystem drift
  analysis, and full drafts of the two new documents. They receive explicit work
  orders with acceptance criteria and return deviation notes.
- **Codex CLI (`gpt-5.6-sol ultra effort`):** heterogeneous adversarial reviewer, invoked at
  the two review gates below. Known gotchas: model must be set explicitly (config
  default may differ); it cannot commit in linked worktrees; on usage-limit errors,
  reschedule rather than downgrade the model.
- **Never haiku.** All subagents inherit-or-sonnet/opus.
- pnpm only; every recommendation is judged for the distributed install base
  (Node floor, AV/EDR, PATH, cold start), not the local box.

## Required inputs (read before any fan-out)

Fable reads ONLY these (delegation covers everything else):
`PRODUCT-DESIGN.md` (the yardstick), `reports/derivation-comparison-r1.md` (why each
ruling exists), `FABLE-DECISION-LOG.md` P26–P35, `OPEN.md`, and the tables of contents
(not bodies) of the old `CONTEXA-DESIGN.md` / `CONTEXA-IMPL.md`.

## Phase plan

### Phase 1 — Inventory fan-out (sonnet collectors, parallel)

Spawn collectors, one per area, each returning a compact evidence table
(subsystem → entry points → key files/tables/CLI verbs → what it actually does →
existing tests → file:line anchors):

- C1: shipping surface — filter/handlers, recovery, install (hook/shim), doctor,
  inspect/optimize, gain/savings ledger (`src/`, published `contexa` package).
- C2: memory subsystem — slices 1–6 as merged (event log, fold, zones, drift,
  push/pull, `remember`/`--local`, doctor E8).
- C3: codegraph M1/M2 — store schema, ingestion pipeline, symbols/call-graph/SCIP,
  docs scan, FTS, what queries exist today.
- C4: M3 state — projection kernel work on the branch, its docs
  (`docs/codemap/`, M3 goal prompts), what is built vs planned.
- C5: plans register — the old CONTEXA-DESIGN/IMPL full text distilled to a
  claim-by-claim list ("the register promises X"), plus the M-route (M1…M5) and
  each milestone's stated scope; include `docs/build/*GOAL-PROMPT*` scopes.
- C6: measurement/R1 harness state + OPEN items that touch design (O-14, O-16, O-22).

### Phase 2 — Drift analysis (opus analysts, parallel, one per subsystem)

Each opus analyst gets: the relevant C-tables + the full `PRODUCT-DESIGN.md`. For every
subsystem finding, classify against the contract with evidence:

- **CONFORMS** — cite the article/ruling it implements (Constitution art. 1–8, R1–R6,
  §3 claim contract, §4 facet boundaries, §5 artifacts, §7 rulings).
- **DRIFT-FIX** — violates the contract; propose the minimal refit (docs/plan level).
- **DRIFT-ESCALATE** — violates the contract but the implementation may be right;
  write the amendment case for the maintainer (LAW changes only via maintainer).
- **GATED** — conforms in design but is "broad construction" that §8's validation
  ladder has not yet unlocked; propose freeze-or-proceed with justification.
- **ORPHAN** — exists in code/plans but maps to nothing in the contract (candidate
  cut or accelerator reclassification).

Mandatory questions the combined analyses MUST answer explicitly (these are the known
tension points; do not let them dissolve into generalities):

1. Does the codegraph store (M1/M2) survive **R2** (on-demand compilation; indexes =
   TTL accelerators, never truth)? What changes make it an accelerator + local claim
   substrate rather than an asserted-truth store?
2. Is the M3 projection kernel the retired "Context Projection as central capability"
   (see VISION.md pointer + P33), or a legitimate compiler internal? Keep / recast /
   freeze — with the §8 gate it would need.
3. Where does the memory subsystem map in the claim contract (§3) and the local facet
   (§4)? Are its statuses/zones compatible with the claim status enum and the
   corrections-repair-owning-source rule?
4. Does the shipping filter remain the adoption wedge (per contract §4 "today's
   assets"), and what does **R3/R4** demand of it that it doesn't do today?
5. Which of the five decision artifacts (§5) does ANY current code partially
   implement (continuity card = Artifact 4 core is the known candidate), and which
   have zero implementation (expected — they are gated)?
6. What is the honest M-route now? Propose M-plan v2: for each old milestone
   (M1 done, M2 done, M3 guide/projection, M4 importers, M5) — keep / re-scope /
   freeze-behind-gate / kill, each tied to a ladder stage or a "may proceed now"
   justification (reliability, wedge correctness, and O-14 measurement work may
   proceed pre-gate; new broad construction may not).

### Phase 3 — Synthesis (Fable) + drafting (opus)

1. Fable merges the analyses into a single **Drift Register** (one line per finding:
   id, subsystem, class, contract anchor, disposition proposal) — this table is the
   heart of the deliverable and goes into the new CONTEXA-IMPL as an appendix.
2. Fable freezes the disposition proposals + M-plan v2 skeleton, then hands TWO opus
   drafters explicit work orders:
   - **New `CONTEXA-DESIGN.md`** — the system's design register: what the product IS
     as implemented-and-planned, structured by the contract (claim contract → two
     facets → artifacts → surfaces), every section carrying a traceability tag to the
     LAW article/ruling it implements. No aspirational content that the ladder has
     not unlocked — gated work is listed in a "gated" section with its gate.
   - **New `CONTEXA-IMPL.md`** — the implementation register: current architecture as
     it exists (post-M2 + M3 state), the Drift Register appendix, M-plan v2 with per-
     milestone acceptance criteria, and the refit work items from DRIFT-FIX findings.
3. Both drafts must preserve still-valid content from the old registers (the old docs
   are inputs to the drafters, via C5) — this is reconciliation, not amnesia.

### Phase 4 — Cross-review gates (Codex CLI, up to 3 fix rounds each)

- **Gate A (after Phase 3.1):** Codex reviews the Drift Register + M-plan v2 for:
  findings that don't hold against the cited code evidence, contract misreadings,
  missing tension points, and gate-dodging ("broad construction smuggled as refit").
  Fable arbitrates disagreements; unresolved ones become maintainer questions.
- **Gate B (after Phase 3.2):** Codex reviews the two new documents for: internal
  contradictions, contradictions with PRODUCT-DESIGN.md (zero tolerance — LAW wins or
  the conflict is escalated, never papered over), untraceable claims (every design
  statement needs a LAW anchor or a code anchor), and dead references. Opus applies
  fixes; Fable verifies.

### Phase 5 — Ratification + landing

1. Present to the maintainer ONE batch table: DRIFT-ESCALATE amendment cases, M-plan
   v2 (per-milestone dispositions), and any kill/freeze proposals. **Nothing replaces
   the old registers before this confirmation.**
2. After confirmation: old CONTEXA-DESIGN/IMPL move to `docs/archive/` with supersede
   banners; new docs land at root; decision log gets the P-entries for ratified plan
   changes; OPEN.md swept (add refit work items, close what this resolves); memory
   updated; **commit + push in one go** (merge→push, no backlog).

## Acceptance checklist (self-verify before declaring done)

- [ ] Every Phase-2 mandatory question (1–6) has an explicit, evidence-cited answer.
- [ ] Drift Register: every finding has class + contract anchor + file:line evidence +
      disposition; zero findings resolved by weakening the LAW without escalation.
- [ ] New CONTEXA-DESIGN.md: every section traceable to a LAW anchor; no ungated
      aspirational scope; old-doc content either carried, superseded-with-pointer, or
      explicitly dropped with reason.
- [ ] New CONTEXA-IMPL.md: matches the code as merged (spot-checked by citations);
      M-plan v2 with per-milestone gates; Drift Register appendix included.
- [ ] Both Codex gates ran (≤3 rounds each); disagreements arbitrated in writing;
      unresolved items surfaced as maintainer questions, not silently decided.
- [ ] Maintainer batch-confirmed before any old doc was replaced; then committed AND
      pushed; product source code untouched.
- [ ] Deviation log kept throughout (what the plan said vs what you actually did).

## Constraints recap

Chinese chat replies / English docs; pnpm only; no source-code edits; adjacent
problems → report, don't fix; distributed-field-first judgment; session-limit
awareness (checkpoint the Drift Register to disk after Phase 3.1 so a resumed session
can continue without re-running Phases 1–2).
