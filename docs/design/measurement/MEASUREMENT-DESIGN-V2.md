---
status: active
review_after: 2026-08-01
ratified: 2026-07-10 (maintainer ruled F1–F4, all per recommendation → FABLE-DECISION-LOG P38)
purpose: measurement design v2 (P37 ⑦ + refinement b) — supersedes parts of MEASUREMENT-DESIGN.md (P32)
supersedes: see §7 table (silent replacement forbidden)
---

# MEASUREMENT-DESIGN-V2 — what the v1 run taught us, and what v2 measures

v1 (P32, `MEASUREMENT-DESIGN.md`, Q1–Q17) was built and actually ran. This doc is the
REDESIGN P37 ⑦ requires before any grid result counts. Every claim below is sourced from
the on-disk run artifacts (`tools/measurement/.work/`), the harness deviation log
(`tools/measurement/implementation-notes.md`), and session `4a64f8f6` (2026-07-09
read-only analysis session). Evidence class per claim-discipline: (measured) = read from
artifacts; (stated) = in-session assistant analysis; (inferred).

---

## 0. What actually happened in the v1 run (evidence register)

| # | Fact | Evidence |
|---|---|---|
| E-1 | Sonnet grid: 72 rows = 66 planned (11 tasks × 2 arms × 3 reps) **+ 6 leftover rows** of `atlas-cache-valkey-resilience` concatenated from an earlier 7-task draft grid (task since dropped — needs live Valkey). The report was computed over the contaminated set. | (measured) `r1-grid-sonnet/grid-plan.json` vs `runs.jsonl`; row mtimes 07-06 vs 07-07 |
| E-2 | Sonnet verdicts: atlas **HOLD** — guardrail ✓ (passB 0.83 ≥ passA 0.78), median uncached Δ +12 ✓, **CI90 [−4, +29] includes 0 ✗**, total not ballooned ✓. token-killer **INSUFFICIENT_DATA** — 31/36 cells void, only 1 task paired. | (measured) `r1-grid-sonnet/report.json` |
| E-3 | 30 of the 31 tk voids are ALL 5 tk-* tasks × 2 arms × 3 reps, `void_reason: "is_error/stop_reason=stop_sequence"` — the runner/sandbox dies at turn 1 on every tk task. +1 `claude exit 143 / unparseable json`, +1 atlas void. **ROOT-CAUSED 2026-07-10 (diagnosis round): NOT tk-specific — account-level weekly-limit 429 exhausted at the atlas→tk grid boundary** (raw cells: `api_error_status:429`, "hit your weekly limit", usage all-zero, turns=1, 30 rejections at 4 s cadence; same tk tasks succeeded at other timestamps). `stop_sequence` was the CLI's label for a pre-inference rejection — a red herring. The grid's limit-abort safeguard missed the wording (regex lacked "weekly", never read `api_error_status`). Fixed harness-side: structured-429 fail-fast gated on `is_error` + task-family round-robin in buildOrder so a mid-grid cap degrades both repos partially instead of zeroing one family. | (measured) row.json sweep; run.*.json 429 evidence |
| E-4 | **Uncached input (M1, v1 primary) has almost no dynamic range**: per-task whole-run M1 is 8–538 tokens; the atlas paired Δ is +12 [−4,+29]. Meanwhile **median paired TOTAL input Δ is ≈ +166k (atlas) / +105k (tk n=1)** in arm B's favor — two orders of magnitude more signal, but v1 rules count total only as an anti-gaming guardrail. | (measured) `report.json` medians |
| E-5 | **Adoption is the gating variable**: in the sonnet grid's 20 graded B-arm runs, only **3 ever called ctx** (8 calls total). The 3 ctx-using runs all passed (1.00 vs 0.82 for the 17 non-users; n too small to claim). v1's arm B measures "ctx available", not "ctx used". | (measured) transcript scan, session 4a64f8f6 |
| E-6 | Codex grid `report.json` (100% void: `codex exit 1 / no usage` ×55, `codex tool error` ×8, `no live reps` ×3) is **STALE** — root cause was codex↔`chatgpt.com/backend-api/ps/mcp` transport failures. A later rerun ("rerun-fast", same dir) yields **48 pass / 13 fail / 5 void** (all 5 = `codex exit 124 / no usage` timeouts). No fresh report.json was generated over the rerun rows. | (measured) mtimes 07-09 00:21 vs 23:31; `rerun-fast-summary.json` |
| E-7 | Codex model-label drift: 63/66 rerun rows are `gpt-5.5-fast`, only 3 remain `gpt-5.5-medium`, in a dir named `r1-grid-codex-gpt55-medium`. Nothing asserts per-grid model homogeneity. | (measured) `runs.jsonl` model field |
| E-8 | Protocol pilot (2 tasks × 5 conditions × 1 rep, gpt-5.5-low): adoption rate none 0 / optional 0.5 / suggested 0.5 / forced 1.0 / forced-inspect 1.0; pass 0/0.5/0.5/0/0. **Every condition ran ~1 turn with tool errors on most rows** — the codex exec loop itself was broken, so outcome numbers are uninterpretable; only the adoption-rate mechanism was demonstrated. | (measured) `protocol-report.json`; (stated) session diagnosis |
| E-9 | In 2 pilot cells the **ctx MCP `context` tool call itself timed out at 300 s** (`timed out awaiting tools/call`). Product-side signal, reported here, not acted on (standing rule: adjacent problems get reported, not fixed in this round). | (measured) `raw-output.json` forced.0 / suggested.0 |
| E-10 | Task bank on disk = **11 tasks** (5 atlas + 6 tk), all flagged `prompt_reviewed:true`; but `implementation-notes.md` records only 4 atlas prompts as Fable-vetted and 6 tk + 1 atlas reviews still OWED, and `task-bank-review.md`'s 4-item finalization checklist is unchecked. The flag and the log contradict; the 60-vs-66 "discrepancy" is just 11×2×3=66 vs the design's planned 10 tasks. | (measured) jsonl vs notes |
| E-11 | The uncommitted `tools/measurement/` changes (tool-errors-not-void diff + 3 protocol scripts) were authored BEFORE session 4a64f8f6 (file mtimes precede it; that session was read-only). No session transcript documents their rationale; the protocol runner's header comment states it: "Tool failures are diagnostics, not voids." | (measured) mtimes; git status |
| E-12 | **Condition contamination**: arm B's checkout carries the ctx push block, whose managed text ends with an imperative — "Start tasks with the `context` MCP tool; drill down by passing back any [handle]" (`armB/repo/AGENTS.md`). So the pilot's `optional` condition was steered, not organic; its 0.5 adoption rate measures "adoption given the product's own onboarding text". | (measured, verified in pilot armB checkout) |
| E-13 | **Treatment/metric mismatch**: the `forced` prompt requires ctx "before any source edit", but the recorded adoption metric is `ctx_before_first_command` — first ctx event vs first `command_execution` event (any shell command, incl. exploration). An agent that legitimately explores first and calls ctx before editing scores false. | (measured, `run-cell-codex-protocol.ts` promptForProtocol vs parseCodexJsonl) |
| E-14 | **Prompt↔grader contract violation** (`tk-install-auto-wires-copilot`): the prompt names the copilot detection dir as `~/.copilot/hooks/`, but the golden fix test detects via `mkdirSync(join(home, ".copilot"))` — bare `~/.copilot` (initCli.test.ts:124-142). An agent implementing exactly what the prompt says fails the grader. The pilot's tk 0/5 pass column is therefore INVALID, and this task was `prompt_reviewed:true` — review did not check the prompt against the golden test's observable contract. | (measured, fix-tests vs bank prompt) |
| E-15 | **ctx product defects surfaced by the pilot** (beyond the E-9 300 s timeouts): a no-seed miss returns guidance ending "…or use task mode" even when the query WAS task mode (`packages/core/src/select/engine.ts` unknown-ref branch, guidance text verified; circularity as experienced by the pilot agent stated in the ChatGPT analysis); the 3 successful tk ctx calls reportedly returned similar VS Code/history docs, missing current implementation code (stated, not independently re-verified — E0 quantifies this). | (measured: guidance text; stated: relevance) |
| E-16 | **Attribution failure in the pilot's own passes**: the only 2 passes (atlas, optional/suggested) are not attributable to ctx — the optional pass never called ctx; the suggested pass had its ctx call time out and passed anyway. | (measured) protocol rows + raw-output |
| E-17 | **Symlink materialization defect (found at E0 sandbox rebuild, 2026-07-11)**: atlas commits `CLAUDE.md` as a relative symlink → `AGENTS.md`; `cpSync` (default `verbatimSymlinks:false`) rewrote it to an ABSOLUTE link back into the shared `base/`, so `ctx push` wrote through and put the ctx disclosure block into arm A's instruction file (all 5 atlas sandboxes; §1c violation) + both arms aliased one mutable file (cross-arm write channel). A4 was blind (compares symlink target strings). E0 reports unaffected (bench reads only store/.mcp.json). FIXED same day: `verbatimSymlinks:true` copy + loud symlink-escape guard (negative-tested); atlas sandboxes rebuilt, armA verified clean, A4 `differing=["AGENTS.md"]`. | (measured) readlink + grep evidence; fix in make-sandbox.ts |

