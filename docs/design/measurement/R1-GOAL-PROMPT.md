---
status: active
review_after: 2026-07-20
---

# R1 GOAL PROMPT — build the afternoon A/B harness (ratified design → work order)

Work order for the builder agent. Authority: `MEASUREMENT-DESIGN.md` (RATIFIED 2026-07-06,
FABLE-DECISION-LOG **P32**). This prompt references the design by section — on any conflict,
the design doc wins; on any gap, log a deviation, do not improvise silently.

## Mission

Make R1 (design §4) **ready to run**: task-bank mining, per-task time-cut sandboxes, the
runner/grader/analysis scripts, and one passing smoke cell. The full 60-run afternoon and the
final task-bank audit are maintainer steps, NOT yours (see Boundaries).

## Scope — deliverables

All harness code lives in **`tools/measurement/`** (new dir; shell + TS run via `pnpm exec tsx`;
NOT part of published packages, no changes under `packages/` or `src/`).

1. **Miner** (`mine-tasks`): scan `~/.claude/projects/` per design §3 extraction recipe
   (read-only). Output `candidates.jsonl`: `{id, repo, timestamp, gitBranch, prompt,
   fix_commit?, test_delta_evidence?, criteria_flags[1..4], answer_in_repo_flag}` + a yield
   table (how many of the mined records survive each inclusion criterion — design §3
   "yield vs full population"). It PROPOSES candidates; it does not decide the bank.
2. **Sandbox builder** (`make-sandbox <task>`): fresh checkout at the fix-parent SHA with
   **git history truncated at that SHA** (the future fix must be unreachable — design §3/T1);
   per-arm config per design §4 table (arm A: no `.mcp.json` ctx server, no push block;
   arm B: both present); **time-cut ctx store** — a per-task store copy filtered to source
   timestamp < T (design §3, Q14). Isolated `HOME`/`CLAUDE_CONFIG_DIR` so the real
   `~/.claude` is never read or written (memory: doctor-dev-fix gotcha).
3. **Runner** (`run-cell <task> <arm> <rep>`): the design §4 per-cell command verbatim
   (`--output-format json`, pinned `--model claude-opus-4-8`, `--max-budget-usd 3`, no
   `--bare`, no `--max-turns` — it does not exist on v2.1.201). Interleave arm order per
   task; persist raw result JSON per cell.
4. **Grader** (`grade-cell`): run the task's `accept_cmd` in the post-run sandbox; record
   `pass` from exit code, **separate from** `is_error` (design §2 M2).
5. **Analysis** (`analyze`): per-repo table (design §4 output table), per-task median of
   reps, paired Δ, 90% paired-bootstrap CI on the median Δ (B≥10,000), and the **four-condition
   gate** verdict (design §4 decision rule: guardrail ≥8/10 · median Δ>0 · CI excludes 0 ·
   total-input not ballooned). Void runs reported with reason, never silently dropped (§7).
6. **Smoke proof**: one real cell end-to-end (1 trivial task × both arms × 1 rep) with
   parsed M1–M6 in the output row. Budget for all smoke runs ≤ **$5** total.

## Boundaries (hard)

- **No ctx/tk product changes** — design §Non-goals. `packages/`, `src/`, `server/` untouched.
- **Acceptance commands are maintainer-authored** (Q5 ruling: hand-written, not agent-drafted).
  You emit candidates + evidence; leave `accept_cmd` empty for the maintainer to fill, except
  the one smoke task, whose accept_cmd may be trivial (e.g. a named vitest file) and is
  flagged `smoke:true`.
- **Do not run the full 60-cell grid** — maintainer supervises spend. Smoke only.
- **Bank-shortfall rule Q17**: if mining yields <10 strong candidates, say so in the notes;
  do NOT pad by rewriting git commits into synthetic prompts.
- Standing constraints: pnpm only (never npm/npx); English code/comments; route heavy output
  through `tk`; consider the distributed field (scripts must not assume this box's paths).

## Acceptance checklist (self-verify, then reviewer re-checks independently)

- [ ] A1 miner runs read-only over real session history; `candidates.jsonl` + yield table
      produced; spot-check 3 candidates trace back to real records (`file:line` cited).
- [ ] A2 sandbox: `git log --all` inside it shows nothing after the pinned SHA; the real fix
      commit hash is unreachable (`git cat-file -e` fails).
- [ ] A3 time-cut store: query proves zero rows with source timestamp ≥ T.
- [ ] A4 arm delta: recursive diff between arm-A and arm-B sandbox configs shows exactly the
      three ratified knobs (design §4 table) and nothing else.
- [ ] A5 smoke cell: both arms complete; result JSON parsed; M1–M6 extracted; grader records
      pass/fail independent of `is_error`.
- [ ] A6 analysis on a synthetic fixture reproduces a hand-computed median/CI/gate verdict.
- [ ] A7 no writes outside `tools/measurement/` + sandboxes; real `~/.claude` untouched
      (verify mtime/checksum before/after smoke).
- [ ] A8 deviation log `tools/measurement/implementation-notes.md` exists (even if empty of
      deviations) — first-class deliverable.

## Handoff back

Return: yield table, candidate list, smoke-cell row, deviation log. Maintainer then:
audits/authors the 10 `accept_cmd`s (~½ day), runs the 60-cell afternoon, reads the
four-condition verdict → R2 go/no-go (budget pre-approved, P32).
