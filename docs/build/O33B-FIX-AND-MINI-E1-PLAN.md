---
status: draft
review_after: 2026-07-26
---

# Plan: O-33(b) retrieval fix + mini-E1 adoption run

Follow-up to E2 r1 (2026-07-12, verdict HOLD both repos — `tools/measurement/.work/e2-grid-r1/report.json`).
Maintainer ruling that framed this plan: no more full grids; E0 becomes the free regression
gate, E1 shrinks to a B-arm-only micro-grid, E2 r2 stays frozen until a product change makes
a decisive effect plausible.

## Evidence base (from E0 r1 + a live probe, 2026-07-12)

- 4/11 tasks retrieve ZERO fix-surface refs (O-33b, bimodal & deterministic): atlas-discovery-multimodule,
  atlas-service-presentation-metadata, tk-install-auto-wires-copilot, tk-powershell-brace-block-rewrite.
- Live probe against the frozen E2 armB sandbox (tk-powershell task query, `task` mode): the response
  serves ONLY doc-class items (ADRs, audit reports, DESIGN.md sections, tester guide) — **zero code
  items**. `src/hook/rewrite.ts` appears only inside other docs' excerpts.
- The task text itself CONTAINS an explicit ref `[rewrite.ts (line 40)](…/src/hook/rewrite.ts:40)`
  and ctx still did not serve that file. Probe script: session scratchpad `probe-ctx.ts` (rebuild
  from `mcp-client.ts` if lost — 30 lines).

Two-part defect hypothesis (to be confirmed by A1, in order of suspected impact):
1. **Task-mode ignores explicit refs embedded in the task text** — paths/`file:line` mentions are
   not extracted and force-served.
2. **Ranking floods with doc items** — code items either absent from the candidate set (indexing
   gap) or out-ranked by doc sections for bug-fix-shaped queries.

## Workstream A — product fix (normal build pipeline, NOT measurement scripts)

| step | what | acceptance |
|---|---|---|
| A1 root-cause | Instrument the select/serving path for the 4 zero queries against the frozen stores: for each, classify **(i)** fix-surface code item not in candidate set at all vs **(ii)** in candidates but out-ranked. Reuse the probe script; no product change yet. | 1-page findings note; fork ruling ready |
| A2 fix (fork, rule after A1) | Candidate fixes, smallest-deterministic first: **F-a** extract explicit file/`file:line` refs from task text and serve them as pinned claims (deterministic, aligns with claim contract); **F-b** serving-mix guarantee: bug-fix-shaped task queries reserve slots for code items (type quota / interleave); **F-c** ranking feature (path/symbol term match boost). F-a is near-free and likely flips tk-powershell alone; F-b/F-c need A1 data. | unit tests per fix; no regression in existing select tests |
| A3 adjacent (same area, small) | O-33(a): unknown-ref miss text says "…or use task mode" even when the query WAS task mode (`select/engine.ts` unknown-ref branch). Fix the circular guidance. | unit test on miss text |
| A4 regression gate (free) | Rerun `e0-bench-retrieval.ts` against the existing frozen sandboxes (ctx serving code runs from live source via `ctx-launch`, so the fix is picked up without rebuilding stores). | **Gate: ≥3 of the 4 zero tasks flip to relevance 1.0; all 7 relevance=1 tasks hold; timeout/drill gates stay green.** If <3 flip, iterate A2 before any paid run |

Notes / constraints:
- Fix slice goes through the standard build pipeline (goal prompt → builder → Fable review). Scope
  is `packages/` select/serving only; measurement scripts stay untouched by the fix slice.
- Caveat to disclose in any later comparison: E2 r1 B-arm rows were produced by PRE-fix serving code.
  Post-fix runs are not row-comparable with E2 r1; per-task E0 relevance is the bridge metric.

## Workstream B — mini-E1 adoption run (after A4 passes, one limit window)

Question: with ctx present but UNMENTIONED (`optional` protocol, push-imperative neutralized),
does the agent call it at all, and before or after its first edit?

- **Cells: B-arm only.** Adoption needs no paired control arm; E2 r1 A rows serve as the
  descriptive outcome baseline. 11 tasks × 2 reps = **22 cells ≈ $60** (extend +11 later only if
  the adoption signal is non-zero and needs precision).
- Harness delta (tools/measurement only): run-grid grows an `--arms B` filter (or a thin loop over
  `run-cell --arm B --protocol optional`); analyze gets an adoption-summary mode — **no verdict
  gate; E1 is descriptive/qualifier per F1**.
- Metrics (already recorded per cell, §4.3): `ctx_calls>0` rate per task; `ctx_before_first_edit`
  (PRIMARY timing); tool-choice share vs E2 r1 A-arm (does ctx displace Read/Grep?); `ctx_errors`;
  `mcp_attached` assertion + void taxonomy unchanged; model pinned `claude-sonnet-5` for
  comparability.
- Report: adoption table + timing + tool-share, folded into O-14/O-33 register lines. Explicitly
  descriptive — no HOLD/ESCALATE verdict.
- Optional add-on (maintainer call, +11 cells ≈ $30): a `shipped` condition rep (sandboxes rebuilt
  with `--keep-push-imperative`) to measure whether the product's own onboarding line moves
  adoption. Skippable; only worth it if the plain-optional adoption rate is near zero.

## Sequencing

1. (free, anytime) Audit the atlas anti-gaming flag from E2 r1 — read the per-rep rows behind the
   uncached inversion; needed before quoting atlas token wins anywhere.
2. Workstream A: A1 → A2/A3 → merge → A4 E0 rerun (free gate).
3. Workstream B: mini-E1, 22 cells, one session-limit window (~2h wall clock).
4. Fold results; only then revisit whether E2 r2 is ever worth unfreezing.

Budget ceiling for the whole plan: **≈ $60–90 paid** (B only; A is product work, A4 is free).
