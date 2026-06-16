# GOAL: tk full-lifecycle Windows dogfood — produce ONE complete markdown report

You are an agent running on macOS. Drive a **complete tk lifecycle** on the
remote Windows box over SSH, exercising **every tk command with every option**,
plus every wrapped-tool handler that exists on the machine, then driving **real
VS Code Copilot and Copilot CLI daily workflows** and verifying — from the
agents' own session transcripts — that their commands flowed through tk with
correct output.

**THE DELIVERABLE IS A SINGLE MARKDOWN REPORT.** Everything you run, its exact
output, and its observed behavior must be recorded. The goal is not "tests
passed" — it is a thorough, honest, reproducible report a human can read to know
exactly how tk behaves on Windows today. Write it to
`<tkroot>\reports\windows-lifecycle-<box>-<chcp>-<YYYYMMDD-HHMM>.md` on the remote
(e.g. `...-cozyultra-936-...md` / `...-company-437-...md`) and pull a copy back to
the mac repo's `reports/`.

## Target boxes (this goal is box-agnostic — run it per box, one report each)

Run the full lifecycle on whichever Windows box you're pointed at, and produce a
SEPARATE report per box. Two known profiles, valuable precisely because their
encodings differ:
- **cozyultra** (GBK / chcp 936 / zh-CN) — exercises tk's GBK decode path.
- **company box** (English / chcp 437 / en-US) — exercises tk's OEM/UTF-8 path.
Point the SSH host at the box under test (default `cozyultra`; override with
`TK_SSH_HOST`). Name each report after its box and encoding profile.

## Environment (verify, then use — do not rediscover)

- Default remote host alias: `cozyultra` (192.168.31.129, user `cozy2`). Connect
  with `ssh cozyultra` or the wrapper `bash scripts/ssh-windows.sh <cmd>`. For the
  company box, set `TK_SSH_HOST` (and adjust the repo paths if they differ).
- PowerShell 7: `C:\Program Files\PowerShell\7\pwsh.exe` (wrapper uses `-NoProfile`).
- tk repo: `C:\Users\cozy2\workspace\token-killer`, branch `token-killer-node-cli`.
  After build, the CLI is `node dist/cli.js` (this IS `tk`).
- atlas repo: `C:\Users\cozy2\workspace\atlas` (gh `Cozy228/atlas`).
- VS Code user dir: `%APPDATA%\Code\User`. Copilot CLI dir: `%USERPROFILE%\.copilot`.
- gh logged in as `Cozy228`.
- Wrapper subcommands: `status build smoke setup-rg clone-atlas dogfood dogfood-preview shell`.
  For anything else run raw `ssh cozyultra "<pwsh -NoProfile -Command ...>"`.

## Critical knowledge (known traps — record if any reproduce)

- **TTY gate**: tk only compresses in a non-TTY (agent) context. Over plain SSH a
  command may look like a TTY — force the agent path by piping (`... | Out-String`)
  or use `--stats`, exactly as `windows-dogfood.ps1` does. Real VS Code/Copilot
  sessions are already non-TTY, so those are honest.
- **Encoding** (capture the box's profile in Phase 0, then judge against it):
  Windows ships several codepage layers. The one that decides tk's behavior is the
  **ANSI codepage (ACP)** — what non-Unicode tools emit. Read mojibake against the
  recorded profile, do NOT assume:
  - Active console codepage: `chcp` (936=GBK, 437/850=English OEM, 1252=Western
    ANSI, 65001=UTF-8).
  - `[Console]::OutputEncoding` / `[Console]::InputEncoding` / `$OutputEncoding`.
  - ACP/OEMCP: `Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Nls\CodePage' | Select ACP,OEMCP`.
  - Locale: `(Get-WinSystemLocale).Name`, `(Get-Culture).Name`.
  **Mojibake criterion**: garbled tk output is a tk bug ONLY if tk failed to decode
  bytes in the box's actual codepage (e.g. ACP 936 and tk mangled GBK). If the
  *terminal itself* renders a tool's raw output garbled (wrong console codepage,
  not tk), that's an environment artifact — note it, but it is NOT a tk defect.
  Always compare tk's output to the raw tool output in the same console before
  blaming tk.
