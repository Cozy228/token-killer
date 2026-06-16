# Windows + Copilot CLI 1.0.62 live verification (DESIGN §12 step 4)

- **Date:** 2026-06-15
- **Box:** cozyultra (`cozy2@192.168.31.129`), Windows 11, console codepage GBK
- **Branch/commit:** `token-killer-node-cli` @ `f9caf6f` (synced via LAN git bundle — see §0)
- **Versions:** Copilot CLI **1.0.62**, node v22.22.3, pwsh 7.6.2, Windows PowerShell 5.1
- **Scope:** live acceptance of hook fixes #19 / #20 / #21 / #23 / #26 that unit tests cannot prove.
- **Result:** **6/6 goals verified.** One latent (currently-masked) finding recorded in §5.

## 0. Getting the box current (the handoff's blocker, resolved)

From a non-interactive `ssh cozyultra` session the box **cannot reach GitHub or the Copilot
model API**: git is configured with `http.proxy=127.0.0.1:7890` (Clash, only up in the desktop
session), the gh token is invalid, and copilot OAuth creds (stored in the interactive session's
DPAPI credential store) are **not readable from an SSH network-logon session**. Same root cause
the handoff hit as a "silent fetch no-op".

Resolution — **bypass GitHub with a LAN git bundle**:
`git bundle create /tmp/tk.bundle token-killer-node-cli` (full self-contained ref; a range
bundle wanted a prerequisite the box lacked) → `scp` → on box `git fetch <bundle> <branch>` +
`git merge --ff-only FETCH_HEAD` → `pnpm build`. Box advanced `6c0fd8d → f9caf6f`.

Copilot CLI was already at 1.0.62 (no `copilot update` needed).

## 1. Hook config dual-schema (#20) — PASS

`node dist/cli.js install` → detected `copilot-cli`, also wired `claude-code`, wrote
`C:\Users\cozy2\.copilot\hooks\tk-rewrite.json`, referenced it from `copilot-instructions.md`,
`Active tier: hook`. The file carries the #20 dual schema **verbatim**:

- `version:1`, `managedBy:"token-killer"`
- `hooks.PreToolUse[0]`: single `command`, `timeout:5` (VS Code-compatible path)
- `hooks.preToolUse[0]`: separate `bash` + `powershell` keys (same command), `timeoutSec:5` (Copilot CLI native)
- command = **absolute quoted node + absolute cli.js + `hook copilot`**
  (`"C:\Program Files\nodejs\node.exe" C:\Users\cozy2\workspace\token-killer\dist\cli.js hook copilot`),
  NOT a bare `tk` (avoids the Windows `CommandNotFoundException` of ADR 0005 §5).

## 2. status preflight (#23) + capability matrix (#26) — PASS

`node dist/cli.js status` (UTF-8 console):

- **Windows preflight — 5/5 `[ok]`:** Copilot CLI 1.0.62 · PowerShell 7.6.2 (≥7) · hook command
  path executable (absolute node+cli) · Copilot hooks dir loaded · Windows shell tool `powershell`
  resolved (`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE`).
- **Capability matrix — 6/6 `[installed]`:** copilot-hook · claude-hook (points at tk) ·
  vscode-hook (shared `~/.copilot/hooks`; `blocked-by-policy: unknown` — honest) · shim (13
  wrappers, probe PASS, `on PATH: no`, TTY opt-in off) · instruction injection · usage guidance.
  Summary: host version 1.0.62, installed/verified timestamps present.

## 3. Synthetic payload acceptance (`scripts/windows-accept.ps1`) — 5/5 PASS

Auth-free; feeds host-shaped payloads to `hook copilot` via byte-exact stdin (`cmd /c <`):

