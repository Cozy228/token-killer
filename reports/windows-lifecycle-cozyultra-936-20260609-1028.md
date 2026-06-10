# tk full-lifecycle Windows dogfood — CozyUltra (GBK / chcp 936)

**Run timestamp:** 2026-06-09 10:28 (remote box local time)
**Driven from:** macOS over SSH (`ssh cozyultra`), commands sent via PowerShell 7 `-EncodedCommand` (UTF-16LE/base64) to avoid quoting corruption.

---

## 1. Summary

| field | value |
|---|---|
| Host | CozyUltra (192.168.31.129, user `cozy2`) |
| OS | Microsoft Windows 11 专业版, build 26100 (NT 10.0.26100.0) |
| Encoding profile | **ACP 936 / OEMCP 936 / chcp 936 / zh-CN — GBK box** (exercises tk's GBK decode path) |
| Console OutputEncoding | CodePage 936 / `gb2312` |
| `$OutputEncoding.WebName` | `utf-8` (PS7 pipeline default) |
| Locale / Culture | zh-CN / zh-CN |
| node | v22.22.3 |
| pnpm | 10.5.2 (corepack 11.5.0 used by `pnpm build`) |
| tk version | **0.1.0** |
| tk branch / HEAD | `token-killer-node-cli` @ `3cb642f` |

**One-line verdict:** **Partial pass** — tk builds, compresses, records, reports,
optimizes (byte-exact restore), installs into both hosts and uninstalls cleanly on a
GBK Windows 11 box, and **both** delivery tiers (hook + shim) intercept end-to-end
mechanically; the **live** transcript-verified agent loop was **blocked by the box's
environment** (invalid GitHub auth → Copilot CLI; GUI-only → VS Code), not by tk.
Three real defects found: **D1** `--max-lines/--max-chars` no-ops, **D2** `cat/env/ls/wc`
fail on Windows (coreutils shell-out), **D3** shim recursion-guard fork-bomb fragility;
plus **T1** stale dogfood assertions. No GBK mojibake defect in tk itself.

### Encoding profile — verbatim capture

```
chcp                         -> 活动代码页: 936         (rendered "活动代码页" garbled in the SSH console — terminal artifact, not tk)
[Console]::OutputEncoding    -> CodePage 936, WebName gb2312
$OutputEncoding.WebName      -> utf-8
HKLM\...\Nls\CodePage ACP    -> 936
HKLM\...\Nls\CodePage OEMCP  -> 936
(Get-WinSystemLocale).Name   -> zh-CN
(Get-Culture).Name           -> zh-CN
```

> **Mojibake rule applied throughout:** garbled output is a *tk defect* only if tk
> failed to decode bytes that were validly in the box's ACP (936/GBK). When the
> *SSH console itself* renders a tool's raw bytes garbled (because the console
> codepage differs from what the tool emitted), that is an environment artifact —
> noted but not charged against tk. Every suspected case is compared to the raw
> tool output in the same console before judging.

---

## 2. Environment & prerequisites

| item | state |
|---|---|
| SSH connectivity | OK (`ssh cozyultra`) |
| PowerShell 7 | `C:\Program Files\PowerShell\7\pwsh.exe` |
| tk repo | `C:\Users\cozy2\workspace\token-killer` (present) |
| atlas repo | `C:\Users\cozy2\workspace\atlas` (present) |
| ripgrep (`rg`) | present — `C:\ProgramData\chocolatey\bin\rg.exe` |
| gh | logged in as Cozy228 (per env) |
| git network | **proxy `127.0.0.1:7890` configured but NOT running** → `git pull` fails to reach GitHub |

### Phase 1 — install latest & build (NOTE: pull substituted with bundle transfer)

The box was on a **divergent stale checkpoint** (`4ff4588 checkpoint before checking
out codex/...`) with 8 modified tracked files + `tk-mcp.mjs` untracked. `git pull
--ff-only` **failed** — git is configured to use proxy `127.0.0.1:7890`, which is not
running on the box, so GitHub is unreachable. Moreover the mac's branch is 20 commits
ahead of `origin` (unpushed), so even a working pull would not have produced the
latest code.

**Faithful substitute (no push, fully local):**
1. Preserved the box's WIP: `git stash push -u -m "win-lifecycle-preserve-WIP-2026-06-09"` (recoverable as `stash@{0}`).
2. On mac: `git bundle create tk-latest.bundle token-killer-node-cli` (complete history, verified).
3. `scp` bundle to box.
4. On box: `git fetch <bundle> token-killer-node-cli` → `git reset --hard FETCH_HEAD`.

Result: box clean at `3cb642f` (mac HEAD). `pnpm install && pnpm build` succeeded:
`dist/cli.js` 103.25 kB, total 525.54 kB, build complete. `node dist/cli.js --version` → **0.1.0**.

---

## 3. tk CLI surface — every command × option

All run from `C:\Users\cozy2\workspace\token-killer`, `tk` = `node dist/cli.js`.
Over SSH (no `-t`) stdout is a pipe → non-TTY → tk takes the agent/compress path
(confirmed: commands compressed without needing `| Out-String`).

