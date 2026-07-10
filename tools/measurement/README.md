# R1 afternoon A/B measurement harness

Measures whether **ctx** lowers the input tokens an agent burns to complete a coding
task, without hurting success. Authority: `docs/design/measurement/MEASUREMENT-DESIGN-V2.md`
(RATIFIED P38; supersedes parts of P32 `MEASUREMENT-DESIGN.md` — see its §7 table).
v2 splits the work into **E1 (adoption**: does an agent use ctx when available;
protocol conditions none/optional/forced**)** and **E2 (value-given-use**: paired A/B
with arm B under the forced protocol; primary metric = paired TOTAL input tokens,
uncached demoted to audit**)**. Void policy = v2 §2 taxonomy: only infra-voids
(runner exit ≠ 0, missing usage, timeout) void a row; tool errors are M5 diagnostics.
Deviation log: `implementation-notes.md`.

**Scope:** these scripts live outside the published packages and never modify
`packages/`/`src/`. They drive the `ctx` CLI and `claude -p` as black-box subprocesses.
Everything runs via `tsx` (pnpm only):

```
node --import "file://$PWD/node_modules/tsx/dist/loader.mjs" tools/measurement/<script>.ts …
```

Working artifacts land under `tools/measurement/.work/` (git-ignored).

## Pipeline

| step | script | acceptance |
|---|---|---|
| 0. **E0 retrieval benchmark** (runs FIRST, no model spend) | `e0-init-ground-truth.ts` → `e0-bench-retrieval.ts` | §1b gates |
| 1. propose candidates | `mine-tasks.ts` | A1 |
| 2. build per-task arm sandboxes | `make-sandbox.ts` | A2/A3/A4 |
| 3. run one cell (task×arm×rep) | `run-cell.ts` | A5 |
| 4. grade one cell | `grade-cell.ts` | A5 |
| 5. analyze all runs | `analyze.ts` | A6 |
| 6. orchestrate the approved grid | `run-grid.ts` | maintainer |

### 0. E0 — standalone ctx retrieval benchmark (V2 §1b, runs FIRST)

E0 benchmarks the instrument directly — **no agent, no model spend** — and gates the
whole ladder: a failing E0 stops spend and routes to product fixes (O-32 timeouts,
O-33 miss-guidance). Two steps:

```
# a) generate the ground-truth SKELETON (maintainer then fills expected + gates BY HAND)
tsx e0-init-ground-truth.ts --bank tools/measurement/task-bank-draft.jsonl \
  --out tools/measurement/e0-ground-truth.jsonl
# ANTI-LEAK: expected.files / expected.decisions are left EMPTY — the maintainer authors
# them from the real fix commit; the script NEVER auto-fills from git (Q17).

# b) run the benchmark against frozen make-sandbox stores (reuses arm-B .mcp.json)
tsx e0-bench-retrieval.ts --ground-truth tools/measurement/e0-ground-truth.jsonl \
  --sandboxes tools/measurement/.work/<grid>/tasks \
  --out tools/measurement/.work/e0 --reps 10 --timeout 60000 \
  [--tasks a,b] [--drill-floor 1.0] [--relevance-floor 0.5]
```

