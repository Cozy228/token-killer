---
status: active
review_after: 2026-07-31
purpose: goal prompt — design round producing "measurement design v2" (P37 ⑦ + refinements); a /shape-style conversation, NOT a build order
executor: Fable session with the maintainer in the loop (user rules every fork); collectors as needed
---

# Goal Prompt — Measurement Design v2

## Why this round exists

P37 ⑦ (2026-07-10): the R1 self-measurement must be REDESIGNED before its results count.
What happened to v1: the ratified design (P32, `docs/design/measurement/MEASUREMENT-DESIGN.md`,
grilled Q1–Q17) was built and the grid actually ran locally — outcomes: `r1-grid-sonnet`
72 rows → verdict HOLD on atlas / INSUFFICIENT_DATA on token-killer (31 voids);
`r1-grid-codex-gpt55-medium` 66 rows → **100% void**. Meanwhile an UNRATIFIED 5-condition
"protocol/adoption" pilot (none/optional/suggested/forced/forced-inspect) was scripted and
run once (`r2-protocol-codex-gpt55-pilot`), and `run-cell-codex.ts` was locally modified to
stop treating tool errors as voids — all of this sits UNCOMMITTED in `tools/measurement/`.

## Mission

Produce a maintainer-ratified **`MEASUREMENT-DESIGN-V2.md`** that answers, explicitly:

1. **What question(s) is v2 answering?** v1 asked "does ctx (pull+push) raise pass-rate /
   cut uncached tokens on real fix tasks". The pilot asks a DIFFERENT question: "does an
   agent ADOPT ctx when it is optional?" Decide: one experiment or two separate ones, and
   which is the O-14 headline.
2. **Void policy.** Why did the codex arm void 100%? Ratify or revert the local
   tool-errors-not-void change; define void taxonomy + a max-void bar for a valid run.
3. **What changes to get a decisive (non-HOLD) answer** — N, task bank (60-vs-66 cell
   discrepancy; 7/11 task prompts still owed review), acceptance commands, repos, models.
4. **P32 supersession list** — name every P32/Q1–Q17 item v2 keeps, amends, or retires.
   Silent replacement is forbidden; the v2 doc carries a "supersedes" table.
5. **Disposition of the uncommitted scripts** (`run-cell-codex-protocol.ts`,
   `run-grid-codex-protocol.ts`, `analyze-codex-protocol.ts`, modified `run-cell-codex.ts`
   + README) — absorb into v2, or discard; nothing stays uncommitted-and-load-bearing.
6. **Boundary with the validation ladder** — O-14 measures the PRODUCT's token/adoption
   value; V0–V3 (LAW §8) validates ARTIFACT trust. v2 must not blur them; it may run in
   parallel with V0 drafting (P37 refinement c).

## Method

/shape-style: route each unknown to LOOKUP (read `.work/` grid outputs, implementation-notes,
MEASUREMENT-DESIGN.md — delegate to collectors, record-don't-judge) / ASK (maintainer rules
every fork above) / TEST (cheap pilot cells only if a fork genuinely needs data) / DEFER.
Fable synthesizes and attacks the draft before ratification; Codex second-opinion optional
at the end. Deliverable lands in `docs/design/measurement/`, gets a P-entry, updates O-14,
and the scripts' fate is committed same day (merge→push).

## Constraints

Chinese chat / English docs; pnpm only; measurement work is pre-gate-sanctioned (O-14) but
is measurement ONLY — no product-surface changes ride along; judge every choice for the
distributed install base; prompt authenticity rule from P32/Q17 stays absolute (never
rewrite-from-git prompts).
