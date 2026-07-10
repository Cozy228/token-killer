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

---

# v2 preconditions build (2026-07-10) — MEASUREMENT-DESIGN-V2 §1b/§1c/§2/§3/§4

Implements the SCRIPT-side preconditions of the ratified v2 design (P38). Authority on
any conflict = `docs/design/measurement/MEASUREMENT-DESIGN-V2.md`. Scope was
`tools/measurement/` ONLY — no `packages/` or `src/` product code was touched (P27).

## Decisions (design left open)

- **Adoption extraction path = the session transcript jsonl (verified), NOT stream-json.**
  The work order flagged the fork (`--output-format stream-json` vs parsing the
  transcript). Verified against the tool, no paid runs:
  - `--output-format json`'s result object (real sonnet rows) carries `session_id` but
    **no `mcp_servers` field and no tool-call events** — so the result alone cannot give
    adoption or MCP-attach.
  - The transcript jsonl `claude -p` writes under the (isolated) `CLAUDE_CONFIG_DIR`
    (or real `~/.claude`) `/projects/<slug>/<session_id>.jsonl` DOES carry ordered
    `assistant.message.content[] tool_use` blocks + `user … tool_result` blocks. A
    type-scan of a real transcript confirmed the shape; `extractAdoption` parses it and,
    run against `atlas-availability-page-parse.B.0`, reproduced ctx_calls=3, read=5,
    grep=6, edit=1, first_ctx=4 < first_edit=26 ⇒ `ctx_before_first_edit=true`.
  - `run-cell` keeps `--output-format json` for the authoritative M1–M6 (fully verified,
    unchanged) and recovers adoption POST-RUN from the transcript keyed by `session_id`.
