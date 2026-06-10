# Windows live-test issues — 2026-06-10

Found while live-testing tk with **VS Code + GitHub Copilot on Windows** (box `cozyultra`,
user `cozy2`, GBK/cp936). This was the last gate before internal rollout: confirm Copilot's
agent routes terminal commands through tk so output gets compressed.

**Verdict: the gate FAILED, and the root cause is fundamental** — see R1. The rest are real but
secondary bugs surfaced along the way. All decisions below are locked with the user; code is
**not yet changed**.

---

## Goal prompt — implementation brief (paste to the implementing agent)

> **Goal.** Implement the locked fixes below so that (1) VS Code + GitHub Copilot's agent receives
> tk-compressed terminal output, and (2) the tk CLI surface is safe and predictable. Repo:
> `/Users/ziyu/Workspace/token-killer`, branch `token-killer-node-cli`. PNPM; English in
> code/comments; reply to the user in Chinese; never use haiku for subagents.
>
> **Read first.** This whole report — especially **R1 ★** (TTY gate), **U1+U2 ★** (CLI surface +
> passthrough), and **D1** (debug trace). Root causes and the live test are settled and validated on
> the box; **do not re-diagnose or re-litigate decisions — implement them.** Each issue's own
> *Fix / Test* subsections are the spec.
>
> **Scope — 5 items, in this order:**
> 1. **CLI surface + passthrough hardening (U1+U2).** Promote `tk install` / `tk uninstall` /
>    `tk status` to top-level; **remove `tk init`** (migrate every reference: `help` in `src/cli.ts`,
>    `src/shim/guidance.ts`, generated TK.md + CLAUDE.md `@import`, `docs/`, runbooks, tests).
>    `tk status` does no writes. Harden passthrough: direct `tk <x>` runs only if `<x>` is a tk
>    command / routable handler / known shimmable tool — else **error, never spawn**; shim-invoked
>    passthrough (`TK_SHIM_DIR` set) stays unchanged; `tk --raw <x>` is the escape hatch.
> 2. **R1 + D1.** Gate (`src/shim/gate.ts`): `match && !isInteractive && (!isTTY || env.TK_COMPRESS_TTY)`.
>    `tk install --host vscode` writes `TK_COMPRESS_TTY=1` into `terminal.integrated.env.windows`
>    (uninstall removes it). Rename `hookDebug`→`tkDebug`; call it from `src/cli.ts` to trace the
>    gate decision (+reason) and savings to **both stderr and `debug.log`**.
> 3. **I4.** For the copilot host, stop writing the standalone `~/.copilot/TK.md`; keep only the
>    inlined block in `copilot-instructions.md`. Claude-code keeps its `@`-imported TK.md.
> 4. **G2.** `tk uninstall --purge-data` deletes `~/.token-killer/projects/` (+ empty home); plain
>    `tk uninstall` preserves it; `--dry-run` reports without deleting.
>
> **Hard constraints (do NOT violate).**
> - Never break **shim-invoked passthrough** (`TK_SHIM_DIR` set) — it's the main delivery path and
>   must stay transparent (covers shimmable tools without a specific handler, e.g. `curl`).
> - Keep `!isInteractive` **unconditional** in the gate, even when `TK_COMPRESS_TTY` is set.
> - tk wraps **real** tools and never fabricates; never auto-spawn an arbitrary PATH binary for an
>   unknown *direct* command (that's the U2 bug that ran Bandizip's uninstaller).
> - **Fail-open:** any compression/exec error falls back to the real tool; never crash or block.
> - Do **not** pursue the Claude-agent route (user decision); stay on Copilot's native agent.
>
> **Success criteria.**
> - `pnpm test` green; add the tests named in each item's *Test* subsection.
> - `tk install`/`tk uninstall`/`tk status` behave as specified; `tk init` is gone; `tk uninstall`
>   spawns nothing on PATH (regression: planted `uninstall.exe` is never run); `tk <unknown>` errors.
> - Gate: TTY+`TK_COMPRESS_TTY`→compress; TTY without flag→passthrough; interactive→never compress.
> - `TK_DEBUG=1` makes `debug.log` show each command's gate reason (e.g. `reason=tty-no-flag`).
> - **Live (box `cozyultra`):** with `TK_COMPRESS_TTY=1` in env.windows + VS Code restarted, Copilot
>   agent runs `git log -n 30` → first line `Git Log: 30 commits`, a `history.jsonl` entry with
>   `savings_pct>0`, and `debug.log` shows `willCompress=true`. (env-inheritance + `isTTY=true`
>   already confirmed — see "Remaining open dependency ✅ RESOLVED".)

---

## Implementation status — 2026-06-11 (the 5 in-scope items SHIPPED)

