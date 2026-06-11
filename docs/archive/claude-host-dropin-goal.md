# Goal — Make `tk` a true drop-in replacement for `rtk` on the Claude Code host

Status: proposed (2026-06-07)
Owner-decided non-goals: **no `rtk` alias / compat layer**, **no history migration** from
`~/Library/Application Support/rtk/history.db`.

## Objective

On this machine the active agent host is **Claude Code**, whose
`~/.claude/settings.json` wires a `PreToolUse` Bash hook to **`rtk hook claude`**.
`tk` has a working rewrite engine (`rewriteCommand` → `tk hook check "git status"`
emits `rewrite: tk git status`) but **no Claude Code delivery chain**: there is no
`tk hook claude` runtime handler and `tk init` does not know the `claude-code` host.

Close exactly that gap so that after one `tk init` the Claude Code → Bash → hook →
`tk <cmd>` → compressed flow runs end-to-end, with `rtk` fully out of the path.
Nothing about the rewrite engine, handlers, or compression behavior changes — this
is a **delivery + installer** task only.

The DESIGN intent already exists (§3.1 "仿 RTK 的两层拆分": `tk init` installs,
`tk hook <host>` runs) but only the Copilot path was built. This goal adds the
symmetric Claude Code path.

## Ground truth — the Claude Code PreToolUse protocol (captured from `rtk hook claude`)

Input on stdin (Claude Code PreToolUse, Bash matcher):

```json
{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"}}
```

Output that actually rewrites the command (rtk, verified live), exit 0:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecisionReason":"RTK auto-rewrite","updatedInput":{"command":"rtk git status"}}}
```

For a non-rewritable command (`echo hi`): **empty stdout, exit 0** — Claude Code then
runs the command unchanged.

`tk` must match this contract exactly, substituting its own values:
- `updatedInput.command` = `rewriteCommand(input).rewritten` (already `tk <cmd>`).
- `permissionDecisionReason` = `"tk auto-rewrite"`.
- Non-rewrite / pass / parse-error / any internal failure → **empty stdout, exit 0**
  (fail-open; CONTEXT.md → Fail-open). Diagnostics go to stderr only.

Note this is a **different wire protocol** from Copilot's `{ "decision": "allow" }`
shape — do not reuse `toProtocol` from `copilot.ts`. The shared piece is
`rewriteCommand`, nothing else.

## Scope

### 1. Runtime handler — `tk hook claude`
- New `src/hook/claude.ts`: read stdin (reuse the bounded-read helper from
  `copilot.ts`, `STDIN_READ_TIMEOUT_MS`), parse the Claude PreToolUse payload,
  and for `tool_name === "Bash"` with a rewritable command emit the
  `hookSpecificOutput` JSON above; otherwise emit nothing. Total/pure decision
  function + a thin runtime entry, mirroring `copilot.ts`'s `decide` /
  `decideFromStdin` split so it is unit-testable without I/O.
- Add `case "claude":` to the dispatcher in `src/hook/cli.ts` and update the
  header comment + the `unknown subcommand` message (`copilot | claude | check`).
- Bash-only: this host's hook uses `matcher: "Bash"`, so the handler only needs the
  command-rewrite path. **Out of scope**: `userPromptSubmitted`, `errorOccurred`,
  direct-tool governance, `postToolUse`/result compression. Keep it minimal.

### 2. Installer — `tk init` learns the `claude-code` host
- Extend `Host` (`src/shim/detect.ts`) with `claude-code`; `detectHost` should
  recognize Claude Code via its env markers (e.g. `CLAUDECODE` /
  `CLAUDE_CODE_ENTRYPOINT`) and/or an existing `~/.claude/settings.json`. Explicit
  `--host claude-code` always wins regardless of detection.
- Accept `claude-code` in `parseInitArgs` (`src/shim/init.ts`, the `--host` switch)
  and route it in `runInit` to a new settings patcher (parallel to the
  `host === "copilot-cli"` branch).
- New patcher (new `src/hook/claudeInstall.ts`, modeled on `install.ts`):
  idempotently set `~/.claude/settings.json` `hooks.PreToolUse` to a `matcher:
  "Bash"` entry whose command is `resolveHookCommand()` retargeted to
  `… hook claude` (absolute node + cli path, per the Windows/PATH fix already in
  `install.ts`).
  - **Drop-in semantics**: if an existing PreToolUse/Bash hook invokes
    `rtk hook claude` (or a prior `tk hook claude`), **replace that entry in place**;
    otherwise append. This is what makes it a true drop-in — after install, `rtk` is
    no longer invoked.
  - **Surgical & marker-guarded**: never touch `statusLine`, `enabledPlugins`,
    `env`, or any non-Bash hook. Preserve unknown keys and formatting as much as
    practical (parse → patch → write). Carry a marker so `--uninstall` removes only
    tk's entry.
- No `-g`/`--global` flag. Owner decision (2026-06-07): claude-code stays
  symmetric with copilot — the hook is the whole job; do **not** write
  `~/.claude/TK.md` or touch `~/.claude/CLAUDE.md`. Every tk write is user-level
  already, so there is no global/local switch to honor; the `-g`/`--global` flag
  was removed entirely (a stray `-g` from rtk muscle memory is silently ignored,
  never an error).
- `--show`: report `Detected host: claude-code` and whether the settings hook is
  present and points at tk.
- `--dry-run`: print the exact settings.json diff without writing.
- `--uninstall`: remove only tk's Bash PreToolUse entry (and the `@TK.md` line /
  `TK.md` under `-g`); leave everything else, including unrelated hooks, intact.

### 3. Prerequisite to document (not code)
The rewritten command is bare `tk <cmd>`, so `tk` must be on `PATH` when Claude Code
runs Bash (same as `rtk` via Homebrew today). On this machine that means
`pnpm build && npm link` (or a global install) before `tk init`. State this in
`tk init` output and in the doc.

## Non-goals (explicit)
- No `rtk` alias, shim, or any compatibility shim that maps `rtk` → `tk`.
- No import/migration of rtk history (`history.db`) or `gain` totals — tk starts its
  ledger from zero.
- No change to compression, handlers, the three-way numbers, or the Copilot/VS Code
  paths.
- No `postToolUse` result compression, no prompt/error governance on this host.

## Acceptance criteria (this machine, drop-in verified)
1. `echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"}}' | tk hook claude`
   prints exactly
   `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecisionReason":"tk auto-rewrite","updatedInput":{"command":"tk git status"}}}`
   and exits 0.