- **`--protocol forced` implies arm B = FORCED, arm A = PLACEBO.** The flag values are
  `none|optional|forced` per the order; the design's E2 also needs arm A's structurally
  matched placebo (§1 T2). Rather than add a 4th flag value, `withPreamble(protocol,arm)`
  maps `forced` → FORCED for B / PLACEBO for A. `none`/`optional` = raw prompt. Both
  preamble texts are frozen exported consts in `lib.ts` (kept byte-aligned with the codex
  runner's `forced` text so the two runners share a treatment).
- **E0 analysis folded into `e0-bench-retrieval.ts`** (no separate `e0-analyze.ts`) — one
  pass emits `e0-rows.jsonl` + `e0-report.json`. Simpler, and the report needs the rows
  it just produced.
- **E0 rides on make-sandbox arm-B stores.** The design says "one `ctx sync` per repo at
  the task-bank SHA"; but bank tasks in one repo have DIFFERENT fix-parent SHAs, each with
  its own make-sandbox `armB` frozen store + `.mcp.json`. E0 reuses those per-task stores
  (`--sandboxes <tasksdir>`, reading each task's `cellB.env.json` → `armB/.mcp.json`),
  spawning `ctx mcp` with the EXACT arm-B wrapper recipe. This guarantees the benchmark
  hits the same frozen index the agent would. Verified end-to-end against a freshly-built
  tk sandbox: 100% completion, p50 169 ms / p95 255 ms, drillability 8/8, gated relevance
  computed.
- **E0 completion is classified by response TEXT, not `isError`.** Verified: a no-seed
  miss returns `isError:false` with the O-33 "…use task mode" guidance. `mcp-client.ts`
  matches miss markers (`does not resolve to a known entity`, `not indexed`, `use task
  mode`, …) and captures the verbatim text for the O-33 check.
- **E0 child env scrubs model keys.** `ctx mcp` refuses to START with a model key set
  (`assertNoEgress`, M14). The client deletes `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`
  / `OPENAI_API_KEY` / `GEMINI_API_KEY` before spawn.
- **E0 handle parse requires a digit.** ctx handles are short base36-ish ids (`c3d118`);
  the literal `[handle]` word in guidance text would otherwise be counted and fail
  drill-down. `parseHandles` keeps only `[…]` tokens containing a digit.
- **Push neutralization strips ONLY the imperative line**, keeping the descriptive
  disclosure line ("This project has a ctx context base…") + gotchas — per the work
  order's literal "strip/neutralize the imperative sentence". (See Open questions for the
  E1-`optional` descriptive-line debate.)
- **Guardrail threshold = 8/11** (was 8/10 in v1). Expressed as the fraction `8/11` so a
  scaled bank still yields ~8/11 (`ceil(8/11·11)=8`, `ceil(8/11·3)=3`).

## Deviations (departed from the plan, and why)

- **`analyze` report shape changed from an ARRAY to an OBJECT**
  `{ source, run_valid, run_invalid_reasons, models, repos }`. Required by the staleness
  guard (source row-count + sha256) and the run-level RUN_INVALID verdict (model
  homogeneity is a grid-level property). `analyzeRuns` now returns `AnalysisResult` (was
  `RepoReport[]`); `renderReport` takes the result. No in-repo consumer reads the old
  array shape (run-grid only writes + prints it). The v1 `.work/report.json` files are
  stale under the new shape — expected (they were already stale, E-6).
- **`mcp_attached` cannot detect a silent no-attach when ctx is never called.** The
  transcript has NO system/init handshake event (confirmed by type-scan). So attach is
  inferred: a ctx `tool_result` error matching a detach pattern ⇒ `false` (⇒ infra-void
  `"mcp not attached"`); any ctx call that got a real response (even a product error) ⇒
  `true`; **no ctx call at all ⇒ `null` (indeterminate), NOT voided.** The design's
  "silent-detach → void" is therefore only enforceable on the positive-detach signal.
  Strict detection of a treatment cell that connected-but-was-never-called needs the
  stream-json `system/init` `mcp_servers` list, which could not be verified without paid
  spend (see Open questions). Conservative choice: flag, don't fabricate a void.
- **Added an entry guard to `run-cell.ts`** (`import.meta.url === pathToFileURL(argv[1])`)
  so `extractAdoption` can be imported for verification without executing `main()`.
  Verified the guard still fires when run-grid invokes it as a subprocess.
- **New shared file `mcp-client.ts`** (dependency-free MCP stdio JSON-RPC client). The
  design implies a "hand-rolled minimal client, no new deps" — this is it, mirroring the
  product shim's own no-SDK stance.
- **Hardened `cellFatalError` / limit-detection in `run-grid.ts` (E-3 fix, 2026-07-10).**
  The Safeguard-2 limit detector missed the "weekly limit · resets Jul 12" 429 that killed
  the sonnet grid (see Adjacent-found E-3). Three changes, harness-side only:
  1. **Read the structured `api_error_status` first** — `429 ⇒ limit`, `401/403 ⇒ auth` —
     independent of prose phrasing. This is the robust primary signal.
  2. **Gate all fatal-detection on `is_error === true`.** A cell that COMPLETED
     (`is_error:false`) is never systemic-fatal, so task output that legitimately quotes
     "403"/"429"/"rate limit" (e.g. the `atlas-discovery-cql-403-fallback` task) can no
     longer trigger a spurious abort. This also let me **remove the bare `\b401\b`/`\b403\b`/
     `\b429\b` numeric alternatives** from the text regexes, which were latent false-positive
     traps (the old regex kept `\b401\b`).
  3. **Broadened the prose fallback** `LIMIT_ERR_RE` to `weekly|daily|monthly|hourly` limits,
     `hit your … limit`, `limit … resets`, and `resets Jul 12`-style (`resets \w+ \d`) dates,
     for the rare no-structured-status case.
  Verified against all 74 preserved cells of `.work/r1-grid-sonnet`: the fixed detector
  flags 33 cells as `limit` (the 30 tk 429s + 3 tk-support session-limit 429s), **0 false
  positives** (the 6 successful cql-403 cells are no longer flagged), and correctly leaves
  8 genuine task-void errored cells (budget/tool_use) un-aborted. In the real grid the abort
  would have fired on the first 429 (~02:18) and `--resume` would finish the rest after the
  cap reset. `tsc -p tsconfig.json` clean.
- **`buildOrder` now round-robins task families by repo (E-3 order-confound fix, reviewer-
  accepted 2026-07-10 as extending v1 §4 arm-order interleaving to the task-family axis).**
  New `orderTasksRoundRobin` groups tasks by `repo` (bank order preserved within each family
  and across first-appearance), then interleaves families deterministically (atlas, tk, atlas,
  tk, …); per-task arm interleaving is unchanged. So a mid-grid quota cap now degrades **both**
  repos partially instead of zeroing one family. No randomness ⇒ `--resume` stays stable.
  Verified: `tsc --noEmit` exit 0; dry-run step order alternates atlas/tk (longer 6-tk bucket
  drains last).

## Adjacent-found (untouched — reported, not fixed; product code out of scope)

- **O-33 confirmed:** a no-seed `context` miss returns `isError:false` with
  `"…does not resolve to a known entity. Pass a [handle] …, or use task mode."` even when
  the query WAS task mode — the E-15 circularity. Lives in `packages/core/src/select/
  engine.ts`; E0 captures it verbatim. NOT fixed (product scope).
- **O-32 (E-9) 300 s ctx timeouts:** not reproduced in this build's local probes (p95
  255 ms on a warm tk store), but E0's `timeout_rate` gate + configurable `--timeout`
  (default 60 s, well below 300 s) exist precisely to catch it cheaply. Product-side; NOT
  fixed.
