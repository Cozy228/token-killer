---
status: draft
review_after: 2026-07-20
---

# implementation-notes — MEASUREMENT-DESIGN deviation log

Deviations from the goal prompt, and facts that changed a design choice. First-class deliverable
(workflow.md phase 4).

## Deviations from the goal prompt

- **Collectors failed on the return step, not the write step.** The 5 Sonnet collectors hit the
  Claude session limit (resets 2am Asia/Shanghai). W2 & W5 returned summaries; W1/W3/W4 were marked
  `failed` but had **already written their full reports to disk** — the API error fired during the
  final summary-return, after the file write. All 5 reports are complete and were read from
  scratchpad. No re-run was needed (a re-run would hit the same limit). Net: zero research lost.
- **Smoke probe run by the synthesizer directly** (as goal §Execution specifies), independently of
  W3's probe — confirmed `usage.input_tokens` / `iterations[]` / `modelUsage.contextWindow` on
  v2.1.201 before W3's report landed.

## Facts that overrode goal-prompt assumptions (verify-against-CLI, not memory)

- **`--max-turns` does NOT exist in `claude` v2.1.201** (measured, W3 §1.2). The goal's R1 sketch
  implied it. Replaced with `--max-budget-usd` as the per-run cap. This is the single most likely
  thing to break a copy-pasted R1 script, hence surfaced in §4 and Q-adjacent.
- **`--bare` skips CLAUDE.md/hooks/auto-memory** (measured, W3 §1.2) — which would strip ctx's push
  channel. So the clean-baseline approach is a controlled sandbox config, NOT `--bare` (Q10). This
  was not obvious a priori and reverses the tempting "just use --bare for a clean run."
- **Corpus is larger than the goal's ~2,570 estimate:** 383 session files / 33,459 `type:user`
  records (measured, W3 §2) — but most are workflow/design chat, not codeable tasks, so the
  *usable* bank is expected small (criterion 2 low yield). The constraint is acceptance-check
  derivability, not prompt count.

## Design choices made beyond the goal spec

- **ctx presence = two channels (pull MCP + push digest).** Discovered by inspecting `packages/`
  (`mcpConfig.ts`, `push/`). The goal treated "ctx presence" as a single flag; the real product has
  two delivery paths with opposite token signs, which forced the channel ablation (§9) and threat T8.
- **Primary metric ambiguity (top-level vs Σ iterations[]) made explicit as Q1 + T10** rather than
  silently picking one — the single probe (num_turns=1) could not disambiguate multi-turn behavior.
- **Reused existing ADRs instead of inventing:** ADR 0016 (primary=uncached delta, safety-is-gate),
  0022 (per-host claim boundary), 0023 (SWE-bench FAIL_TO_PASS reuse), 0024 (no-full-matrix
  ablation). The design is a specialization of these, not a competitor.

## Acceptance checklist — self-verification (per-item)

- [x] R1 runnable tomorrow, zero new code beyond a shell script; commands verified against current
  `claude -p` (smoke probe run, usage fields confirmed, `--max-turns` corrected to `--max-budget-usd`).
- [x] Evidence ladder explicitly climbed (§1 table: L0–L6, what each rung proves / cannot prove).
- [x] Arms differ ONLY in ctx presence — exact config-delta table in §4.
- [x] Task bank from real session history with stated inclusion criteria + explicit contamination
  rules (§3).
- [x] Pre-registration section exists — metrics + exclusions frozen before any full run (§7).
- [x] Every W1 third-party claim carries a primary-source citation (reports W1/W5 carry arXiv/OpenAI/
  DORA/ACM URLs; numbers labeled measured-by-source where not independently re-derived).
- [x] Q1..Q13 present (13 ≥ 8), each a committed recommendation, no option menus.
- [x] ≤600 lines (392) + frontmatter (`status: draft`, `review_after: 2026-07-20`).

## Open follow-ups (not blocking the design)

- Multi-turn accumulation of `usage.input_tokens` unverified (Q1/T10) — resolve with a 2-turn probe
  before R1 coding.
- Session-start prompt count is a 50/383-file sample (W3 §2 gap) — full-corpus count deferred to
  bank-mining time.
- Codex red-team verdicts folded/logged below.

## Codex red-team verdicts

Verdict: **RETHINK** — "careful statistically but weak causally." All three objections were
legitimate and folded as **design changes** (not just logged):

1. **Contamination via ctx's own local state (folded → Q14, T1, §3).** The killer objection: my
   original T1 froze only the git SHA, but ctx memory/`remember`/digest are derived from the same
   session history the task bank is mined from — a post-task `remember("fix is in X")` leaks the
   answer. Changed to a **time-cut environment freeze**: repo + ctx store/memory/config all filtered
   to source-timestamp < task-T. This is the most consequential change.
2. **Measurability ≠ representativeness (folded → Q-scope, T12, §1/§3).** Bank excludes exactly the
   design/nav/refactor tasks a context tool claims value on. Headline re-scoped to "among objectively
   gradable coding tasks" + bank yield reported vs the full 33,459-record population.
3. **M1 is a cache-accounting artifact (folded → Q16, T13, §2, decision rules).** Push block is a
   cacheable prefix; cache segmentation can move tokens between counters without changing work.
   Changed to **three-column reporting** (uncached + total + success, claim must survive all three);
   total promoted from "audit-only" to anti-gaming guardrail. R1 decision rule gained clause (d).

Also folded: **baseline competence** — clarified arm A already has Read/Grep/Glob (competent
baseline) + optional third arm `+ctx-tools/empty-store` for R2 (Q15); **rep non-independence** —
reps not treated as i.i.d.; per-task median is the unit (§7, T14).

Not folded / disagreement: none material — the red-team was accepted almost wholesale. The one
softening: Codex wanted total-input as a co-primary; I kept uncached primary (per the fixed
project fact + ADR 0016) but elevated total to a mandatory co-reported guardrail, which achieves
the same anti-gaming goal without discarding the >97%-cache-hit rationale.

Net: the design moved from L3-statistically-clean-but-causally-soft to causally defensible. The
RETHINK was about causal validity, and the causal holes are now closed in-doc rather than deferred.
