# Token Killer (`tk`)

**Save:** Cut your AI agent's token bill by 60–90% — tk wraps the real tools and
compresses their output before it ever reaches the model.

**Safely:** Zero runtime dependencies, zero fabrication, zero lock-in — everything
runs locally, and lossless recovery is one flag away.

**At scale:** One install distributes the best practices to every engineer — each
agent reads less, spends less, and works the same proven way, by default.

Works with Claude Code and GitHub Copilot (CLI + VS Code); Codex support is
planned. Deterministic, local, test-first. Nothing leaves your machine.

```bash
tk install        # wire it into your agent — then commands compress automatically
```

---

## Why

Your coding agent pays for **every byte** of command output it reads. A single
`git status`, a test run, or a broad `rg` dump can cost thousands of tokens — most
of it boilerplate the agent skims past. Worse, when it re-runs the same command, you
get **re-billed for output you've already seen**.

`tk` sits in front of the real tool. It runs the command, hands the agent the same
*actionable* result in far fewer tokens, and never re-emits output that hasn't
changed. Typical savings: **~60–90% off a dev command, ~27% off a whole Claude Code
session.**

Real numbers, **measured on this repo** (`raw chars → tk chars`, one run — yours
vary with input size):

| command                              |    raw |     tk | savings | how                                  |
| ------------------------------------ | -----: | -----: | ------: | ------------------------------------ |
| `git show HEAD`                      | 73,646 |    869 |   ↓ 99% | large commit → summary + pointer     |
| `diff README.md AGENTS.md`           | 15,087 |    162 |   ↓ 99% | large diff → summary + pointer       |
| `read --level aggressive src/cli.ts` | 21,215 |  1,427 |   ↓ 93% | signatures only, bodies stripped     |
| `git branch -a`                      |    129 |     31 |   ↓ 76% | strips tracking/ahead-behind noise   |
| `rg import src` (721 matches)        | 58,059 | 16,412 |   ↓ 72% | count header + grouped by file       |
| `git log -n 10`                      |  4,677 |  1,494 |   ↓ 68% | one line per commit                  |
| `ls -la node_modules`                |  1,670 |    811 |   ↓ 51% | drops perms/owner/size columns       |
| `find src -name '*.ts'`              |  4,050 |  2,050 |   ↓ 49% | tightened paths                      |

**Healthy 0% is the point, not a miss.** tk never pads what's already minimal and
never guesses at content it can't shrink losslessly:

| command                | savings | why 0% is correct                                |
| ---------------------- | ------: | ------------------------------------------------ |
| `cat src/cli.ts`       |      0% | source code — passthrough, never lossy-truncated |
| `cat README.md`        |      0% | prose — passthrough by design                    |
| `git status` (clean)   |    ~0% | already terse; a dirty tree compresses ~40%       |
| `rg` (tiny result set) |   ~0% | a few matches — the count header costs more than it saves |

This honesty is the whole pitch: every number above is `raw − delivered`, measured —
never an estimate.

## Install

Not yet on npm (publication is planned) — get `tk` on your PATH from source:

```bash
git clone https://github.com/Cozy228/token-killer.git
cd token-killer
pnpm install && pnpm build
pnpm setup            # one-time: configures pnpm's global bin dir on PATH
# reload your shell first run only: `source ~/.zshrc` (or ~/.bashrc), or open a new terminal
pnpm add -g .         # puts `tk` on your PATH
```

Then `tk install` auto-detects your agent and picks the highest delivery tier it
supports (a hook where possible, a PATH shim otherwise). Restart your agent afterward.

```bash
tk install            # auto-detect host, wire everything in
tk status             # show what's wired
tk uninstall          # remove it all (add --purge-data to also wipe metrics)
```