---

## 1. What question(s) is v2 answering? (mission item 1)

**Root question (maintainer, 2026-07-10 follow-up ruling): does calling ctx have a
DECISIVE effect on task outcomes — and if not, is that because ctx is not good enough,
or because the model doesn't use it at the right moment in the right way?** Measurement
exists to answer that; nothing is measured for its own sake. The v1 run and the pilot
could not answer it because they mixed three failure sources in one grid: ctx product
defects (E-9/E-15), condition contamination + treatment/metric mismatch (E-12/E-13),
and grader errors (E-14). v2 separates them into a ladder — each stage isolates one
source and gates the next; a failed stage stops spend and routes to product/harness
fixes instead of more cells:

| Stage | Isolates | Question |
|---|---|---|
| **E0** instrument benchmark (NEW, runs FIRST — no agent in the loop) | ctx itself | is the tool reliable and relevant enough to be worth an agent's call? |
| **E1** adoption | usage policy | does an agent use ctx (organically / when nudged / when forced)? |
| **E2** value-given-use | outcome | given real use, does ctx move tokens/pass decisively? |

v1 asked one question; the run exposed that it silently bundles two (E1/E2) and
presupposes a third (E0):

- **E2 — value-given-use**: on real frozen tasks, does using ctx cut input tokens at
  equal-or-better pass rate? (v1's original question.)
- **E1 — adoption**: does an agent USE ctx when it is merely available? (the unratified
  pilot's question — and per E-5 the variable that decides whether E2's arm B is even a
  treatment.)

**v2 structure: two experiments, one harness, never blended.**

- **E1 (adoption)** runs protocol conditions `none / optional / forced` (drop `suggested`
  and `forced-inspect` from the headline grid: 5 conditions × small N diluted the pilot;
  the two dropped conditions stay available in the runner for follow-ups). Metrics:
  ctx_call_rate, ctx_before_first_command, ctx_errors, per-condition pass rate. Purely
  descriptive — no gate, no CI. Adoption numbers are reported per model/runner and never
  pooled across runners.
- **E2 (value-given-use)** is the paired A/B of v1 **with the treatment made real**:
  arm B runs under the `forced` protocol (one `mcp__ctx__context` call before edits — the
  minimal prompt that achieved 100% adoption in the pilot, E-8). **T2 guard (self-attack
  finding):** a forced preamble in B only would make the arms differ beyond ctx; arm A
  therefore gets a structurally matched placebo preamble ("Before any source edit, locate
  the relevant files with repository search and inspect them.") so both arms carry an
  equivalent workflow directive and the delta stays ctx-only. Both preamble texts are
  frozen pre-run and published with the config-delta hash. Gate and stats per §4.
- **O-14 headline = E2** (the token/pass claim is the debt P25 deferred; it is what a
  skeptic asks first). E1 is reported alongside as the adoption qualifier: "value shown
  under forced use; organic adoption at X% (E1) is the product's onboarding problem, not
  the measurement's." — RULED F1, §9.

The scoped-claim discipline (P32/T12) extends: the E2 headline now reads "among
objectively gradable coding tasks, **when ctx is invoked**". That is honest: it measures
the tool's ceiling value, and E1 measures how often the ceiling is reached organically.

## 1b. E0 — standalone ctx retrieval benchmark (runs FIRST; maintainer-ordered)

Directly benchmarks the instrument, no agent in the loop. Frozen index (one `ctx sync`
per repo at the task-bank SHA, then read-only), a fixed query set derived from the 11
bank tasks (the task prompt as the `context` query, plus 1–2 drill-down queries per
task using returned handles), **10 reps per query** against the MCP server.

Metrics per query (report distributions, not just means):
- **reliability** — completion rate (no timeout / no transport error), latency p50/p95
  (the E-9 300 s hangs make this the first gate);
- **relevance** — fraction of returned refs that hit **current implementation code or a
  governing decision** for that task vs stale/adjacent docs (ground-truth: the real fix
  commit's touched files + the decision entries that govern them — authored per task
  once, before any run, same anti-leak discipline as Q17);
- **actionability** — handle drill-down success rate (every advertised [handle]
  resolves), and miss-message honesty (a no-seed miss must not emit misleading guidance
  — E-15's "use task mode" circularity is the counterexample).

Gates (pre-registered): timeout rate ≈ 0 (any hang = product defect, fix before E1/E2);
relevance floor per repo (exact threshold set when the ground truth is authored — before
results exist); drillability ≈ 1. **E0 failing any gate stops the ladder**: findings
route to OPEN.md product items (O-32 timeouts, O-33 miss-guidance), get fixed, and E0
re-runs. Only a passing E0 authorizes paid E1/E2 cells. E0 is cheap (no model spend —
pure local tool calls), so it re-runs after every relevant product fix.

**Landscape note (sonnet survey, 2026-07-10 — full report in session; frozen sweep =
`landscape-measurement-methods-20260706.md`):** no comparable project publishes a
standalone retrieval-only benchmark — closest analogues are RepoDocBench's
Completeness@K (still end-to-end-integrated) and ADR 0023 item 4 (tk's own unbuilt
proposal). E0 therefore has no external template; its ground-truth shape borrows
codegraph's rubric structure ("KEY SYMBOLS a correct answer must hit" + dynamic
boundaries, `offload-eval-ground-truth.json`) applied to fix-commit touched files +
governing decisions. Corrections to earlier beliefs: codegraph's arms are
offload/raw/nocg/**frontload** (pre-computed exploration injected via hook — the
structural analogue of our push channel), not "5 arms A–E"; GitNexus's 74%/88% traces
to a 3-query single-codebase aggregate with no reps and no correctness check. Nobody
in the field reports CI/significance; only academic papers pair tokens with success —
v2's E2 gate already exceeds field practice, keep it.

## 1c. Condition hygiene (maintainer-ordered, applies to E1 AND E2)

All conditions run **byte-identical checkouts and instruction files**; the ONLY deltas
are (a) whether the ctx MCP server is configured and (b) the user prompt. Consequences:
- The push block's imperative line ("Start tasks with the `context` MCP tool…") is
  **stripped/neutralized in every E1 checkout** — E-12 showed it turns `optional` into a
  steered condition. Organic adoption = tools present, nothing tells the agent.
  Product-as-shipped steering (push block intact) is a SEPARATE, explicitly named
  condition (`optional-shipped`) if run — never conflated with `optional`.
- E2 keeps the frozen preamble pair from §1 (forced vs placebo) as the only prompt
  delta; the push block question applies there too — arm B's block carries the same
  neutralization unless the cell is explicitly measuring the shipped bundle (Q2's
  pull+push definition then applies to a named `shipped` arm, not silently).
- **Adoption metric aligned to the treatment** (E-13): primary adoption flag =
  ctx called **before the first file edit** (`file_change` event), matching the forced
  instruction; before-first-command is kept only as a secondary descriptive column.
  E1 additionally records **tool-choice share** — ctx calls vs Read/Grep/Glob call
  counts per run (the only adoption-measurement precedent found in the field,
  codegraph `ab-adoption.sh`, measures exactly this shift rather than a boolean).
- **MCP-connection assertion per cell** (HarrisonSec reproduction found silent
  no-MCP runs completing as if measured): every arm-B/protocol cell logs whether the
  ctx MCP server actually connected (server handshake or first tool listing); a cell
  whose treatment silently failed to attach is infra-void, not a "0 adoption" data
  point. Runner uses strict MCP config + pre-warmed server where the host supports it.
- **Prompt↔grader contract check** added to the bank review: for every task, the
  reviewer verifies the prompt's observable claims against the golden test's actual
  fixture (E-14's `~/.copilot/hooks/` vs `~/.copilot` mismatch is the class instance);
  the pilot's tk 0/5 pass column is RETRACTED as invalid.

## 2. Void policy (mission item 2)

Why the codex arm "voided 100%": not ctx, not the tasks — (a) MCP transport failures
between codex and its own backend (E-6), then (b) v1's rule `toolErrors > 0 → void`
converting every row with ANY failed tool item into a void, and (c) a stale report
narrating (a)+(b) as a verdict. The uncommitted diff removed (b).

**RULED (F2, 2026-07-10): the tool-errors-not-void change is RATIFIED**, with this
taxonomy replacing v1 §7's single void rule:

| Class | Definition | Handling |
|---|---|---|
| **infra-void** | runner exit ≠ 0, no usage record, timeout (exit 124), MCP transport failure before any grading | row excluded from pairing; reason string recorded; counts toward the max-void bar |
| **graded** | usage present + acceptance command ran | pass/fail counts; `tool_errors` recorded as an M5 diagnostic column, NEVER voids the row (a mid-run tool error is part of how the arm worked; grading is separate — v1 already said `is_error ≠ fail`) |
| **contaminated** | row not in the grid-plan step list (E-1 leftovers) | analyze must filter runs.jsonl to grid-plan steps; leftover rows reported, excluded |

**Max-void bar (new, pre-registered):** a task×arm is valid only if ≥2/3 reps are graded;
a repo's grid is valid only if infra-void ≤ 20% of planned cells. Above the bar → the RUN
is invalid (fix the harness, rerun); it does not produce a HOLD/ESCALATE verdict at all.
Under v1 the tk repo "answered" INSUFFICIENT_DATA when the truth was "harness broken" —
the bar makes that distinction structural.

**Report-staleness guard:** `analyze` writes into the report the runs.jsonl row count +
content hash it was computed from; any consumer (or /gc) can detect E-6-style staleness.
**Model-homogeneity guard (E-7):** analyze asserts all rows in a grid share one model
label or refuses a verdict (rows report actual model, not the flag's intent).

## 3. Primary metric (new — forced by E-4)

v1's primary (uncached input, M1) collapsed: whole-task uncached is 8–538 tokens and the
paired delta CI spans zero at afternoon N. The signal mass sits in **total input incl.
cache** (median Δ ≈ 166k, E-4), which v1 demoted to an audit/anti-gaming column. Cache
reads are not free (billed ~10% of input rate; they are also the thing ctx claims to
avoid — re-reading files every turn).

**RULED (F3, 2026-07-10): paired TOTAL input tokens is promoted to the primary gated
metric alongside the pass-rate guardrail; uncached becomes a reported audit column.**
The anti-gaming logic inverts cleanly: a total-input win with an uncached
BLOWUP would be flagged (cache-segmentation gaming works both directions, T13 preserved).
`total_cost_usd` stays reported (M6) but not primary (conflates model choice).

## 4. Getting a decisive answer (mission item 3)

- **Task bank = the 11-task `task-bank-draft.jsonl`** — but it does not graduate to
  non-draft until (a) the owed prompt reviews are done (6 tk + `atlas-discovery-list-only`,
  E-10) and the `prompt_reviewed` flags match the review log, and (b) the
  `task-bank-review.md` checklist is checked off. Q17 authenticity stays absolute: never
  rewrite-from-git prompts.
- **Sequencing (maintainer-ordered): the grid does NOT expand next.** Order = E0
  benchmark → fix the product defects it confirms (O-32/O-33, relevance) → E0 re-pass →
  harness/grader/condition fixes below → only then the E1+E2 grid.
- **Harness preconditions (before any paid cell):**
  1. Diagnose + fix the tk `stop_sequence` turn-1 death (E-3) — until then token-killer,
     the product's own repo, contributes zero data.
  2. Purge/filter the leftover `atlas-cache-valkey-resilience` rows (E-1) via the
     contaminated-row rule (§2).
  3. Instrument ctx usage in the Claude runner rows (`ctx_calls`, `ctx_context_calls`,
     `ctx_before_first_command`) — v1 rows don't record adoption; E-5 had to be
     recovered by transcript scan.
  4. Re-generate the codex report from the rerun rows or delete the stale one.
  5. Strip/neutralize the push-block imperative in measurement checkouts (§1c);
     re-verify every bank prompt against its golden test's observable contract (§1c,
     E-14) — the existing `prompt_reviewed:true` flags do NOT cover this check.
  6. Author the E0 ground truth (per-task expected-hit file/decision sets) and freeze
     the E0 gates before the first benchmark run.
- **Size:** keep 3 reps. E2 = 11 tasks × 2 arms × 3 reps = 66 cells/runner. E1 rides the
  same budget: `none` and `forced` cells ARE E2's arms; only `optional` adds cells
  (+33). Total ≈ 99 cells per runner — still an afternoon at v1's per-cell cost.
- **Gate (E2, per repo, pre-registered):** guardrail pass_B ≥ pass_A on ≥ 8/11 tasks ·
  median paired Δ > 0 on the primary (§3 fork) · 90% bootstrap CI excludes 0 ·
  no anti-gaming flag · **and the §2 max-void bar held**. Verdicts: ESCALATE / HOLD /
  RUN-INVALID (new).
- **Models/runners:** primary runner = Claude Code headless (the only clean instrument,
  per memory + v1). Codex kept as heterogeneous SECONDARY for E1 adoption only —
  its exec loop proved too fragile for token claims (E-6/E-7/E-8) — FORK F4.

## 5. Disposition of the uncommitted scripts (mission item 5)

**RULED (F4, 2026-07-10): ABSORB, none discarded; codex demoted to E1-only secondary:**

| Artifact | Fate |
|---|---|
| `run-cell-codex.ts` diff (tool_errors field + raw-output.json) | commit — implements §2 taxonomy |
| `run-cell-codex-protocol.ts`, `run-grid-codex-protocol.ts`, `analyze-codex-protocol.ts` | commit as E1's codex runner (secondary role per §4) |
| README protocol section | commit, amended to name E1/E2 and the §2 void taxonomy |
| NEW work v2 orders | port protocol conditions into the Claude runner (`run-cell.ts`), add adoption columns (§4.3), add staleness/homogeneity/contamination guards (§2) |

Nothing stays uncommitted-and-load-bearing: on ratification these land in one commit with
this doc (merge→push same day).

## 6. Boundary with the validation ladder (mission item 6)

O-14/v2 measures the PRODUCT's value: instrument quality (E0), adoption (E1), tokens
(E2). V0–V3 (LAW §8) validates ARTIFACT trust — whether ctx's rendered claims are
correct. No v2 number may be cited as artifact-trust evidence and vice versa. E-9/E-15
(ctx MCP 300 s timeouts, misleading miss guidance, weak relevance) are product defects
feeding neither track — they live in OPEN.md (O-32, O-33) and are what E0 exists to
catch cheaply. v2 runs in parallel with V0 drafting (P37 refinement c); V1 execution
still waits for both.

## 7. P32 supersession table (mission item 4 — silent replacement forbidden)

| P32 item | v2 fate | Note |
|---|---|---|
| Q1 top-level usage field | KEEP (Claude runner); codex extraction documented per-runner | |
| Q2 ctx presence = pull+push | AMEND | presence ≠ use; E2 arm B = forced-use; channel ablation unchanged for R2 |
| Q3 size 10×3 | AMEND | 11-task bank × 3 reps; +optional cells for E1 |
| Q4 no determinism chase | KEEP | |
| Q5 hand-authored accept_cmd | KEEP | + fix-tests apply-test discipline (implementation-notes) |
| Q6 per-repo separation | KEEP | |
| Q7 fix-parent SHA freeze | KEEP | sandbox=git-archive deviation stands |
| Q8 bootstrap-CI primary stat | KEEP | applied to the §3 primary |
| Q9 R1 gate conditions | AMEND | + max-void bar; + RUN-INVALID verdict; ≥8/11 |
| Q10 no --bare | KEEP | |
| Q11 R2 N=40 honesty | KEEP | R2 unchanged, still gated on v2 direction |
| Q12 R3 deferred | KEEP | |
| Q13 30% held-out | KEEP for R2 | bank too small at R1 scale, unchanged from v1 practice |
| Q14 time-cut environment | KEEP | input-boundary realization stands |
| Q15 third arm (empty store) | KEEP for R2 | E1's `optional` partially covers intent at R1 |
| Q16 three-column report | AMEND | §3 fork may swap which column is primary; all three still reported |
| Q17 prompt authenticity | KEEP (absolute) | |
| §7 void rule (single) | RETIRE → §2 taxonomy | the ratify-the-diff decision |
| M1 definition as primary | AMEND per §3 fork | uncached always still reported |

## 8. Preconditions checklist (no paid cell before all green)

- [x] F1–F4 ruled by maintainer (§9, 2026-07-10); doc status → active; P-entry P38; O-14 updated
- [x] E-9/E-15 product defects logged (O-32 timeouts, O-33 miss-guidance/relevance)
- [ ] **E0 ground truth authored + gates frozen; E0 run PASSES** (§1b — hard gate on everything below)
- [x] tk stop_sequence diagnosed + fixed (E-3): weekly-limit 429 at the atlas→tk boundary, not a tk defect; fail-fast now reads `api_error_status` (429⇒limit, is_error-gated, no bare-number false positives) + buildOrder round-robins task families (deterministic, resume-stable). Verified over all 74 preserved cells: 33 limit / 0 false positives
- [x] Claude runner records adoption columns (§4.3), adoption metric = before-first-edit (§1c) — @9f38bc2e; extraction verified against a real sonnet transcript; mcp_attached is 3-state (only positive detach voids)
- [x] analyze: grid-plan filtering + staleness hash + model-homogeneity assert + max-void bar + RUN_INVALID + total-input primary (§2/§3) — @9f38bc2e, selftest 23/23
- [x] push-block imperative neutralized in measurement checkouts (§1c) — make-sandbox default @9f38bc2e (`--keep-push-imperative` = named shipped condition); existing sandboxes need REBUILD to pick it up
- [x] prompt↔grader contract re-review of all 11 tasks (10 PASS, 1 FIXED); tk-install E-14 fixed — verified against fix commit e8fa9b40: detection IS `~/.copilot` (`src/shim/detect.ts:51`), `hooks/` is the write target; pilot tk pass column retracted (§1c)
- [x] owed prompt reviews done via the contract sweep; `prompt_reviewed` flags reflect reality (review log: task-bank-review.md "Contract re-review — 2026-07-10")
- [x] scripts committed per §5 (@39c70db4 absorb + @9f38bc2e v2 preconditions); stale codex report.json: superseded — analyze now writes staleness hash; regenerate on next use
- [x] E0 tooling BUILT @9f38bc2e; ground truth AUTHORED 2026-07-10 (11 tasks, anti-leak: fix-commit-only). Gates FROZEN pre-run: timeout_rate = 0 · drillability = 1.0 · relevance floor atlas 0.5 / token-killer 0.4. Sandboxes rebuilt 11/11 (push-imperative neutralization verified in every armB managed block). **E0 RUN 2026-07-11: PASS both repos** (`.work/e0-r1/{atlas,tk}/e0-report.json`) — 198 calls, 100% completion, 0 timeouts/transport errors, p50 160–256 ms, p95 ≤ 447 ms; drill 88/88; relevance atlas 0.60, tk 0.67. **Disclosure: per-task relevance is BIMODAL** — deterministic across reps, 1.0 or 0.0; **4/11 tasks score 0.0** (atlas-discovery-multimodule, atlas-service-presentation-metadata, tk-install-auto-wires-copilot, tk-powershell-brace-block-rewrite) = O-33(b) quantified. O-32's 300 s timeout did NOT reproduce over local stdio (points at codex-side transport). miss_messages empty → O-33(a) guidance defect untested this run (no no-seed misses occurred).
- **Pre-registered secondary hypothesis (added at E0 close, before any E1/E2 cell):** the E2 token/pass effect concentrates in E0-relevance=1 tasks; E0-relevance=0 tasks predict no ctx benefit. Analyzed as a descriptive split, not a new gate.
- **E1/E2 paid grid: AUTHORIZED by this checklist** — but the account's weekly limit resets Jul 12 (E-3); launching before reset would burn the grid into the same 429 wall. Launch = maintainer's call after reset.

## 9. Forks — RULED by maintainer 2026-07-10 (P38)

| Fork | Question | Ruling |
|---|---|---|
| **F1** | O-14 headline: E2 (value-given-forced-use) with E1 as qualifier — or adoption-first? | **E2 headline, E1 qualifier** |
| **F2** | Ratify tool-errors-not-void + §2 taxonomy + max-void bar, or revert the diff? | **RATIFIED** (taxonomy + max-void bar + RUN-INVALID verdict) |
| **F3** | Primary metric: promote paired total-input to primary (uncached → audit), or keep uncached-primary? | **PROMOTE total input** (all three columns still reported; anti-gaming inverted) |
| **F4** | Scripts: absorb all + codex demoted to E1-only secondary runner — or discard protocol scripts / keep codex for token claims? | **ABSORB all + codex = E1-only secondary** (no token claims from codex rows) |
| **F5** (follow-up ruling, same day) | Expand the grid next, or benchmark the instrument first? | **E0-first ladder** (§1/§1b): retrieval benchmark → product fixes → condition hygiene + grader fixes (§1c) → only then E1/E2. Root question reframed to "decisive impact, and if absent — tool quality or usage timing/manner?" |
