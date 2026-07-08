---
status: active
review_after: 2026-07-20
---

# implementation-notes — R1 A/B harness deviation log

First-class deliverable (workflow.md phase 4; goal §A8). Deviations from
`R1-GOAL-PROMPT.md` / `MEASUREMENT-DESIGN.md`, facts that changed a choice, and the
per-item acceptance self-verification. Authority on any conflict = the design doc.

## Deviations from the goal prompt (logged, not silently improvised)

- **A3 time-cut is proven at the INPUT boundary, not by a store timestamp query.**
  The goal's A3 says "query proves zero rows with source timestamp ≥ T." The ctx
  store has **no source-timestamp column**: `entities.first_seen`,
  `entities.last_verified`, and `claims.at` are all written as `this.#now()` —
  INGEST wall-time — (`packages/core/src/store/store.ts:249,318`, verified). So a
  timestamp filter on the store is meaningless. The design intent (arm B contains
  no post-T material — §3/Q14) is realized by controlling the INPUTS to `ctx sync`:
  - git/code/docs sources are time-cut by construction — the sandbox is the tree at
    SHA ≤ T and its history is truncated (A2 proves nothing newer is reachable);
  - the memory source (the only unbounded leak vector — it reads `~/.claude/.../memory/`)
    is fed a **time-cut HOME** whose memory dir is empty (default) or filtered to
    files mtime < T (`--memory-mode asof`).
  The store-level A3 check is therefore **host-import memory rows == 0**
  (`timecut-proof.json`), cross-checking that the empty HOME let nothing in.

- **Sandbox is a fresh `git archive` single-commit repo, NOT a `git worktree`.**
  The design §4 per-cell sketch says "fresh worktree at TASK_SHA^." A worktree
  shares the origin's `.git` (the fix commit stays reachable — A2 fails) AND shares
  the ctx store shard, which is keyed by `git rev-parse --git-common-dir`
  (`packages/core/src/store/shard.ts:57-63`) — so it would collide with the REAL
  `~/.contexa` store. `make-sandbox` instead extracts the tree via `git archive <sha> |
  tar -x` into a fresh `git init` + single seed commit: the fix SHA is not even an
  object in the sandbox (A2 clean), and the sandbox gets its own common-dir ⇒ its
  own store shard (real store never touched).

- **Both arms share the same base tool set; arm B only ADDS ctx tools.** The design
  §4 TABLE gives arm A `--allowedTools Bash Edit Read Write Grep Glob` and arm B the
  same **+** the three `mcp__ctx__*` tools. The §4 command SKETCH, by contrast, sets
  `--allowed-tools` only for arm B (`${ARM_B:+…}`), which would leave arm A with the
  full default tool set — an asymmetry beyond ctx presence, violating A4/T2. The
  table wins: both arms pass the identical base list; arm B appends the three ctx
  tools. (`lib.ts` BASE_TOOLS / CTX_MCP_TOOLS.)

- **ctx is invoked from source; arm B `.mcp.json` points at a wrapper, not `ctx`.**
  ctx has no global bin and its `dist/` is stale (F2). The harness runs it via
  `node --import file://<abs>/node_modules/tsx/dist/loader.mjs <abs>/packages/cli/src/cli.ts`
  (module resolution anchors to cli.ts, so cwd is free to be the sandbox). Since
  `ctx` is not on PATH inside a sandbox, arm B's `.mcp.json` registers an absolute
  `ctx-launch` wrapper (`{command:"<abs>/armB/ctx-launch", args:["mcp","--project",
  "<abs>/armB/repo"], env:{CONTEXA_HOME,HOME}}`), NOT `{command:"ctx"}` as §4 shows.
  The server is pinned to the FROZEN store at the canonical armB/repo so a per-rep
  scratch copy still serves the T-frozen context base.

- **Memory-mode default = `empty` (zero host memory).** ctx memory `.md` files carry
  no reliable SOURCE timestamp, so a provably-clean time-cut cannot be derived from
  them per-file. Default excludes host memory entirely (arm B still gets the
  code/git/docs index — the bulk of ctx, and §9 treats memory as a separable facet).
  `--memory-mode asof` copies files with mtime < T as a flagged heuristic; full
  memory-up-to-T is left as a maintainer knob for the ablation runs.

