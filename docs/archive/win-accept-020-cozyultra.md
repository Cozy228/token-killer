---
status: archived
note: 0.2.0 real-machine acceptance evidence (cozyultra GBK box); zero live references; archived by /gc 2026-07-10.
---

# tk Real-Machine Acceptance Report

**49 pass · 1 fail · 3 warn · 3 skip · 8 info**

## Environment

| Key | Value |
|---|---|
| date | 2026-06-16 17:46:00 |
| tk invocation | node C:\Users\cozy2\workspace\token-killer\dist\cli.js |
| tk version | 0.2.0 |
| OS | Windows |
| OS detail | Microsoft Windows 10.0.26100 |
| PowerShell | 7.6.2 |
| Node | v22.22.3 |
| compile-cache tier | enableCompileCache() API (Node >=22.8) |
| code page / enc | 936 |
| antivirus | Defender(Not running), Windows Defender |
| git | yes |
| ripgrep (rg) | yes |
| tree | yes |
| pnpm | yes |
| target repo | C:\Users\cozy2\workspace\token-killer |
| prior install host | copilot-cli |

## Summary by phase

| Phase | pass | fail | warn | skip | info |
|---|--:|--:|--:|--:|--:|
| func | 19 | 0 | 1 | 0 | 1 |
| hook | 10 | 0 | 0 | 0 | 0 |
| compress | 10 | 1 | 0 | 0 | 0 |
| boundary | 8 | 0 | 2 | 0 | 2 |
| failsafe | 1 | 0 | 0 | 1 | 0 |
| perf | 0 | 0 | 0 | 0 | 3 |
| shim | 1 | 0 | 0 | 0 | 1 |
| lifecycle | 0 | 0 | 0 | 1 | 0 |
| tier0 | 0 | 0 | 0 | 1 | 1 |

## Findings (fail / warn)

- WARN [func] debug bundle scrubs home path — leaks C:\Users\cozy2
- FAIL [compress] git log -p -20 — raw=493368 saved=0% < 60%
- WARN [boundary] unicode content (rg) — needle not found verbatim — possible mojibake
- WARN [boundary] unicode content (read) — needle not found verbatim
- WARN [boundary] destructive 'tk uninstall' / 'uninstall --help' ignores unknown flags and runs a real uninstall — guard with arg validation.

## Detailed results