`--sandboxes` points at a dir with one make-sandbox output per task (i.e. a grid's
`tasks/` dir). The bench spawns `ctx mcp` exactly as the arm-B wrapper does (run-from-
source via tsx; command/args/env read from each task's `armB/.mcp.json`), speaks MCP
JSON-RPC over stdio (dependency-free client, `mcp-client.ts`), and records per query ×
rep: **completion** (`hit`/`miss`/`timeout`/`transport-error`), **latency** (p50/p95),
returned handles, and a **drill-down** of each advertised handle. Output = `e0-rows.jsonl`
(per-call rows) + `e0-report.json` (reliability, relevance where the ground truth is
filled — else `ungated`, drillability, and **verbatim miss-message text** for the O-33
check). Analysis is folded into the bench script (no separate `e0-analyze.ts`).

Gates (§1b): `timeout_rate ≈ 0` · `drillability ≈ 1` · per-repo relevance floor (only
when the ground truth + `--relevance-floor` are supplied; otherwise reported `UNGATED`).
`miss` is classified by the response **text** (`does not resolve…`, `use task mode`), not
`isError` — a no-seed miss returns `isError:false` with misleading guidance (O-33).

### 1. Mine candidates (read-only)
```
tsx mine-tasks.ts --out tools/measurement/.work
```
Writes `candidates.jsonl` + `yield.json`. It PROPOSES; it does not decide the bank
or author acceptance commands. Then **hand-author each `accept_cmd`** from the real
fix commit's test delta (Q5) and assemble a bank JSONL of
`{task, repo, sha, at, prompt, accept_cmd, smoke?}`.

### 2. Build sandboxes (per task)
```
tsx make-sandbox.ts --task <id> --repo <path> --sha <fix-parent-sha> --at <ISO-T> \
  --prompt @prompt.txt --accept-cmd @accept.sh --out tools/measurement/.work/tasks/<id>
```
Produces `armA/` + `armB/` (byte-identical base, differing only in the 3 ctx knobs),
`arm-delta.json`, `timecut-proof.json`, `cell{A,B}.env.json`, `meta.json`. Prints the
A2/A3/A4 checks.

**Condition hygiene (§1c):** by default the push-block **steering imperative**
("Start tasks with the `context` MCP tool…") is stripped from arm B's managed block
(the descriptive disclosure line + gotchas stay) — E-12 showed it turns `optional` into
a steered condition. Pass `--keep-push-imperative` ONLY for an explicitly named `shipped`
condition that measures the product's own onboarding.

### 3–4. Run + grade a cell
```
tsx run-cell.ts   --taskdir <dir> --arm A --rep 0 --out .work/runs \
    [--config-mode isolated|real] [--protocol none|optional|forced]
tsx grade-cell.ts --taskdir <dir> --runsdir .work/runs --arm A --rep 0
```
Repeat for arm B and reps 0..M-1. **Interleave arm order per task** (§4/§7). Each
cell writes `row.json` (M1–M6 + pass + adoption). Concatenate all `row.json` into
`runs.jsonl`.

**`--protocol` (E1/E2, §1c):**
- `none` / `optional` → raw prompt (no preamble). `none` = arm A / no ctx; `optional` =
  arm B, ctx present but nothing tells the agent (organic adoption).
- `forced` → **arm B** gets the frozen `FORCED_PREAMBLE` (one `mcp__ctx__context` call
  before edits); **arm A** gets the structurally matched `PLACEBO_PREAMBLE` (T2 guard —
  keeps the delta ctx-only). Both texts are frozen in `lib.ts`. This is the E2 treatment.

**Adoption columns** recovered per cell from the session transcript (§4.3): `ctx_calls`,
`ctx_context_calls`, `ctx_search_calls`, `ctx_remember_calls`, `ctx_errors`,
`ctx_before_first_edit` (**PRIMARY** — first ctx event vs first file-edit event),
`ctx_before_first_command` (secondary), and tool-choice share (`read_calls` / `grep_calls`
/ `glob_calls` / `edit_calls` / `bash_calls`). **MCP-connection assertion:** each treatment
cell records `mcp_attached`; a positive silent-detach signal voids the row
(`void_reason: "mcp not attached"`, infra-void). See the deviation log for the extraction
path (transcript jsonl keyed by `session_id`) and the `mcp_attached` limitation.

### 5. Analyze
```
tsx analyze.ts --runs .work/runs.jsonl --out .work/report.json [--grid-plan .work/grid-plan.json]
```
Per-repo table + gate (V2 §2/§3/§4). **PRIMARY metric = paired TOTAL input tokens** (F3);
uncached is a reported audit column. Gate: guardrail pass_B ≥ pass_A on ≥8/11 tasks ·
median Δtotal > 0 · 90% bootstrap CI excludes 0 · **no anti-gaming flag** (a total-input
win with an uncached BLOWUP is flagged — the inversion of the v1 rule). Verdicts:
`ESCALATE_TO_R2` / `HOLD` / `INSUFFICIENT_DATA` / **`RUN_INVALID`**.

Guards (§2): pass `--grid-plan` (run-grid does this automatically) to filter **contaminated**
rows (outside the plan's step list) and apply the **max-void bar** — a task×arm is valid
iff ≥2/3 reps graded, and a repo's grid is valid iff infra-void ≤20% of planned cells,
else `RUN_INVALID`. **Model-homogeneity** (E-7): mixed model labels ⇒ `RUN_INVALID`, no
verdict. The report also records the source `runs.jsonl` row count + sha256 (staleness
guard). Report shape is now `{ source, run_valid, run_invalid_reasons, models, repos }`.
`--selftest` reproduces the hand-computed fixtures for the primary switch, anti-gaming,
CI, homogeneity, max-void, and contamination (A6).

### 6. Run the approved grid
```
tsx run-grid.ts --bank tools/measurement/task-bank.jsonl --out tools/measurement/.work/r1-grid \
  --reps 3 --config-mode isolated --execute
```
Defaults to dry-run; `--execute` is required to launch paid cells. Draft banks
require `--allow-draft`, so a maintainer explicitly accepts the risk before spend.
Use `--resume` to skip existing graded rows after an interruption. For **E2** pass
`--protocol forced` (arm B = forced preamble, arm A = matched placebo — §1); the default
`none` keeps the raw-prompt A/B. run-grid passes `--grid-plan` to `analyze` so the
contamination + max-void guards fire automatically.

## Codex protocol/adoption runner (E1 secondary)

The Codex protocol runner measures **when ctx is actually used** (E1), separately from
whether a task passes. Per v2 F4 ruling, codex is an **E1-only secondary runner** —
its execution loop proved too fragile for token claims (MCP transport failures,
model-label drift) — the primary runner for both E1 and E2 is Claude Code headless.
It reuses the same sandboxes and `grade-cell.ts`, but runs five protocol conditions
(the v2 headline grid uses only none/optional/forced):

| protocol | meaning |
|---|---|
| `none` | arm A checkout, no ctx MCP server |
| `optional` | arm B checkout, ctx available but not mentioned |
| `suggested` | ctx available, prompt suggests using it when useful |
| `forced` | prompt requires one `mcp__ctx__context` call before edits |
| `forced-inspect` | prompt requires ctx plus inspection of returned file refs |

Dry-run a small pilot first:

```
node --import "file://$PWD/node_modules/tsx/dist/loader.mjs" \
  tools/measurement/run-grid-codex-protocol.ts \
  --bank "$PWD/tools/measurement/task-bank-draft.jsonl" \
  --out "$PWD/tools/measurement/.work/r2-protocol-codex-gpt55-pilot" \
  --tasks atlas-availability-page-parse,tk-install-auto-wires-copilot \
  --protocols none,optional,suggested,forced,forced-inspect \
  --reps 1 \
  --model gpt-5.5 \
  --reasoning low \
  --allow-draft
```

Execute/resume the same pilot:

```
node --import "file://$PWD/node_modules/tsx/dist/loader.mjs" \
  tools/measurement/run-grid-codex-protocol.ts \
  --bank "$PWD/tools/measurement/task-bank-draft.jsonl" \
  --out "$PWD/tools/measurement/.work/r2-protocol-codex-gpt55-pilot" \
  --tasks atlas-availability-page-parse,tk-install-auto-wires-copilot \
  --protocols none,optional,suggested,forced,forced-inspect \
  --reps 1 \
  --model gpt-5.5 \
  --reasoning low \
  --allow-draft \
  --execute \
  --resume
```

Each protocol cell writes `row.json`, `raw-output.json`, and `last-message.txt`.
After every cell the grid prints completed cells, graded failures, voids, tool
error rows, ctx-used rows, and artifact counts. The final
`protocol-report.json` includes protocol-level adoption rates and paired outcome
deltas versus `none` for the same task+rep.

## Auth (run-cell `--config-mode`)

- **`isolated`** (default, literal A7): sets an isolated `CLAUDE_CONFIG_DIR` so real
  `~/.claude` is never written. A custom config dir does NOT inherit the macOS
  keychain login, so provide a token in the environment:
  `export CLAUDE_CODE_OAUTH_TOKEN=$(claude setup-token)` (or `ANTHROPIC_API_KEY`).
- **`real`**: uses host auth; the instrument writes its own session transcript under
  `~/.claude/projects/<sandbox-slug>` (removable) — a documented A7 deviation. Used
  for the smoke because no token was configured. **Prefer `isolated` for the grid.**

## Full R1 afternoon (maintainer)

10 tasks (mixed token-killer + atlas, reported per-repo) × 3 reps × 2 arms = 60 cells.
Budget: supervise spend (`--max-budget-usd 3` per cell). Then read `analyze`'s
four-condition verdict → R2 go/no-go (budget pre-approved, P32).
