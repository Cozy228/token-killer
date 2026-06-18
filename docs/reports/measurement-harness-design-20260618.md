# Measurement harness — implementation design (Slice −1) — 2026-06-18

> Implementation companion to **[ADR 0016](../adr/0016-measurement-before-feature.md)** ("measurement
> precedes the feature") and **§9 Slice −1** of [`code-graph-design-20260618.md`](./code-graph-design-20260618.md).
> Grounds the telemetry methodology of [`low-token-agent-research-compendium-20260618.md`](./low-token-agent-research-compendium-20260618.md) §11
> against how the surveyed projects *actually* measure token saving (live-source audit, Appendix A).
> **Question answered:** how do we evaluate the search/read token saving of tk's code graph — honestly,
> in tk's measured-≠-estimate ledger model — *before* building the graph?

---

## 0. TL;DR

1. **tk's existing `saved_tokens = raw − delivered` does not transfer.** That is a *within-call diff* (the
   proxy sees both the raw output and the compressed output in one invocation). A code-graph query has **no
   raw counterpart in the same call** — its win is *replacing a multi-call grep/read loop that never
   happened in the treatment run*. That saving is the **difference between two whole trajectories**,
   observable only by running both arms. This is exactly why ADR 0016 forbids the graph writing `saved_tokens`.
2. **Two epistemically distinct tracks.** **Track 1 — offline A/B eval** (the real, measured proof, trajectory
   level) and **Track 2 — online opportunity accounting** (live mechanical facts, `estimate_kind=opportunity`,
   never `saved_tokens`).
3. **Primary metric = `uncached_input_tokens` delta**, not total-token compression ratio. The surveyed
   gold-standard (codegraph) counts *total tokens incl. cached* — but SWE-ContextBench measured **cache-read
   at >97% of total usage**, so a total-token delta mostly measures cheap cache replay, not avoidable cost.
   Measuring **uncached** is where tk is *more honest than codegraph*.
4. **Imitate codegraph's A/B protocol shape** (same tool class, same MCP delivery), with two improvements:
   `uncached`-primary, and medians+spread. Co-measure quality with the papers' methods (localization F1,
   AST validity, `FAIL_TO_PASS`+`PASS_TO_PASS`).
5. **Track 2 is independently validated by Serena**, which explicitly *refuses* token benchmarking and reports
   "call counts, payload sizes, prerequisite steps" instead — tk's exact opportunity-facts posture.

---

## 1. The crux — why `saved_tokens` does not transfer

tk's measured ledger (`src/core/savings.ts:14`, `calculateSavings`) computes `max(0, rawTokens −
outputTokens)` because the command proxy holds **both sides in one call**. Two different "wins" hide in a
code graph, and only one is measurable that way:

| Win | What it is | Within-call measurable? | Class |
|---|---|:--:|---|
| **W1 — output projection** | the graph's *own response* collapses container bodies → signatures | **yes** — `full bodies − collapsed` is a real raw−delivered diff | can be `measured`, like an existing handler |
| **W2 — loop avoidance** | the agent skipped 5×grep + 3×read because one `tk_explore` answered | **no** — counterfactual; the avoided loop never ran in the treatment arm | A/B only → `opportunity` online, `measured` offline |

The headline benchmark figures (codegraph's "47% fewer tokens") are **overwhelmingly W2**. So the centre of
gravity of the harness must be **trajectory-level A/B**, not within-call compression ratio.

---

## 2. Primary metric and the cache-token trap

The compendium §11 names `uncached_input_tokens` "the best measure of avoidable cost", and §12 risk #10
calls a high compression ratio that does not reduce uncached input "a fake win". The live-source audit makes
this concrete and urgent:

- **codegraph** counts `Tokens = total tokens processed (input incl. cached + output)` (Appendix A.1, verbatim).
- **SWE-ContextBench** measured, on SWE-Bench-style repo tasks, that **cache-read tokens are >97% of total
  usage** (Appendix A.6). Agentic spend is input-bound *and* history-multiplied, so most of "total" is the
  prompt prefix being re-sent and cache-read cheaply.

⇒ A total-token delta is ~97% measuring cache replay. **tk's Track-1 primary metric is the
`uncached_input_tokens` delta** (baseline − treatment), with `cached_input_tokens` reported alongside (never
summed). Prefer **provider-reported usage** (Copilot CLI / Claude Code emit it); fall back to
`estimateTokens` (`src/core/tokens.ts:72`) only when provider numbers are unavailable — and only for
*relative* A/B comparison, where the same estimator on both arms cancels its bias. No absolute external %
claim is ever made on the estimator alone.

---

## 3. Track 1 — offline A/B eval (the measured proof)

The gate ADR 0016 requires before any external % claim. Protocol, imitating codegraph (Appendix A.1) with
the two improvements above:

```
fixed task set  ──►  for each task, run N times per arm, take the median (run-to-run variance is up to 30×)
 (§11 categories)     ┌─ BASELINE arm:   agent, tk MCP graph OFF (host-native grep/read/glob stay available)
                      └─ TREATMENT arm:  agent, tk MCP graph ON  (same native tools also available)
 capture per run:     ① provider usage  (total / input / cached / UNCACHED / output)
                      ② full session transcript  ──►  trajectory analyser (§4)
                      ③ task oracle verdict       (pass / fail, + edit correctness)
 report:              Pareto(success_rate × median uncached_tokens)
                      + secondary deltas: tool_calls · file_reads · search_calls · duplicate_reads ·
                        distinct_files_touched · rounds · latency