- **VS Code can only rewrite** (PreToolUse `updatedInput`), not compress output;
  Copilot CLI uses a flat hook rewrite. On VS Code, success = the command was
  rewritten to route through tk (tk then runs the tool and compresses).
- **Mutations run for real**, each wrapped **snapshot → run → verify → restore**:
  - git: `$h = git rev-parse HEAD`, stash any dirt, run real mutation through tk,
    verify, then `git reset --hard $h` / `git stash pop` / delete scratch branch.
  - `tk optimize`: `--backup` → `--apply` → verify delta → `--restore`
    (backups in `~/.token-killer/backups/context/<ts>/`).
  - `tk init`: real install → `--uninstall`.
- **`git push` is FORBIDDEN** — never push to any remote, not even a scratch
  branch. Everything stays local.

## For EVERY command you run, record a row

Capture, in the report, for each invocation:

| field | meaning |
|---|---|
| command | the exact command line (incl. all flags) |
| cwd | atlas / token-killer |
| exit | exit code |
| raw→out | raw chars/tokens → compressed chars/tokens |
| savings | `--stats` savings % (or "n/a") |
| faithful? | output correct & uncorrupted? recovery hints present if truncated? |
| output | the actual output (verbatim, or trimmed with the trim noted) |
| notes | anomalies, mojibake, wrong counts, surprising behavior |

Already-minimal / prose surfaces showing ~0% are HEALTHY — say so, don't flag.

## Plan

### Phase 0 — Connect, baseline & encoding profile
`bash scripts/ssh-windows.sh status`. Record hostname/branch/dist/atlas/rg.
If atlas or rg missing → `clone-atlas` / `setup-rg` first.

**Record the encoding profile up front** (it gates how you read every later
output — see the mojibake criterion above). Run and record verbatim:
```powershell
chcp
[Console]::OutputEncoding | Select CodePage,WebName
$OutputEncoding.WebName
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Nls\CodePage' | Select ACP,OEMCP
(Get-WinSystemLocale).Name; (Get-Culture).Name
```
State the profile in the report's Summary, e.g. "ACP 936 / chcp 936 / zh-CN
(GBK box)" or "ACP 1252 / chcp 437 / en-US (English box)". Known targets:
- **cozyultra**: chcp 936, ACP 936, zh-CN → exercises tk's **GBK** decode path.
- **company box**: chcp 437, en-US → exercises tk's **English OEM / UTF-8** path.

### Phase 1 — Install latest & build
`git -C <tkroot> pull --ff-only` on the branch, then
`bash scripts/ssh-windows.sh build`. Record `node dist/cli.js --version`.

### Phase 2 — tk's OWN CLI surface: every command × every option
Run each below, record a row each. Use `tk init --show` / `--dry-run` first so
nothing is written until you mean it.

- **proxy flags** (apply each, on a verbose command like `git log -p -20` and on
  a small one, so you see both effects):
  `--raw`, `--stats`, `--verbose`, `--max-lines <n>`, `--max-chars <n>`,
  `--save-raw`, `--no-save-raw`, `--report`, `--report --json`, `--report --csv`,
  `--help`, `--version`.
- **init**: `tk init --show`; `tk init --dry-run`; `tk init --host auto|claude-code|copilot-cli|vscode`
  (dry-run each host); `tk init --project --dry-run`; `tk init shim status`;
  then the REAL installs in Phase 4; `--uninstall` in Phase 7.
- **hook**: `tk hook check git status`; `tk hook check pnpm install`;
  `tk hook check <a non-rewritable cmd>`; `tk hook copilot` and `tk hook claude`
  driven with a sample stdin tool-event (show the emitted decision);
  re-run the check commands with `TK_DEBUG=1` and capture the trace.
