# R1 afternoon A/B measurement harness

Measures whether **ctx** lowers the uncached input tokens an agent burns to complete
a coding task, without hurting success. Authority: `docs/design/measurement/MEASUREMENT-DESIGN.md`
(RATIFIED P32). Work order: `docs/design/measurement/R1-GOAL-PROMPT.md`. Deviation log:
`implementation-notes.md`.

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
