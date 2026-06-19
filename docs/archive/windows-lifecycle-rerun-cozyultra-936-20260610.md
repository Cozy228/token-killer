# tk Windows lifecycle — re-run / defect re-verification (CozyUltra, GBK chcp 936)

**Run timestamp:** 2026-06-10 17:4x (mac local)
**Driven from:** macOS over `ssh cozyultra`, pwsh 7 `-EncodedCommand` (UTF-16LE/base64),
console forced to UTF-8 so tk's UTF-8 stdout reads faithfully.
**Code under test:** `token-killer-node-cli` @ `75497a8` + the uncommitted **D2
presence-gate** fix, deployed to the box as a fresh `dist/` (scp).
**Predecessor:** `reports/windows-lifecycle-cozyultra-936-20260609-1028.md` (found D1/D2/D3/O1/T1).

---

## 1. One-line verdict

The three real defects from the 2026-06-09 dogfood — **D1** (`--max-lines/--max-chars`
no-ops), **D2** (`cat/env/ls/wc` error on Windows), **D3** (shim fork-bomb when the
guard env var is absent) — are **all FIXED and verified live on the GBK box**. The two
lower-severity items — **O1** (token-budget-block restore leaves a 0-byte file) and
**T1** (5 stale dogfood assertions) — **still reproduce**. No new defect found.

| id | 2026-06-09 | 2026-06-10 re-run | evidence |
|---|---|---|---|
| **D1** max-lines/max-chars no-op | open (medium) | ✅ **FIXED** | live caps applied + honest marker (§2) |
| **D2** coreutils error on Windows | open (med-high) | ✅ **FIXED** | hook gating + present-only shim (§3) |
| **D3** shim fork-bomb | open (high) | ✅ **FIXED** | self-guarding wrapper, regression PASS (§4) |
| **O1** token-budget restore → 0-byte | open (minor) | ⚠️ **still present** | §5 |
| **T1** stale dogfood assertions | open (test debt) | ⚠️ **still present** | §6 |

Local test suite after the fix: **1454/1454 green** (one integration timeout was
parallel-load flake; passes isolated).

---

## 2. D1 — `--max-lines` / `--max-chars` (FIXED)

`src/core/outputLimit.ts` now applies real display caps (was a stub returning input).
Live on the box:

```
> tk --max-lines 5 git log --oneline -20
3cb642f fix(debug): …
… (4 more) …
[tk] output limited to 5 of 20 lines by --max-lines

> tk --max-chars 50 git log --oneline -20
[tk] unchanged since 17:41:15 — same as the earlie
[tk] output limited to 50 of 201 chars by --max-chars
```

Both caps fire, and the marker names the responsible flag (not confusable with a
compression `+N more` omission). Non-finite default = no cap (flags do nothing unless
passed), so existing behavior is unchanged.

## 3. D2 — coreutils on Windows (FIXED)

**Fix:** Windows-only presence gating (`isProgramAvailable`, `src/executor.ts`),
shared by the hook-rewrite eligibility and the shim installer. tk wraps real tools; it
must never claim a binary that is absent. Off Windows it is always true → POSIX
behavior and every test unchanged.

**Hook gating, live** (`tk hook check`, no side effects), in a shell where the
coreutils are not on PATH:

| command | binary present? | decision |
|---|---|---|
| `cat package.json` | no | **pass** ✓ |
| `ls -la` | no | **pass** ✓ |
| `wc package.json` | no | **pass** ✓ |
| `env` | no | **pass** ✓ |
| `git status` | yes | rewrite → `tk git status` ✓ |
| `rg TODO src` | yes | rewrite → `tk rg TODO src` ✓ |

**Shim install, live** — only present-binary wrappers are written, with honest disclosure:

```
token-killer shim installed: …\.token-killer\shim
  wrappers: 13 (curl, dotnet, find, gh, git, javac, npm, npx, pip, playwright, pnpm, rg, tree)
  skipped 28 not on PATH: aws, cat, diff, docker, env, … ls, … wc, …
```

No `cat.cmd` / `ls.cmd` / `wc.cmd` / `env.cmd`. The earlier "rewrites `cat`→`tk cat`
straight into a failure" path is gone.