### 3.1 Proxy flags

| command | exit | raw→out (tokens) | savings | faithful? | notes |
|---|---|---|---|---|---|
| `tk --version` | 0 | n/a | n/a | yes | prints `0.1.0` |
| `tk --help` | 0 | n/a | n/a | yes | full usage (captured) |
| `tk --stats git log -p -20` | 0 | 171027→730 | **99.6%** | yes | git-log handler digest; commit headers de-fragmented |
| `tk --stats git status --short` (clean tree) | 0 | 0→1 | 0% (healthy) | yes | empty status condensed to `ok`; minimal input |
| `tk --verbose git log -p -20` | 0 | 171027→730 | 99.6% | yes | adds `Raw output: projects\repo-…\raw\…-git-log--p--20.log` |
| `tk --raw git log -p -20` | 0 | 700473 chars passthrough | n/a | yes | uncompressed; first line `commit 3cb642f…` |
| `tk --max-lines 5 git log --oneline -20` | 0 | — | — | **NO — flag ignored** | printed all 20 lines |
| `tk --max-lines 3 git log -p -5` | 0 | — | — | **NO — flag ignored** | 11 lines emitted |
| `tk --max-lines 3 cmd /c dir` (no handler) | 0 | — | — | **NO — flag ignored** | 28 lines emitted |
| `tk --max-chars 200 git log --oneline -20` | 0 | — | — | **NO — flag ignored** | full ~1800 chars |
| `tk --max-chars 50 git log --oneline -20` | 0 | 1599 chars | — | **NO — flag ignored** | full text |
| `tk --save-raw --verbose git status --short` | 0 | 0→1 | 0% | yes | forces raw save even at 0 tokens; path shown |
| `tk --no-save-raw --verbose git log -p -5` | 0 | 33132→191 | 99.4% | yes | raw save suppressed (no `Raw output:` line) |
| `tk --report` | 0 | agg 635569→182165 | 71.3% | yes | 39 cmds, per-handler breakdown |
| `tk --report --json` | 0 | n/a | n/a | yes | `{"commands":39,...,"savingsPct":71.3}` |
| `tk --report --csv` | 0 | n/a | n/a | yes | header + one data row |

> **DEFECT D1 — `--max-lines` / `--max-chars` are no-ops on the proxy path.**
> Parsed correctly in `src/parse.ts` into `options.maxLines/maxChars`, but
> `src/core/outputLimit.ts` ships stubs:
> ```ts
> export function limitLines(text, _maxLines) { return text; }
> export function limitChars(text, _maxChars) { return text; }
> export function limitOutput(text, _options) { return text; }
> ```
> `limitOutput` is the only caller (handlers/base.ts:118-119, applied to both raw
> and compressed output), so both documented flags do nothing. Reproduced on the
> live Windows build three ways (compressed / no-handler / char-cap). NOT
> platform-specific — same in source. (The `read`/`cat` handler has its *own*
> working `--max-lines`; that path is unaffected.)

### 3.2 init (read-only / dry-run; real installs in §6, uninstall in §9)

Baseline at start (`tk init --show`): detected host **copilot-cli**; a `claude-code`
settings hook is **present but NOT tk** (it was `rtk hook claude`); a copilot hook
config already exists at `~/.copilot\hooks\tk-rewrite.json` (pre-existing from a
prior session); shim dir present (manifest v0.1.0, **41 programs**, NOT on PATH,
probe **PASS** → `…\shim\git.cmd`); injection + usage guidance absent.

| command | exit | result |
|---|---|---|
| `tk init --show` | 0 | status block above |
| `tk init --dry-run` | 0 | would overwrite copilot hook config + write `~/.copilot\TK.md` + reference from `copilot-instructions.md`; Active tier: hook |
| `tk init --host auto --dry-run` | 0 | same as above (auto → copilot-cli) |
| `tk init --host claude-code --dry-run` | 0 | would **replace** `~/.claude\settings.json` hook: `- rtk hook claude` → `+ "…node.exe" …\dist\cli.js hook claude` (absolute-path PATH fix); write `~/.claude\TK.md` ref from CLAUDE.md |
| `tk init --host copilot-cli --dry-run` | 0 | would overwrite copilot hook config + TK.md |
| `tk init --host vscode --dry-run` | 0 | would install shim/injection for vscode + write `~/.copilot\instructions\token-killer.instructions.md` |
| `tk init --project --dry-run` | 0 | would write `<repo>\.github\copilot-instructions.md` + `<repo>\.github\hooks\tk-rewrite.json` + user TK.md |
| `tk init shim status` | 0 | shim dir, manifest v0.1.0 41 programs, on PATH: no, probe PASS |

All dry-runs faithful; nothing written (verified by re-running `--show`). The
claude-code diff confirms the **resolveHookCommand absolute-path fix** (writes
`node.exe` + full `dist/cli.js` path, not a bare `tk`).