```

**Arm definition (copied from codegraph's `--strict-mcp-config` shape):** WITH = tk graph MCP enabled;
WITHOUT = empty MCP config; **both arms keep the host's built-in read/grep/bash** so the only variable is the
graph. Same task per arm.

### 3.1 Task set

The compendium's 11 categories: *locate implementation · understand module architecture · follow call chain ·
modify function · add test · fix failing test · debug build error · inspect git diff · update config ·
understand component state flow · trace API route → service → database.* v1 starts with **one task per
category on a known repo with an answer key** (tk's own repo is the cheapest oracle source).

### 3.2 Quality / safety co-measurement (imitate the papers, not the marketing repos)

A token win that drops task success is a regression, not a win. Co-measure:

- **Localization quality — F1** (FastContext): for *locate/trace* tasks, `F1 = 2PR/(P+R)` of returned
  `file:line` against a patch-derived ground-truth set, instance-averaged.
- **Edit safety — AST validity** (SWE-Pruner): any code body the graph projects must parse; tree-sitter
  parse-success rate of returned snippets (SWE-Pruner: 87.3% vs 0.29% for naive truncation).
- **Task success — `FAIL_TO_PASS` + `PASS_TO_PASS`** (SWE-ContextBench): for *fix/modify/add-test* tasks,
  the target tests flip failing→passing *and* no regression in previously-passing tests.

### 3.3 Safety via fallback-replay → `omission_bug_rate` (the core safety number)

Verbatim from compendium §11, made operational:

1. Run the task in the **treatment** arm (graph projections enabled).
2. If it **fails — or succeeds with suspicious retries** — identify the projected evidence the graph
   introduced (collapsed signatures, low-confidence hand-backs, staleness-banner files).
3. Re-run from the same checkpoint with **only those outputs escalated to raw / full-exact** form.
   *Pragmatic v1:* re-run the whole task with the graph forced into "raw passthrough" mode (full bodies, no
   signature collapse) and compare.
4. If the task **flips failure→success** or the answer fixes a factual omission, count one **context omission
   bug**. `omission_bug_rate` = omission bugs / treatment runs.

This turns the §8 quality gate from a slogan into a measured rate, and is the safety counterweight to the
token metric (token spend alone does not predict success — arXiv 2604.22750).

---

## 4. The trajectory analyser (the main build gap)

A/B needs per-run trajectory metrics that tk does **not** yet compute. tk's inspect session readers already
extract one `FlatRecord` per tool call `{tool_name, tool_input, tool_response, timestamp, sessionId}` from
Copilot/VS Code transcripts (`src/inspect/vscodeReader.ts:24`), and the `ToolCategory` classifier already
labels read/search/etc. The analyser consumes those and computes, per session/run:

| Metric | Operational definition (compendium §11) | Build note |
|---|---|---|
| `tool_calls` / `search_calls` / `file_reads` | counts by `ToolCategory` | classifier exists; just aggregate per-run (habits.ts only does mean/max) |
| `duplicate_reads` | keyed `(normalized_path, selector_type, selector_value, file_hash)` — separates "same path after change" (hash differs) from "wasteful re-read" (all equal) | extract path+range from `read_file` tool_input; `selector_type` ∈ whole-file / range / symbol; hash from content when available, else `(path,mtime)` proxy |
| `repeated_file/range/symbol_reads` | same file/range/symbol read >1× | derived from the dedup key above |
| `distinct_files_touched` | unique files surfaced to the agent | union of read/search-result paths |
| `search_result_usefulness` | a search is *useful* if one of its top candidates is read/edited, appears in the final diff, or is named in the final answer **within the next k tool actions** | parse candidate paths from the search `tool_response`, then look ahead k records |

Privacy: counts + labels + hashes only, no raw bodies — same posture as the existing scanner
(`src/inspect/scan.ts`).

---

## 5. Track 2 — online opportunity accounting (never `saved_tokens`)

Live, per graph query, into a new **opportunity ledger** (③-style; `estimate_kind=opportunity`; reuses the
four-ledger separation in `src/core/ledger.ts:65` so it is rendered side-by-side and **never summed** with
measured accounts). Records **mechanical facts of what the query did**, *not* a savings figure:

- `nodes_returned`, `files_returned`, `tokens_returned` (of the graph's own response)
- `tool_calls_collapsed` = 1 (the single call standing in for the loop it replaces)
- `reads_avoided_in_session` — cross-referenced with the §4 analyser: did the agent subsequently *not* read
  files the graph already served verbatim?

The **only** token-savings number tk may surface next to this is the **reference rate measured in Track 1**,
explicitly labelled `measured-in-eval, not on your machine`. A borrowed benchmark % (codegraph's 47%, a
Repomix 70%) is **never** shown as if it were this user's measured saving — that is precisely the dishonesty
tk's ledger model exists to prevent.

> **Independent validation.** Serena (the LSP-precision standard) *refuses* token benchmarking — its authors
> state benchmarks are "too small / self-contained" and token reduction is "harder to measure precisely", so
> they report **call counts, payload sizes, prerequisite steps** instead (Appendix A.5). That is Track 2's
> posture exactly. tk goes one step further by *also* building Track 1 to obtain a real measured %.

---

## 6. Reuse vs build, and the slice ordering

| Concern | Reuse (tk has it) | Build fresh |
|---|---|---|
| Token denominator | `estimateTokens` `src/core/tokens.ts:72` (fallback only) | provider-usage capture per run (primary) |
| Trajectory source | inspect readers `src/inspect/vscodeReader.ts:24` + `ToolCategory` classifier | per-run aggregation |
| Ledger separation / `estimate_kind` | four-ledger model `src/core/ledger.ts:65` | the opportunity ledger (Track 2) + an eval-results ledger (Track 1) |
| Bench scaffold | `scripts/benchmark/run.ts` (5-phase VM) | the A/B runner hooked into it |
| — | — | **trajectory analyser** (`duplicate_reads`, `search_result_usefulness`, …) |
| — | — | **A/B runner** (drive `copilot`/`claude -p` headless, MCP on/off, collect usage) |
| — | — | **task oracle** (per-task answer key / test verdict) |
| — | — | **fallback-replay** harness (omission-bug counting) |

**Slice −1 minimal viable closure (recommended):** single host (Copilot CLI headless) · 11 tasks × 1 each ·
N=5 medians · `uncached` primary · trajectory analyser with `duplicate_reads` + `search_result_usefulness` ·
fallback-replay as step 2. Track-2 online accounting ships alongside the graph slices, not in Slice −1.

---

## 7. Honesty boundaries (the invariants this harness must hold)

1. **Provider usage > estimator** for any absolute claim; estimator only for same-arm relative A/B.
2. **`uncached_input_tokens` is the primary number**, never total-incl-cached (the 97% trap).
3. **Medians + spread**, never single-run (field-wide variance up to 30×; nobody reports CIs — medians
   already put tk at/above field norm).
4. **Token win is never reported without the success-rate / omission-bug counterweight** (token spend does
   not predict success).
5. **Opportunity ≠ measured.** Track 2 facts carry `estimate_kind=opportunity` and never occupy the
   `saved_tokens` name (reserved for ledger ①).

---

## 8. Open questions (to resolve before building)

1. **Host + agent runner for Track 1:** Copilot CLI headless (tk's stated target) vs Claude Code headless
   (cleaner `usage` reporting). Decides how provider-usage capture is wired. *Lean: Copilot CLI for fidelity
   to the target; add Claude Code as a second arm if its usage stream is materially cleaner.*
2. **Task oracle source:** hand-author a small tk-repo task set (cheap, controllable, fits the 11 categories)
   vs adopt an external SWE-bench-style set (more authoritative, much heavier). *Lean: tk-repo set for
   Slice −1; revisit external sets once the harness shape is proven.*

---

## Appendix A — how the surveyed projects measure token saving (live-source audit, 2026-06-18)

Four measurement *philosophies*. Only **A (trajectory A/B delta)** measures W2 (loop avoidance); B/C answer a
different question; D is unsubstantiated.

### Bucket A — trajectory A/B delta (the imitable template)

**A.1 codegraph (colbymchenry) — gold standard for a *tool* project.** Verbatim methodology:
> "Each arm is `claude -p` (Claude Opus 4.8) run headlessly against the repo with `--strict-mcp-config`:
> **WITH** = CodeGraph's MCP server enabled, **WITHOUT** = an empty MCP config. Built-in Read/Grep/Bash stay
> available to both. Same question per repo, **4 runs per arm, median reported**. Cost = the run's
> `total_cost_usd`; Tokens = total tokens processed (input incl. cached + output); Time = wall-clock; Tool
> calls = every tool invocation, including those inside any sub-agents the model spawns."
7 repos (VS Code/Excalidraw/Django/Tokio/OkHttp/Gin/Alamofire), 1 query each, provider-reported tokens.
Transparent + externally verifiable; **no runnable script**. *Caveat tk fixes:* total-incl-cached token
counting (see §2). Confidence: high.

**A.2 claude-context (zilliztech).** Baseline = simple read/grep/edit; treatment = +MCP; GPT-4o-mini; 30
SWE-Bench-Verified instances (2-file-mod, 15–60 min); 3 runs/method; 73,373 → 44,449 tokens (~39%); tool
calls −36%; retrieval P/R/F1 ~0.40 held. Eval scripts exist; token-counting method unstated. Confidence: medium.

**A.3 FastContext (Microsoft, 2606.14066) — most rigorous protocol.** Baseline = mini-SWE-agent direct read;
treatment = + trained explorer subagent. **Token accounting splits main-agent vs explorer** (explorer-internal
tokens excluded from the main account; overhead reported separately ≈2.1%). SWE-bench Multilingual 300 / Pro
200 / SWE-QA (GPT-5.4 judge). Localization **F1** (instance-averaged, patch-derived ground truth). 45 configs,
single-run-per-config. Full code + checkpoints. Confidence: high.

**A.4 SWE-Pruner (2601.16746).** Baseline = agent reads full files; treatment = +neural skimmer. **"76.1% of
tokens = reads" derived by action-category tokenization** (classify each round's tokens into read/execute/edit;
cross-validated 67.5% on GLM-4.6). Reduction reported as a **23–54% range** (headline 39% token / 26.8% cost).
**AST validity** via tree-sitter (87.3% vs 0.29% naive). 50-sample SWE-Bench subset + SWE-QA; 3 seeds (partial).
Open-source. Confidence: medium-high.

**A.5 SWE-ContextBench (2602.08316) — the oracle-ceiling method.** 5 settings (no-experience / free / oracle
× trajectory / summary); 300 SWE-Bench-Lite + 99 derived; success = `FAIL_TO_PASS` ∧ `PASS_TO_PASS`. **Key
data points tk relies on:** cache-read >97% of usage; summary 217 tok vs full trajectory 25,634 tok; oracle
summary 34.34% vs 26.26% baseline. Single-run/setting. Confidence: high.

### Bucket B — budget cap (no delta claim)

**aider repo-map.** No % claim; **binary-searches ranked tags to fit `--map-tokens`** (default 1024, ±15%
tolerance, `ok_err=0.15`); counts via `litellm.token_counter(model=…)` (model-aware), ~1% line sampling for
large texts. Self-states "the token counts aider reports are *estimates*" and "aider never *enforces* limits".
Transparent, reproducible, but answers "does it fit the budget", not "how much did it save". 

**Probe (probelabs).** No % claim; `--max-tokens` cap only; tokenizer undocumented; states the structural
efficiency claim ("one call vs 10+ agentic loops") but no measured delta.

### Bucket C — structural / on-demand (saving by design, unmeasured)

**codesearch (flupkede).** Returns metadata by default (`compact=true`), full code via `get_chunk` on demand.
Saving is architectural; no corpus, no measured %.

### Bucket D — unsubstantiated headline (avoid imitating)

**GitNexus** — "74% / 88%" appears **nowhere** in the (1300-line) repo/docs; no baseline, dataset, or method.
**Repomix** — "~70%" with no corpus/method; the compression mode is self-marked **experimental** and unfit for
exact edit/debug reads. **cocoindex-code** — "~70%" from a single anecdote (1.8K → ~650 tokens). These are the
marketing-% pattern tk's measured-≠-estimate ledger exists to refuse.

### Rigor ranking (for imitation priority)

`FastContext ≈ SWE-ContextBench ≈ codegraph (high) > SWE-Pruner (med-high) > claude-context (med) > aider
(high *as a cap*, n/a as a delta) > Probe / codesearch (no delta) > Repomix / cocoindex / GitNexus (unsubstantiated)`.

**Cross-cutting facts:** none of the surveyed work reports statistical-significance tests or confidence
intervals; single-run or few-seed is the norm; run-to-run variance is universally acknowledged. tk reporting
**medians + spread** already exceeds field norm.

---

## Appendix B — references

- Compendium §11 (telemetry set, operational defs, fallback-replay, eval principle):
  [`low-token-agent-research-compendium-20260618.md`](./low-token-agent-research-compendium-20260618.md).
- ADR: [0016 measurement-before-feature](../adr/0016-measurement-before-feature.md) · scope
  [0013](../adr/0013-code-graph-surface-scope.md).
- tk infra: `src/core/tokens.ts` (estimator), `src/core/savings.ts` (within-call diff), `src/core/history.ts`
  (`HistoryRecord`), `src/core/ledger.ts` (four-ledger `estimate_kind` separation), `src/inspect/vscodeReader.ts`
  + `src/inspect/scan.ts` + `src/inspect/habits.ts` (trajectory source), `scripts/benchmark/run.ts` (scaffold).
- Sources audited live 2026-06-18: codegraph (github.com/colbymchenry/codegraph), FastContext
  (arxiv 2606.14066 + github.com/microsoft/fastcontext), SWE-Pruner (arxiv 2601.16746), SWE-ContextBench
  (arxiv 2602.08316), claude-context (github.com/zilliztech/claude-context), aider (aider.chat/docs/repomap.html),
  Probe (github.com/probelabs/probe), codesearch (github.com/flupkede/codesearch), Serena (github.com/oraios/serena),
  Repomix (repomix.com/guide/code-compress), GitNexus (github.com/abhigyanpatwari/GitNexus), cocoindex-code.
