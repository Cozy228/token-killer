# Contexa (`ctx`)

Contexa reduces the command output your coding agent has to read.

Install it once, wire it into Claude Code, Copilot CLI, or VS Code, then keep using
your agent normally. `ctx` runs locally, keeps the real command exit code, and saves
the original output when it needs to shorten a large result.

## Install from a private registry

Your team should install the packaged build from your internal npm registry:

```bash
npm install -g @your-org/contexa
ctx --version
ctx install
```

`ctx install` auto-detects the current host and uses the best delivery tier it can:
hook, shim, or instruction injection. Restart your agent after install.

Useful install commands:

```bash
ctx doctor             # check install and metrics health
ctx doctor --fix       # repair broken delivery and stale metrics
ctx install --project  # add project-level guidance in the current repo
ctx uninstall          # remove ctx-installed artifacts
```

Data and config live under `~/.contexa/`. Set `CONTEXA_HOME` to use a
different location.

For publishing and registry setup, see [docs/INSTALL.md](./docs/INSTALL.md).

## Compress command output

After install, supported agent-run commands are compressed automatically. The agent
does not need to type `ctx`.

You can also run commands through `ctx` yourself:

```bash
ctx git status
ctx git diff
ctx rg "submitOrder" src
ctx npm test
ctx tsc --noEmit
ctx err npm run build
ctx summary npm test
```

`ctx` captures stdout, stderr, and the exit code, compresses the output, records the
savings, then exits with the real command's exit code.

Use these flags when you need control:

```bash
ctx --raw <command...>       # print raw output, no compression
ctx --stats <command...>     # append savings and raw-output path
ctx --save-raw <command...>  # save the full raw output
ctx --max-lines 200 <command...>
ctx --max-chars 12000 <command...>
```

TTY note: `ctx` normally compresses non-interactive, non-TTY command output. VS Code
Copilot runs terminal tools inside a TTY, so `ctx install --host vscode` writes
`CTX_COMPRESS_TTY=1` into the VS Code integrated-terminal environment. That opts the
agent terminal into compression while interactive commands still pass through raw.

## Inspect token-saving opportunities

Use `inspect` when you want to know where your agent setup is wasting context or
missing compression.

```bash
ctx inspect          # opens an HTML report
ctx inspect --text   # print the report in the terminal
ctx inspect --advice # show ranked action items
```

`inspect` is read-only. It scans recent agent sessions, user or project guidance,
skills, prompts, and editor settings, then reports the biggest token-saving
opportunities it can prove from local data.

If you want `ctx` to apply safe context-file changes, run:

```bash
ctx optimize           # preview the plan
ctx optimize --apply   # apply deterministic changes, with backups
ctx optimize --restore # revert the last optimize backup
```

## Measure gain

Use `gain` after your agent has run commands through `ctx`.

```bash
ctx gain            # opens an HTML report for the current project
ctx gain --text     # terminal summary
ctx gain --history  # recent commands and per-command savings
ctx gain --json     # machine-readable output
ctx gain --csv      # spreadsheet-friendly output
ctx gain --user     # aggregate across projects
```

`gain` reports measured savings from local history. The main command-output number is
`raw output - delivered output`. Session-level views use their own denominator and are
shown separately, so command savings and session savings are not silently combined.

## Benchmarks

These numbers were measured on this repo. Your numbers will vary with command shape
and output size.

| command                              |    raw |     ctx | savings | how                              |
| ------------------------------------ | -----: | -----: | ------: | -------------------------------- |
| `git show HEAD`                      | 73,646 |    869 |     99% | large commit to summary + pointer |
| `diff README.md AGENTS.md`           | 15,087 |    162 |     99% | large diff to summary + pointer |
| `read --level aggressive src/cli.ts` | 21,215 |  1,427 |     93% | signatures only, bodies stripped |
| `git branch -a`                      |    129 |     31 |     76% | strips tracking noise |
| `rg import src` (721 matches)        | 58,059 | 16,412 |     72% | count header + grouped by file |
| `git log -n 10`                      |  4,677 |  1,494 |     68% | one line per commit |
| `ls -la node_modules`                |  1,670 |    811 |     51% | drops perms, owner, size columns |
| `find src -name '*.ts'`              |  4,050 |  2,050 |     49% | tightened paths |

0% can be the correct result. `ctx` does not pad output just to show savings, and it
does not guess at content it cannot shrink safely.

| command                | savings | why 0% is correct |
| ---------------------- | ------: | ----------------- |
| `cat src/cli.ts`       |      0% | source code passes through |
| `cat README.md`        |      0% | prose passes through |
| `git status` (clean)   |     ~0% | already terse |
| `rg` (tiny result set) |     ~0% | a few matches can be cheaper raw |

## What gets compressed

`ctx` has dedicated handlers for common developer commands:

- `git status`, `git diff`, `git log`, `git show`, `git branch`
- `rg`, `grep`, `find`, `tree`, `ls`, `dir`
- `cat`, `type`, `less`, and `read --level minimal|balanced|aggressive`
- `npm`, `pnpm`, `yarn`, `npx`, `vitest`, `jest`, `eslint`, `tsc`
- `pytest`, `ruff`, `mypy`, `pip`
- `mvn`, `gradle`, `javac`, `dotnet`
- wrappers such as `err <cmd>`, `summary <cmd>`, `test <cmd>`, `deps`, and `smart`

Unknown commands run raw. If a handler cannot preserve the useful evidence, it falls
back to raw output.

## Recover the original output

When `ctx` truncates a large result or deduplicates a repeated command, it includes a
pointer to the saved raw output. You can also re-run any command without compression:

```bash
ctx --raw <command...>
```

