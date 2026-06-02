# Token Guard

**Copilot cost-control CLI for usage-based billing.**

Token Guard reduces avoidable GitHub Copilot token spend by guiding agent workflows toward compact command output, bounded file reads, shorter prompts, and reviewable project instructions.

GitHub announced that Copilot moves to usage-based billing on June 1, 2026. GitHub AI Credits are consumed based on token usage, including input, output, and cached tokens. For agentic coding, noisy tool output is no longer just annoying. It is expensive.

Read the announcement: [GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/).

## What Token Guard Does

Token Guard is a CLI companion for Copilot. Developers keep using VS Code Copilot, Copilot CLI, and GitHub-hosted agent workflows. `tg` sits beside those tools to:

- install supported hooks;
- suggest compact shell commands;
- run token-friendly command wrappers;
- scan token-heavy skills and instructions;
- report avoidable context waste;
- restore its project changes when needed.

It does not replace Copilot or require developers to learn a new coding assistant.

## Expected Savings

Actual savings depend on repository size, command habits, and hook support. The table below shows the kind of waste Token Guard is designed to reduce in a typical agent-heavy coding session.

| Operation | Raw workflow | With `tg` | Typical reduction |
| --- | ---: | ---: | ---: |
| Search results | 8,000 tokens | 1,500 tokens | 80% |
| File reads | 20,000 tokens | 6,000 tokens | 70% |
| Test output | 25,000 tokens | 2,500 tokens | 90% |
| Git diff/status | 8,000 tokens | 2,000 tokens | 75% |
| Logs | 12,000 tokens | 2,000 tokens | 80% |

These are estimates for product planning, not billing guarantees.

## Installation

Internal preview distribution is expected to use npm. On Windows, npm exposes `tg` through the normal `tg.cmd` shim.

```powershell
npm install -g @company/token-guard
```

Verify the install:

```powershell
tg --version
tg config show
```

## Quick Start

Initialize Token Guard in a repository:

```powershell
tg init --mode balanced
```

Check what was configured:

```powershell
tg hook status
tg config show
```

Use Copilot normally. When a supported hook can intervene, Token Guard suggests compact commands. Developers can also run compact wrappers directly.

## How It Works

Without Token Guard:

```text
Copilot -> shell command -> raw output -> model context
```

With Token Guard:

```text
Copilot -> tg suggestion or compact wrapper -> filtered output -> model context
```

Token Guard applies four strategies:

1. **Filtering**: remove progress bars, repeated lines, boilerplate, and generated noise.
2. **Bounding**: cap file reads, search results, logs, and command output.
3. **Grouping**: group errors, warnings, test failures, and search matches by file or category.
4. **Reporting**: show where the session spent or saved context.

## Commands

### Search

```powershell
tg rg "submitOrder"
```

Searches the repo while applying ignore rules and compact output limits. Use this instead of raw `rg` when an agent only needs relevant matches.

### File Reads

```powershell
tg cat src/order/submit.ts --head 160
tg cat src/order/submit.ts --around submitOrder
```

Reads a bounded slice of a file instead of dumping the whole file into context.

### Tests

```powershell
tg test "npm test"
tg test "pnpm test"
```

Keeps failures, errors, and summaries while dropping repetitive passing output and progress noise.

### Git

```powershell
tg diff
```

Shows changed files and useful hunks without flooding the agent with the entire patch when it is not needed.

### Logs

```powershell
tg logs app.log
```

Keeps errors, warnings, timeouts, and repeated-line summaries. Useful before pasting logs into Copilot.

### Generic Compaction

```powershell
some-command | tg compact
```

Applies Token Guard's generic output filter to command output from tools that do not yet have a dedicated wrapper.

### Analytics

```powershell
tg report
```

Shows suggested commands, compacted output, blocked waste, and estimated savings.

## Examples

**Search output**

```text
# raw rg
120 matches across 34 files, including generated and dependency output

# tg rg
34 files matched, showing top 40 lines
src/order/submit.ts:42 submitOrder(...)
src/order/useSubmitOrder.ts:18 submitOrder(...)
```

**Test output**

```text
# raw npm test
hundreds of passing tests, progress lines, setup logs, and one failure

# tg test "npm test"
FAILED: 1 suite, 2 tests
src/order/submit.test.ts
  - rejects duplicate submit
  - preserves idempotency key
```

**Logs**

```text
# raw logs
10,000 lines with repeated heartbeat and polling messages

# tg logs app.log
ERROR x3 payment timeout
WARN x18 retry scheduled
INFO repeated heartbeat x8,421
```

## Project Setup Commands

Install or inspect hooks:

```powershell
tg hook init
tg hook status
```

Patch or restore `AGENTS.md`:

```powershell
tg agentsmd patch
tg agentsmd restore
```

Scan skills:

```powershell
tg skill scan
tg skill optimize --dry-run
```

Apply skill changes only after reviewing the proposed patch:

```powershell
tg skill optimize --apply
tg skill restore
```

## Modes

Token Guard supports three rollout modes:

| Mode | Behavior |
| --- | --- |
| `passive` | Only reports and suggests. Good for evaluation. |
| `balanced` | Suggests most of the time and blocks obvious waste. Recommended default. |
| `strict` | Enforces stronger limits for teams that want tighter cost control. |

Change mode:

```powershell
tg config set mode balanced
```

## Supported Copilot Surfaces

Hook behavior depends on what the host exposes.

| Surface | Expected behavior |
| --- | --- |
| VS Code Copilot Chat / Agent | Hook can suggest or update supported shell commands when the host allows it. |
| GitHub Copilot CLI | Hook may need to deny with a compact-command suggestion, then let the agent retry. |
| GitHub-hosted coding agent | Support depends on the available hook and instruction surface. |
| No hook support | Developers can still run `tg` wrappers directly. |

## Windows

Token Guard is designed for Windows enterprise rollout:

- npm installation creates a normal `tg.cmd` shim;
- commands work in PowerShell and Windows Terminal;
- project setup should be reversible;
- hook behavior may vary by Copilot surface.

## Command Reference

Core:

```powershell
tg init
tg hook init
tg hook status
tg config show
tg config set mode balanced
tg report
```

Compact wrappers:

```powershell
tg rg
tg cat
tg test
tg diff
tg logs
tg compact
```

Project helpers:

```powershell
tg agentsmd patch
tg agentsmd restore
tg skill scan
tg skill optimize --dry-run
tg skill optimize --apply
tg skill restore
```

Preview commands:

```powershell
tg plan
tg impl
tg review
```

## Restore

Token Guard should be reversible. Use restore commands to remove project changes:

```powershell
tg agentsmd restore
tg skill restore
tg hook remove
```

By default, Token Guard appends small marked blocks, creates reviewable patches, and avoids replacing existing agents or skills.

## Privacy

Token Guard should not record source code, prompts, raw logs, secrets, or file contents. Reports should store command categories, byte counts, policy decisions, and estimated savings only.

## Documentation

- [DESIGN.md](./DESIGN.md): implementation design and product decisions.

## Status

Token Guard is an internal preview tool. Hook behavior differs between VS Code Copilot Chat, Copilot CLI, and GitHub-hosted agent surfaces, so some features may be advisory rather than fully automatic.