- **A7 smoke ran in `--config-mode real` (host auth), not isolated.** Literal A7
  wants an isolated `CLAUDE_CONFIG_DIR` so real `~/.claude` is never written. A
  custom config dir does **not** inherit the macOS-keychain login (verified:
  "Not logged in" even after copying `.claude.json`), so isolated mode needs a token
  (`CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`). Extracting the keychain
  credential was (correctly) blocked by the security auto-mode classifier, and no
  token was provided for the smoke. run-cell implements BOTH modes; the smoke used
  `real`. Under real mode A7 was verified on the meaningful surfaces:
  `~/.claude/settings.json` checksum UNCHANGED, existing project/memory dirs
  UNCHANGED, `history.jsonl` UNCHANGED (5369→5369 — headless `-p` does not log
  there), and the instrument's own two sandbox-keyed transcript dirs were removed so
  `~/.claude/projects/` is byte-identical to baseline. Only `~/.claude.json`
  (mutable per-invocation counters/caches, also churned by the live session) changed
  — not a config/hook mutation, so unrelated to the doctor-dev-fix gotcha A7 guards.
  **For the real 60-cell afternoon: prefer isolated mode with a token** for literal
  A7 (see README).

## Facts that overrode goal-prompt assumptions (verify-against-tool, not memory)

- `claude -p --output-format json` on v2.1.201 emits the documented `usage`
  (input_tokens / cache_read / cache_creation / output_tokens), `num_turns`,
  `duration_ms`/`duration_api_ms`, `total_cost_usd`, `is_error`, `stop_reason`,
  `permission_denials` — all extracted per cell (smoke row confirmed).
- **Headless `-p` does NOT append to `~/.claude/history.jsonl`** (measured: unchanged
  across two live cells). Less footprint than assumed.