## Local development

Use this only when working on Contexa itself:

```bash
pnpm install
pnpm run build
npm link
ctx --version
```

Run the install smoke test from the repo:

```bash
pnpm run test:install
```

Create a package tarball:

```bash
pnpm pack
```

Only `dist/`, `README.md`, and `package.json` are included in the package.

## Examples

These examples show raw command output first, then what the agent receives from
`ctx`.

### `git log`

Raw `git log -n 10` is 4,677 chars in this sample. `ctx` returns 1,494 chars by
keeping one line per commit.

```text
$ git log -n 10
commit eb43692dedadd1c686f010e8259b3314900afe56
Author: Cozy <cozy228@outlook.com>
Date:   Thu Jun 11 01:53:46 2026 +0800
    docs: migrate ctx init references to the new install/...
    ...body lines repeated for all 10 commits...

$ ctx git log -n 10
Git Log: 10 commits
eb43692dedad docs: migrate ctx init references to install/...
  Cozy <cozy228@...> | Thu Jun 11 01:53:46 2026 +0800
6dbf25d7f086 feat(cli): top-level install/uninstall + passthrough...
  ...one line + author per commit, every hash and subject kept...
```

### `rg`

A broad `rg import src` produced 721 matches and 58,059 raw chars in this sample.
`ctx` returned 16,412 chars by grouping matches by file.

```text
$ rg import src
src/cli.ts:2:import { parseArgv } from "./parse.js";
...721 matches, ungrouped, file path repeated on every line...

$ ctx rg import src
721 matches in 151 files:
src/cli.ts:2:import { parseArgv } from "./parse.js";
src/cli.ts:3:import { routeCommand } from "./router.js";
...grouped by file, every match preserved...
```

### `read` and `cat`

`cat` passes source through. `read --level aggressive` gives the agent a cheaper
symbol view.

```text
$ ctx cat src/cli.ts
21,215 chars, 0% savings

$ ctx read --level aggressive src/cli.ts
File: src/cli.ts   Lines: 432
Symbols:
- import { parseArgv } from "./parse.js";
- export async function main(argv: string[]) { ... }
...declarations only, bodies stripped, recoverable via cat or --raw...
```

### `git show`

Large patches collapse to a commit summary plus a raw-output pointer.

```text
$ ctx git show HEAD
commit eb43692dedadd1c686f010e8259b3314900afe56
Author: Cozy <cozy228@outlook.com>   Date: Thu Jun 11 01:53:46 2026 +0800
docs: migrate ctx init references to the new install/uninstall/status surface
--- Changes ---
README.md  +5 -5
...one stat line per file; the full patch is saved and linked...
```

### Large `diff`

Small diffs keep hunks. Over-budget diffs collapse to a summary plus pointer.

```text
$ ctx diff README.md AGENTS.md
README.md  +182 -153
[full output: ~/.contexa/projects/repo:/raw/20260611-...-diff.log]
```

## Details

### Runtime architecture

```text
Without ctx:                                  With ctx:

agent -> "git status" -> shell -> git        agent -> "git status" -> ctx -> git
  ^                              |             ^                         |
  |          raw output          |             |      compressed output   |
  +------------------------------+             +-------------------------+
```

`ctx` sits between the agent and the real command. It runs the command, captures
stdout, stderr, and exit code, applies a command-specific handler when one exists,
records the savings, and returns the real exit code.

Management commands such as `install`, `inspect`, `optimize`, `gain`, `telemetry`,
and `support` are loaded only when called. The compression path stays small because
it runs on every shimmed command.

### Compression mechanism

`ctx` uses command-aware compression instead of generic summarization:

1. Smart filtering drops repeated headers, progress noise, and boilerplate while
   keeping the command evidence.
2. Grouping combines repeated shapes, such as search matches by file or package
   output by dependency section.
3. Truncation keeps the useful frame and writes a pointer to the saved raw output
   when the full result is too large.
4. Session dedup replaces a repeated read-only command with a recoverable marker
   when the fresh output is byte-identical to the prior output.

Handlers are allowed to shrink output only when they can preserve the useful
evidence. Source files, prose, tiny outputs, unknown tools, and risky shapes can pass
through raw with 0% savings.

### Safety contract

- Raw output is always a valid result. If compression fails, `ctx` falls back to the
  real command output.
- Paths, line numbers, diff file names, test failures, and exit codes must survive.
- Large output is saved before it is shortened. The compressed result carries a
  pointer back to the raw file.
- `ctx --raw <command...>` re-runs a command without compression when you need exact
  bytes.

Session dedup is separate from command compression. When enabled, a repeated
read-only command with byte-identical output is replaced with a recoverable marker.
Enable it with:

```bash
CTX_SESSION_DEDUP=1
```

Dedup savings are reported separately from filter savings. A changed exit code is
not deduped.

### Guidance files

`ctx install` writes a short `CTX.md` usage guide into the config directory and wires a
guarded reference into the host's instruction file. Re-running install replaces only
the managed block. `ctx uninstall` removes the managed block and leaves your own
content alone.

The guide nudges agents toward cheaper commands such as `git status --short`,
`git log --oneline`, and `rg -c`, and tells them how to read `gain` without mixing
measurement denominators.

Network telemetry is opt-in unless your internal build changes the default at compile
time. Check the current setting with:

```bash
ctx telemetry status
```

More detail:

- [docs/INSTALL.md](./docs/INSTALL.md) covers private registry publishing and internal builds.
- [docs/PRINCIPLES.md](./docs/PRINCIPLES.md) explains the evidence-first product rules.
- [docs/DESIGN.md](./docs/DESIGN.md) documents handler and runtime contracts.