| Phase | Status | Case | Detail | ms |
|---|---|---|---|--:|
| func | PASS | tk --version | 0.2.0 | 69 |
| func | PASS | tk --help |  | 64 |
| func | PASS | tk status |  | 887 |
| func | PASS | tk config show |  | 80 |
| func | PASS | tk config path | C:\Users\cozy2\.token-killer\config.jsonc | 87 |
| func | PASS | tk telemetry status |  | 85 |
| func | PASS | tk telemetry preview |  | 94 |
| func | PASS | tk gain --text |  | 103 |
| func | PASS | tk gain --history |  | 113 |
| func | PASS | inspect --text |  | 120 |
| func | PASS | inspect --json |  | 113 |
| func | PASS | inspect --project --text |  | 163 |
| func | PASS | inspect --user --text |  | 114 |
| func | PASS | inspect --since 7d --text |  | 115 |
| func | PASS | inspect --advice --text |  | 125 |
| func | PASS | inspect --surface instructions --text |  | 121 |
| func | INFO | inspect --fail-on error | exit=0 (nonzero = findings reached threshold, by design) | 115 |
| func | PASS | optimize context --project (preview) |  | 118 |
| func | PASS | optimize context --user (preview) |  | 82 |
| func | PASS | tk debug (writes bundle) |  | 216 |
| func | WARN | debug bundle scrubs home path | leaks C:\Users\cozy2 |  |
| hook | PASS | hook check git status | rewrite: tk git status | 73 |
| hook | PASS | hook check git commit | pass: git commit -m x | 93 |
| hook | PASS | hook check git add . | pass: git add . | 88 |
| hook | PASS | hook check rg foo . | rewrite: tk rg foo . | 94 |
| hook | PASS | hook check read CONTEXT.md | pass: read CONTEXT.md | 90 |
| hook | PASS | copilot rewrite -> modifiedArgs | {"permissionDecision":"allow","permissionDecisionReason":"tk auto-rewrite","modifiedArgs":{"command":"tk git status"}} | 72 |
| hook | PASS | copilot deny node_modules |  | 70 |
| hook | PASS | copilot fail-open bad json (empty=allow) |  | 76 |
| hook | PASS | claude rewrite -> updatedInput |  | 88 |
| hook | PASS | claude fail-open bad json |  | 83 |
| compress | FAIL | git log -p -20 | raw=493368 saved=0% < 60% | 218 |
| compress | PASS | git log -30 | raw=22616 saved=94.6% (>=40%) | 147 |
| compress | PASS | rg import src | raw=19495 saved=74.8% (>=40%) | 584 |
| compress | PASS | git status | Raw: 107 tokens Output: 27 tokens Saved: 80 tokens (74.8%) | 199 |
| compress | PASS | git branch | Raw: 36 tokens Output: 9 tokens Saved: 27 tokens (75%) | 131 |
| compress | PASS | git show -1 --stat | Raw: 158 tokens Output: 158 tokens Saved: 0 tokens (0%) | 142 |
| compress | PASS | git diff | Raw: 0 tokens Output: 0 tokens Saved: 0 tokens (0%) | 134 |
| compress | PASS | tree src | Raw: 68 tokens Output: 87 tokens Saved: 0 tokens (0%) | 126 |
| compress | PASS | pnpm --version | (passthrough) | 319 |
| compress | PASS | npx --version | (passthrough) | 273 |
| compress | PASS | --raw passthrough (no banner) |  | 132 |
| boundary | PASS | non-git dir -> clear error |  | 162 |
| boundary | PASS | empty repo: git status |  | 170 |
| boundary | INFO | empty repo: git log | exit=128 (no commits) | 138 |
| boundary | PASS | untracked dir collapses to dir/ |  | 164 |
| boundary | PASS | -uall expands dir (passthrough) |  | 136 |
| boundary | WARN | unicode content (rg) | needle not found verbatim — possible mojibake | 148 |
| boundary | WARN | unicode content (read) | needle not found verbatim | 95 |
| boundary | PASS | huge file read --max-lines 200 capped | out~201 lines | 103 |
| boundary | PASS | failing cmd preserves nonzero exit | exit=1 | 133 |
| boundary | PASS | unknown binary bounded (no fork-bomb) | exit=1 | 73 |
| boundary | PASS | path with spaces |  | 170 |
| boundary | INFO | unknown-flag policy (install --dry-run) | exit=0 — NOTE: 'tk uninstall --help' ignores flags and uninstalls for real | 80 |
| failsafe | PASS | TK_DEBUG=1 traces to stderr |  | 179 |
| failsafe | SKIP | corrupt config fail-open | no config file |  |
| perf | INFO | tk --version startup | cold=84ms p50=67 p95=94 | 67 |
| perf | INFO | tk git status vs raw | tk p50=166ms  raw p50=42ms  overhead=125ms (tk spawns 2x: porcelain+human) | 166 |
| perf | INFO | git log -p -100 compress | 322ms  saved=0% | 322 |
| shim | INFO | tk shim status | token-killer shim status | 116 |
| shim | PASS | where git resolves through shim (PATH prepend) | C:\Users\cozy2\.token-killer\shim\git.cmd
C:\Program Files\Git\cmd\git.exe |  |
| lifecycle | SKIP | install/uninstall E2E | -SkipLifecycle |  |
| tier0 | SKIP | Copilot CLI E2E | -CopilotCliE2E off or copilot not on PATH |  |
| tier0 | INFO | VS Code + Copilot agent (MANUAL) | baseline gain rows=2 — see report for steps |  |

## Manual gate — VS Code + Copilot routing (cannot be scripted)

A headless script cannot drive the Copilot GUI. Do this once at the keyboard:

1. `tk install --host vscode` then **fully quit & reopen VS Code** (integrated terminal must pick up the new PATH).
2. Open a git repo (>=20 commits) and Copilot Chat in **Agent** mode.
3. Prompt: *"Summarize what changed in the last 20 commits."* (runs `git log`). Approve the terminal run.
4. In the VS Code terminal: `tk gain --history`.
   - **PASS**: the command Copilot ran appears as a row with a savings %. Note whether `tk status` tier is **hook** or **shim**.
   - **DID NOT ENGAGE**: no new row — Copilot ran outside the integrated-terminal env. A key finding: pivot to the hook tier.

_Generated by scripts/windows-dogfood.ps1_
