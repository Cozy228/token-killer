---
status: active
review_after: 2026-07-19
---

# Goal prompt — Measurement system research → design (pre-grilling)

## Mission

Produce **`docs/design/measurement/MEASUREMENT-DESIGN.md`** — a decision-complete design for proving (or refuting) ctx's value, strong enough to survive adversarial grilling. The design must cover three rungs: (R1) an **afternoon crude A/B** runnable immediately with zero new infrastructure, (R2) a **full offline paired harness**, (R3) an **online opportunity/telemetry track**. You produce the design only — no implementation, no ctx code changes.

"Solid proof" is the bar: a skeptical outsider reading the numbers should not be able to dismiss them with one sentence. A/B alone is not solid proof; the design must climb the evidence ladder (see ADR 0001) explicitly: paired tasks → repetition → pre-registered metrics → significance/uncertainty → quality guardrail → ablation per ctx feature → real-task replay.

## Fixed facts & constraints (do not re-litigate; cite them)

- Primary metric = **uncached input-token delta**, NOT total tokens — cache hit rate is >97% so totals are noise (memory: measurement-harness design).
- **Claude Code headless (`claude -p` with JSON output) is the only clean uncached runner** among available hosts; Copilot CLI / VS Code report no clean token numbers → they are Track-2 self-instrument targets only (memory: host token-visibility).
- Product thesis: "internal A/B = proof currency" (PROJECT-CONTEXT-PACK §9). This research exists because measurement was structurally deferred (P25 features-before-measurement); the design must be cheap enough to stop deferring.
- Two real testbeds exist: `token-killer` (this repo) and `atlas`, plus **one month of real session history** (~2,570 real user prompts in `~/.claude/projects/`) as a task-bank source.
- Claim discipline (memory: manager-doc framing): every number in the eventual report is labeled **measured / estimated / inferred**; no unqualified "60–90%" claims; verify any third-party claim against primary sources before citing.
- Research mode = **record, don't judge** for collectors; judgment happens in the synthesis and in grilling.

## Non-goals

- No implementation of the harness (that's the next slice, after grilling ratifies the design).
- No telemetry-server work, no host-adapter changes.
- No re-opening of product scope (P27 scope guard stands).

## Research workstreams (fan out collectors; each returns facts + citations, ≤2000 words)

**W1 — How comparable projects prove value.** Survey the proof methodology (not the product) of: SWE-bench / SWE-agent eval harnesses; Aider's benchmark suite and leaderboard method; published Copilot/Cursor productivity studies (incl. the GitHub/Microsoft RCTs and their critiques); DORA/SPACE research method; eval tooling conventions (evalite, promptfoo, Braintrust, LangSmith, OpenAI evals). Extract: task selection, pairing strategy, repetition counts, what they measure, how they handle nondeterminism, how results were attacked by critics.

**W2 — Statistics for small-n agent experiments.** Paired designs (paired t / Wilcoxon / bootstrap CIs), minimum repetitions for detectable effect at plausible variance, variance sources in agentic runs (sampling temperature, tool nondeterminism, retrieval order, model version drift) and standard controls (pinned model IDs, fixed seeds where possible, interleaved arm ordering, same-day runs). Pre-registration as cherry-picking defense: metrics and exclusion rules declared before runs.

**W3 — Instruments.** Exactly what Claude Code headless exposes per run (usage fields: input/output/cache-read/cache-write tokens, cost, turns, duration; JSON output format; --max-turns etc. — verify against current docs/CLI, not memory). How to convert a real historical session into a replayable task (prompt extraction, repo-state pinning via git SHA, acceptance check derivation). What tk/ctx already logs that can be reused (four-ledger metrics, inspect scanner).

**W4 — Metric definitions.** Primary: uncached input tokens per completed task (with/without ctx). Secondary: task success against acceptance checks (the guardrail — savings at equal-or-better success, else the saving is fake), wall-clock, turn count, user-correction count. Opportunity metrics for the online track. Define each precisely enough to compute from W3's instruments.

**W5 — Threats to validity & anti-patterns.** Contamination (ctx index built from the same repo state the task edits), Hawthorne/prompt-drift between arms (the ONLY difference between arms must be ctx presence — same model, same skills, same hooks), task-selection bias, LLM-judge bias for quality grading (rubric + human spot-check design), and how each published study in W1 was criticized — inherit their scar tissue.

## Deliverable spec — MEASUREMENT-DESIGN.md

Sections, in order: 1) Goals/non-goals; 2) Metric definitions (from W4, each labeled with its instrument); 3) Task bank construction — real tasks mined from session history + criteria, per-repo split (token-killer / atlas), contamination rules; 4) **R1 afternoon protocol** — exact commands, N tasks × M reps, arm setup (with-ctx vs without-ctx flag/config), what table comes out, decision rule for "did the number move"; 5) R2 full harness design (architecture only); 6) R3 online opportunity track; 7) Statistical analysis plan (pre-registered); 8) Quality guardrail & grading; 9) Ablation plan (memory / code-graph / docs facets separately); 10) Threats-to-validity table with mitigations; 11) Cost & time budget per rung; 12) Open decision points **Q1..Qn** for grilling — every choice you made that a reasonable person could contest, stated as a question with your committed recommendation.

Doc constraints: ≤600 lines; every design choice cites W1–W5 evidence inline; numbers labeled measured/estimated/inferred; frontmatter `status: draft` + `review_after`.

## Acceptance checklist (self-verify before returning; report per-item)

- [ ] R1 protocol is runnable tomorrow with zero new code beyond a shell script — commands verified against current `claude -p` behavior (actually run a 1-task smoke probe to confirm the usage fields exist).
- [ ] Evidence ladder explicitly climbed; the doc states what each rung proves and what it still cannot prove.
- [ ] Arms differ ONLY in ctx presence; the doc shows the exact config delta.
- [ ] Task bank sourced from real session history with stated inclusion criteria; contamination rules explicit.
- [ ] Pre-registration section exists (metrics + exclusions frozen before any full run).
- [ ] Every W1 claim about third-party projects carries a primary-source citation.
- [ ] Q1..Qn decision list present and honest (≥8 real contested choices, each with a committed recommendation, no option menus).
- [ ] ≤600 lines; frontmatter present.

## Execution & roles

- **Collectors (Sonnet)**: W1–W5 in parallel, record-don't-judge, primary sources over blogs, cite everything.
- **Synthesizer (Opus, single-track)**: reads all five reports + fixed facts, writes MEASUREMENT-DESIGN.md, runs the R1 smoke probe, self-verifies the acceptance checklist, keeps `implementation-notes.md` deviation log.
- **Codex second-opinion (after draft, before user)**: red-team the draft via ~/.claude/prompts/codex-second-opinion.md — attack the proof validity specifically ("would a skeptic dismiss this?"). Synthesizer folds verdicts or logs disagreement.
- **Fable**: reviewer; then hosts the grilling session with the user against the doc's Q1..Qn.
- Never haiku. pnpm only. English doc, Chinese chat.

## Handoff

Return: path to MEASUREMENT-DESIGN.md + acceptance checklist per-item status + Codex verdict summary + the Q1..Qn list inline for immediate grilling. Next step after grilling: ratified design → implement R1 → run the afternoon → numbers on the table (closes OPEN.md O-14).
