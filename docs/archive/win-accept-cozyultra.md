---
status: archived
note: 0.2.x-era real-machine acceptance evidence (cozyultra GBK box); zero live references; archived by /gc 2026-07-10.
---

# tk Real-Machine Acceptance Report

**50 pass · 1 fail · 2 warn · 3 skip · 8 info**

## Environment

| Key | Value |
|---|---|
| date | 2026-06-16 15:15:01 |
| tk invocation | node C:\Users\cozy2\workspace\token-killer\dist\cli.js |
| tk version | 0.1.0 |
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
| func | 20 | 0 | 0 | 0 | 1 |
| hook | 10 | 0 | 0 | 0 | 0 |
| compress | 10 | 1 | 0 | 0 | 0 |
| boundary | 8 | 0 | 2 | 0 | 2 |
| failsafe | 1 | 0 | 0 | 1 | 0 |
| perf | 0 | 0 | 0 | 0 | 3 |
| shim | 1 | 0 | 0 | 0 | 1 |
| lifecycle | 0 | 0 | 0 | 1 | 0 |
| tier0 | 0 | 0 | 0 | 1 | 1 |

## Findings (fail / warn)

- FAIL [compress] git log -p -20 — raw=65413 saved=0% < 60%
- WARN [boundary] unicode content (rg) — needle not found verbatim — possible mojibake
- WARN [boundary] unicode content (read) — needle not found verbatim
- WARN [boundary] destructive 'tk uninstall' / 'uninstall --help' ignores unknown flags and runs a real uninstall — guard with arg validation.

## Detailed results

| Phase | Status | Case | Detail | ms |
|---|---|---|---|--:|
| func | PASS | tk --version | 0.1.0 | 69 |
| func | PASS | tk --help |  | 66 |
| func | PASS | tk status |  | 886 |
| func | PASS | tk config show |  | 89 |
| func | PASS | tk config path | C:\Users\cozy2\.token-killer\config.jsonc | 66 |
| func | PASS | tk telemetry status |  | 74 |
| func | PASS | tk telemetry preview |  | 95 |
| func | PASS | tk gain --text |  | 108 |
| func | PASS | tk gain --history |  | 113 |
| func | PASS | inspect --text |  | 140 |
| func | PASS | inspect --json |  | 114 |
| func | PASS | inspect --project --text |  | 1,000 |
| func | PASS | inspect --user --text |  | 115 |
| func | PASS | inspect --since 7d --text |  | 121 |
| func | PASS | inspect --advice --text |  | 128 |
| func | PASS | inspect --surface instructions --text |  | 119 |
| func | INFO | inspect --fail-on error | exit=0 (nonzero = findings reached threshold, by design) | 116 |
| func | PASS | optimize context --project (preview) |  | 1,206 |
| func | PASS | optimize context --user (preview) |  | 82 |
| func | PASS | tk debug (writes bundle) |  | 227 |
| func | PASS | debug bundle scrubs home path |  |  |
| hook | PASS | hook check git status | rewrite: tk git status | 84 |
| hook | PASS | hook check git commit | pass: git commit -m x | 86 |
| hook | PASS | hook check git add . | pass: git add . | 82 |
| hook | PASS | hook check rg foo . | rewrite: tk rg foo . | 90 |
| hook | PASS | hook check read CONTEXT.md | pass: read CONTEXT.md | 92 |
| hook | PASS | copilot rewrite -> modifiedArgs | {"permissionDecision":"allow","permissionDecisionReason":"tk auto-rewrite","modifiedArgs":{"command":"tk git status"}} | 84 |
| hook | PASS | copilot deny node_modules |  | 85 |
| hook | PASS | copilot fail-open bad json (empty=allow) |  | 82 |
| hook | PASS | claude rewrite -> updatedInput |  | 84 |
| hook | PASS | claude fail-open bad json |  | 83 |
| compress | FAIL | git log -p -20 | raw=65413 saved=0% < 60% | 159 |
| compress | PASS | git log -30 | raw=4699 saved=73.3% (>=40%) | 136 |
| compress | PASS | rg import src | raw=18972 saved=74.4% (>=40%) | 1,127 |
| compress | PASS | git status | Raw: 195 tokens Output: 84 tokens Saved: 111 tokens (56.9%) | 179 |
| compress | PASS | git branch | Raw: 36 tokens Output: 9 tokens Saved: 27 tokens (75%) | 132 |
| compress | PASS | git show -1 --stat | Raw: 419 tokens Output: 419 tokens Saved: 0 tokens (0%) | 136 |
| compress | PASS | git diff | Raw: 22681 tokens Output: 65 tokens Saved: 22616 tokens (99.7%) | 168 |
| compress | PASS | tree src | Raw: 68 tokens Output: 87 tokens Saved: 0 tokens (0%) | 126 |
| compress | PASS | pnpm --version | (passthrough) | 324 |
| compress | PASS | npx --version | (passthrough) | 311 |
| compress | PASS | --raw passthrough (no banner) |  | 126 |
| boundary | PASS | non-git dir -> clear error |  | 151 |
| boundary | PASS | empty repo: git status |  | 168 |
| boundary | INFO | empty repo: git log | exit=128 (no commits) | 127 |
| boundary | PASS | untracked dir collapses to dir/ |  | 180 |
| boundary | PASS | -uall expands dir (passthrough) |  | 138 |
| boundary | WARN | unicode content (rg) | needle not found verbatim — possible mojibake | 155 |
| boundary | WARN | unicode content (read) | needle not found verbatim | 69 |
| boundary | PASS | huge file read --max-lines 200 capped | out~201 lines | 98 |
| boundary | PASS | failing cmd preserves nonzero exit | exit=1 | 142 |
| boundary | PASS | unknown binary bounded (no fork-bomb) | exit=1 | 83 |
| boundary | PASS | path with spaces |  | 172 |
| boundary | INFO | unknown-flag policy (install --dry-run) | exit=0 — NOTE: 'tk uninstall --help' ignores flags and uninstalls for real | 89 |
| failsafe | PASS | TK_DEBUG=1 traces to stderr |  | 181 |
| failsafe | SKIP | corrupt config fail-open | no config file |  |
| perf | INFO | tk --version startup | cold=68ms p50=65 p95=85 | 65 |
| perf | INFO | tk git status vs raw | tk p50=177ms  raw p50=42ms  overhead=135ms (tk spawns 2x: porcelain+human) | 177 |
| perf | INFO | git log -p -100 compress | 212ms  saved=0% | 212 |
| shim | INFO | tk shim status | token-killer shim status | 104 |
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