Once wired, **compression and session dedup apply automatically** to the commands
your agent runs — no need for it to type `tk` explicitly. `tk install` also drops a
short [`TK.md`](#best-practice-guidance) usage guide so the agent spends tokens well
by default.

You can always invoke it by hand, too:

```bash
tk <the command you would normally run> [...args]
```

`tk` executes the real command, captures stdout/stderr/exit code, compresses
locally, records the savings, and exits with the **original exit code**.

## Build & distribute

`tk`'s `bin` runs the compiled `dist/cli.js`, so every distribution builds first. The
package ships only `dist/` + `README.md` (beyond `package.json`) and has **zero runtime
dependencies** — the tarball is fully self-contained.

**Local dev — link to your working copy:**

```bash
pnpm install && pnpm build
pnpm add -g .          # `tk` -> this repo's dist/  (rebuild after src edits, or use `pnpm dev`)
```

**Hand someone a self-contained tarball:**

```bash
pnpm pack              # -> token-killer-0.1.0.tgz   (the prepack hook rebuilds dist/ first)
```

They install it with no git, build, or deps — then wire it into their agent:

```bash
npm i -g ./token-killer-0.1.0.tgz
tk install
```

On Windows the same tarball works (`npm i -g .\token-killer-0.1.0.tgz`); see
[docs/WINDOWS-TESTER-GUIDE.md](./docs/WINDOWS-TESTER-GUIDE.md) for the end-to-end VS Code +
Copilot test. To publish to a private/internal npm registry for a team (scoped package, auth,
telemetry build args), see [docs/INSTALL.md](./docs/INSTALL.md).

## How it works

```
  Without tk:                                  With tk:

  agent ──"git status"──▶ shell ──▶ git        agent ──"git status"──▶ tk ──▶ git
    ▲                                 │           ▲                    │        │
    │      ~2,000 tokens (raw)        │           │   ~200 tokens      │ filter │
    └─────────────────────────────────┘           └──── (filtered) ────┴────────┘
```

Four command-aware strategies, chosen per tool:

1. **Smart filtering** — drop noise (headers, hints, boilerplate), keep evidence.
2. **Grouping** — aggregate similar items (files by directory, errors by rule).
3. **Truncation** — keep the relevant context, cut redundancy, leave a pointer back
   to the full output.
4. **Session dedup** — when a read-only command is re-run and its output is
   byte-identical to last time, replace the repeat with a one-line marker.

**The guarantee that makes it safe:**

- **Raw output is always a valid result.** Every handler must prove it preserved the
  evidence — or it falls back to passing the command through untouched.
- **Evidence is never deleted, only ever truncated with a pointer.** Every match,
  every diff hunk, every path and line number survives compression. When output is
  too large to send in full, tk collapses it to a summary plus a **pointer to the
  saved raw** — recoverable on demand, never silently dropped.
- **High savings with wrong content is worse than zero savings.** Source files and
  prose, which can't be shrunk losslessly, pass through untouched rather than risk it.

## Examples

All captured from this repo — raw on top, what your agent actually gets below.

**`git log` — one line per commit** _(4,677 → 1,494 chars, −68%)_

```text
$ git log -n 10                                    raw: 4,677 chars
commit eb43692dedadd1c686f010e8259b3314900afe56
Author: Cozy <cozy228@outlook.com>
Date:   Thu Jun 11 01:53:46 2026 +0800
    docs: migrate tk init references to the new install/…
    …4–8 body lines, repeated for all 10 commits…
─────────────────────────────────────────────────  ↓ tk: 1,494 chars
$ tk git log -n 10                          Git Log: 10 commits
eb43692dedad docs: migrate tk init references to install/…
  Cozy <cozy228@…> | Thu Jun 11 01:53:46 2026 +0800
6dbf25d7f086 feat(cli): top-level install/uninstall + passthrough…
  …one line + author per commit, every hash & subject kept…
```

**`rg` (broad) — count header + grouped by file** _(58,059 → 16,412 chars, −72%)_

```text
$ rg import src                                    raw: 58,059 chars
src/cli.ts:2:import { parseArgv } from "./parse.js";
…721 matches, ungrouped, file path repeated on every line…
─────────────────────────────────────────────────  ↓ tk: 16,412 chars
$ tk rg import src
721 matches in 151 files:
src/cli.ts:2:import { parseArgv } from "./parse.js";
src/cli.ts:3:import { routeCommand } from "./router.js";
…grouped by file, every single match preserved…
```

**`read` — signatures only, vs `cat` which passes through** _(21,215 → 1,427 chars, −93%)_

```text
$ tk cat src/cli.ts          → 21,215 chars  (0% — source is never lossy-truncated)
$ tk read --level aggressive src/cli.ts → 1,427 chars  (−93%)
  File: src/cli.ts   Lines: 432
  Symbols:
  - import { parseArgv } from "./parse.js";
  - export async function main(argv: string[]) { … }
  …declarations only, bodies stripped, recoverable via cat/--raw…
```

**`git branch -a` — drops remote-tracking noise** _(129 → 31 chars, −76%)_

```text
$ git branch -a                  $ tk git branch -a
  main                           * token-killer-node-cli
* token-killer-node-cli            main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
  remotes/origin/token-killer-node-cli
```

**`git show` — message + change summary instead of the full patch** _(73,646 → 869 chars, −99%)_

```text
$ tk git show HEAD
commit eb43692dedadd1c686f010e8259b3314900afe56
Author: Cozy <cozy228@outlook.com>   Date: Thu Jun 11 01:53:46 2026 +0800
docs: migrate tk init references to the new install/uninstall/status surface
--- Changes ---
README.md  +5 -5
…one stat line per file; the 73 KB patch is saved, pointer included…
```

**`diff` (large) — collapses to a recoverable pointer** _(15,087 → 162 chars, −99%)_

```text
$ tk diff README.md AGENTS.md
README.md  +182 -153
[full output: ~/.token-killer/projects/repo:…/raw/20260611-…-diff.log]
```

The agent sees the shape of the change instantly; if it needs the hunks, the pointer
re-opens the full output — or `tk --raw <cmd>` re-runs it uncompressed. A **small**
diff is shown in full (hunks preserved); only an over-budget one falls back to the
summary. Nothing is ever lost — only deferred behind a pointer.

## What makes tk different

Beyond per-command compression, `tk` ships three things most proxies don't:

### Session dedup — stop paying twice

When your agent re-runs the same **read-only** command in the same directory and the
compressed output is **byte-identical** to what it last produced, `tk` replaces the
repeat with a marker instead of re-emitting it:

```text
[tk] unchanged since 14:02:11 — same as the earlier `git status` here; full: <pointer>
```

Lossless and recoverable: tk always re-runs the real command and exact-compares the
fresh output, so any real change re-emits in full; a changed exit code is never
deduped. Dedup savings are reported on a **separate line** — never silently summed
with filter savings. Disabled by default; enable with `TK_SESSION_DEDUP=1`.

### Honest measurement — two denominators, both measured

Savings are always **measured** (`raw − delivered`), never estimated, never summed
across ledgers. `tk` answers two different questions:

```bash
tk gain               # opens an HTML report: measured savings, four views side by side
tk gain --text        # same, printed to the terminal instead
tk gain --history     # recent commands + per-command savings (terminal)
tk gain --json        # machine-readable; --csv for spreadsheets
```

`tk gain --session` reports **~27–28%** on real Claude Code sessions — and the
denominator is the session's *unique* content (counted once), so prompt-cache churn
can't inflate the number. (Claude Code / Codex are computable; VS Code shows `n/a` —
its transcripts carry no token usage.)