### 3.3 hook

| command | input | output | faithful? |
|---|---|---|---|
| `tk hook check git status` | — | `rewrite: tk git status` | yes |
| `tk hook check pnpm install` | — | `pass: pnpm install` (not a read cmd) | yes |
| `tk hook check echo hi` | — | `pass: echo hi` | yes |
| `tk hook check git push` | — | `pass: git push` | yes (no governance block configured) |
| `tk hook claude` | `{"tool_name":"Bash","tool_input":{"command":"git status"}}` | `{"hookSpecificOutput":{…,"updatedInput":{"command":"tk git status"}}}` | yes |
| `tk hook claude` | non-Bash `{"tool_name":"Read",…}` | _(empty — skip, fail-open)_ | yes |
| `tk hook copilot` | CLI dialect `{"eventName":"preToolUse","toolName":"shell","toolArgs":{"command":"git log --oneline -5"}}` | `{"permissionDecision":"allow",…,"modifiedArgs":{"command":"tk git log --oneline -5"}}` | yes (flat shape for Copilot CLI) |
| `tk hook copilot` | VS Code dialect `{"hookEventName":"PreToolUse","tool_name":"shell","tool_input":{"command":"git diff"}}` | `{"hookSpecificOutput":{…,"updatedInput":{"command":"tk git diff"}}}` | yes (VS Code shape) |

> **Gotcha (not a defect):** `hook copilot` emits nothing unless the payload
> carries an event field (`event`/`eventName`/`hookEventName`). Without it the
> normalizer fails open to `unknown` → no decision. Real hosts always send it;
> my first probe omitted it.

**TK_DEBUG trace** (`TK_DEBUG=1`, hook claude via stdin) — to stderr, stdout stays clean JSON:
```
tk debug: claude:stdin bytes=60
tk debug: claude:decision command="git status" decision="rewrite" rewritten="tk git status"
tk debug: claude:emit rewrote=true
```
`hook check` (dry-run) emits no TK_DEBUG trace, only the `rewrite:`/`pass:` line — expected.

> **Capture artifact (not a tk defect):** when tk's UTF-8 stdout is piped through
> PowerShell cmdlets (`Select-Object`/`Select-String`) on this gb2312 console, the
> em-dash in tk's own text (`volume — cost`) rendered as `�?`. Setting
> `[Console]::OutputEncoding = UTF8` fixes it. All captures below use UTF-8 console,
> which is also what a non-TTY agent receives. This is the host console layer, not tk.

### 3.4 inspect

| command | exit | result / notes |
|---|---|---|
| `tk inspect` | 0 | input vscode; 32 sessions; 0 tool events (chat-only); static ctx 1 file, 0 findings |
| `tk inspect --input-type copilot-cli` | 0 | warns "no copilot-cli session sources found" (none yet — created in §7); 0 sessions |
| `tk inspect --input-type copilot-cli --json` | 0 | valid JSON (schemaVersion, generatedAt) |
| `tk inspect --since 1d` | 0 | vscode, 32 sessions |
| `tk inspect --json` | 0 | top-level keys: schemaVersion, generatedAt, inputType, session_inventory, transcript_coverage, tool_event_count, … |
| `tk inspect --project` | 0 | runtime + project static ctx |
| `tk inspect --user` | 0 | user static ctx, 1 file, 0 findings |
| `tk inspect --copilot-context` | 0 | static-context only (skips runtime scan) |
| `tk inspect --repo-context` | 0 | runs |
| `tk inspect --advice` | 0 | runs |
| `tk inspect --advice --min-confidence 2 --min-occurrences 2` | 0 | runs (filters) |
| `tk inspect --telemetry-export` | 0 | no endpoint configured → wrote local export `~/.token-killer\advice\telemetry-export.json` (no network) |
| `tk inspect --no-telemetry-export` | 0 | runs |
| `tk inspect --write-advice` | 0 | wrote `inspect-report.md/.json` + `advice.md` to `~/.token-killer\advice` |
| `tk inspect --html` | 0 | wrote `~/.token-killer\reports\inspect-…html` ("opening in your browser") |
| `tk inspect --session dummy-xyz` | 0 | runs, filters (real ids exercised in §8) |
| `tk inspect --session` (no value) | 1 | guard: "--session requires a value" |
| `tk inspect --fail-on info\|warn\|error` | 0,0,0 | 0 findings → none reach any severity → exit 0 |
| `tk inspect --surface instructions` | 0 | 1 file scanned |
| `tk inspect --surface prompts\|agents\|skills` | **2,2,2** | "no major source analyzable" — those surface files don't exist + 0 runtime events |

> **Note (behavior, not a defect):** `--surface prompts/agents/skills` exits **2**
> because nothing is analyzable in that surface on this repo. It's a deliberate
> "no source" exit distinct from `--fail-on`. Sharp for CI that filters to an
> empty surface, but defensible.
>
> **Note (gotcha):** `--json` does not expose per-session ids — `session_inventory`
> is just a count (32). Real session targeting for `--session` must come from the
> transcript filenames.

