---
status: active
review_after: 2026-07-20
ratified: 2026-07-06 (grilling → FABLE-DECISION-LOG P32)
---

# MEASUREMENT-DESIGN — proving (or refuting) ctx's value

Decision-complete design for measuring whether ctx reduces the uncached input tokens an
AI agent burns to complete a coding task, **without hurting task success**. Three rungs:
R1 (afternoon crude A/B, zero new infra), R2 (full offline paired harness), R3 (online
opportunity/telemetry track). Design only — no harness code, no ctx changes (goal §Non-goals).

Evidence sources cited inline as `W1–W5` (collector reports in scratchpad), `ADR NNNN`
(repo `docs/adr/`), and `(measured)` / `(doc-stated)` / `(inferred)` per claim-discipline
(memory: manager-doc-framing). Fixed facts from the goal prompt are cited, not re-litigated.

---

## 1. Goals & non-goals

**Goal.** Produce a number a skeptical outsider cannot dismiss in one sentence: on real,
frozen coding tasks, does ctx lower whole-task **uncached input tokens** at **equal-or-better
task success**? Climb the evidence ladder explicitly (goal §Mission; ADR 0001 is the
project's evidence-class discipline — capping/claims only where recovery/proof exists):

| Rung | Adds | Proves | Still cannot prove |
|---|---|---|---|
| L0 paired tasks | same task, 2 arms | direction on one task | nothing general (n=1) |
| L1 repetition | M reps/arm | per-task effect survives run-noise | population effect |
| L2 pre-registered metrics | frozen bank + rules | not cherry-picked | — |
| L3 significance/uncertainty | bootstrap CI / Wilcoxon | effect ≠ run-noise at fixed N | large-population generality |
| L4 quality guardrail | acceptance check | saving is real, not truncation | subjective quality |
| L5 ablation per facet | memory/graph/docs arms | which facet carries the effect | facet interactions beyond one confirm |
| L6 real-task replay | mined history, held-out | not benchmark-overfit | cross-host / cross-repo transfer |

R1 reaches L1–L2 (crude L3). R2 reaches L3–L6. R3 is a different claim class entirely
(opportunity, never summed with measured — ADR 0022).

**Non-goals.** No harness implementation (next slice). No telemetry-server or host-adapter
work. No product-scope reopening (ADR 0037 solo-first; P27 scope guard). No single blended
score, no cross-language/cross-host extrapolation (ADR 0022 claim boundary).

---

## 2. Metric definitions (each labeled with its instrument)

Instrument = Claude Code headless `claude -p ... --output-format json`, verified on **v2.1.201**
(measured, W3 §1). The result JSON carries `usage{input_tokens, cache_creation_input_tokens,
cache_read_input_tokens, output_tokens, iterations[]}`, `num_turns`, `duration_ms`,
`duration_api_ms`, `total_cost_usd`, `is_error`, `stop_reason`, `permission_denials`,
`modelUsage{<model-id>{...,contextWindow}}` (measured, W3 §1.3).

**M1 — Primary: uncached input tokens per completed task.** The three input counters are
additive, non-overlapping: `total_input = cache_read + cache_creation + input_tokens`; `input_tokens`
is "tokens after the last cache breakpoint" — the portion newly processed at full price
(doc-stated, W4 §1). Formula:

```
uncached_input_tokens(task, arm) = Σ over API steps (dedup by message id)  usage.input_tokens
```

Parallel tool calls in one turn share a message id — **dedup by id or double-count** (doc-stated,
W4 §1). For a single `claude -p` call, R1 reads top-level `usage.input_tokens`; R2 cross-validates
against `Σ iterations[].input_tokens` (the per-step ground truth) — see Q1. Total-including-cached
is an **audit column** — cache-hit >97% makes it a near-constant floor that swamps signal
(fixed fact, goal §Constraints; ADR 0016 "total-incl-cached is an audit column only") — **but it is
also a load-bearing anti-gaming guardrail (Codex red-team #3, folded):** ctx's push block is a
stable prefix that gets cached, while without-ctx file reads become cache-reads after turn 1, so
cache *segmentation* between the three counters can move for reasons unrelated to actual work.
**Report three columns together — uncached input (M1), total input incl. cache, success rate (M2)
— and require the claim to survive all three.** A run where uncached drops but total input balloons
is **not** a win (ctx merely relocated tokens into the cache tier); flag it, don't bank it. Unit:
integer tokens, reported as the **paired delta** `M1(without) − M1(with)` per task alongside the
total-input delta, not an absolute level.
Failure modes: cross-`query()` accumulation is not automatic (doc-stated, W4 §1); cache-TTL/pacing
differences between arms shift what falls into `input_tokens` vs `cache_read` (confound → T9).

**M2 — Task success (the guardrail).** Per task, one **acceptance command** exits 0 iff the
task's FAIL_TO_PASS check(s) now pass AND its PASS_TO_PASS check(s) still pass — SWE-bench's joint
rule, "fixing the bug while introducing a regression still fails" (doc-stated, W4 §2; ADR 0023
reuses SWE-bench FAIL_TO_PASS/PASS_TO_PASS). `pass(task,arm) = [exit==0]`. Objective, automatable,
**not an LLM judgment**. `is_error:false` from the agent does NOT imply pass — grade separately
(W4 §2). This is the hard gate: correctness must not regress (ADR 0022 gate #1).

**M3 — Wall-clock.** `duration_ms` (total) and `duration_api_ms` (API round-trips subset)
(doc-stated, W4 §3). Reported, never primary: host/AV/cold-start variance dominates (memory:
runtime-perf-baseline; W4 §3). Unit: ms.

**M4 — Turn count.** `num_turns` = request/response steps (doc-stated, W4 §4). Efficiency proxy,
read jointly with M1 — gameable by collapsing into fewer larger turns (W4 §4). Unit: count.

**M5 — Correction proxy (no live user).** Stand-in set (inferred, W4 §5): tool-error count
(`tool_result.is_error==true`), transport retries (`system/api_retry` events), self-correction
turns (revert/redo heuristic). Reported as diagnostics, never as success. Unit: count.

**M6 — Cost.** `total_cost_usd` — **client-side estimate, not billing** (doc-stated, W4 §6);
conflates token-volume with model choice. Reported separately from M1, never a token proxy. Unit: USD.

**M7 — Opportunity (online, R3 only).** avoided-reads, payload-bytes-not-sent, tool-call-count
delta, index-hit-rate; each `estimate_kind:"opportunity"`, **never summed into M1** (ADR 0022;
W4 §7). Counterfactual estimates on hosts with no clean token count.

---

## 3. Task bank construction

**Source.** Real session history in `~/.claude/projects/` (fixed fact, goal §Constraints).
Measured corpus (W3 §2): **383 session `.jsonl` files, 33,459 `type:user` records**, 5 project
dirs — the two testbeds are `token-killer` and `atlas`. Each user record carries `cwd`, `gitBranch`,
`timestamp`, `message.content`, `parentUuid` (thread chain) (measured, W3 §2).

**Extraction recipe** (W3 §2): first `type:user & !isMeta` record → `cwd` (repo), `gitBranch`,
`message.content` (prompt), `timestamp` → `git log --before=<timestamp>` for the commit state.

**Inclusion criteria (frozen before any run — pre-registration, W2 §4):**
1. Self-contained coding task on a specific repo, resolvable from repo-state-at-task-start.
2. Has a derivable **objective** acceptance check (a test/build command, or a specific
   symbol/file edit mechanically verifiable) — else excluded (no M2 → no guardrail).
3. Repo state reconstructable at a pinned SHA (the commit that the task's real fix landed on,
   or its parent).
4. Not a meta/workflow/design-chat prompt (those dominate this repo's history — most `type:user`
   records are not codeable tasks; expect a **low yield**, inferred).

**Per-repo split.** `token-killer` graded via its own `vitest`; `atlas` graded via its own
suite. **Never pooled into one number** (ADR 0022/0023: no cross-repo blended score). Report
each repo's table independently.

**Contamination rules — freeze a TIME-CUT ENVIRONMENT, not just a git SHA (T1; W5 §1;
ADR 0023 SWE-bench Verified discipline; Codex red-team objection #1, folded).** The dangerous
leak for *this* product is not future git history — it is ctx's own local state, because the
ctx memory store, `remember` facts, session summaries, and pushed digest are derived from the
**same session history the task bank is mined from**. A task mined from a 2026-06-20 session
could be "solved" by a 2026-06-21 `remember("the fix is in X")`. Therefore, per task, freeze
**everything as-of the task timestamp T**, and exclude any task whose environment can't be
reconstructed at T:
- **Repo:** checkout at the fix-parent commit; sandbox **truncates git history at that SHA** so
  no arm can `git log -p` the future fix (SWE-Bench-Pro leaked gold patches this way: −6.87 pt on
  Opus 4.6 once removed — measured-by-source, W5 §1).
- **ctx store / memory / index:** rebuilt (or filtered) to contain **only** entities/claims/notes
  with a source timestamp `< T`. Any `remember` note, session summary, or pushed digest authored
  after T is excluded from arm B. This is the load-bearing rule (SWE-bench analogue: 32.67% of
  "successful" SWE-bench+ patches had the answer already in the issue text — W5 §1).
- **Config:** `CLAUDE.md`/`AGENTS.md`/`.mcp.json`/skills/hooks pinned to their T-state; nothing
  the real fix later added.
- The without-ctx arm's materials must be a **strict subset** of what a human given only the
  environment-at-T sees; arm B adds only ctx's pre-T derived index.
- Any task whose answer is discoverable in a code comment / doc present at T is **kept** (both
  arms can reach it) but flagged, so ctx isn't credited for surfacing what a grep would.
- **Reported claim is scoped, not universal (Codex #2):** the bank is censored to objectively
  gradable tasks (criterion 2), which excludes exactly the design/navigation/refactor-judgment
  work where a context tool often claims value. So the headline is stated as **"among
  objectively gradable coding tasks"**, and §3's bank table reports **yield vs the full mined
  population** (how many of 33,459 records survived each criterion) so the censoring is visible,
  not hidden (ADR 0022 narrow-claim boundary).

**Held-out set (T4).** Reserve 30% of the bank, never used during ctx development/tuning; the
headline number comes from the held-out set only (W5 §4 benchmark-overfitting mitigation).

---

## 4. R1 — afternoon protocol (runnable tomorrow, zero new code beyond a shell script)

**Arm delta — the ONLY difference is ctx presence.** ctx reaches the agent by two channels
(measured, repo `packages/`): **pull** = MCP tools `context/search/remember` via project
`.mcp.json` (`packages/core/src/install/mcpConfig.ts`, server `ctx`, cmd `ctx mcp`), and **push**
= a rendered digest block placed into `CLAUDE.md`/`AGENTS.md` via `ctx push` / `.ctx/push.jsonc`
(`packages/core/src/push/`, cli `packages/cli/src/cli.ts`). "Full ctx" = both channels ON.

Exact config diff (everything else byte-identical):

| Knob | without-ctx (arm A) | with-ctx (arm B) |
|---|---|---|
| `.mcp.json` `mcpServers.ctx` | absent | `{command:"ctx",args:["mcp"]}` |
| `--allowedTools` | `Bash Edit Read Write Grep Glob` | same **+** `mcp__ctx__context mcp__ctx__search mcp__ctx__remember` |
| push block in `CLAUDE.md`/`AGENTS.md` | absent | present (`ctx push` output) |
| model | `--model claude-opus-4-8` (pinned, snapshot logged) | identical |
| system prompt / skills / hooks / repo SHA / sandbox | identical | identical |

**Arm A is a competent baseline, not a crippled agent (Codex #"baseline competence", folded).**
Arm A keeps full `Read Grep Glob Bash` — it can navigate and search the repo the ordinary way.
So the paired contrast isolates "does ctx's *derived* index beat competent grep/read," not "does
an agent with tools beat one without." (Optional third arm to fully separate "having ctx tools"
from "the tools having good content": `+ctx-tools, empty store` — see Q15.)

Do **not** use `--bare` (it skips `CLAUDE.md`/hooks/auto-memory — measured, W3 §1.2 — which would
also strip the push channel); instead use a **dedicated sandbox checkout per task** with per-arm
controlled config files, so the host's own `~/.claude` never leaks (Q10). `--max-turns` does **not
exist** in v2.1.201 — cap with `--max-budget-usd` instead (measured, W3 §1.2).

**Per-cell command** (task × arm × rep):
```bash
# sandbox = fresh worktree at TASK_SHA^ (parent of fix); history truncated
claude -p "$PROMPT" \
  --output-format json \
  --model claude-opus-4-8 \
  --max-budget-usd 3 \
  --permission-mode bypassPermissions \
  --add-dir "$SANDBOX" \
  ${ARM_B:+--mcp-config "$SANDBOX/.mcp.json" --allowed-tools "$TOOLS_B"} \
  > "run.$TASK.$ARM.$REP.json"
# grade:
( cd "$SANDBOX" && bash "$ACCEPT_CMD" ); echo "pass=$?"
# extract: jq '.usage.input_tokens, .num_turns, .total_cost_usd, .is_error' run.*.json
```

**Size.** N = **10 tasks** (mixed token-killer + atlas, reported per-repo) × M = **3 reps** × 2
arms = 60 runs (Q3). Interleave arm order per task to cancel ordering/drift (W5 §2).

**Output table** (per repo):

| task | passA/passB | M1_A (med of 3) | M1_B (med) | Δ=A−B | Δ% | turnsΔ |
|---|---|---|---|---|---|---|

**Decision rule — "did the number move" (crude, R1 only):** ctx is worth escalating to R2 iff
(a) `pass_B ≥ pass_A` on **≥8/10** tasks (guardrail holds), AND (b) median paired uncached Δ > 0,
AND (c) a 90% paired-bootstrap CI on the median Δ excludes 0 (W2 §1), AND (d) **total-input didn't
balloon** — median total-input Δ is not materially negative (the anti-gaming guardrail, §2 M1). R1
proves **direction under noise**, not a defensible population effect — it explicitly cannot clear
L3 rigor (§1 table).

---

## 5. R2 — full offline paired harness (architecture only)

Components (build order after grilling ratifies):
1. **Bank store** — frozen JSONL: `{id, repo, sha, prompt, accept_cmd, arm_config_hash, split}`.
   Immutable once R2 starts (pre-registration, W2 §4).
2. **Runner** — spawns one `claude -p` per cell; interleaved/counterbalanced arm order; pinned
   model ID + snapshot check before/after; retries capped and **logged as M5**, not silently
   re-run (a re-run drifts — ADR 0001 decision 6 recovery-not-rerun principle generalizes).
3. **Collector** — parses result JSON → one row per run (all M1–M6 + full invocation hash for
   audit, W5 §2). Never mutates.
4. **Analysis** — §7 pre-registered plan: paired bootstrap CI (primary), Wilcoxon + Hodges–Lehmann
   (secondary), Holm across ablation arms.
5. **Report** — per-repo tables, per-arm CIs, excluded-task log, config-delta hash. Reuses tk's
   **four-ledger discipline**: `estimate_kind` labels, measured never summed with opportunity
   (`src/core/ledger.ts`, "four ledgers … NEVER summed" — measured, W3 §3).

Reuse: tk's heuristic token estimator (`src/core/tokens.ts`, calibrated chars/token — measured,
W3 §3) is for the **opportunity** track only, never for M1 (M1 comes from the real API `usage`).
ctx store is SQLite (`packages/core/src/store/migrations/001-init.sql`: entities/claims/links/
conflicts — measured, W3 §3) — freeze a per-task copy at the task SHA.

Size: N = **40 tasks/repo** × M = **5 reps** × arms (baseline + ablation, §9). Fixed in advance;
power limitation disclosed, not over-claimed (Q11; W2 §2).

---

## 6. R3 — online opportunity / telemetry track

Different claim class (ADR 0022: "each host proves a different thing; never let a number measured
on one host impersonate another"). On VS Code Copilot / real IDE usage there is **no clean token
count** (fixed fact, goal §Constraints; memory: host-token-visibility). So R3 records **M7
opportunity signals** only, `estimate_kind:"opportunity"`, via tk's opt-in telemetry + `inspect`
scanner (`src/inspect/` — measured, W3 §3; ADR 0004 opt-in network telemetry). Reports "what ctx
avoided doing" (reads, payload, tool calls, index hits), never a token-savings %. Spec now, **build
deferred to post-R2** (Q12). No auto-falsification/demotion engine (ADR 0022).

---

## 7. Statistical analysis plan (PRE-REGISTERED — frozen before any full run)

Declared before R2 data collection; changing it after seeing data voids the pre-registration
(W2 §4; Simmons/Nelson/Simonsohn 2011 Table 2, read verbatim, W2 §4).

- **Design:** paired — same task, arm A vs arm B — cancels between-task variance (W2 §1). Reps
  within a task are **not** assumed independent (shared backend/cache/routing — Codex, T14): space
  reps beyond cache TTL or use a fresh session per rep, and treat the per-task **median of reps** as
  the unit of analysis, not each rep as an i.i.d. draw.
- **Primary test:** paired **bootstrap 95% percentile CI** on the **median** of per-task
  differences (B≥10,000 resamples of the difference vector; Berg-Kirkpatrick/Burkett/Klein 2012
  recentered paired bootstrap; Efron–Tibshirani percentile method — W2 §1). Chosen because the
  "up to 30× run-to-run variance" context makes differences heavy-tailed, breaking t-test
  normality (W2 §1). Effect is "real" iff the CI excludes 0.
- **Secondary:** Wilcoxon signed-rank (needs symmetry, not normality; T=Σsgn·rank) with
  **Hodges–Lehmann pseudomedian** as effect size (W2 §1); paired-t + **Cohen's dz = M_diff/SD_diff**
  reported only if the difference vector looks roughly normal (W2 §1).
- **Ablation arms:** multiple comparisons → **Holm step-down** (sort p, compare P_k to α/(m+1−k)),
  "uniformly more powerful" than flat Bonferroni at the same family-wise error (W2 §5).
- **Report per-arm CI, not one omnibus p** — a CI shows magnitude + direction + uncertainty per
  arm (W2 §5).
- **Fixed N, single look.** N declared in advance; **no interim peeking / optional stopping** —
  peeking every observation inflates false-positive to ~22% vs nominal 5% (Simmons et al. Fig 1,
  measured-by-source, W2 §4). Stopping rule stated before collection.
- **Exclusions (frozen):** a task-run is **void** (not a negative saving, not dropped silently) if
  either arm errors for non-task reasons (transport, budget cap) or the acceptance command is
  flaky (non-deterministic across reps). Void tasks are **reported with reason** (W5 §3). Report
  results with AND without exclusions (Simmons rule 5, W2 §4).
- **Sample-size honesty:** `n = ((z_{α/2}+z_β)/dz)²` needs an assumed dz + SD_diff we do not yet
  have (W2 §2); therefore R2's N=40/repo is a **fixed budget**, and any null result is reported as
  "no effect detectable at N=40 given observed variance," never "no effect" (Q11).

---

## 8. Quality guardrail & grading

The guardrail is **M2 objective acceptance**, not a judge — "a saving with a success regression is
fake" (goal §W4). Saving is counted only under `valid_saving := pass_B ≥ pass_A` (W4 §2). Prefer
objective checks over LLM judges everywhere (W5 §5). When a task genuinely needs subjective quality
(e.g. "is this refactor cleaner" — expect **rare**, and excluded from the bank by criterion 2 where
possible): anchored rubric + **blinded** grader (doesn't know the arm) + randomized presentation
order + human spot-check on a sample + a judge from a **different model family** than the system
under test — because LLM judges show position/verbosity/self-enhancement bias (Zheng et al. 2023,
arXiv:2306.05685; >80% human agreement but bias real — measured-by-source, W5 §5).

---

## 9. Ablation plan (memory / code-graph / docs facets separately)

Follows ADR 0024: **no full factorial**. Two orthogonal decompositions:

**By knowledge facet** (holding delivery = full): `baseline · +memory · +code-graph ·
+docs/decisions · +all`. Isolates which facet carries the M1 effect. This mirrors ADR 0024's K13
retrieval-technology arms (one locked config per cell).

**By delivery channel** (within +all): `pull-only (MCP) · push-only (digest) · both`. This is the
sharp one — **the push block ADDS input tokens to every turn while pull SAVES them by avoiding
reads** (inferred, from `packages/core/src/push/`). M1 is self-honest here: if push costs more than
it saves, M1 goes **up**, not down (T8). Mirrors ADR 0024's D7 projection arms inside the graph arm.

**Procedure (ADR 0024):** pick the facet winner and the channel winner **independently**, then run
**one combined confirmation** of the final config vs baseline (correctness non-regressing, expected
benefit present, tokens not reversed). Holm-correct across arms (§7). Do not chase higher-order
interactions beyond the single confirmation — accepted, disclosed limit (ADR 0024).

---

## 10. Threats to validity → mitigations

| # | Threat | Direction | Mitigation (this design) | Src |
|---|---|---|---|---|
| T1 | **Contamination via ctx's own local state** — memory/`remember`/digest built from the SAME session history tasks are mined from (a post-T note names the fix) | inflates ctx (strongly) | freeze **time-cut environment** at task T: repo at fix-parent + ctx store/memory/config filtered to source-timestamp < T; sandbox truncates git history | W5 §1, Codex #1 |
| T2 | **Arms differ beyond ctx** (prompt/tools/model drift/order) | any sign | freeze all but ctx; publish config-delta hash; pin+recheck model snapshot; same-day; interleave order | W5 §2 |
| T3 | **Task-selection / survivorship** — cherry-pick, drop failures | inflates ctx | freeze bank pre-run; report every excluded task + reason; completion-rate as own metric | W5 §3 |
| T4 | **Benchmark overfitting / Hawthorne** — tune ctx to the eval set | inflates ctx | 30% held-out set is the headline; blinded grading | W5 §4 |
| T5 | **LLM-judge bias** (position/verbosity/self-pref) | any sign | prefer objective M2; rubric+blind+multi-judge+human spot-check only when unavoidable | W5 §5 |
| T6 | **Optional stopping / multiple looks** | inflates significance | fixed N, single look, pre-declared stopping rule | W2 §4 |
| T7 | **Run-to-run nondeterminism** (temp≠0 even at 0; batch-variance; backend drift) | inflates variance | M reps + median-of-reps; bootstrap on differences; pin model; same-day | W2 §3 |
| T8 | **Push block inflates with-ctx input** | deflates OR inflates ctx | M1 captures it natively (net metric); channel ablation isolates push vs pull | §9 (inferred) |
| T9 | **Cache-TTL / pacing confound** — turn gaps shift input vs cache_read | any sign | same pacing both arms; report cache-read audit column; dedup-by-id | W4 §1 |
| T10 | **Metric-accumulation error** — miss cross-turn/cross-call sum, double-count parallel tools | any sign | dedup by message id; R2 validates top-level vs Σ iterations[] | W4 §1, Q1 |
| T11 | **External-validity** — toy/single tasks don't transfer (Peng 55.8% faster vs METR 19% slower on real repos) | over-claim | real mined tasks on own repos; per-repo report; no cross-host claim | W1 §3, W5 §7 |
| T12 | **Measurability censoring** — bank excludes design/nav/refactor tasks (no objective check), exactly where a context tool claims value | over-claim | scope headline to "gradable coding tasks"; report bank yield vs full 33,459-record population | Codex #2 |
| T13 | **Cache-segmentation gaming** — uncached Δ moves because push block shifts the cacheable prefix, not because work dropped | inflates ctx | three-column report (uncached + total + success); reject uncached-win + total-balloon | Codex #3 |
| T14 | **Rep non-independence** — reps hit the same backend/cache/routing, so they aren't clean noise samples | understates variance | space reps beyond cache TTL / fresh session per rep; disclose rep-correlation as a limit | Codex #other |

---

## 11. Cost & time budget per rung

All **estimated** (labeled; real-task runs cost more than the $0.18 trivial probe — measured, W3 §1.3).

| Rung | Runs | Wall time | $ (estimated) |
|---|---|---|---|
| R1 | 10×3×2 = 60 | one afternoon (+ ~½ day task-bank mining) | ~$50–150 |
| R2 | 40/repo × 5 × ~7 arms × 2 repos ≈ 2,800 | ~2–4 days incl. build | ~$1.5–4k |
| R3 | telemetry, marginal per run | ongoing, opt-in | ~0 (uses existing infra) |

The R1 cost is the point: cheap enough to **stop deferring measurement** (fixed fact, goal
§Constraints — P25 features-before-measurement is the debt this pays down). If R1's direction is
flat or negative, R2 is not spent.

---

## 12. Decision points (Q1..Q17 — RATIFIED 2026-07-06, P32)

Every choice a reasonable person could contest, as a question + ruling. Grilled 2026-07-06:
every committed recommendation below was confirmed; Q17 was added during grilling.

- **Q1 — Primary token field: top-level `usage.input_tokens` vs `Σ iterations[].input_tokens`?**
  Single-call top-level was consistent with the one iteration in the probe (measured) but multi-turn
  is unverified. **Rec:** R1 uses top-level; R2 validates by asserting top-level == Σ iterations on
  every run and switches to Σ if they diverge. Cheap insurance against T10.

- **Q2 — What counts as "ctx presence": pull-only or pull+push?** **Rec:** full-ctx = pull+push
  (the product default), because that's what ships; then the channel ablation (§9) tells us which
  half earns its keep. Measuring only pull would flatter ctx by hiding push's token cost (T8).

- **Q3 — R1 size (10×3)?** **Rec:** 10 tasks × 3 reps. Enough to see direction in an afternoon;
  not enough for L3 — and R1 is not asked to clear L3.

- **Q4 — Determinism: chase seeds/temperature-0?** The CLI exposes neither temperature nor seed
  (measured, W3 §1.2), and temp-0 isn't deterministic anyway (batch-variance; measured-by-source,
  W2 §3). **Rec:** do **not** chase determinism; absorb it with reps + median + bootstrap. Pin the
  model ID (the one lever we have).

- **Q5 — Acceptance-check derivation: auto vs hand-authored?** **Rec:** hand-author each M2 from
  the **real fix commit's test delta** (its FAIL_TO_PASS), audited once. Auto-derivation is
  unreliable and most mined prompts lack a clean test (criterion 2 low yield). This bounds bank size
  but keeps the guardrail trustworthy.

- **Q6 — Repo split: pool or separate?** **Rec:** **separate** always — token-killer and atlas each
  get their own table and CI (ADR 0022/0023 forbid a cross-repo blended number).

- **Q7 — Contamination freeze point: fix-parent SHA vs task-start HEAD?** **Rec:** fix-parent
  commit, with sandbox history truncated at that SHA. Strongest defense against the SWE-Bench-Pro
  git-history leak (W5 §1).

- **Q8 — Statistical primary: bootstrap CI vs Wilcoxon vs t?** **Rec:** paired bootstrap median-diff
  CI is primary (robust to the heavy tails 30× variance implies); Wilcoxon+Hodges–Lehmann secondary;
  t/dz only if differences look normal (W2 §1).

- **Q9 — R1 "moved" threshold?** **Rec:** guardrail on ≥8/10 tasks + median Δ>0 + 90% bootstrap CI
  excludes 0. Deliberately looser than R2 (90% not 95%, direction not magnitude) — it's a go/no-go
  gate, not a claim.

- **Q10 — Clean baseline via `--bare` or controlled sandbox config?** **Rec:** controlled sandbox
  config, **not** `--bare` — `--bare` skips CLAUDE.md/hooks, which would strip the push channel and
  make arm B untestable (measured, W3 §1.2).

- **Q11 — Is R2's N=40/repo enough given 30× variance?** **Rec:** treat N=40 as a fixed budget;
  report any null as "no effect detectable at N=40 given observed SD_diff," and publish the achieved
  power post-hoc (W2 §2). Honest floor beats an unbacked "no effect."

- **Q12 — Build R3 now or defer?** **Rec:** spec now, **defer build to post-R2**. R1/R2 answer the
  live question (does ctx save measured tokens); R3 is a weaker opportunity claim on other hosts.

- **Q13 — Held-out headline set?** **Rec:** yes — 30% of the bank never touched during ctx tuning;
  the reported headline is the held-out number only (W5 §4). Non-negotiable if we want the number to
  survive the overfitting critique.

- **Q14 — Contamination freeze: git SHA only, or full time-cut environment? (Codex #1)** **Rec:**
  full time-cut environment — freeze repo + ctx store/memory/config filtered to source-timestamp < T,
  not just the git SHA. This is the single most important change from the red-team: ctx's own local
  memory is a bigger leak than future git history, because tasks are mined from the same history that
  seeded that memory. Cost: harder task-bank build (must reconstruct or filter the store per task);
  worth it — without this the whole result is dismissible as "ctx searched the answer transcript."

- **Q15 — Add a third arm (`+ctx-tools, empty store`) to isolate retrieval value? (Codex baseline)**
  **Rec:** yes for R2, skip for R1. Arm A already has Read/Grep/Glob (a competent baseline), so R1's
  two-arm contrast is defensible; but a `tools-present, store-empty` arm cleanly separates "the agent
  has ctx tools" from "the tools return good content," mirroring ADR 0023's three-arm structure. Adds
  one arm to the R2 grid (already Holm-corrected).

- **Q16 — Report uncached only, or three columns? (Codex #3)** **Rec:** three columns always —
  uncached input (primary), total input incl. cache, and success rate — and require the claim to
  survive all three. Reporting uncached alone lets cache-segmentation shifts masquerade as savings.
  This slightly re-weights the "total is audit-only" fixed fact: total stays non-primary, but it is
  promoted from "ignore" to "anti-gaming guardrail."

- **Q17 — Bank-shortfall fallback: what if <10 tasks survive the inclusion criteria? (added in
  grilling)** **Rec (ratified):** first mine under the strict criteria; if short of 10, extend with
  **post-authored acceptance tests** — tasks still come from real session prompts, but the M2
  command is written now from the real fix commit's behavior. Anti-leak discipline: the author
  reads ONLY the fix commit, never the ctx store or either arm's config, so the test can't encode
  arm-favoring hints. If still short, accept the smaller N and scale the R1 gate proportionally
  (e.g. ≥6/8). Do NOT rewrite git commits into synthetic prompts — "real tasks, real prompts" is
  the result's core narrative asset, and rewording leaks answer phrasing.

---

## Handoff

R1 is runnable tomorrow with a shell script + a hand-authored task bank (Q5). Route (OPEN.md O-14):
~~ratify in grilling~~ **ratified 2026-07-06 (P32)** → implement R1 → run the afternoon → numbers
on the table. R2 is gated on R1 showing direction (budget pre-approved, P32). Evidence: W1–W5 in
scratchpad; smoke probe verified `claude -p` usage fields on v2.1.201 (measured); landscape
measurement-methods sweep in `landscape-measurement-methods-20260706.md` (no comparable tool
publishes a correctness-gated measurement).