### Context optimization — the other half

Compression saves tokens at runtime. The other half is **context hygiene**: the
instructions, skills, agents, and editor settings that silently bloat *every*
request before any command runs.

```bash
tk inspect            # read-only audit (opens an HTML report); --text for the terminal
tk inspect --advice   # ranked, actionable findings (with --text)
tk optimize           # preview plan from the audit
tk optimize --apply   # apply safe, mechanical fixes (backs up first)
tk optimize --restore # revert
```

`tk optimize` **downshifts each rule to the narrowest place it still works**
(always-on instruction → path-scoped → on-demand). User-level by default; add
`--project` to include the current repo. It never edits your project repo unless
asked.

## Usage

```bash
tk git status
tk git diff
tk diff old.txt new.txt
tk rg "submitOrder" src
tk cat package.json
tk read --level balanced src/cli.ts
tk ls .
tk npm test
tk tsc --noEmit
tk npx tsc --noEmit
tk dotnet test
tk deps
tk err npm run build
tk summary npm test
tk smart src/main.ts
```

## Flags

```bash
tk --raw <command...>          # run WITHOUT any compression (debugging / exact bytes)
tk --stats <command...>        # append a token-savings summary (+ saved raw-output path)
tk --max-lines 200 <command...>
tk --max-chars 12000 <command...>
tk --save-raw <command...>     # always snapshot the full output
tk --no-save-raw <command...>
tk --help
tk --version
```

`## Token Savings` is **not** printed by default. It appears only with `--stats`.

## VS Code settings

`tk inspect` flags VS Code's built-in terminal-output compression
(`chat.tools.compressOutput.enabled`) when it's off, and `tk optimize --apply`
turns it on for you (backs up first; `--restore` reverts) — no dedicated flag.

<a id="best-practice-guidance"></a>

## Best-practice guidance (`TK.md`)

`tk install` delivers a short usage guide so the agent prefers terse forms
(`git status --short`, `git log --oneline`, `rg -c`) and reads `gain` honestly. It
writes:

- **`TK.md`** — the usage guide, in your config dir.
- A **guard-wrapped, idempotent block** wired into the agent's instruction file
  (`CLAUDE.md` for Claude Code, `copilot-instructions.md` for Copilot / VS Code).
  Re-running replaces the block; `tk uninstall` removes it. Your own content is never
  touched.

## Handler coverage

Each command below has a dedicated, evidence-preserving handler. Anything without one
(piped commands, unknown tools) runs **raw** — never fabricated.

- **read-like:** `cat`, `type`, `less`
- **explicit read:** `read --level minimal|balance|balanced|aggressive`
- **list-like:** `ls`, `dir`, `find`, `tree`
- **search-like:** `rg`, `grep`
- **diff:** `diff`
- **git:** `git status`, `git diff`, `git log`, `git show`, `git branch`
- **python:** `pytest`, `ruff`, `mypy`, `pip` list/freeze
- **js/ts:** `npm` / `pnpm` / `yarn` test, `vitest`, `jest`, `eslint`, `tsc`,
  `npm` / `pnpm` / `yarn` list
- **java:** `mvn` / maven, `gradle`, `javac`
- **dotnet:** `dotnet` (test, test --logger trx, msbuild -bl, format)
- **generic wrappers:** `err <cmd>`, `summary <cmd>`, `test <cmd>`, `deps`,
  `smart <file>`, `npx <tool>`
- **generic fallback** for everything else

## Recover the original

A dedup marker or a truncated handler **always** carries a pointer to the saved raw
output. `tk --raw <command>` re-runs without any compression when you need the exact
bytes.

## Learn more

- [docs/PRINCIPLES.md](./docs/PRINCIPLES.md) — the product rationale (why
  evidence-first, why command-aware).
- [docs/DESIGN.md](./docs/DESIGN.md) — the implementation contracts every handler
  must satisfy.