### 3.5 debug

| command | exit | result |
|---|---|---|
| `tk debug` | 0 | wrote `reports\debug-<ts>.md`; "65 commands · 17 anomalies · delivery wired" |
| `tk debug --out reports/win-debug.md` | 0 | 713 KB bundle |
| `tk debug --out … --full` | 0 | 3.35 MB (every row's payload) |
| `tk debug --out … --redact` | 0 | 15 KB (length/label only), banner "· redacted" |

All faithful. The "delivery wired" stamp + the §2 hook-runs check are exercised live in §6.

### 3.6 optimize — full backup → apply → verify → restore cycle

| command | exit | result / verification |
|---|---|---|
| `tk optimize` (dry-run) | 0 | user scope 0 findings; project scope 2 findings on `AGENTS.md` (conditional_rule_in_always_on @35 [warn], task_prompt_in_instruction @1 [info]) — both advisory |
| `tk optimize --apply` | 0 | **0 auto-applicable**; 2 suggestions printed not applied; **AGENTS.md sha256 unchanged** (no mutation) |
| `tk optimize --write-advice` | 0 | wrote `advice\context\user.md` + `…\56c681cf9e66.md` |
| `tk optimize --surface instructions` | 0 | user scope 0 findings |
| `tk optimize --project` | 0 | project scope, 2 findings |
| `tk optimize --user` | 0 | user scope, 0 findings |
| `tk optimize --token-budget-block` | 0 | **installed** managed block into `~/.copilot\copilot-instructions.md` (tk:token_budget markers) |
| `tk optimize --token-budget-block --restore` | 0 | **removed** block; backup at `~/.token-killer\backups\context\<ts>\` |
| `tk optimize --backup` | 0 | snapshotted **4 files** → `backups\context\<ts>` |
| `tk optimize --restore` | 0 | restored 4 files (CLAUDE.md×2, copilot-instructions.md, AGENTS.md); git tree clean |
| `tk optimize --backup AGENTS.md` | 0 | snapshotted **1 file** |
| `tk optimize --restore` | 0 | restored 1 file; git tree clean |
| `tk optimize --vscode-settings` (dry-run) | 0 | flags `chat.tools.compressOutput.enabled` is off |
| `tk optimize --vscode-settings --apply` | 0 | backup taken; set `…compressOutput.enabled: true`; **sha changed** |
| `tk optimize --vscode-settings --restore` | 0 | removed key (was absent before apply); **sha256 byte-identical to pre** ✓ |

> **Verified byte-for-byte restoration.** Every mutation cycle returned the file to
> its exact prior bytes: VS Code `settings.json` pre==post sha256
> (`DB8BD87C…71FBB2`); AGENTS.md unchanged throughout; repo `git status --short`
> only ever showed `?? reports/` (my scratch output dir).
>
> **Minor finding (O1):** `--token-budget-block --restore` left
> `~/.copilot\copilot-instructions.md` as a **0-byte file** (empty-file hash
> `E3B0C442…`). The file contained only the tk block, so it was created fresh by
> the install; restore reverted to empty rather than deleting the file it created.
> Cleaned in §9.

### 3.7 gain

| command | exit | result |
|---|---|---|
| `tk gain` | 0 | this project: 39 cmds, 635569→ saved 453433 (**71.3%**); top handlers; quality block |
| `tk gain --user` | 0 | all projects: 65 cmds, saved 648624 (**75.5%**) |
| `tk gain --daily` | 0 | per-day buckets; 2026-06-05 14016 (28cmd), 2026-06-09 439417 (71.6%, 11cmd) |
| `tk gain --weekly` / `--monthly` / `--all` | 0 | same base + period rollups |
| `tk gain --graph` | 0 | sparkline "Saved tokens — last 30 days: ▁…█" |
| `tk gain --history` / `--history 20` | 0 | record rows appended |
| `tk gain --failures` | 0 | "Failures … - none" |
| `tk gain --quota` | 0 | ~$1.36 (default $3/Mtok where model unknown) |
| `tk gain --quota -t claude-opus-4-8` | 0 | ~$6.80 (model @ $15/Mtok) — override works |
| `tk gain --json` / `--csv` / `--format json\|csv\|text` | 0 | structured outputs |
| `tk gain report --text` | 0 | four-view ledger (①measured 75.5% ②optimizer none ③governance ④quality), "never summed" |
| `tk gain report --json` | 0 | structured four-view JSON |
| `tk gain report --scope user\|project\|runtime --text` | 0 | scope header reflects each |
| `tk gain report --project` / `--user` `--text` | 0 | scope project / user |
| `tk gain report --since 2026-06-01 --text` | 0 | header "scope: user, since 2026-06-01T00:00:00.000Z" |

Quality block (gain): **29 passed, 5 reverted-to-raw, 5 reverted-to-raw (empty)** of 39 —
the reverts are no-handler / empty-output commands, honestly labeled (not a defect).

### 3.8 config

| command | exit | result |
|---|---|---|
| `tk config path` | 0 | `~/.token-killer\config.jsonc` |
| `tk config show` | 0 | `{telemetryExport:false, telemetry:false}` (defaults; file absent) |
| `tk config init` | 0 | wrote config template (**file did not exist before** — new; removed in §9) |

### 3.9 telemetry

| command | exit | result |
|---|---|---|
| `tk telemetry status` | 0 | network: disabled, local: disabled, device_hash, last_sent **never** |
| `tk telemetry preview` | 0 | prints exact payload (schema 1, os win32, arch x64, 65 cmds, 75.5%, top handlers/commands); **sends nothing** (last_sent stays never) |
| `tk telemetry enable` | 0 | network: enabled, wrote config.jsonc |
| `tk telemetry disable` | 0 | network: disabled, wrote config.jsonc — **left disabled** |

No network upload occurred at any point (`last_sent: never` throughout).

---

## 4. Handler coverage

Tool presence probed with `Get-Command`. Verbose run = the high-output form;
terse = the tool's native-minimal form (tk passes those through ≈unchanged → 0%
is healthy). Savings are tk `--stats`. Repos: atlas (small, ~recent clone) and
token-killer (rich history).

### 4.1 Present tools — exercised

| handler | tool path | verbose run → savings | terse run → savings | faithful? | notes |
|---|---|---|---|---|---|
| git-status | Git\cmd\git.exe | `git status` 52% (25→12) | `git status --short` 0% | yes | clean tree → `ok` |
| git-log | git | `git log -p -20` **99.6%** (171027→730); `git log -30` 67.1% | `git log --oneline` 0% | yes | de-fragmented digest |
| git-diff | git | `git diff HEAD~5 HEAD` **99%** (29244→286) | `git diff --stat` 0% | yes | atlas HEAD~5 diff was tiny (47 tok) |
| git-show | git | `git show <big>` **97.1%** (4368→125) | `git show --stat` 26.6% | yes | |
| git-branch | git | `git branch -a` 48.3% (29→15) | — | yes | |
| git-worktree | git | `git worktree list` 0% (18→18) | — | yes | single worktree, minimal |
| search-like | rg (choco) | `rg export packages` **67.3%** (1920→627) | `rg -c/-l` 0% | yes | root `rg export` = 0 matches (atlas quirk, reported honestly) |
| tree | system32\tree.com | `tree packages` 0% (52→52) | — | yes | dirs-only, minimal |
| package-list | npm.ps1 | `npm ls` **95.1%** (283→14) | — | yes | |
| package-list | pnpm.ps1 | `pnpm list` 27.8% (97→70) | `pnpm list --depth=0` (dogfood PASS) | yes | |
| npx | npx.ps1 | `npx --version` passthrough | — | yes | prose |
| tsc | node_modules\.bin\tsc | `tsc --noEmit` 0% (0→0) | — | yes | clean typecheck → no output |
| dotnet | Program Files\dotnet | `dotnet --info` 0% (221→221) | — | yes | prose passthrough |
| javac | Adoptium jdk-17 | `javac -version` → `javac 17.0.7` | — | yes | prose |
| pip | Python313 | `pip list` 0% (13→21) | — | yes | tiny list; +overhead noted |
| (generic) python | Python313 | `python --version` → `Python 3.13.1` | — | yes | prose |
| curl | system32\curl.exe | `curl --version` passthrough | — | yes | no live fetch (git proxy down → network restricted) |
| gh | GitHub CLI\gh.exe | `gh repo view` 0% (31→31) | — | yes | rewrites to `--json …`; small |
| playwright | Python312\Scripts | `playwright --version` → `Version 1.42.0` | — | yes | prose |
| diff | (internal, no binary) | `diff package.json tsconfig.json` → `package.json -> tsconfig.json (+12 -51)` | — | yes | **computed internally — works without a `diff` binary** |
| js-test | vitest (.bin) present | not re-run live (slow); historically 87.9% in `gain` | — | yes | suite validated via dogfood |

### 4.2 Present-as-handler but BROKEN on Windows — **DEFECT D2**

| handler | command | result on Windows |
|---|---|---|
| read | `tk cat package.json` | **`cat: command not found`** |
| env | `tk env` | **`env: command not found`** |
| ls | `tk ls` / `tk ls -la` | **`ls: command not found`** |
| wc | `tk wc package.json` | **`wc: command not found`** (also tool absent) |

> **DEFECT D2 — coreutils handlers shell out to Unix binaries absent on Windows.**
> The read handler (`programs: ["cat"]`) and the `env`/`ls`/`wc` handlers execute
> the system binary and compress its bytes, rather than reading internally. The
> code says so explicitly: _"RTK: read.rs reads the file bytes directly; tk shells
> to the system `cat`"_ (`src/handlers/system/read.ts:418`). On a stock Windows box
> none of `cat`/`env`/`ls`/`wc` exist, so each returns `command not found` — and
> the hook **rewrites** `cat …`/`ls …` to `tk cat …`/`tk ls …` (dogfood: "hook: ls →
> rewrite tk ls .", "hook: read → rewrite tk read CONTEXT.md"), routing common
> agent commands straight into the failure. Contrast: `tk read <file>` (4056-token
> file read internally) and `tk diff` (internal) both work. tk already owns an
> internal reader, so reading `cat`/`head`/`tail` bytes directly would fix this
> cross-platform. **Severity: medium-high** — `cat`/`ls` are among the most common
> commands an agent emits; on Windows they error through tk. (Whether a given host
> emits `cat` vs `type`/`Get-Content` is checked against the real transcripts in §8.)

### 4.3 Absent tools — skipped (tool not installed)

Recorded explicitly, not silently omitted:
`glab`, `gt`, `eslint` (replaced by oxlint), `prettier` (removed from deps),
`next`, `prisma`, `pytest`, `ruff`, `mypy`, `mvn`/maven, `gradle`, `docker`,
`kubectl`, `aws`, `terraform`, `wget`, `psql`, `find` (Windows `find.exe` is a
different command). Each would route to its handler if installed; none present to exercise.

---

## 5. Scripted dogfood (`pnpm test:windows-dogfood`)

**Result: 40 passed, 5 failed.** All 40 handler/CLI/delivery checks that exercise
real tk behavior passed (git compaction 99.6%, log 67.1%, rg, status/branch/show/
diff/tree, pnpm list, hook rewrites for git/pnpm/rg/read/ls, init for both hosts,
VS Code settings patch, shim wrappers, inspect/optimize/report/config/telemetry).

**All 5 failures are STALE TEST ASSERTIONS in `windows-dogfood.ps1`, not tk
defects** — each asserts a contract tk has since improved, and tk's live output is
correct:

| dogfood test | asserts (stale) | tk's actual (correct) output |
|---|---|---|
| hook copilot: rewrite git status | `"rewritten_command":"tk git status"` | `{"permissionDecision":"allow",…,"modifiedArgs":{"command":"tk git status"}}` (ADR 0005 per-dialect shape) |
| hook copilot: deny node_modules | `"decision":"deny"` | `{"hookSpecificOutput":{…,"permissionDecision":"deny",…}}` (correct deny w/ reason) |
| hook copilot: fail-open bad json | `"decision":"allow"` | empty stdout = allow (Copilot-CLI fail-open contract) |
| shim status + probe PASS | runs `tk shim status` | CLI is now `tk init shim status`; bare `shim` → proxy → "shim: command not found" |
| Copilot hook config content | literal `"tk hook copilot"` | absolute `"…node.exe …\dist\cli.js hook copilot"` (Windows PATH fix — better) |

> **Finding (test debt, T1):** `scripts/windows-dogfood.ps1` lags the current hook
> output shapes, the `init shim` subcommand move, and the absolute-hook-path fix.
> The harness should be updated; it is currently red for the wrong reasons and
> masks the real green.

> **Correction to §4.1:** the earlier `gh repo view` row was an **HTTP 401 auth
> error** that tk faithfully passed through, NOT real repo data — gh is installed
> but its stored token is **invalid** (`gh auth status`: "The token in default is
> invalid."). tk's behavior was correct (it relayed gh's error verbatim); the gh
> handler could not be meaningfully exercised because gh itself is unauthenticated.

---

## 6. Delivery install (real)

Both hosts installed for real (§Phase 4), then verified.

| host | tier | files written | verified |
|---|---|---|---|
| copilot-cli | **hook** | `~/.copilot\hooks\tk-rewrite.json` (PreToolUse → absolute `node.exe …\dist\cli.js hook copilot`); `~/.copilot\TK.md`; reference added to `~/.copilot\copilot-instructions.md` | ✅ wired binary runs (below) |
| vscode | **shim** | `~/.token-killer\shim\*` (41 `.cmd` wrappers); patched `%APPDATA%\Code\User\settings.json` with `terminal.integrated.env.windows` = `{PATH: "…shim;${env:PATH}", TK_SHIM_DIR: "…shim"}`; `~/.copilot\instructions\token-killer.instructions.md` | ✅ probe PASS; shim runs (below) |
| claude-code | (not installed) | — | existing hook is `rtk` (foreign); `tk debug` §2 confirms its binary runs (`rtk 0.42.3`) |

**`tk debug` §2 self-check** (delivery health): copilot-cli hook *present, managed by
tk ✅*; instruction injection *present ✅*; shim *probe PASS ✅* → `…\shim\git.cmd`;
rewrite-engine probe rewrites `git status`/`git log -5`/`grep`/`ls`; **no delivery
failures recorded ✅**.

**Wired hook binary runs live** — feeding the exact configured command host-style
(stdin via `cmd <`):
- copilot: `{"eventName":"preToolUse","toolName":"shell","toolArgs":{"command":"git status"}}` → `{"permissionDecision":"allow",…,"modifiedArgs":{"command":"tk git status"}}`
- claude: `{"tool_name":"Bash","tool_input":{"command":"git status"}}` → `{"hookSpecificOutput":{…,"updatedInput":{"command":"tk git status"}}}`

---

## 7. Real workflows (lifecycle core) — headless reality

### 7.1 Copilot CLI — **could NOT be driven live (BLOCKED, recorded honestly)**

Copilot CLI 1.0.56 is installed (`~/AppData\Roaming\npm\copilot.ps1`) and has a true
headless mode (`copilot -p "<prompt>" --allow-all-tools`). I attempted workflow 1 in
atlas ("check git working-tree status with a shell command"):

```
copilot -p "..." --allow-all-tools --deny-tool 'shell(git push)' --no-color
→ Error: No authentication information found.
```

Diagnosis (what I tried):
- Bridged `gh auth token` → **empty** (`gh auth status`: *"The token in default is
  invalid."*). gh's own API calls return **HTTP 401**.
- No `GITHUB_TOKEN`/`GH_TOKEN`/`COPILOT_GITHUB_TOKEN` set on the box.
- `~/.copilot\session-store.db` is 4 KB (empty); the only `session-state` dirs
  (10:53/10:54) are **my failed `-p` attempts**, which never reached a tool call.
- Re-auth (`gh auth login` / copilot `/login`) needs an **interactive device-code
  flow**, which can't be completed over headless SSH. The git proxy (`127.0.0.1:7890`)
  is also down, so the box's outbound network may itself require a proxy.

**Verdict: Copilot CLI live interception is NOT VERIFIED on this box** — GitHub auth
is invalid and there is no headless re-auth path. Proposed next move: a human on the
box runs `gh auth login` (or `copilot` → `/login`) and ensures network egress, then
re-runs the two workflows; OR set `COPILOT_GITHUB_TOKEN` to a PAT with Copilot scope.

### 7.2 VS Code — GUI-only, not driven live

Per the goal, VS Code's in-editor agent has no headless entry and needs a human at
the GUI; none was available. **VS Code live agent interception is NOT VERIFIED
(GUI-only, no headless path).** Install correctness *was* verified (§6) and the shim
tier it uses is proven end-to-end below.

### 7.3 Mechanical end-to-end interception proofs (strongest available evidence)

Since no live LLM could be driven, I exercised the full delivery chain minus the LLM
— host event → tk hook rewrite → execute rewritten command → tk compresses — for
**both** tiers. This proves the Windows delivery mechanism itself is functional.

**Hook tier (Copilot CLI):** fed the WIRED hook the PreToolUse event for
`git log -p -5` →
```
hook → {"permissionDecision":"allow",…,"modifiedArgs":{"command":"tk git log -p -5"}}
run  → tk git log -p -5  →  Raw 19457 → Output 167 tokens  (99.1% saved)
```

**Shim tier (VS Code):** with the env a real VS Code terminal sets (`PATH` =
`…shim;…`, `TK_SHIM_DIR` = `…shim`, both confirmed in settings.json), ran bare
`git status` in atlas:
```
git status → (shim git.cmd → tk git status) → "* main...origin/main / clean — nothing to commit"
node processes after: 0  (recursion guard active, no fork)
```

### 7.4 Transcript / history verification (Phase 6)

- `tk inspect --input-type copilot-cli --since 1d` → **0 sessions, 0 tool events**
  (no successful Copilot session exists to verify — consistent with §7.1).
- `tk gain --user --history` → **new rows DID land** from this run, e.g.
  `2026-06-09T02:56:38Z  git-log  99.1%  git log -p -5` (the hook-rewritten command
  from §7.3), `git-status 52%`, `package-list 35.9%`, etc. `gain --user` grew from
  65 → **118 commands (82.9%)** over the session — tk's own ledger faithfully
  recorded everything driven through it.

**Per-host summary:** Copilot CLI — workflow attempted → blocked at auth → not
through tk (never executed) → **not verified**. VS Code — not driven (GUI) →
install + shim chain verified mechanically → **mechanism verified, live agent not**.
No command that *did* run through tk produced wrong output.

---

## 8. Defects

Every issue below is reproducible; tk-output defects are quoted verbatim.

### D1 — `--max-lines` / `--max-chars` are no-ops (proxy path) · severity medium
`src/core/outputLimit.ts` ships stubs (`limitLines/limitChars/limitOutput` return
input unchanged); `handlers/base.ts:118-119` is the only caller. Both documented
flags silently do nothing. Reproduced on Windows 3 ways. Not platform-specific.
(Handler-local `read --max-lines` is a separate, working path.)

### D2 — coreutils handlers shell out to Unix binaries absent on Windows · severity medium-high
`tk cat`, `tk env`, `tk ls`, `tk wc` all return **`<cmd>: command not found`** on a
stock Windows box, because these handlers execute the system binary
(`src/handlers/system/read.ts:418` — _"tk shells to the system `cat`"_) instead of
reading internally. The hook actively **rewrites** `cat …`→`tk cat …`, `ls …`→`tk
ls …` (dogfood PASS rows), routing common agent commands into the failure. tk
already reads files internally for `tk read` (works) and computes `tk diff`
internally (works), so reading `cat`/`head`/`tail` bytes directly would fix this
cross-platform. Verbatim:
```
> tk cat package.json   →  cat: command not found
> tk env                →  env: command not found
> tk ls -la             →  ls: command not found
```

### D3 — shim recursion guard depends on an external env var; fork-bomb if absent · severity high (failure mode), conditional (trigger)
The Windows shim wrapper is `@"node" "cli.js" "git" %*` with **no self-contained
re-entry guard**. tk's recursion guard (`buildChildEnv`/`assertNoRecursion`,
executor.ts) only strips the shim dir from the child PATH **when `TK_SHIM_DIR` is
set**. The `.cmd` does not set `TK_SHIM_DIR` itself.
- **Supported config works:** with `PATH`+`TK_SHIM_DIR` both set (exactly what
  `init --host vscode` writes into `settings.json`), `git status` routes shim→tk→git
  and compresses correctly; **0 residual processes**. Verified.
- **Failure mode:** if the shim dir is on PATH **without** `TK_SHIM_DIR` (my test
  prepended PATH only), tk re-resolves `git` → the shim → `node cli.js git` → … an
  **infinite fork bomb**. I triggered it and watched it climb past **2,599 node
  processes still growing**; I had to surgically kill the `cli.js … git` tree.
- **Recommendation:** make the wrapper self-guarding — `set "TK_SHIM_DIR=%~dp0"` at
  the top of each `.cmd` (and the POSIX wrapper equivalent) so the guard never
  depends on ambient env. On Windows a fork bomb is fast and disruptive; the guard
  should not be one missing variable away.

### O1 — `optimize --token-budget-block --restore` leaves a 0-byte file · severity minor
When the block was the only content, restore reverts `~/.copilot\copilot-instructions.md`
to empty (`E3B0C442…`) rather than deleting a file it created. (Mooted here: the
real `init` later re-populated it, and `--uninstall` removed it.)

### T1 — `scripts/windows-dogfood.ps1` has 5 stale assertions · test debt, not a runtime defect
Asserts pre-ADR-0005 hook fields (`rewritten_command`/`decision`), the old
`tk shim` path, and a literal `tk hook copilot` command. tk's live output is correct
in all 5; the harness is red for the wrong reasons (details in §5).

### Environment (NOT tk defects, but they blocked the live lifecycle)
- **GitHub auth invalid** on the box (`gh auth status` → token invalid; API 401) →
  Copilot CLI cannot authenticate; no headless re-auth path.
- **git proxy `127.0.0.1:7890` down** → `git pull` to GitHub fails (worked around
  with a local git-bundle transfer; **no push** performed).
- **SSH console codepage is gb2312** → piping tk's UTF-8 stdout through PowerShell
  cmdlets mojibakes non-ASCII (e.g. em-dash). Fixed by `[Console]::OutputEncoding=UTF8`;
  not a tk defect (an agent reads tk's bytes as UTF-8 directly).

**No GBK/mojibake defect in tk itself was found.** Every garbled string traced to
the SSH console layer, never to tk mis-decoding ACP-936 bytes. tk's compressed
output of Chinese-locale tool output (git, etc.) was faithful throughout.

---

## 9. Lifecycle verdict

**Partial pass — tk itself is solid on Windows; the live-agent leg was blocked by
the box's environment, not by tk.**

Evidence chain:
| lifecycle stage | result |
|---|---|
| Latest tk built & version confirmed | ✅ `0.1.0` @ `3cb642f` (bundle-synced, built clean) |
| Every tk command × option exercised | ✅ §3 (all recorded; D1 found) |
| Every present handler exercised; absent skipped | ✅ §4 (D2 found; absent listed) |
| Scripted dogfood | ✅ 40 pass / 5 stale-assertion fails (T1) |
| Delivery installed into both hosts | ✅ §6 (hook + shim; wired binaries run) |
| **Live agent use, transcript-verified** | ❌ **not verified** — Copilot auth invalid (no headless re-auth); VS Code GUI-only |
| Interception mechanism (both tiers) | ✅ mechanically end-to-end: hook 99.1%, shim git-status, §7.3 |
| All mutations restored; repos clean | ✅ byte-for-byte; both repos clean, owner WIP stashed |
| Uninstall clean | ✅ §7 — nothing tk left; foreign `rtk` hook untouched |
| ONE report produced & pulled to mac | ✅ this file |

**Bottom line:** tk installs, compresses (git-log 99.6%, diff 99%, npm ls 95.1%),
records, reports, optimizes-with-byte-exact-restore, and uninstalls cleanly on a
GBK Windows 11 box. Three real defects (D1 dead flags, D2 coreutils portability,
D3 shim fork-bomb fragility) and one test-debt item (T1) are the actionable output.
A fully transcript-verified **live** agent loop needs a human to restore GitHub auth
(Copilot CLI) and/or drive the VS Code GUI on the box — neither possible headlessly
this run.

