# Goal: Ship Layer 2 — Copilot-CLI hook tier (RTK-style) + Inspect (Track B)

Drive agent sessions that build Token Killer's **first product capability beyond the local
command proxy**: the Copilot-CLI hook that delivers the `tk` proxy into the Copilot
tool-call loop (DESIGN §3 / §13.1) and the read-only session scanner (DESIGN §9 /
`docs/inspect-v1-design.md`). This is where `tk` stops being "an RTK-style CLI" and becomes
a "Copilot cost-control companion".

## Delivery model (locked — read this first)

- **The shim is the primary delivery tier** for command-compression, and it is
  host-agnostic — it covers VS Code (the user's main env). It has its own plan:
  [`docs/shim-delivery-goal.md`](shim-delivery-goal.md) +
  [ADR 0002](adr/0002-shim-delivery-tier-and-passthrough.md). **This goal does NOT build
  the shim.**
- **The hook in this goal is Copilot-CLI-only.** GitHub Copilot hooks do not fire for
  compression in the user's VS Code env ([`docs/layer2-hook-protocol-spike.md`](layer2-hook-protocol-spike.md),
  closed — do not relitigate). On VS Code, command-compression is delivered by the **shim**,
  never by a hook.
- **The hook works like RTK, not like a result rewriter.** RTK's Copilot/Claude hook only
  *prepends the proxy*: it rewrites `git status` → `tk git status` in the pretool payload,
  and the `tk` proxy does the compression. This goal's hook does the same. It does **not**
  do posttool `modifiedResult` or direct-tool result replacement — **compression always
  happens inside the `tk` proxy, never by the hook editing a tool result**
  (CONTEXT.md *Delivery tier*: the hook is one delivery of the `tk` prefix; the proxy
  decides whether to compress).
- **One installer, `tk init`** (modeled on `rtk init`), auto-detects the host and wires the
  highest available tier — **default VS Code → shim**, Copilot CLI → the `tk hook copilot`
  handler, neither → instruction injection. This mirrors RTK's split: `rtk init` installs,
  `rtk hook copilot` is the runtime handler the host invokes. The unified `tk init` lives in
  shim-delivery-goal.md Phase 3; this goal supplies the `tk hook copilot` handler and the
  config-writing routine `tk init` calls. Do not build a competing init here.

- **Spec source of truth:** `docs/DESIGN.md` §3, §9, §10, §13.1; `docs/inspect-v1-design.md`
  (canonical inspect spec); `CONTEXT.md` → *Delivery* (Delivery tier, Shim, Instruction
  injection); `docs/adr/0002-shim-delivery-tier-and-passthrough.md`
- **Reuse:** the existing command-proxy pipeline (`src/core/pipeline.ts`,
  `src/handlers/**`) is the compressor — do NOT re-implement it. The hook only rewrites the
  command string to `tk <cmd>`; the `tk` proxy compresses.
- **Background:** `docs/REPORT.md` and the copilot session tool-use analysis under `docs/`

This is larger and less mechanical than Track A. Build it in thin vertical slices, each
shippable and tested, rather than one big drop.

## Guardrails (from DESIGN — non-negotiable)

- **User-level scope only.** Hook config writes to `~/.copilot/hooks/` (Copilot CLI) and
  Token Killer data to `~/.token-killer/`. Never write hooks, config, or filters into the
  project repo (DESIGN §15, §3.0).
- **The hook rewrites commands; it never replaces results.** No `modifiedResult`, no
  posttool result projection in this goal. Compression is delegated to the `tk` proxy.
- **Fail-open.** Any parse/config/policy error → `allow` / no rewrite. Only an explicit
  deny rule blocks. Debug logs go to stderr; stdout is reserved for the JSON protocol
  (DESIGN §3.6).
- **Terminal commands only get the `tk` prefix.** Non-equivalent shells (heredoc, redirect,
  pipe RHS, `find … | xargs`) → `pass`. Mutating ops (`git commit`, deletes) are never
  rewritten (DESIGN §14) — at most a dry-run/confirmation hint.
- **Direct tools are governed, not compressed here.** `read_file` / `grep_search` /
  `list_dir` cannot be RTK-rewritten (no shell to prefix). The hook may *govern* them
  (deny dependency-dir / lockfile reads) but does **not** compress them — direct-tool result
  compression would need `modifiedResult` and is **deferred** out of this goal.
- **No model-name guessing.** If payload lacks a reliable model name, fall back to L2
  behavior governance (DESIGN §3.7, §11).
- **Raw evidence is recovery/metrics, never telemetry.** Telemetry off by default;
  aggregate fields only, opt-in (DESIGN §8.3).

