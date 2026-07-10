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
| 1. propose candidates | `mine-tasks.ts` | A1 |
| 2. build per-task arm sandboxes | `make-sandbox.ts` | A2/A3/A4 |
| 3. run one cell (task×arm×rep) | `run-cell.ts` | A5 |
| 4. grade one cell | `grade-cell.ts` | A5 |
| 5. analyze all runs | `analyze.ts` | A6 |
| 6. orchestrate the approved grid | `run-grid.ts` | maintainer |

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

### 3–4. Run + grade a cell
```
tsx run-cell.ts   --taskdir <dir> --arm A --rep 0 --out .work/runs [--config-mode isolated|real]
tsx grade-cell.ts --taskdir <dir> --runsdir .work/runs --arm A --rep 0
```
Repeat for arm B and reps 0..M-1. **Interleave arm order per task** (§4/§7). Each
cell writes `row.json` (M1–M6 + pass). Concatenate all `row.json` into `runs.jsonl`.

### 5. Analyze
```
tsx analyze.ts --runs .work/runs.jsonl --out .work/report.json
```
Per-repo table + four-condition gate (guardrail ≥8/10 · median Δ>0 · 90% bootstrap CI
excludes 0 · total-input not ballooned). `--selftest` reproduces the hand-computed
fixture (A6).

### 6. Run the approved grid
```
tsx run-grid.ts --bank tools/measurement/task-bank.jsonl --out tools/measurement/.work/r1-grid \
  --reps 3 --config-mode isolated --execute
```
Defaults to dry-run; `--execute` is required to launch paid cells. Draft banks
require `--allow-draft`, so a maintainer explicitly accepts the risk before spend.
Use `--resume` to skip existing graded rows after an interruption.

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
