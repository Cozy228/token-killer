---
status: active
review_after: 2026-07-21
---

# HANDOFF — run the R1 A/B grid and read the verdict

For a fresh session with no prior context. The harness and task bank are **built,
validated, committed, and pushed** on `feat/1.0.0` (commits `8c05075` + `eb763a5`).
Your job: run the grid, then read the four-condition verdict. Authority for the
method is `docs/design/measurement/MEASUREMENT-DESIGN.md` (RATIFIED P32); build
deviations are in `tools/measurement/implementation-notes.md`.

## What this measures
Does **ctx** lower the **uncached input tokens** an agent burns to complete a real
coding task, **without hurting task success** (M2). Two arms differ ONLY in ctx
presence (arm A = no ctx; arm B = ctx MCP tools + push block). Per-repo verdict,
never pooled (atlas vs token-killer reported separately).

## State — ready to run
- **Task bank**: `tools/measurement/task-bank-draft.jsonl` — 11 tasks (5 atlas + 6
  token-killer). Every `accept_cmd` materializes the fix commit's FAIL_TO_PASS test
  from `tools/measurement/fix-tests/<task>/` (the sandbox is at the fix-parent and
  can't reach the source repo's git objects); every gate was verified FAIL@parent /
  PASS@fix. Every prompt was independently Fable-reviewed (`prompt_reviewed:true`).
  Rows are `draft:true` → the runner needs `--allow-draft`.
- **Harness** (all in `tools/measurement/`, run via `tsx`, never touches `packages/`):
  `run-grid.ts` orchestrates bank → make-sandbox → run-cell → grade-cell → analyze.

## Run it
1. **Auth (isolated mode needs a token).** A custom `CLAUDE_CONFIG_DIR` does NOT
   inherit the macOS keychain login, so isolated mode needs a token. **Do NOT** use
   `export …=$(claude setup-token)` — that captures interactive TUI escape codes,
   not a token (the run-grid precheck will reject it). Run `claude setup-token`
   interactively, copy the token it shows, then:
   ```bash
   export CLAUDE_CODE_OAUTH_TOKEN=<paste the real token>
   echo "$CLAUDE_CODE_OAUTH_TOKEN"   # must be one clean line, no [?2004h codes
   ```
   (Alternative: `--config-mode real` uses host keychain auth but writes the
   instrument's own transcript under `~/.claude/projects/<sandbox-slug>`; remove
   those dirs after — a documented A7 deviation.)
2. **Dry-run first** (no spend — prints the plan + budget exposure):
   ```bash
   node --import "file://$PWD/node_modules/tsx/dist/loader.mjs" \
     tools/measurement/run-grid.ts \
     --bank "$PWD/tools/measurement/task-bank-draft.jsonl" \
     --out "$PWD/tools/measurement/.work/r1-grid-sonnet" \
     --reps 3 --config-mode isolated --model claude-sonnet-5 --allow-draft
   ```
3. **Execute** (add `--execute`; add `--resume` on every re-run after the first):
   ```bash
   node --import "file://$PWD/node_modules/tsx/dist/loader.mjs" \
     tools/measurement/run-grid.ts \
     --bank "$PWD/tools/measurement/task-bank-draft.jsonl" \
     --out "$PWD/tools/measurement/.work/r1-grid-sonnet" \
     --reps 3 --config-mode isolated --model claude-sonnet-5 --allow-draft --execute --resume
   ```

## Session limit — expect it, don't fight it
11×3×2 = **66 cells**. The Claude account session limit WILL likely hit mid-run.
The harness handles it: a session/usage-limit error **aborts the grid** (doesn't
burn the rest) and prints the reset time. When it resets, re-run the SAME command
(it already has `--resume`) — resume keeps the good graded rows and re-runs the
limit-killed cells. Repeat until the grid completes.

## Cost
Sonnet ≈ **$8–30** for 66 cells (hard cap 66 × $3 = $198; sonnet won't approach it).
Auth-failed / limited cells cost ≈ $0 (they fail before inference).

## Read the verdict
`run-grid` runs `analyze` at the end and writes `.work/r1-grid-sonnet/report.json`;
you can re-run analyze anytime:
```bash
node --import "file://$PWD/node_modules/tsx/dist/loader.mjs" \
  tools/measurement/analyze.ts --runs tools/measurement/.work/r1-grid-sonnet/runs.jsonl
```
Per repo it prints: the §4 table (passA/passB, M1 medians, Δ, Δ%, turnsΔ), a
**data-quality line** (paired tasks / void cells), and the **four-condition gate**:
(a) guardrail pass_B ≥ pass_A on ≥8/10 tasks · (b) median uncached Δ > 0 · (c) 90%
paired-bootstrap CI excludes 0 · (d) total-input not ballooned (anti-gaming).
Verdicts:
- **ESCALATE_TO_R2** — all four hold ⇒ ctx shows direction; R2 is greenlit (budget
  pre-approved, P32).
- **HOLD** — gate not met ⇒ ctx did not show direction on this repo.
- **INSUFFICIENT_DATA** — fewer than 5 paired tasks survived, or the CI is
  degenerate (a single task's bootstrap CI trivially "excludes 0" — the n=1 trap).
  Not decisional. **atlas has exactly 5 tasks**, so ANY atlas void drops it below
  the floor → INSUFFICIENT. If that happens, resume/re-run the voided atlas cells,
  or add another atlas task (see below). token-killer has 6 (one void still leaves 5).

The claim is **model-scoped**: results are labeled `claude-sonnet-5`. If R1 shows
direction on sonnet, R2 can confirm on opus (the production model).

## Gotchas already found (don't rediscover)
- Every maintainer-authored `accept_cmd` was originally a **vacuous gate** (ran the
  test as-is at fix-parent, where it passes). Fixed via materialization — don't
  revert to path-only test runs.
- Relative paths crossing a subprocess-with-cwd boundary re-anchor against the
  child's cwd — all harness paths are absolutized. Keep it that way.
- `atlas-cache-valkey-resilience` was dropped: its test needs a live Valkey.
- macOS `/bin/bash` is 3.2 (no associative arrays); the `.work/*.sh` authoring
  helpers are 3.2-safe.

## Open items
- Adding more atlas tasks (for void margin above the 5-floor): the authoring loop is
  proven — pick a `fix(`/`feat(` atlas commit with a focused pure-logic test delta,
  verify with `.work/verify-mat.sh <repo> context-layer - <fix> <testpath>`, extract
  the fix's test into `fix-tests/<task>/`, add a materializing `accept_cmd`, author a
  prompt, and have Fable review it (Opus drafts → Fable reviews).
- `docs/design/measurement/R1-GOAL-PROMPT.md` is the original work order; the
  afternoon 60→66-cell run + verdict is the last R1 step before R2 go/no-go.