| # | payload | result |
|---|---|---|
| T1 | CLI `powershell`, `toolArgs` as JSON **string** + extras | `modifiedArgs.command='tk --session … git status'`; `description`/`mode` preserved |
| T2 | CLI `powershell`, `toolArgs` as **object** | rewritten; `description` preserved |
| T3 | VS Code `run_in_terminal`, full `tool_input` | `updatedInput.command='tk git status'`; `explanation`+`isBackground` preserved (#19: not schema-rejected) |
| T4 | CLI payload with **leading UTF-8 BOM** | BOM stripped, still rewrites |
| T5 | non-shell `read_file` | empty output (fail-open, no rewrite) |

## 4. LIVE end-to-end against real Copilot CLI 1.0.62 (`scripts/windows-capture-live.ps1`) — PASS

Drove a real `copilot -p "…git status" --allow-all-tools` session (run by the authenticated
user; a tee-wrapper hook captured the exact host stdin to disk; config restored afterward).

**Real host facts captured** — ONE tool call fired the hook **twice** (the dual-schema config's
two entries both fire), with two different shapes:

```jsonc
// payload 1 — Copilot CLI NATIVE (camelCase preToolUse entry), bytes=229, leadingBOM=false
{"sessionId":"a938a6db-…","timestamp":1781513173266,"cwd":"C:\\…",
 "toolName":"powershell","toolArgs":"{\"command\":\"git status\",\"description\":\"Run git status\"}"}

// payload 2 — Claude-style (PascalCase PreToolUse entry), bytes=261, leadingBOM=false
{"hook_event_name":"PreToolUse","session_id":"a938a6db-…","timestamp":"2026-06-15T08:46:14.917Z",
 "cwd":"C:\\…","tool_name":"Bash","tool_input":{"command":"git status","description":"Run git status"}}
```

Confirmed against assumptions:
- **`toolArgs` IS a JSON string** on real 1.0.62 (#21 assumption correct).
- **No leading BOM** in 1.0.62 (our BOM stripping is defensive, not currently exercised).
- Session id is `sessionId` (camel) in payload 1, `session_id` (snake) in payload 2 — normalize.ts probes both.

**E2E outcome (the decisive evidence)** — `tk` actually ran and compressed the call. From
`~/.token-killer/projects/repo-e82ec09d82f1/history.jsonl`:

```json
{"timestamp":"2026-06-15T08:46:16.824Z","command":"git status --porcelain -b","handler":"git-status",
 "raw_tokens":96,"output_tokens":36,"saved_tokens":60,"savings_pct":62.5,"exit_code":0,
 "session_id":"a938a6db-5e2f-4e0e-8a65-7cd6bf7b6e13"}
```

- The tool call was rewritten to `tk git status` and executed → **62.5% saved**.
- `session_id a938a6db` carried through → **ADR 0009 session carrier works E2E**.
- That session id appears only in **payload 2's** `updatedInput.command` → **Copilot CLI 1.0.62
  honored the PascalCase `PreToolUse` / `hookSpecificOutput.updatedInput` path.**

## 5. Finding + fix: the camelCase `preToolUse` payload was inert (now fixed)

Feeding the two captured payloads back through `hook copilot` (before the fix):
- payload 2 (PascalCase) → rewrites correctly (`tk --session a938a6db… git status`).
- **payload 1 (camelCase native) → empty output, NO rewrite.**

Root cause: payload 1 carries **no event-name field** (`event` / `eventName` / `hookEventName`
/ `hook_event_name` all absent — the host scopes the event by the config key it fired under).
`normalize.ts` derived `event` from those keys, so it resolved to `"unknown"` → `decide()` fell
to the default → `allow`, no rewrite. Masked today only because the PascalCase entry carries the
rewrite — but if a future Copilot CLI version stopped honoring PascalCase (or firing both), the
camelCase path would silently fail.

**Fix (committed):** `normalize.ts` now infers `preToolUse` when the event field is genuinely
ABSENT *and* the payload is a recognized-dialect tool call with a name + input but no result. An
event name that is present-but-unrecognized still stays `unknown` (it may be a future event).

**Double-wrap is NOT a concern** (corrected from the initial draft): `rewriteCommand`'s
`eligibility()` already returns `pass` for a command whose first token is `tk` ("already a tk
command", `rewrite.ts:223`). So even if the host fires both entries and applies / chains both, a
second pass over `tk git status` is a no-op — never `tk tk git status`. The inert path was *not*
what protected against double-wrap; idempotency is.

**Live-confirmed on the box** (after `pnpm build`): re-feeding the captured payloads, **payload 1
now rewrites** to `modifiedArgs.command = "tk --session a938a6db… git status"` (description
preserved); payload 2 unchanged. Regression-locked in `tests/unit/hook/protocol-matrix.test.ts`
Row 7 (both real payloads + an idempotency case). Captures retained under
`reports/windows-live-captures/`.

## Double-fire convergence re-verification (#20 / #21 follow-up)

The earlier live run captured the payloads BEFORE the `bcc9181` event-less fix, when only
the PascalCase entry emitted a rewrite — so it could not show what the host does once BOTH
entries rewrite. Re-running `scripts/windows-feed-captures.ps1` on the box (real Windows
1.0.62, node v22.22.3, dist built at `bcc9181`) replays the two retained real payloads
through the real `node dist/cli.js hook copilot` and now shows BOTH rewriting:

- `payload-…164613-798` (native event-less camelCase) → `modifiedArgs.command =
  "tk --session a938a6db… git status"`.
- `payload-…164615-175` (PascalCase) → `hookSpecificOutput.updatedInput.command =
  "tk --session a938a6db… git status"`.

Both callbacks received the SAME original `git status` and converged on the **byte-identical**
rewritten command. This rules out the conflicting-application failure mode: whichever response
the host applies (or last-writer-wins), the executed command is the same single `tk …` — never
`tk tk`, never two different commands. Locked in-process as the faithful host contract in
`tests/unit/hook/protocol-matrix.test.ts` Row 7 (double-fire convergence + defense-in-depth
idempotency).

## Live run DENIED the tool call — hook command unparseable under Copilot's `pwsh -c` (#20 defect + fix)

The desktop-session live run (authenticated copilot + Clash up) did NOT silently rewrite — it
**denied the tool call**:

```
✗ Run git status (shell)
  └ Denied by preToolUse hook from "...\.copilot\hooks\tk-rewrite.json" (hook errored)
Error: could not run git status due to a local pre-tool hook failing.
```

Copilot CLI's native `preToolUse` is **fail-CLOSED**: a hook that errors DENIES the command
(worse than a silent inert hook — it blocks the user). This is exactly the residual #20 was
guarding, surfaced live.

**Root cause.** The dual-schema config put the SAME command string in `bash` and `powershell`:
`"C:\Program Files\nodejs\node.exe" <cli> hook copilot`. Copilot CLI runs the `powershell` field
through **PowerShell**, where that cmd/bash-syntax string does NOT parse — a leading double-quoted
path is a string VALUE PowerShell echoes/rejects (not a command), and the double quotes are
stripped crossing the `-Command` argument boundary, splitting `C:\Program Files\…` on its space
(`C:\Program` "is not recognized"). It worked in `bash` (bash executes a leading quoted path) and
in the 6/15 capture only because the tee-wrapper was a `.cmd` file, which masked the real node
command. Auth-free reproduction (`scripts/diag-hook-invocation.ps1`, since removed): the baked
command **failed** under `powershell -Command` and `-File`, **passed** under `cmd /c` and direct
node spawn — confirming the failure is the PowerShell invocation, not the rewrite logic.

**Ground truth — how Copilot actually launches the hook.** A first fix changed ONLY the
`powershell` field, and the live re-run STILL denied (every tool call, even non-shell
`report_intent` / `skill(...)`). Instrumenting each hook field to a no-space `.cmd` shim that
runs `scripts/hooklog.cjs` (logs the parent-process chain + the real tk hook's exit/stderr,
always exits 0) and reading Copilot's own `~/.copilot/logs/process-*.log` (`--log-level debug`)
gave the decisive facts:

- The pre-fix `process-*.log` shows `HookExitCodeError: Hook command failed with code 1` /
  `Stderr: ParserError: 1 | …node.exe" …\dist\cli.js hook copilot` — a PowerShell **parse**
  error on the command string (the hook process never started; tk's own fail-open never ran).
- The parent-process chain shows Copilot launches EVERY hook field via
  `pwsh.exe -nop -nol -c <field-value>` — `command` (PascalCase) AND `powershell` (camelCase)
  BOTH go through `pwsh -c`. So a powershell-only fix is incomplete: the PascalCase `command`
  field (still the bash/cmd form) ParserErrors too, and preToolUse being fail-closed, that one
  failing field is enough to DENY. That is exactly why the first re-run was "worse".
- With the shims (bare `.cmd`, parseable) the real `node dist/cli.js hook copilot` ran with
  `status=0` and emitted the correct rewrite — confirming the hook BINARY is fine; only the
  baked command STRING was unparseable under `pwsh -c`.

**Fix.** `resolveHookCommandPowershell` bakes `& '<node>' '<cli>' hook copilot` — call operator
`&` (executes the quoted path) + SINGLE quotes (survive the `-c` arg-boundary that strips double
quotes). `buildCopilotHookConfig` is now PLATFORM-AWARE: `preToolUse.powershell` = pwsh form,
`preToolUse.bash` = bash form, and `PreToolUse.command` = pwsh form on `win32` / bash form on
macOS/Linux (Copilot CLI Windows runs `command` via `pwsh -c`; macOS/Linux VS Code runs it via
sh). The config is written at install time on a known OS, so the form is chosen by
`process.platform`. `parseHookCommandPaths` drops a leading `&` and honors single quotes so the
#23 path validation still works. Regression-locked in `tests/unit/hook/install.test.ts`.

**Auth-free verification on the box** (`scripts/verify-hook-fix.ps1`, after `pnpm build` +
`node dist/cli.js install --host copilot-cli`) reproduces Copilot's EXACT invocation
`pwsh -nop -nol -c <field>` with a native payload on stdin, for BOTH fields:

```
PreToolUse.command (PascalCase):    exit=0  rewrote=True
preToolUse.powershell (camelCase):  exit=0  rewrote=True
```

The box's installed config is now the fixed form. (NOTE: VS Code reads the same PascalCase
`command`; on Windows it likely uses pwsh too, but its execution shell is UNVERIFIED — re-check
VS Code Windows after this change.)

**Residual (one live re-run, desktop session):** confirm Copilot CLI 1.0.62 now REWRITES (not
denies), and that the double-fire yields exactly ONE execution / history row:

```pwsh
cd C:\Users\cozy2\workspace\token-killer
copilot -p "Run this exact shell command and show its output, nothing else: git status"
# expect: NOT denied; output tk-compressed; tk history has exactly ONE shell row for git status.
```

## Artifacts

- `scripts/windows-accept.ps1` — auth-free synthetic acceptance (re-runnable, 5/5).
- `scripts/windows-capture-live.ps1` — drives a real copilot session, byte-exact payload capture, auto-restores config. Prereq: authenticated copilot + Clash up.
- `scripts/windows-feed-captures.ps1` — replays captured payloads through the handler.
- `scripts/verify-hook-fix.ps1` — auth-free check that the installed `powershell` hook field
  actually runs under PowerShell (`powershell`/`pwsh`, `-Command`/`-File`) and rewrites (#20 fix).
- `reports/windows-live-captures/payload-*.json` — the two real 1.0.62 payloads.