## Slice plan

### Slice 0 — Tool-event normalizer (foundation for everything)

`src/hook/normalize.ts`: read stdin JSON, emit a unified `ToolEvent`:
`{ kind, toolName, toolInput, toolResult?, command?, cwd, model?, session? }`.

- Accept both Copilot CLI camelCase (`toolName`, `toolArgs`, `toolResult`) and VS Code
  snake_case (`tool_name`, `tool_input`, `tool_response`/`tool_result`). The hook only acts
  on the Copilot-CLI dialect, but the normalizer is **shared with inspect**, which reads VS
  Code transcripts — so both dialects must parse.
- Classify `kind`: `terminal | direct_read | direct_search | direct_list |
  direct_web | edit | unknown` (DESIGN §3 table).
- Unparseable input → an `unknown` event that downstream maps to `allow`.
- Tests: payload fixtures for each dialect × each kind; malformed payload → fail-open.

### Slice 1 — `tk hook copilot` — the Copilot hook handler (RTK-style command rewrite)

The **configured command** the host invokes — mirrors RTK's `rtk hook copilot` (which is
what `~/.claude/settings.json` points `PreToolUse` at). A single host-named handler
`src/hook/copilot.ts` reads the Copilot hook payload from stdin, dispatches by event, and for
`preToolUse` runs the command through a rewrite registry `src/hook/rewrite.ts` (DESIGN §3.8).
It only prepends `tk`; the `tk` proxy does the compression.

- **Terminal events:** command string → registry → `pass | rewrite | suggest | deny`. A
  `rewrite` only **prepends `tk`** (`git status` → `tk git status`, `rg <pat> <path>` →
  `tk rg <pat> <path>`, `npm test` → `tk npm test`). Nothing else changes (DESIGN §3.8).
- Non-equivalent shells (heredoc, redirect, pipe RHS, `find … | xargs`) → `pass`.
- Command chains: rewrite both sides of `&&`/`||`/`;`; only LHS of `|`. Already-`tk` → pass.
- **Governance (not compression):** direct-tool deny — reads of `node_modules`/`dist`/
  `build`/`target`/`coverage`/`.git`/lockfiles → `deny`; repo-root-wide search → `warn`
  (DESIGN §3.2, §11 L2). Decision only; never rewrites a result.
- Output decision JSON on stdout: `{ decision, rewritten_command?, reason? }`.
- `tk hook check <command>`: dry-run that prints how a command would be rewritten (mirrors
  `rtk hook check`) — the test/debug surface.
- Tests: each rewrite-table row; each non-rewrite case; chain handling; already-`tk` → pass;
  governance denies; malformed → fail-open (`allow`).

### Slice 2 — `tk hook copilot` prompt + error events (governance, no result rewrite)

Extend the same `tk hook copilot` dispatcher with the other Copilot hook events — one
configured command, several event branches (RTK only wires `preToolUse`; these are tk
additions, still Copilot-CLI-only):

- `userPromptSubmitted`: warn/block on `prompt.warnTokens`/`prompt.blockTokens`; suggest
  routing for obvious implementation-intent prompts (DESIGN §3.5, §11 L1).
- `errorOccurred` (tool failure): append the shortest recovery hint via `additionalContext`
  and record failure metrics only — no source/log text. There is **no success-path posttool
  and no `modifiedResult`**: the rewritten `tk <cmd>` already compressed its own output, so
  posttool result replacement is unnecessary.
- History: extend `src/core/history.ts` with `source_adapter` (`terminal_tool`) per
  DESIGN §8.1 future-lineage fields.
- Tests: prompt thresholds, failure-hint shape, fail-open, history rows.

### Slice 3 — `tk init` installs the Copilot hook config (no standalone hook installer)

Mirror RTK's split: `rtk init` installs, `rtk hook copilot` runs. Installation is unified
under `tk init` (modeled on `rtk init`), which **writes the host hook config pointing at
`tk hook copilot`**. There is **no `tk hook install`/`tk hook init`/`tk hook status`**.

- `tk init` (default `host=vscode`) → shim (shim-delivery-goal.md Phase 2).
- `tk init --host copilot-cli` → write `~/.copilot/hooks/tk-rewrite.json` config that invokes
  `tk hook copilot` (recoverable, marker-based; never the repo). Mirrors `rtk init --copilot`.