2. A non-rewritable command (`echo hi`) and any malformed/empty/oversized stdin →
   **empty stdout, exit 0** (fail-open). The handler never throws.
3. `tk init --host claude-code` rewrites `~/.claude/settings.json` so the Bash
   PreToolUse hook invokes tk's `hook claude`; `statusLine`, `enabledPlugins`, and
   `env` are byte-for-byte preserved. Re-running is idempotent (no duplicate hook).
   `-g` is accepted but writes nothing extra (symmetric with copilot).
4. `tk init --show` reports `claude-code` + hook present; `tk init --uninstall`
   restores the file to having no tk hook without disturbing other keys.
5. After install, a real Claude Code Bash call (e.g. `git status`) is observed to run
   as `tk git status` (manual dogfood on this machine).
6. `pnpm test:product` stays green with new unit tests covering the protocol shaping,
   fail-open paths, and the settings patcher (install / idempotent re-install /
   replace-rtk-entry / uninstall / preserve-other-keys).

## Tests to add (product suite, `vitest.config.ts`)
- `tests/unit/hook/claude.test.ts`: rewrite → exact JSON; pass/non-Bash/malformed →
  empty; exit code 0 always.
- `tests/unit/hook/claudeInstall.test.ts`: against a temp settings.json — fresh
  install, idempotent re-install, replace an existing `rtk hook claude` entry,
  uninstall, and "other keys untouched" (`statusLine`/`enabledPlugins`).

## References
- DESIGN §3.1 (two-layer `tk init` / `tk hook <host>` split; Hook 配置产物).
- `src/hook/copilot.ts` (handler shape, bounded stdin read, fail-open) — mirror, do
  not reuse the protocol shaper.
- `src/hook/install.ts` (`resolveHookCommand`, marker, dry-run/uninstall pattern).
- `src/shim/init.ts` / `src/shim/detect.ts` (`runInit`, `parseInitArgs`, `Host`).
- Ground-truth protocol captured from `rtk 0.42.1` `rtk hook claude` (above).