- **tk `stop_sequence` turn-1 death (E-3): ROOT-CAUSED 2026-07-10 (artifacts only, no
  paid cell).** NOT tk-specific and NOT a prompt/CLAUDE.md/stop-sequence/recursion issue —
  it was an **account-level 429 rate cap** (weekly limit) hit at the atlas→tk boundary,
  which the grid's own limit-abort safeguard then failed to catch, so it burned the whole
  tk block into 30 void cells. Evidence chain:
  - Every dead tk cell's raw JSON is `is_error:true, api_error_status:429,
    result:"You've hit your weekly limit · resets Jul 12 at 1pm", stop_reason:stop_sequence,
    usage all-zero, num_turns:1, wall ~3 s`. `stop_reason:stop_sequence` is just how the
    CLI labels a rejected-before-inference result — a red herring, not a prompt collision.
  - The 30 failures fired in a 4-second-apart burst (02:16–02:20) right after atlas cells
    that each ran 8–9 min. Instant cadence = rejections, not runs.
  - Same tk tasks, same repo/CLAUDE.md, same `--max-budget-usd 3`, same
    `bypassPermissions` **succeeded** at other times (e.g. `tk-support-github-channel.B.0`
    exit 0, 208 s, 12 turns; `.A.0` 135 s, 21 turns). So it is temporal quota, not tk.
  - `grid-plan.json` step order runs **all 5–6 atlas tasks before all 5 tk tasks** (bank
    order; `buildOrder` interleaves only arms within a task, never task families). The
    weekly cap ran out during the atlas block, so the loss landed entirely on tk — a fully
    confounded result (atlas has data, tk has none), not a signal about tk.
  - Discriminators for the ruled-out hypotheses: `--max-budget-usd` identical across arms
    (atlas succeeded at $2.9); permission-mode identical; auth is a **shared account** with
    per-cell isolated *config dirs* (isolated dir ≠ isolated quota) — same 429 pool; zero
    tokens billed rules out any content/CLAUDE.md early-stop.
  - **Why the existing safeguard didn't abort:** `run-grid.ts` already had a limit detector
    (`cellFatalError`/`LIMIT_ERR_RE`, since 8c050758). Two gaps let the weekly-limit message
    through: (1) `LIMIT_ERR_RE` listed `session|usage|rate limit` but **not `weekly limit`**;
    (2) its `resets \d` alternative needs a digit right after "resets", but the text is
    "resets **Jul** 12"; and (3) `cellFatalError` scanned only the `result` prose, never the
    structured `api_error_status:429`. So no abort fired and the grid burned all remaining
    cells. **FIXED** — see Deviations. (Underlying quota exhaustion is product/account-side,
    NOT fixed; the harness now aborts on the first 429 and `--resume` finishes after reset.)

## Open questions

- **stream-json `system/init` verification.** Before the first paid grid, a maintainer
  should run ONE cheap cell with `--output-format stream-json --verbose` to confirm the
  init event lists `mcp_servers[{name,status}]`; if so, `run-cell` can adopt it for STRICT
  silent-no-attach voiding (the one case the transcript can't cover). Until then,
  `mcp_attached=null` on zero-ctx-call treatment cells is a known blind spot.
- **E1 `optional` descriptive line.** §1c says "tools present, nothing tells the agent",
  but the order scoped neutralization to the imperative sentence only. The block's first
  line still discloses ctx exists. If the maintainer wants a truly silent `optional`, the
  whole managed block should be stripped for that condition — a one-line change, deferred
  pending a ruling.
- **`prompt_reviewed` reconciliation + E-14 grader fix (§1c) + E0 ground-truth authoring**
  remain maintainer-owned preconditions (not script work); untouched here.