- **inspect**: `tk inspect`; `--json`; `--html`; `--since 1d`; `--session <id>`;
  `--input-type vscode`; `--input-type copilot-cli`; `--repo-context`; `--advice`;
  `--write-advice`; `--telemetry-export`; `--no-telemetry-export`;
  `--min-confidence 2`; `--min-occurrences 2`; `--project`; `--user`;
  `--copilot-context`; `--surface instructions|prompts|agents|skills`;
  `--fail-on info|warn|error` (record the exit code for each `--fail-on`).
- **debug**: `tk debug`; `--out reports/win-debug.md`; `--full`; `--redact`.
- **optimize** (the REAL backup/apply/restore cycle): `tk optimize` (dry-run plan);
  `--apply`; `--backup`; `--backup <one file>`; `--restore`; `--write-advice`;
  `--token-budget-block` then `--restore`; `--surface <name>`; `--project`;
  `--user`; `--vscode-settings --apply` then `--vscode-settings --restore`.
  Confirm every file reverts byte-for-byte; record the backup dir.
- **gain**: `tk gain`; `--user`; `--daily`; `--weekly`; `--monthly`; `--all`;
  `--graph`; `--history`; `--history 20`; `--failures`; `--quota`;
  `--quota -t <model>`; `--json`; `--csv`; `--format json|csv|text`;
  `tk gain report`; `report --scope user|project|runtime`; `report --project`;
  `report --user`; `report --since <date>`; `report --text`; `report --json`.
- **config**: `tk config show`; `tk config path`; `tk config init`
  (snapshot the config file first, restore after if it overwrote anything).
- **telemetry**: `tk telemetry status`; `tk telemetry preview`;
  `tk telemetry enable` then `tk telemetry disable` (leave it disabled — no
  network upload should occur; confirm `preview` sends nothing).

### Phase 3 — Wrapped-tool handlers: every tool present on the box
tk has handlers for: git (status/diff/log/show/branch + extended), gh, glab, gt,
rg/search-like, ls, tree, cat/read, wc, env, json, diff, npm, pnpm, npx, tsc,
eslint, prettier, vitest/js-test, next, prisma, playwright, pip, pytest, ruff,
mypy, maven, gradle, javac, dotnet, docker, kubectl, aws, terraform, curl, wget,
psql, log files, smart/summary/deps.

For EACH handler: first check the tool exists (`Get-Command <tool>`). If present,
run it (through tk, agent path) on a real surface in atlas/token-killer with both
a verbose invocation AND its native-terse form (e.g. `git log` vs `git log
--oneline`, `rg x` vs `rg -c x`) and record rows. If the tool is **absent**,
record it explicitly as "skipped: tool not installed" — do not silently omit.
This is how "all commands" stays honest on a box that lacks some toolchains.

Also run the scripted suite for breadth and fold its PASS/FAIL into the report:
`bash scripts/ssh-windows.sh dogfood`.

### Phase 4 — Install delivery into both hosts (real)
`tk init --host vscode` and `tk init --host copilot-cli` (real writes). Verify
with `tk init --show` and confirm the wired hook binary actually runs
(`tk hook check` / `tk debug` §2). Record what files were written.

### Phase 5 — Drive real daily workflows (lifecycle core)
Start fresh agent sessions doing ordinary work that naturally issues shell
commands, so tk's hook/shim intercepts them.

**Headless reality (do not fight it):**
- **Copilot CLI is the headless path** — it has a true non-interactive mode:
  `copilot -p "<prompt>"` (a.k.a. `--prompt`) runs one-shot, prints to stdout, and
  exits; `--model <m>` and Autopilot / allow-all-tools let it execute commands
  hands-off. Confirm exact flags with `copilot --help`. This is what you drive
  over SSH.
- **VS Code's in-editor Copilot agent CANNOT be driven headlessly** — it is a GUI
  plan-execute loop with no command-line entry, and its commands run in the
  integrated terminal. Note: VS Code now *hosts* Copilot CLI sessions via the
  Copilot SDK, but those run the CLI harness and do NOT pass through VS Code's
  settings.json PreToolUse hook — so they don't exercise the VS Code delivery
  tier. The VS Code hook only fires for a human-driven GUI session.