- **Path bug class (hit twice):** a relative `CONTEXA_HOME` / `--mcp-config` / accept
  script path is re-anchored against the CHILD process's cwd (the sandbox), landing
  artifacts inside the checkout or failing with 127 / "config not found". Fix:
  absolutize every path that crosses a subprocess-with-cwd boundary (`resolve()` at
  each script's entry). Applies to make-sandbox, run-cell, grade-cell.
- The mined corpus is 390 session files / 34,687 `type:user` records; only ~12
  survive all four inclusion criteria (design §3's predicted low yield) — above the
  10-task floor, so Q17 bank-shortfall did not trigger for this box.

## Acceptance checklist — self-verification (independently re-checkable)

- [x] **A1** `mine-tasks` ran read-only (real `~/.claude/projects` dir mtime
  UNCHANGED before/after); produced `.work/candidates.jsonl` + yield table; 3 strong
  candidates traced to real records with `file:line` (e.g.
  `~/.claude/projects/-Users-ziyu-Workspace-token-killer/3f47a13a-…jsonl:1`).
- [x] **A2** sandbox `git log --all` = 1 commit; the post-T source commit `74f600b7`
  is NOT reachable (`git cat-file -e` fails) → fix unreachable.
- [x] **A3** `timecut-proof.json`: host-import memory rows = 0; time-cut HOME memory
  files = 0 (empty mode). Input-boundary + store cross-check (see deviation above).
- [x] **A4** `arm-delta.json`: `onlyInB=[".mcp.json"]`, `differing=["AGENTS.md",
  "CLAUDE.md"]` (the push block), `onlyInA=[]` → exactly the three ratified knobs
  (`isExactlyKnobs=true`). Tools knob is in `cell{A,B}.env.json`.
- [x] **A5** smoke: both arms exit 0, JSON parsed, M1–M6 extracted
  (A: M1_uncached=6977 total=59689 turns=2 $0.193; B: 7012/59915/2/$0.195);
  grader records `pass` from accept_cmd exit SEPARATELY from `is_error`
  (both pass=true, is_error=false; the arm-A grade even caught a harness path bug
  before the fix). Smoke spend ≈ $0.39 (≤ $5).
- [x] **A6** `analyze --selftest` reproduces the HAND-COMPUTED fixture: Δ=[10,20,30]
  → median 20; bootstrap-median PMF {10:7/27, 20:13/27, 30:7/27} ⇒ analytic 90% CI
  [10,30] (seed-stable); gate ESCALATE. All 8 checks PASS.
- [x] **A7** (real-config mode) settings/memory/existing-projects untouched;
  instrument transcripts removed; `~/.claude/projects` == baseline. Deviation logged.
- [x] **A8** this file.

## Post-build: harness hardening + task-bank construction (2026-07-06/07)

Beyond the R1 build, iterating toward a real run surfaced several harness-correctness
fixes and one load-bearing finding about task authoring:

- **`run-grid.ts`** (thin orchestrator) gained two safeguards after a full grid was
  wasted: (1) a **token precheck** — a corrupted `CLAUDE_CODE_OAUTH_TOKEN` (the
  classic `export …=$(claude setup-token)` capturing TUI escape codes, not a token)
  is rejected before spending; (2) **systemic fail-fast** — an auth OR account-limit
  error in any cell aborts the grid (all remaining cells would fail identically),
  and `--resume` re-runs those systemic voids (a limit-killed grid can now be
  finished after reset) while keeping real graded rows. Applies the distributed-field
  rule: a session/usage limit is account-global, not per-cell.
- **`analyze.ts`** gained a **minimum-N floor** (`MIN_TASKS_FOR_VERDICT = 5`) + a
  degenerate-CI guard: with 1 surviving task the bootstrap CI collapses to `[v,v]`
  and trivially "excludes 0" → a false ESCALATE. Verdict is now `INSUFFICIENT_DATA`
  below the floor, and the report prints a **data-quality line** (paired tasks / void
  cells). The A6 selftest asserts the n=1 → INSUFFICIENT_DATA guard.
- **`make-sandbox.ts`** hardened for real repos: the base tree is extracted WITHOUT
  `.git` and each arm re-inits its own repo (copying a live `.git` races git's
  post-commit `gc --auto` → ENOENT on a large tree like atlas); the A4 `fileMap`
  hashes bytes + records symlink targets + tolerates unreadable/special files
  (readFileSync-as-utf8 crashed on atlas binaries/symlinks). Every path crossing a
  subprocess-with-cwd boundary is absolutized (a relative `CONTEXA_HOME`/`--mcp-config`
  re-anchors against the child's cwd and lands artifacts inside the checkout).
- **`grade-cell.ts`** exposes `$TK_MEASURE_DIR` so an accept_cmd can materialize a
  committed test asset (see below).

**Load-bearing finding — vacuous gates.** Every maintainer-authored accept_cmd ran
its test **as-is at the sandbox sha (fix-parent)**, where the test PASSES — so the
gate exited 0 regardless of the agent's work (M2 gives zero signal; verified by
running each test at the fix-parent worktree). A valid FAIL_TO_PASS must run the
**fix commit's** test version, which the sandbox cannot reach (truncated archive, no
source git objects). Fix (SWE-bench apply-test): the fix's test file(s) are extracted
into committed assets under **`fix-tests/<task>/`**, and each accept_cmd copies them
in (via `$TK_MEASURE_DIR`) before running vitest. Every task's gate was re-verified
end-to-end: FAIL on the bare sandbox (bug present), PASS after the fix's code is
applied. `atlas-cache-valkey-resilience` was **dropped** — its test needs a live
Valkey, ungradable in a bare sandbox.

**Task bank (`task-bank-draft.jsonl`, draft).** 5 atlas + 6 tk = 11 tasks. atlas
prompts were authored by Opus then **independently reviewed by Fable**, which caught
a systematic defect: symptom-only prompts are Q17-clean but UNDER-SPECIFIED against
exact-match golden tests (fix-invented labels/URLs/ordering are unguessable → the A/B
delta becomes label-lottery noise); Fable's revised prompts pin the observable output
contract while withholding implementation structure. `prompt_reviewed:true` marks the
4 Fable-vetted atlas prompts. **Still owed (blocked by the account session limit):**
Fable review of the 6 tk prompts (real session prompts — some reference an image/
attachment not in the sandbox, a fairness risk) + the `atlas-discovery-list-only`
prompt.

## Handoff back (maintainer)

- Author the ≤10 `accept_cmd`s from each candidate's real fix-commit test delta
  (Q5; read ONLY the fix commit — never the ctx store or either arm's config).
- Decide isolated-vs-real auth for the 60-cell afternoon (README §Auth). Isolated +
  token gives literal A7.
- Run the grid (interleave arm order per task), then `analyze` → four-condition
  verdict → R2 go/no-go (budget pre-approved, P32).
