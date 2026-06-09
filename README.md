# tk

`tk` is Token Killer: a local command proxy that kills noisy agent output without killing evidence — and stops re-billing you for output you've already seen.

```bash
tk <original command> [...args]
```

The command after `tk` is the command you would normally run. `tk` executes it, captures stdout/stderr/exit code, compresses output locally, records token savings, and exits with the original command exit code.

## Principles

1. Retention before compression.
2. Raw output is always a valid result.
3. Never hide actionable facts behind placeholders.
4. Command-aware beats generic summarization.
5. Compress structure and noise, not evidence.
6. Full diffs, full matches, and source content are passthrough by default.
7. Every handler must prove preservation or fall back to raw.
8. High savings with wrong content is worse than zero savings.
9. Evaluation is based on agent next-action equivalence.
10. Deterministic, local, test-first.

See [docs/PRINCIPLES.md](./docs/PRINCIPLES.md) for the product rationale and [docs/DESIGN.md](./docs/DESIGN.md) for the implementation contracts.

## Install

Wire `tk` into your agent (Claude Code / Copilot CLI / VS Code) — it picks the
highest delivery tier available per host:

```bash
tk init            # auto-detect host, install
tk init --show     # show what's wired
tk init --uninstall
```

Once wired, compression **and session dedup** apply automatically to the agent's
commands. `tk gain` shows measured savings; `tk gain --history` lists recent runs.

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
tk --raw <command...>
tk --stats <command...>
tk --verbose <command...>
tk --max-lines 200 <command...>
tk --max-chars 12000 <command...>
tk --save-raw <command...>
tk --no-save-raw <command...>
tk --no-dedup <command...>
tk --report
tk --report --json
tk --report --csv
tk --help
tk --version
```

`## Token Savings` is not printed by default. It appears only with `--stats`, `--verbose`, or `--report`.

## Session dedup

When an agent re-runs the same **read-only** command in the same directory and the
compressed output is **byte-identical** to what it last produced, `tk` replaces the
repeat with a one-line marker instead of re-emitting it:

```text
[tk] unchanged since 14:02:11 — same as the earlier `git status` here; full: <pointer>
```

Lossless and recoverable: the full output was already delivered earlier in the
session; `tk` always re-runs the command and exact-compares the fresh output (any
real change re-emits in full), and the marker carries a pointer back to the saved
original. A changed exit code is never deduped.

- `tk --raw <command>` bypasses dedup (and all compression).
- `TK_SESSION_DEDUP=0` (or the config key) disables it.
- Dedup savings show as a **separate line** in `tk gain` — never summed with filter savings.

## Optimize your agent's context

Compression saves tokens at runtime. The other half is **context hygiene** — the
instructions, skills, agents, and editor settings that silently bloat every request.

```bash
tk inspect                # read-only audit: runtime sessions + static context files
tk inspect --advice       # ranked, actionable findings
tk optimize               # dry-run plan from the audit
tk optimize --apply       # apply safe, mechanical fixes (backs up first)
tk optimize --restore     # revert
```

`tk inspect` scans both your agent's session history (what wasted tokens at runtime)
and your static context files (instructions / prompts / agents / skills).
`tk optimize` consumes that audit and **downshifts each rule to the narrowest place it
still works** (always-on instruction → path-scoped → on-demand). User-level by
default; add `--project` to include the current repo. It never edits your project repo
unless asked.

## Best-practice guidance

`tk init` delivers a short usage guide so the agent spends tokens well by default —
prefer terse forms (`git status --short`, `git log --oneline`, `rg -c`), read `gain`
honestly. It writes:

- **`TK.md`** — the usage guide, in your config dir.
- A **guard-wrapped, idempotent block** wired into the agent's instruction file
  (`CLAUDE.md` for Claude Code, `copilot-instructions.md` for Copilot / VS Code).
  Re-running replaces the block; `tk init --uninstall` removes it. Your own content is
  never touched. `tk optimize --token-budget-block` keeps the block in sync.

## VS Code settings

```bash
tk optimize --vscode-settings            # advisory review
tk optimize --vscode-settings --apply    # apply (backs up first)
tk optimize --vscode-settings --restore  # revert
```

- **One setting is auto-changed and one-click reversible**: VS Code's built-in
  terminal-output compression (`chat.tools.compressOutput.enabled`).
- Riskier ones are **advice-only** — too many auto-loaded instruction files
  (`chat.includeReferencedInstructions`), extra readable dirs
  (`github.copilot.chat.additionalReadAccessFolders`), MCP auto-discovery
  (`chat.mcp.discovery.enabled`), a high per-request tool budget
  (`chat.agent.maxRequests`). `tk` flags them; you decide.

## Measure savings — two honest denominators

`tk` answers two different questions, both from **measured** `raw − delivered` (never
estimated, never summed across the four ledgers):

**Per command** — `tk gain` — of a command's output, how much `tk` squeezed:

| command      | savings |
| ------------ | ------: |
| `rg` (broad) |   88.5% |
| `git log`    |     82% |
| `git status` |     39% |
| `git diff`   |     24% |

Range is ~60–90% on dev commands; an already-terse form (`git status --short`)
healthily shows ~0% — `tk` doesn't pad what's already minimal.

**Per session** — `tk gain --session` — of the whole session's token usage after you
onboarded `tk` (not just one command's output), `tk` saves **~27–28%** on real Claude
Code sessions. The denominator is the session's **unique content** — what would
actually enter context without `tk`, counted once — so prompt-cache churn doesn't
inflate it. (`tk` reaches ~40% of that content, shell output, and compresses ~67% of
it.) Per host: Claude Code / Codex computable; VS Code shows `n/a` (no token usage in
its transcripts).

```bash
tk gain               # per-command savings
tk gain --session     # per-session footprint savings (+ --json)
tk gain --history     # recent commands
tk gain report        # full report (--scope user|project|runtime, --json, --csv)
```

## Current Handler Coverage

Implemented:

- read-like: `cat`, `type`, `less`
- explicit read: `read --level minimal|balance|balanced|aggressive`
- list-like: `ls`, `dir`, `find`, `tree`
- search-like: `rg`, `grep`
- diff: `diff`
- git status
- git diff
- git log
- git show
- git branch
- pytest
- ruff
- mypy
- pip list/freeze
- npm/pnpm/yarn test, vitest, jest
- eslint
- tsc
- npm/pnpm/yarn list
- mvn/maven
- gradle
- javac
- dotnet (test, test --logger trx, msbuild -bl, format)
- generic wrappers: `err <cmd>`, `summary <cmd>`, `test <cmd>`, `deps`, `smart <file>`, `npx <tool>`
- generic fallback

Planned:

- broader fixture corpus for every handler
- more real-command integration tests when optional tools are installed
- per-handler raw-save and filter-fallback tests

## Recover the original

A dedup marker or a truncated handler always carries a pointer to the saved raw
output. `tk --raw <command>` re-runs without any compression when you need the
exact bytes.