So:
- **Copilot CLI** (the real lifecycle proof) — once in `~/workspace/atlas` and
  once in `~/workspace/token-killer`, run 2–3 daily workflows with `copilot -p`:
  summarize recent git history; find where a symbol is used; check working-tree
  status. Record each prompt and the tool calls it produced.
- **VS Code** — headless verification is limited to install correctness:
  `tk init --host vscode --show`, `tk hook check git status` (dry-run rewrite),
  and confirming the wired hook binary runs. Record this and state plainly that
  **live VS Code agent interception needs a human at the GUI** — if nobody can
  drive the GUI on the box, mark VS Code live-interception as "not verified
  (GUI-only, no headless path)" rather than faking it. If a human session IS
  available, capture it and verify in Phase 6.

### Phase 6 — Verify from the sessions' own transcripts (proof)
For the newest session in each host:
- `tk inspect --input-type copilot-cli --since 1d` and `--session <id>` — confirm
  the workflow commands appear AND were routed through tk, with sane savings.
- `tk inspect --input-type vscode --since 1d` likewise.
- Open the raw latest transcript (Copilot: `%USERPROFILE%\.copilot`; VS Code:
  `%USERPROFILE%\.vscode\...\transcripts\`) and spot-check that executed commands
  are the tk-wrapped forms and their output is intact.
- `tk gain --history` — confirm new rows landed from this run.
Record, per host: workflow → command issued → went-through-tk? → savings →
output-correct? Flag every command that bypassed tk or whose tk output was wrong.

### Phase 7 — Close the loop
`tk init --uninstall` and `tk init shim uninstall` to confirm clean removal
(proving install → use → uninstall). Verify `tk init --show` reports nothing left.
Confirm all Phase-2/3 mutations are restored and both repos are clean
(`git status --short` empty, on the original ref).

## The report (the actual deliverable)

Write ONE markdown file with these sections:
1. **Summary** — host, OS/VS Code versions, tk version, run timestamp, one-line
   verdict: did a full lifecycle (install → real agent use → transcript-verified
   interception → uninstall) succeed end-to-end?
2. **Environment & prerequisites** — what was present/absent.
3. **tk CLI surface** — a table of every command×option run, with the per-row
   fields above. Include the verbatim (or noted-trim) output.
4. **Handler coverage** — table of every handler: tool present? verbose vs terse
   savings, faithfulness, skipped-if-absent.
5. **Scripted dogfood** — PASS/FAIL tally + any failures.
6. **Delivery install** — files written per host, hook-runs-live check.
7. **Real workflows** — per host: prompts, tool calls, transcript-verified tk
   interception, savings, output correctness.
8. **Defects** — every wrong / garbled / bypassed / un-restored result, each with
   the exact command and the offending snippet. If none, say "none found" and
   what you checked.
9. **Lifecycle verdict** — clear pass/fail with the evidence chain.

## Success criteria
- Latest tk built & version confirmed on Windows.
- Every tk command and option exercised and recorded (or explicitly marked
  not-applicable with reason).
- Every present handler exercised; absent ones recorded as skipped.
- Delivery installed into VS Code and Copilot CLI and confirmed live.
- ≥1 real daily workflow per drivable host executed and **transcript-confirmed**
  to have gone through tk with correct output.
- All mutations restored; both repos clean.
- ONE complete markdown report produced and pulled back to the mac.

## Guardrails
- Run BOTH dry-run and real, including mutations — but wrap every mutation
  snapshot → run → verify → restore, and confirm the restore left repos/context
  files clean before moving on.
- **Never `git push`** to any remote.
- No network telemetry uploads (leave telemetry disabled).
- If a step fails or a host can't be driven, record it honestly and report what
  you tried + the error + proposed next move — don't retry the same failing
  action more than 2–3 times or wander into unrelated exploration.
- Report tk output defects verbatim; never paper over mojibake or truncation.