All five locked items in the goal brief are implemented; `pnpm test` is green
(**1481 passed**), `pnpm exec tsc --noEmit` clean, smoke green (67/0/1 in a clean
home), `validate-docs` 35/35. Code on branch `token-killer-node-cli`, uncommitted.

| Item | What changed | Tests |
|------|--------------|-------|
| **U1+U2** | `tk install` / `tk uninstall` / `tk status` are now top-level reserved verbs (`src/parse.ts`, `src/types.ts`, `src/cli.ts`); `src/shim/init.ts` split into `runInstall`/`runUninstall`/`runStatus`. `tk init` removed → prints a rename hint and exits 1. Manual shim control re-homed to top-level `tk shim`. **Passthrough hardening** in `src/cli.ts`: a direct `tk <x>` (no `TK_SHIM_DIR`) runs only if `<x>` is a routable handler or a known shimmable tool (`isShimmableProgram`, `src/shim/programs.ts`); otherwise it errors and spawns nothing. Shim-invoked passthrough (`TK_SHIM_DIR` set) is unchanged; `tk --raw` is the escape hatch. | `tests/integration/cli.test.ts` (Passthrough hardening: errors+spawns-nothing, `--raw` force-runs, shim-invoked still runs); `tests/unit/shim/initCli.test.ts` (install/uninstall/status + `tk init` rename); `tests/unit/shim/shimCli.test.ts` (`tk shim …`) |
| **R1** | Gate is now `match && !isInteractive && (!isTTY \|\| TK_COMPRESS_TTY)` (`src/shim/gate.ts`, `!isInteractive` stays unconditional). `tk install --host vscode` writes `TK_COMPRESS_TTY=1` into `terminal.integrated.env.*` alongside PATH/`TK_SHIM_DIR` (`src/shim/hostConfig.ts`); uninstall removes it. | `tests/unit/shim/gate.test.ts` (TTY+flag→compress, interactive+flag→still passthrough, reason codes); `tests/unit/shim/hostConfig.test.ts`; `initCli.test.ts` (env round-trip) |
| **D1** | `hookDebug`→`tkDebug` (dual-sink: stderr **and** `debug.log`). `src/cli.ts` traces the gate decision `tkDebug("gate", {command, handler, isTTY, interactive, willCompress, reason})` with `reason ∈ {no-handler, interactive, tty-no-flag, compress}`, plus `compress` (savings) and `compress-failed`. | `tests/integration/cli.test.ts` (TK_DEBUG dual-sink: debug.log gets the gate line + savings; passthrough records `reason=no-handler`); `tests/unit/hook/debug.test.ts` |
| **I4** | `guidanceFilePath("copilot-cli")` → `undefined`: the standalone `~/.copilot/TK.md` is no longer written; guidance stays only inlined in `copilot-instructions.md`. Claude-code keeps `@`-imported `TK.md`. Uninstall still strips the inlined copilot block. | `tests/unit/shim/guidance.test.ts` (no standalone TK.md, block still stripped); `hostAdapter.test.ts`; `initCli.test.ts` |
| **G2** | `tk uninstall --purge-data` deletes `~/.token-killer/projects/` (+ empty home); plain uninstall preserves it; `--dry-run` reports only (`src/shim/init.ts`). | `initCli.test.ts` (preserve-by-default, purge removes, dry-run reports) |

