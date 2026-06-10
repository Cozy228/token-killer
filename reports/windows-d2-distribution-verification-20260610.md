# Windows D2 fix + distribution chain — verification (2026-06-10)

**Box:** CozyUltra (192.168.31.129, `cozy2`), Windows 11 专业版 build 26100, GBK/cp936,
node v22.22.3. Driven from macOS over `ssh cozyultra`.
**Code under test:** `token-killer-node-cli` HEAD (`75497a8`) + the uncommitted D2 fix
in this session. Deployed to the box as a fresh `dist/` build and, separately, as a
global `npm i -g` tarball.

---

## 1. What was wrong (D2 recap)

The 2026-06-09 Windows dogfood found **D2**: `cat`/`env`/`ls`/`wc` returned
`<cmd>: command not found` on a stock Windows box, and the hook rewrote the agent's
`cat foo` → `tk cat foo`, routing the most common agent commands straight into that
failure. Severity medium-high.

## 2. The fix — presence-gating, NOT a coreutils reimplementation

**Principle (creator's call):** tk wraps real tools to compress their output. It must
**never fabricate or claim a command whose binary is absent.** On a stock Windows box
`cat`/`ls`/`wc`/`env` are not executables at all — PowerShell aliases them to cmdlets
(`Get-Content`/`Get-ChildItem`/…) — so intercepting them only **breaks** what the shell
would otherwise have run. The fix is to make tk get out of the way when the binary
isn't there; the shell then handles the command natively.

Implemented as a Windows-only presence gate at both interception layers, sharing one
helper `isProgramAvailable()` (`src/executor.ts`): off Windows it is always true (POSIX
tools are present, `resolveProgram` is a no-op), so **POSIX behavior and all 1454 tests
are unchanged**.

| Layer | Before | After |
|---|---|---|
| **Hook rewrite** (`src/hook/rewrite.ts` `eligibility`) | `cat foo` → `tk cat foo` | absent binary → **pass** (left for the shell); present → rewrite as before |
| **Shim install** (`src/shim/install.ts` `installWrappers`) | wrote a wrapper for every shimmable program | only writes wrappers for programs whose binary is on PATH (shim dir excluded so re-install is idempotent) |
| **Shim summary** (`src/shim/cli.ts`) | printed the unfiltered candidate count (now a lie) | prints the **actual installed set** + an honest `skipped N not on PATH: …` disclosure |

Tests added: presence gate for `rewriteCommand` (3 cases) and `installWrappers` (1 case),
both inject the checker for a deterministic cross-platform assertion. **1454 tests green.**

## 3. Box verification — both layers, live

**Hook** (`tk hook check`, no side effects):

| command | binary on box | decision |
|---|---|---|
| `git status` | yes | **rewrite: tk git status** ✓ |
| `rg TODO src` | yes (chocolatey) | **rewrite: tk rg TODO src** ✓ |
| `cat package.json` | no | **pass** ✓ |
| `ls -la` | no | **pass** ✓ |
| `wc package.json` | no | **pass** ✓ |
| `env` | no | **pass** ✓ |

**Shim** (`tk init shim install`, real install then uninstalled):

```
token-killer shim installed: C:\Users\cozy2\.token-killer\shim
  wrappers: 13 (curl, dotnet, find, gh, git, javac, …)
  skipped 28 not on PATH: aws, cat, diff, docker, env, eslint, … ls, … wc, …
  interception probe: PASS (…\shim\git.cmd)
```

Ground-truth `dir` listing = exactly those 13 `.cmd` files. **No `cat.cmd`/`ls.cmd`/
`wc.cmd`/`env.cmd`.** The summary now matches reality and discloses what was skipped.

## 4. Distribution chain — fixed and verified

The dogfood's distribution pain was: box stale, git proxy down → `git pull` fails,
branch unpushed. Root cause for testers: **don't depend on git/proxy.**

`package.json` has **zero runtime `dependencies`**, so `pnpm pack` produces a fully
self-contained tarball (`token-killer-0.1.0.tgz`, 149 KB — `dist/` + README). Verified
on the box:

```
npm i -g token-killer-0.1.0.tgz      → added 1 package in 591ms
Get-Command tk                       → C:\Users\cozy2\AppData\Roaming\npm\tk.ps1
tk --version                         → 0.1.0
tk hook check cat package.json       → pass      (D2 fix present)
tk hook check git status             → rewrite: tk git status
```

No build, no git, no proxy, no registry. This is the tester install path
(see `docs/WINDOWS-TESTER-GUIDE.md`).

## 5. Remaining gate — YOUR live VS Code + Copilot test

What SSH **cannot** prove: that GitHub Copilot's agent in **VS Code** actually routes its
terminal commands through tk so compression happens. That needs a human at the GUI. This
is the single biggest unknown before a real rollout — run it once yourself.

**Pre-flight checklist (Windows box, at the keyboard):**

1. `npm i -g token-killer-0.1.0.tgz`  (or `cd repo; npm i -g .`)
2. `tk init --host vscode`  → patches VS Code `settings.json`
   (`terminal.integrated.env.windows` PATH → shim). **Fully restart VS Code.**
3. `tk init --show`  → confirm: host vscode, shim on PATH, probe PASS.
4. Open a real repo (e.g. `atlas`) in VS Code; open Copilot Chat in **agent mode**.
5. Ask something that runs a verbose command, e.g. *"show me the last 20 commits"* →
   Copilot runs `git log` in the integrated terminal.
6. **The decisive check:** run `tk gain --history`.
   - The command appears with a savings % → **tk engaged.** 🎉 (Note which tier.)
   - Nothing recorded → **tk did NOT engage** — Copilot ran the command outside the
     integrated terminal's env. That's the finding; capture it and we pivot to the
     hook tier / a different wiring.
7. Sanity: confirm no common command visibly **broke** (the D2 class). `cat`/`ls` should
   work via PowerShell as normal.

Record for each: did delivery engage (which tier), measured savings, any breakage.

## 6. Follow-ups

- **`tk init shim install --dry-run` now honored (FIXED, this session).** It previously
  installed regardless of the flag (`runShim` only switched on `argv[0]` and never parsed
  `--dry-run`). It now previews the exact install/skip set and the patches it would make,
  writing nothing; `uninstall --dry-run` likewise. A sandboxed E2E test asserts no writes.
- **Which tier VS Code Copilot actually uses** (PreToolUse hook vs terminal-env shim) is
  still unproven on the target — §5 is designed to answer exactly that. This is the one
  remaining gate before rollout.