- neither host → instruction injection.
- `tk init --show` (active tier / status), `tk init --dry-run`, `tk init --uninstall`.
- **Config artifact** (format verified from `rtk init --copilot`'s `.github/hooks/rtk-rewrite.json`):
  `{ "hooks": { "PreToolUse": [ { "type": "command", "command": "tk hook copilot", "cwd": ".",
  "timeout": 5 } ] } }`. **tk diverges from RTK on location:** default user-level
  `~/.copilot/hooks/tk-rewrite.json` (RTK writes the repo `.github/`); repo `.github/hooks/` +
  `.github/copilot-instructions.md` only via `tk init --project`. The handler must be fast and
  internally fail-open (preToolUse is fail-closed on timeout/crash).
- The unified `tk init` lives in **shim-delivery-goal.md Phase 3**; this goal supplies the
  `tk hook copilot` handler (Slices 1–2) and the Copilot-hook-config-writing routine that
  `tk init --host copilot-cli` calls.

### Slice 4 — `tk inspect` (read-only session scanner)

Implement per `docs/inspect-v1-design.md`. Default `--input-type vscode`.

- Scan VS Code `workspaceStorage` chat sessions / Copilot transcripts (and
  `copilot-cli` session-state when requested). Pure read-only; never log command
  argument values, search terms, or file contents.
- Rank opportunities by **both** frequency and output volume — required columns:
  `count`/`share`, `total_output_chars`/tokens, `avg`, `max`, `total_input_chars`/`max`,
  `success`/`failure` (DESIGN §9 table).
- Flags: `--since`, `--session`, `--json`, `--repo-context`, `--input-type`. Exit codes
  per the inspect spec.

### Slice 5 — `tk inspect --advice` / `--write-advice`

Pattern detection over the evidence model (DESIGN §10): dependency-dir reads, large-file
reads, repo-wide search, oversized tool inputs, lockfile/build-output reads, full test
runs, mutating-command safety, repeated workflows.

- **Advice now leads with a delivery recommendation, not just per-command fixes** — the
  shim-primary model makes "how is `tk` even reaching this host?" the first question:
  - Scanned host is **VS Code** with many compressible terminal commands run raw → recommend
    `tk init` / shim install (VS Code cannot use the Copilot-CLI hook; the shim is the only
    deterministic path).
  - Scanned host is **Copilot CLI** → recommend `tk init --host copilot-cli` plus the
    per-command rewrites.
  - Either host, direct-tool waste (dependency-dir / large-file reads) → governance advice
    (avoid the read, narrow the scope); note direct-tool result compression is not yet
    delivered.
- `--write-advice` writes a recoverable user-level advice file with markers.
  `--telemetry-export` only emits the allow-listed aggregate fields (DESIGN §8.3).

## Definition of Done (per slice)

1. Code under `src/hook/` or `src/inspect/`, user-level writes only, files < 500 lines.
2. Fail-open verified by a test that feeds malformed/empty input and asserts `allow`/no
   rewrite.
3. stdout carries only protocol JSON; diagnostics on stderr (asserted in a test).
4. Unit tests for each decision branch + payload fixtures (both camelCase and snake_case)
   under `tests/unit/hook/` or `tests/unit/inspect/`.
5. `tk <command>` proxy behavior and all existing tests remain unchanged
   (`pnpm test:product` still green).
6. Update DESIGN §implementation-status table: flip the shipped capability from
   `planned` → `shipped` with the code path. The hook is recorded as **Copilot-CLI-only,
   command-rewrite (no `modifiedResult`)**.

## Acceptance (Track B milestone)

1. Slices 0–1 give a working `tk hook copilot` **command-rewrite** handler (RTK-style:
   prepends `tk`, proxy compresses), demonstrably fail-open, user-level only. No
   `modifiedResult` anywhere.
2. `tk inspect` (Slice 4) produces the ranked opportunity report on real local sessions.
3. The unified `tk init` (shim goal Phase 3, seam from this goal) defaults to
   **vscode → shim**, falls to `tk hook copilot` when Copilot CLI is detected, and degrades
   to injection — verified by simulated-env tests.
4. `pnpm typecheck && pnpm test:product && pnpm test:migration` stay green; new hook/
   inspect suites pass.
5. No project-repo writes; verified by a test that runs a hook and asserts the repo tree
   is untouched.
6. DESIGN.md status table and `docs/inspect-v1-design.md` reflect what actually shipped.

## Constraints

- pnpm only. English in code, comments, tests, commit messages.
- Pure TypeScript/Node; no RTK/Rust dependency at runtime (DESIGN §15).
- One slice per session/PR. Do not start Slice N+1 until Slice N is green and tested.
- Reuse the command-proxy pipeline for compression — the hook only prepends `tk`, it does
  not fork or re-implement the compressor, and it never replaces a tool result.