Docs migrated (`README.md`, `docs/INSTALL.md`, `docs/WINDOWS-TESTER-GUIDE.md`),
inspect/advice recommendations now say `tk install`. **Not done (out of scope per
the brief's 5-item list):** R2, I1, I2, I3, G1 remain as proposed in this report.
**Live box re-test (R1 confirmation on `cozyultra`) is the remaining gate** — see
"Success criteria" / "Remaining open dependency" below; it needs the Windows box.

---

## Issue summary

| ID | Sev | One-liner | Status / decision |
|----|-----|-----------|-------------------|
| **R1** | ★ CRITICAL | tk's TTY gate refuses to compress in a TTY; VS Code Copilot's agent runs in a pty (TTY=true) → never compresses, on any tier | **FIX ACCEPTED**: `TK_COMPRESS_TTY` opt-in |
| R2 | HIGH | Reinstall outside the VS Code terminal mis-detects `copilot-cli`, silently swaps shim→hook tier | Fix proposed |
| U1+U2 | ★ HIGH | tk-verbs leak into passthrough: `tk init status` silently re-installs; `tk uninstall` spawned `…\Bandizip\uninstall.EXE`. Root: install/uninstall/status aren't real top-level commands | **DECIDED**: CLI surface redesign → top-level `tk install` / `tk uninstall` / `tk status`; **drop `tk init`** |
| I1 | HIGH | `tk inspect` leads with meaningless telemetry; no "problem + action item" | Fix proposed |
| I2 | HIGH | On VS Code, inspect's runtime half is always empty (0 tool events) | Needs path investigation |
| I3 | MED | inspect never surfaces the VS Code-settings wins (`chat.tools.compressOutput`) | Fix proposed |
| I4 | MED | Copilot guidance duplicated; the standalone `TK.md` is dead weight (never read) | **DECIDED**: drop standalone TK.md for copilot |
| G1 | LOW | `tk gain` provenance opaque (data is real dogfood, not a bug) | Discoverability only |
| G2 | MED | Uninstall leaves all metrics; no reset/purge command | **DECIDED**: `--purge-data` flag |
| D1 | MED | `debug.log` is written only by the hook path; the shim/compress path traces to stderr only → `TK_DEBUG` is blind for the exact case (VS Code) where stderr is invisible | **DECIDED (fix)**: compress path also writes debug.log + the gate reason |
| R3 | INFO | PowerShell-vs-CMD is a red herring; shim resolves in both | No fix; troubleshooting note |

---

## R1 ★ — TTY gate is incompatible with VS Code Copilot (CRITICAL)

**Problem.** Copilot's agent ran `git log` in VS Code; tk never compressed and never recorded.
Running `tk git log -n 10` **directly** (no shim) ALSO returned raw output — proving it's not a
delivery/PATH problem.

**Root cause.** `src/shim/gate.ts:15-21`:
```
shouldCompress = match !== null && !isTTY && !isInteractive(command)
```
tk compresses **only when stdout is NOT a TTY** (comment: *"piped to the agent, no human
watching"*). Interactive terminal → TTY → `executePassthrough` (`cli.ts:259-260`), which inherits
stdio and never records (`cli.ts:238`). The gate's premise is **agent⇒pipe, human⇒TTY**.

That premise holds for Copilot CLI / Claude Code (they capture command output via **pipes** →
`isTTY=false` → compress works). It **breaks for VS Code Copilot**, whose `run_in_terminal` tool
executes in a real integrated terminal = a **ConPTY**, so `process.stdout.isTTY = true` even though
an agent (not a human) consumes the output. → tk passes through raw for the agent, **regardless of
whether the shim resolves or a hook rewrites the command**. No delivery tier can fix this; tk
itself declines to compress in a TTY.

Evidence: SSH calls (output piped, `isTTY=false`) → compressed 79.1% + recorded. The user's
interactive `git log` / `tk git log` (`isTTY=true`) → raw + unrecorded. The agent's
`run_in_terminal` uses pwsh in a panel terminal (ConPTY).

**Fix (accepted).** Add an explicit opt-in that overrides the TTY gate for opted-in terminals:
- `src/shim/gate.ts`: `shouldCompress = match !== null && !isInteractive(command) && (!isTTY || forceCompress)`,
  where `forceCompress = Boolean(process.env.TK_COMPRESS_TTY)`. **Keep the `!isInteractive` guard
  unconditional** — never compress `git rebase -i`/pagers/etc. even with the flag.
- `tk init --host vscode`: write `"TK_COMPRESS_TTY": "1"` into `terminal.integrated.env.windows`
  alongside `PATH`/`TK_SHIM_DIR` (`src/shim/cli.ts:~102`). Uninstall removes it with the rest.
- Net effect: every (non-interactive) command in the VS Code integrated terminal — agent AND
  human — compresses. That is what a user who installed tk for VS Code wants.
- **Tradeoff (accepted by user):** a human typing in that terminal also sees tk's compressed
  format, not raw. Agent-run vs human-run can't be distinguished within one pty, so "compress
  everything in this opted-in terminal" is the honest model.

**Test.**
- *Unit* (`tests/.../gate`): `isTTY=true` + `TK_COMPRESS_TTY` set → `true`; `isTTY=true` + unset →
  `false`; interactive command + flag set → still `false`; `isTTY=false` (unchanged) → `true`.
- *Init* (`tests/.../init` or shim cli): `tk init --host vscode` writes `TK_COMPRESS_TTY=1` into
  the VS Code env block; `--uninstall` removes it; idempotent re-run doesn't duplicate.
- *Live (box)*, in order — these two steps must be separated because R1 masked the env question:
  1. **Prove the agent terminal inherits `terminal.integrated.env.windows`**: have Copilot run
     `echo TK_SHIM_DIR=%TK_SHIM_DIR%` (or pwsh `$env:TK_SHIM_DIR`). If empty → the agent terminal
     does NOT inherit the env, and `TK_COMPRESS_TTY`+shim both miss it → fall back to the hook
     path (needs `chat.useHooks:true`). If set → continue.
  2. Restart VS Code, have Copilot run `git log -n 30` (NOT `--oneline`). PASS = output's first
     line is `Git Log: 30 commits` AND `~/.token-killer/projects/<fp>/history.jsonl` gains an entry
     with `savings_pct > 0`.

**How this was missed / how to detect & avoid recurrence.**
- *Why missed:* every existing test runs tk with stdout **piped** (`isTTY=false`), so they only
  ever exercised the compress path. The gate's unit test asserts `isTTY=true ⇒ false` — it
  **encoded the buggy assumption as expected behavior**, so it passed while being wrong. No test
  ever ran tk under a pty.
- *Detect:* add a **pty-based integration test** (node-pty/conpty) that runs `tk git log` inside a
  pseudo-terminal and asserts compression under `TK_COMPRESS_TTY`. A pty harness is the only thing
  that reproduces the agent's real execution shape.
- *Avoid:* document a **host × stdout-shape matrix** (pipe vs pty) in DESIGN/ADR and record which
  hosts execute in a pty (VS Code Copilot = pty; Copilot CLI / Claude Code = pipe). Make
  "classify the command-execution channel" a required checklist item when onboarding any new host,
  because the TTY gate's correctness depends entirely on it.

---

## R2 — Reinstall outside the VS Code terminal mis-detects `copilot-cli`, silently swaps tier (HIGH)

**Problem.** The box was wired with `tk init --host vscode` (shim). After the user reinstalled,
`tk init status` reported host `copilot-cli` / tier `hook` — the vscode/shim setup was silently
abandoned.

**Root cause.** `detectHost` priority (`src/shim/detect.ts:32-39`): live `TERM_PROGRAM=vscode`
beats a lingering `~/.copilot` dir (the 3ab9e5e fix) — but only when init runs **inside** the VS
Code integrated terminal. The user reinstalled from a **plain PowerShell** (no `TERM_PROGRAM`), so
detection fell through to `~/.copilot` exists → `copilot-cli` → hook tier. And once host=copilot-cli,
init always takes the hook branch (`src/shim/init.ts:232`) and never refreshes the shim.

**Fix.** Two parts: (a) when a prior install of a *different* tier/host exists, prefer it (or warn
loudly) instead of silently re-detecting; (b) emit a visible notice when the detected host differs
from the last-installed host ("was: vscode/shim → now: copilot-cli/hook; pass `--host vscode` to
keep the previous setup"). Persist last-installed host in the data dir to enable this.

**Test.** Unit: detect from a plain-PowerShell env (no `TERM_PROGRAM`, `~/.copilot` present) →
copilot-cli, but with a recorded prior `vscode` install → warn/keep. Init integration: reinstall
emits the host-change notice.

**Detect & avoid.** A `tk init status` (post-U1) that clearly shows host + tier + *last-installed*
would have made the silent swap obvious. Prevention: never let auto-detect silently override a
recorded prior install without surfacing it.

---

## U1 — (merged into "U1 + U2 — CLI surface redesign" above)

---

## U1 + U2 ★ — CLI surface redesign: top-level install / uninstall / status (HIGH; U2 is dangerous)

**Problems (two symptoms, one cause).**
- **U1:** `tk init status` silently RE-INSTALLS — `status` is an unknown token, ignored by
  `parseInitArgs` (`src/shim/init.ts:80`), so `runInit` falls through to a full install
  (`:205-239`). The real status was the `--show` flag. Inconsistent: `tk init shim status` IS a
  subcommand, but top-level status is a flag.
- **U2 (dangerous):** `tk uninstall` → `spawn C:\Program Files\Bandizip\uninstall.EXE EACCES`. tk
  tried to run **Bandizip's uninstaller**. Dispatch (`src/cli.ts:196-234`) recognizes only
  init/hook/inspect/debug/optimize/gain/config/telemetry/report; any other first token becomes
  `parsed.command` and is **passed through** (resolved on PATH and spawned). `uninstall` isn't a tk
  verb → tk looked it up on PATH → Bandizip's `uninstall.EXE` → spawn. EACCES is the only thing
  that stopped a real uninstaller from running. Brushes the "tk wraps real tools, never fabricates"
  principle the wrong way — it wrapped a tool the user never intended.

**Root cause (shared).** install / uninstall / status were never first-class top-level commands —
install was `tk init`, uninstall a `--uninstall` flag, status a `--show` flag. So the natural verbs
(`tk uninstall`, `tk status`) fell through to passthrough.

**Fix (DECIDED with user — full CLI surface redesign).** Promote them to real top-level commands and
**drop `tk init` entirely** (no alias):
- **`tk install`** — install (auto-detect host). Flags: `--host`, `--project`, `--dry-run`.
- **`tk uninstall`** — remove what tk installed. Flags: `--purge-data` (G2), `--project`, `--dry-run`.
- **`tk status`** — show install status (host / tier / shim / injection / guidance). Replaces both
  `tk init --show` and the broken `tk init status`.
- Manual shim control (was `tk init shim <install|status|uninstall>`) re-homed under `tk install`
  (or kept as `tk shim …`) — decide during impl; it's an advanced/debug path.
- These are now reserved verbs that route or error — they can **never** reach passthrough.
- **Migration cost (accepted):** dropping `tk init` means updating every reference — `help`/usage in
  `src/cli.ts`, `src/shim/guidance.ts` (TK.md text), the generated TK.md / CLAUDE.md `@import`
  comment, `docs/`, runbooks, and any test asserting `tk init`. The guidance files already written
  on user machines say `tk init`; `tk install` should rewrite them on next run.

**Passthrough hardening (REQUIRED — user directive: "unrecognized command must NOT passthrough").**
The deeper danger is not just the verb names — it's that `src/cli.ts:234` spawns **any** PATH binary
for an unrecognized first token. `tk uninstall` reaching Bandizip's `uninstall.EXE` is one instance;
`tk <typo>` could spawn anything. New rule:
- **Shim-invoked** (`TK_SHIM_DIR` set in tk's env — the shell already resolved a real tool the user
  ran, e.g. `git`→`git.cmd`→`tk git …`): passthrough stays, **unchanged**. This is the main path and
  must remain transparent (covers shimmable tools without a specific handler, e.g. `curl`).
- **Direct `tk <x>`** (no `TK_SHIM_DIR`): run only if `<x>` is (a) a tk command, (b) a routable
  handler, or (c) a known/shimmable dev tool. Otherwise **error** — `unknown command "<x>" — tk
  wraps known dev tools; use `tk --raw <x>` to run it anyway` — and **never spawn an arbitrary PATH
  binary**. `--raw` (`src/cli.ts:239`) stays the explicit escape hatch to force-run anything.
- This is what makes `tk uninstall` safe even beyond the verb rename: an unknown word can no longer
  silently become a spawned executable.

**Test.**
- Direct `tk <unknown>` (with a same-named binary planted on PATH) → errors, **spawns nothing**.
- Shim-invoked passthrough (`TK_SHIM_DIR` set) of an unhandled-but-shimmable tool still runs.
- `tk --raw <unknown>` still force-runs it.
- `tk status` performs **no writes** (assert no file mutations) and prints host/tier/shim/etc.
- `tk uninstall` removes tk's artifacts and **spawns nothing on PATH** — regression: a fake
  `uninstall.exe` planted on PATH is never spawned.
- `tk install` ≡ old `tk init` behavior; `tk init` now errors (or prints "renamed to `tk install`").
- Unknown first token that collides with a system binary is NOT auto-spawned for reserved verbs.

**Detect & avoid.** *Why missed:* passthrough's "run anything unrecognized" is unbounded; no test
covered "a tk-verb-shaped word colliding with a system binary," and arg parsers silently ignored
unknown tokens. *Prevention:* (1) maintain an explicit reserved-verb list that routes/errors before
passthrough; (2) side-effecting commands must reject unknown args, not ignore them; (3) consider a
confirm-prompt before passthrough-spawning a binary outside the known shimmable/dev-tool set
(names like `uninstall`/`setup`); (4) a test asserting tk's documented verbs never reach passthrough.

---

## I1 — `tk inspect` output has no action items (HIGH, user's original top concern)

**Problem.** Output leads with internal telemetry (`Session inventory`, `Tool events analyzed`,
`Unknown-time records`) that mean nothing to the user; the actionable Static-context findings are
buried last; the Opportunities section dead-ends at `_No tool events found to analyze._`.

**Root cause / where.** `src/inspect/report.ts:62-89` (header stats), `:84-90` (empty fallback);
static section appended at `src/inspect/cli.ts:310-312`; markdown is default, `--html` opt-in
(`src/inspect/cli.ts:281-303` vs `:348-354`).

**Fix.** Re-order to "problem + action item" first: lead with findings/recommendations, demote
counts to a one-line footer (or behind `--stats`). When `tool_event_count===0`, replace the dead
end with a diagnostic action item (ties to I2). Evaluate making HTML the default (richer find+fix /
copy-as-prompt surface).

**Test.** Snapshot test of the markdown with 0 tool events asserts the first section is findings,
not telemetry, and that the 0-events case prints a diagnostic line, not `_No tool events_`.

**Detect & avoid.** Prevention: treat inspect output as a user-facing deliverable with a snapshot
test that encodes "actionable-first"; review output as a user would, not as a stats dump.

---

## I2 — VS Code runtime inspect is always empty (0 tool events) (HIGH)

**Problem.** `Input type: vscode` + `Transcript coverage: 0` + `Tool events analyzed: 0`: the whole
runtime half of inspect produced nothing on the primary host; only static analysis fired.

**Root cause.** VS Code discovery (`src/inspect/sources.ts:59-77`) counts `chatSessions/*.jsonl`
as inventory (34) but seeks tool events only in `GitHub.copilot-chat/transcripts/`; a record counts
only if it has `toolName`/`tool_name`/`tool` (`src/inspect/scan.ts:171-177`). On the box those
transcripts existed but the scanner found 0 tool-bearing records. **Note:** the diagnostic later
confirmed Copilot DOES write tool calls — the chat session jsonl records `run_in_terminal` with the
command — but in `chatSessions/*.jsonl` / `…copilot-chat/transcripts/*.jsonl` under keys the scanner
doesn't recognize (`toolCalls[].name`, `toolSpecificData.kind==="terminal"`), not `toolName`.

**Fix.** Extend `isToolRecord`/scan to recognize the real VS Code Copilot schema
(`toolCalls[].name`, `toolSpecificData.kind`, `terminalToolSessionId`) seen in
`chatSessions/<id>.jsonl`. Then inspect can attribute the agent's terminal tool calls. If a host
truly exposes no tool transcripts, the report must say so plainly instead of printing `0` as data.

**Test.** Fixture: a real-shape VS Code `chatSessions` jsonl with a `run_in_terminal` toolCall →
scan reports ≥1 tool event. Regression fixture committed from the box's `34db0bf7` session (sanitized).

**Detect & avoid.** Prevention: pin scanner schemas to **captured real fixtures** per host/version,
not assumed key names; Copilot's schema differed from the assumed `toolName`. Re-capture on host
version bumps (Copilot 0.52.0 / VS Code 1.124.0 here).

---

## I3 — inspect never surfaces the VS Code-settings wins (MED)

**Problem.** The highest-leverage native lever for a VS Code user —
`chat.tools.compressOutput.enabled` — is implemented but invisible to `tk inspect`.

**Root cause.** `src/context/vscodeSettings.ts` (analyzes compressOutput + ~9 advisory settings,
`:27-50`) is wired only into `tk optimize --vscode-settings` (`src/context/optimizeCli.ts:160-162`),
bypassing the inspect pipeline.

**Fix.** Fold the vscodeSettings check into `tk inspect` as a top-ranked finding (at minimum the
`compressOutput` one), so the report tells a VS Code user the single most useful thing to change.

**Test.** With `compressOutput` unset in a fixture settings.json, `tk inspect` lists it as a
high-priority finding with the apply hint.

**Detect & avoid.** Prevention: one analysis surface. When an analyzer exists but isn't reachable
from the command users actually run, that's a wiring gap — assert in a test that every shipped
analyzer is reachable from `tk inspect`.

---

## I4 — Copilot guidance duplicated; standalone TK.md is dead weight (MED)

**Problem.** For copilot, init writes the full guidance into BOTH `~/.copilot/TK.md`
(`src/shim/guidance.ts:66-73`) AND inlined into `~/.copilot/copilot-instructions.md`
(`:101-105`). Copilot has no import syntax (`:85-90`) so it reads only `copilot-instructions.md`;
the standalone `TK.md` is never loaded.

**Fix (decided).** For the copilot host, **stop writing the standalone `TK.md`**; keep only the
inlined block in `copilot-instructions.md`. (Claude-code keeps its `TK.md` — it's the live
`@`-imported file there, no dup.) Uninstall must stop expecting/removing the copilot TK.md.

**Test.** `tk init --host copilot-cli` writes `copilot-instructions.md` only (no `~/.copilot/TK.md`);
claude-code still writes `~/.claude/TK.md` + the `@TK.md` reference; uninstall is clean for both.

**Detect & avoid.** Prevention: per-host guidance delivery should assert "the file the host
actually loads contains the guidance, and nothing unreadable is written." Encode the host's
import-capability in the adapter.

---

## G1 — `tk gain` provenance opaque (LOW, not a bug)

**Problem.** A "fresh" box showed 61 commands / 72.1% saved; the user expected empty.

**Root cause.** Genuine dogfood: gain is scoped per git-root fingerprint
(`src/core/dataDir.ts:69-74` → `~/.token-killer/projects/repo-<fp>/history.jsonl`,
`src/core/gain.ts:120-144`). Those were real `tk git log/diff` runs against the token-killer repo.
Numbers are correct; the gap is discoverability (no surfaced "where stored / how to reset").

**Fix.** Minor: `tk gain` could print the data path / fingerprint, and point at the reset command
(G2). No numeric change.

**Detect & avoid.** Prevention: per-project ledgers should be self-describing (show path + how to
clear) so "where did this come from" never needs forensics.

---

## G2 — Uninstall leaves all metrics; no reset/purge (MED)

**Problem.** `tk init --uninstall` (`src/shim/init.ts:117-142`) removes hooks/shim/injection/guidance
but never touches `~/.token-killer/projects/`. No reset command exists (`tk telemetry purge` only
clears the unrelated network-telemetry aggregate).

**Fix (decided).** `tk uninstall` keeps data by default; **`tk uninstall --purge-data`** deletes
`~/.token-killer/projects/` (and the now-empty home). NOT destructive by default.

**Test.** `tk uninstall` leaves `projects/` intact; `tk uninstall --purge-data` removes it;
`tk uninstall --purge-data --dry-run` reports without deleting.

**Detect & avoid.** Prevention: any command that creates persistent user data should ship a
documented way to remove it; "uninstall removes everything it installed" should explicitly state
what it does and does NOT touch.

---

## D1 — `TK_DEBUG` is blind on the shim/compress path (MED — cost us hours; now a fix)

**Problem.** `TK_DEBUG=1` was correctly set in VS Code's `env.windows`, yet `debug.log` stayed empty
through the whole diagnosis — leading to the repeated false conclusion "tk never ran." It compounds
exactly where it hurts most: in the agent's terminal, **stderr is invisible**, so a stderr-only trace
is no trace at all.

**Root cause.** Two debug sinks diverge:
- The hook runtime uses `hookDebug()` (`src/hook/debug.ts:58-70`) which writes to **both** stderr
  **and** `debug.log` (`appendToLog`, lines 65-66).
- The shim/compress path (`src/cli.ts:273-278`) hand-rolls a `process.stderr.write` and **never
  touches `debug.log`**. And there is **no trace at all** for the most important decision — the
  compress-vs-passthrough gate (`shouldCompress`) — so "why didn't this compress?" is unanswerable
  from any log. (That decision, `isTTY=true → passthrough`, was the entire R1 root cause and left
  zero footprint.)

**Fix (decided).** Make the compress path use the same dual-sink emitter and trace the gate:
- Rename `hookDebug` → a neutral `tkDebug` (it's already general; "hook" is a misnomer) and call it
  from `src/cli.ts` at: (1) the gate decision — `tkDebug("gate", { command, handler, isTTY,
  interactive, willCompress, reason })` where `reason` ∈ {no-handler, tty-no-flag, interactive,
  compress}; (2) compress success — `{ handler, rawTokens, outTokens, savedPct }`; (3) the
  fail-open catch (already logs to stderr — switch to `tkDebug` so it also lands in the file).
- Net: with `TK_DEBUG=1`, `debug.log` shows every command's route + the passthrough reason — a
  one-line answer to "why wasn't this compressed?" (e.g. `tk debug: gate … isTTY=true willCompress=false reason=tty-no-flag`).

**Test.** With `TK_DEBUG` set and `isTTY=true` (no `TK_COMPRESS_TTY`): a handler command appends a
`debug.log` line with `reason=tty-no-flag`. With `TK_COMPRESS_TTY` set: line shows `willCompress=true`
+ savings. Assert the file (not just stderr) is written.

**Detect & avoid.** *Why it cost hours:* a debug switch that only covers one of two execution paths is
worse than none — it produces confident-but-empty logs. *Prevention:* one debug emitter, used by every
path; a `TK_DEBUG` trace must exist for every compress-vs-passthrough decision (the gate is the most
diagnostic event in the system and had no trace).

---

## R3 — PowerShell-vs-CMD is a red herring (INFO, no fix)

tk doesn't pick the shell — VS Code's `terminal.integrated.defaultProfile.windows` does. The
Windows shim (`git.cmd`) resolves under both PowerShell and cmd via PATHEXT
(`src/shim/install.ts:66-67`), and `(Get-Command git).Source` confirmed PS5 and pwsh7 both pick the
shim when it's first on PATH. The CMD/PowerShell distinction does not affect interception. Worth a
one-line note in VS Code troubleshooting docs only.

---

## Diagnostic red herrings — record so they're not re-derived

1. **`debug.log` is hook-path only** — now promoted to a real fix, see **D1**. "No debug.log" did
   NOT mean the shim didn't run; the compress path simply never writes the file.
2. **`git --version` is never recorded.** No subcommand handler → `executePassthrough` →
   no record (`src/cli.ts:258-260`). It is an invalid routing probe. *Prevention:* the
   troubleshooting doc must say "test routing with `git log` (a recorded handler), never
   `git --version`."
3. **`first on PATH` in `tk init --show`** reflects the PATH of the shell `--show` runs in, not the
   VS Code-injected terminal PATH (`src/shim/cli.ts:148-157`). Measuring from a plain PowerShell is
   misleading. *Prevention:* label the line as "(in this shell)".

---

## Locked decisions (to implement)

- **U1+U2 (CLI surface):** top-level **`tk install` / `tk uninstall` / `tk status`**; **drop
  `tk init`** (no alias). `tk status` shows status (no writes). Migrate all `tk init` references in
  code/docs/guidance.
- **U2 (passthrough hardening):** direct `tk <unknown>` **errors, never spawns** an arbitrary PATH
  binary; shim-invoked passthrough (`TK_SHIM_DIR` set) unchanged; `tk --raw <x>` is the escape hatch.
- **R1:** `TK_COMPRESS_TTY` opt-in — gate change + `tk install --host vscode` writes the env flag.
- **D1:** compress path uses the dual-sink `tkDebug` (stderr + `debug.log`) and traces the
  compress-vs-passthrough gate reason. (Pairs with R1 — makes the next live test self-explaining.)
- **G2:** `tk uninstall --purge-data` wipes data; plain `tk uninstall` preserves it.
- **I4:** drop the standalone `~/.copilot/TK.md` for copilot; keep the inlined block.

## Remaining open dependency — ✅ RESOLVED (live test, 2026-06-10 ~23:30)

R1's fix assumed the agent's `run_in_terminal` inherits `terminal.integrated.env.windows`. **Confirmed
by probe:** Copilot agent ran `node -e "…process.stdout.isTTY … process.env.TK_SHIM_DIR …"` and
returned:
```
process.stdout.isTTY=true
TK_SHIM_DIR=C:\Users\cozy2\.token-killer\shim
TK_COMPRESS_TTY=unset
```
- **`TK_SHIM_DIR` is set in the agent terminal** → `run_in_terminal` DOES inherit `env.windows`, so
  both the shim PATH and a future `TK_COMPRESS_TTY` flag reach the agent. (Delivery confirmed; the
  earlier round-1 "env not inherited" conclusion was wrong — the TTY gate masked it.)
- **`isTTY=true`** → directly confirms the agent terminal is a ConPTY and the TTY gate is the **sole**
  blocker (a node process's stdout in that terminal is the same TTY the shim's `tk` sees).

→ **R1 path validated: `TK_COMPRESS_TTY` (written into `env.windows`, relax the gate) will compress
the agent's commands.** No hook tier and no Claude-agent path needed. **Decision: stay on Copilot's
native agent; do NOT pursue the Claude-agent route** (user: "we don't use Claude Agent").

Post-implementation live confirmation: add `TK_COMPRESS_TTY=1` to `env.windows`, restart VS Code,
have Copilot run `git log -n 30` → expect first line `Git Log: 30 commits`, a `history.jsonl` entry
with `savings_pct>0`, and (read from the session jsonl) the compressed form is what the agent received.

## Claude-agent route — investigated, NOT pursued (user decision)

For the record: VS Code's **Claude agent** (`github.copilot.chat.claudeAgent.enabled`, "powered by the
same agent as Claude Code", Claude Agent SDK) executes shell via its own **Bash tool that captures
output** (pipe, `isTTY=false`) — so it would dodge BOTH R1 blockers (no TTY gate; hooks independent of
`chat.useHooks`), and tk already supports Claude Code hooks (`tk init --host claude-code`). But the
user does not use the Claude agent, and `claudeAgent.enabled` is org-managed + currently `false`. Kept
as a known alternative only. (Sources: VS Code agent-hooks + third-party-agents docs.)

---

## Appendix — diagnostic evidence (box `cozyultra`, 2026-06-10)

- Copilot **0.52.0**, VS Code **1.124.0**. Agent ran `git log --oneline -5` via `run_in_terminal`
  (session `34db0bf7`), exit 0, in a **pwsh** panel terminal — though
  `terminal.integrated.defaultProfile.windows = "Command Prompt"` (the agent ignores the profile).
- settings.json: `terminal.integrated.env.windows` correctly injects shim-first PATH + `TK_DEBUG=1`;
  `chat.useHooks: false` (hook tier disabled).
- Shim verified working end-to-end: controlled shell with shim-first PATH, bare `git log -n 30` →
  tk's `Git Log: 30 commits`, recorded `raw 5147 → 1075 tokens, saved 79.1%`
  (`projects/repo-e82ec09d82f1/history.jsonl`). `(Get-Command git).Source` = shim git.cmd in PS5 & pwsh7.
- Real OS PATH: shim is NOT on User or Machine PATH; git is on **Machine** PATH
  (`C:\Program Files\Git\cmd`). User-level PATH cannot precede Machine PATH, and **admin is not
  available** → a global System-PATH prepend is out; only env.windows / pwsh-profile / hook are
  user-level levers.
- The decisive step: `tk git log -n 10` run **directly** in the interactive terminal returned RAW
  output → isolates the cause to the TTY gate, not delivery.
</content>
</invoke>