> **Note (design, not a regression):** the gate keys on the *actual* child PATH. In a
> shell that has Git-for-Windows' `usr\bin` on PATH (where `ls.exe`/`cat.exe` exist),
> tk *does* rewrite `ls`→`tk ls` and it works (handler shells to the real binary).
> That is exactly why the scripted dogfood still shows `hook: ls → rewrite tk ls` PASS
> (its pnpm PATH carries Git's binaries) — present→rewrite, absent→pass, both correct.
>
> **Residual (minor, by design):** explicitly typing `tk cat foo` when no `cat` binary
> exists still prints `cat: command not found`. The hook/shim no longer route there, so
> an agent won't hit it; only a hand-typed `tk cat` would. Left as-is per the creator's
> "wrap, don't reimplement" call.

## 4. D3 — shim fork-bomb (FIXED)

The generated `.cmd` wrapper is now **self-guarding** — it sets the guard var itself so
tk's recursion guard strips the shim dir from the child PATH even when the ambient env
lacks it:

```bat
@echo off
setlocal
set "TK_SHIM_DIR=C:\Users\cozy2\.token-killer\shim"
"…\node.exe" "…\dist\cli.js" "git" %*
```

**Regression test (the exact prior trigger):** shim dir prepended to PATH with
`TK_SHIM_DIR` **unset**, run `git.cmd status` under a 25s watchdog:

```
baseline node procs: 0
--- wrapper output ---
* token-killer-node-cli...origin/… [ahead 148, behind 89]
?? reports/
after node procs: 0
D3 verdict: PASS - no fork bomb
```

The 2026-06-09 run watched this climb past 2,599 node processes. Now node count
returns to baseline; the command compresses and exits.

## 5. O1 — token-budget-block restore leaves a 0-byte file (STILL PRESENT, minor)

With `~/.copilot\copilot-instructions.md` absent, `optimize --token-budget-block`
creates it (550 B); `--token-budget-block --restore` reverts it to **0 bytes**
(`E3B0C442…`) instead of deleting the file it created:

```
O1 pre : ABSENT
O1 mid : size=550 (block installed)
O1 post: exists size=0 (E3B0C442…)
```

Unchanged from 2026-06-09. When the file already has other content, restore is
byte-exact (not triggered). Fix: when restore empties a file the block-install created,
delete it rather than leaving an empty file.

## 6. T1 — scripted dogfood stale assertions (STILL PRESENT, test debt)

`bash scripts/ssh-windows.sh dogfood` → **40 passed, 5 failed** (identical to
2026-06-09). All 5 are stale assertions in `scripts/windows-dogfood.ps1`; tk's live
output is correct in every case:

| dogfood test | asserts (stale) | tk actual (correct) |
|---|---|---|
| hook copilot: rewrite git status | `"rewritten_command":"tk git status"` | `{…,"modifiedArgs":{"command":"tk git status"}}` (ADR 0005) |
| hook copilot: deny node_modules | `"decision":"deny"` | `{"hookSpecificOutput":{…,"permissionDecision":"deny",…}}` |
| hook copilot: fail-open bad json | `"decision":"allow"` | empty stdout = allow (Copilot-CLI contract) |
| shim status + probe PASS | `tk shim status` | path is now `tk init shim status` |
| Copilot hook config content | literal `"tk hook copilot"` | absolute `"…node.exe …\dist\cli.js hook copilot"` |

The D2 fix introduced **no new dogfood failures**. Harness needs updating to the
current shapes; it is red for the wrong reasons and masks the real green.

## 7. Cleanup / box state

All mutations made during this run were reverted and verified:
- `init shim uninstall` + `init --uninstall` → shim removed, copilot hook removed,
  injection + usage guidance removed; `init --show` reports nothing tk left.
- `.bashrc` and VS Code `settings.json` — shim/PATH patches fully reverted (no
  `token-killer`/`TK_SHIM`/`shim` refs remain).
- `copilot-instructions.md` returned to ABSENT.
- Box repo `git status --short` → only `?? reports/` (scratch output). Foreign `rtk`
  hook in `~/.claude\settings.json` left untouched.

## 8. Environment notes (unchanged, not tk defects)

- GitHub auth on the box still invalid + git proxy `127.0.0.1:7890` down → live Copilot
  CLI / GUI VS Code agent loops remain unverifiable headlessly (same as 2026-06-09).
  This run re-verified the **mechanism** (hook + shim interception) and every CLI/handler
  surface, not a live LLM loop.
- Git-for-Windows is installed (`C:\Program Files\Git\cmd\git.exe`), which is why the
  D2 presence gate resolves `ls`/`cat` under the dogfood's PATH (§3 note).

---

**Bottom line:** all three actionable defects from the prior Windows dogfood are fixed
and confirmed on the GBK box; O1 and T1 remain as logged lower-severity items. The D2
fix is safe (no POSIX impact, no new dogfood failures, 1454 tests green).

---

## 9. Follow-up — O1 + T1 fixed (same day, after box shutdown)

Both remaining items were fixed immediately after this re-run:

- **O1 fixed** (`src/context/applySafe.ts` `applyMarkerBlock`): when `--token-budget-block
  --restore` empties a file the install created (block was the sole content), tk now
  **deletes** the file instead of leaving a 0-byte leftover. The pre-restore backup still
  preserves the bytes, so it stays reversible. Regression tests added
  (`applySafe.test.ts`, `optimize.test.ts`); 1457 tests green.
- **T1 fixed** (`scripts/windows-dogfood.ps1`): the 5 stale assertions were updated to the
  current shapes — Copilot CLI flat `modifiedArgs`/`permissionDecision` (ADR 0005),
  empty-stdout fail-open via a new `-ExpectEmpty` mode, `init shim status` path, and the
  absolute-hook-path config match (new `-ExpectEmpty` mode for the fail-open contract).

**Live re-verification on the GBK box (same day, box powered back on):**
- **T1 — `pnpm test:windows-dogfood` → `Results: 45 passed, 0 failed`** (was 40/5). All five
  previously-stale assertions now pass against tk's real output; the harness is green for
  the right reasons.
- **O1 — verified live:** fresh `copilot-instructions.md` → `--token-budget-block` creates
  it (550 B) → `--restore` **deletes** it (`ABSENT`), no 0-byte leftover.
- Box left clean: shim + copilot hook uninstalled, bundle removed, repo `git status` empty
  (owner WIP preserved in `stash@{0}`), then shut down.

**Final state: D1/D2/D3/O1 all fixed & verified live; T1 dogfood 45/0 green.** No open
items remain from the 2026-06-09 Windows dogfood.
