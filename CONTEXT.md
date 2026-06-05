# Token Guard

Token Guard (`tg`) is a local Copilot cost-control companion. It reduces unconscious
token inflation in GitHub Copilot workflows through a command proxy, a hook runtime, and
a read-only session scanner. This glossary fixes the project's canonical vocabulary; it
is not a spec and carries no implementation detail.

## Surfaces

**Command proxy**:
The `tg <command>` entry point that runs a real command and compresses its output.
_Avoid_: wrapper, RTK clone.

**Hook runtime**:
The Layer 2 surface that sits inside the Copilot tool-call loop, governing tool events
before and after they run. Distinct from the command proxy.
_Avoid_: plugin, middleware.

**Inspect**:
The read-only `tg inspect` scanner over local Copilot session evidence. Diagnostic only,
never enforcement.
_Avoid_: audit, monitor.

## Delivery

How the agent comes to invoke the [Command proxy](#surfaces) at all. The proxy is the
same code regardless of delivery; these terms name the wiring in front of it.

**Delivery tier**:
One of the three ordered ways the proxy reaches the agent, used in strict preference
order: **Hook** (the [Hook runtime](#surfaces), when the host's hooks are enabled and
fire), then **Shim**, then **Instruction injection**. A host uses the highest tier it
can actually support; lower tiers are fallbacks, not parallel paths.
_Avoid_: mode, channel, layer (overloaded with "Layer 2").

**Shim**:
A delivery tier that places per-tool wrapper executables (`git`, `git.cmd`, …) ahead of
the real tools on the agent's PATH; each wrapper just calls `tg <tool> "$@"`. Host-agnostic
and deterministic (0-token, 100% coverage), unlike injection. The proxy, not the wrapper,
decides whether to compress.
_Avoid_: wrapper (the wrapper file is one part of the shim), RTK shim (RTK has none).

**Instruction injection**:
The lowest delivery tier: a `.github/copilot-instructions.md` (or equivalent) telling the
model to prefix commands with `tg`. Relies on model compliance, so coverage is
probabilistic — the fallback when neither hook nor shim is available.
_Avoid_: prompt hack, CLAUDE.md mode.

**Passthrough**:
A proxy invocation that runs the real tool with inherited stdio (`stdio: inherit`,
including the TTY) and does **no** capture or compression. The safe path for interactive
commands and for any invocation that does not match a specific handler. Distinct from
`--raw`, which still captures then reprints.
_Avoid_: raw (means capture-then-print here), inherit.

**Specific match**:
A [Command proxy](#surfaces) routing outcome where the command matched a real handler
(e.g. `git-commit`, `tsc`) rather than falling through to the generic handler. Only a
specific match is eligible for compression; a generic fall-through is a
[Passthrough](#delivery) candidate.
_Avoid_: handler match (every command "matches" generic), routed.

**Interactive command**:
An invocation that needs the terminal to function — an editor (`git commit` without
`-m`/`-F`), an in-place rebase (`rebase -i`), a patch picker (`add -p`), a login prompt
(`*login`), or a pager. Detected by a TTY gate (the proxy's stdout is a TTY) plus a small
explicit denylist, and always [Passthrough](#delivery)'d, never captured.
_Avoid_: TTY command, raw command.

## Hosts and dialects

**Host**:
A Copilot surface that invokes Token Guard hooks. The two in scope are Copilot CLI and
VS Code Copilot Chat. GitHub Copilot hooks are one unified system shared across them.
_Avoid_: editor, client, IDE.

**CLI dialect**:
The camelCase payload convention used by Copilot CLI: `toolName`, `toolArgs` (JSON
string), `toolResult`, event names like `preToolUse`.
_Avoid_: camelCase format.

**VS Code dialect**:
The snake_case payload convention used by VS Code Copilot Chat: `tool_name`,
`tool_input`, `tool_response`, event names like `PreToolUse`.
_Avoid_: snake_case format.

## Tool events

**Tool event**:
The host-agnostic normalized representation of one tool invocation, produced by the
normalizer from either dialect. Carries kind, tool name, input, optional result, cwd,
session, and optional model.
_Avoid_: payload, hook input.

**Shell execution**:
A tool event whose entry point runs a raw shell/terminal command string (Copilot CLI
`bash`, VS Code `run_in_terminal`). The only kind eligible for command rewrite.
_Avoid_: terminal command, powershell layer.

**Direct tool action**:
A structured tool call that does work without becoming a shell command (`read_file`,
`grep_search`, `list_dir`, `apply_patch`, `fetch_webpage`). Governed by policy and
result projection, never by shell rewrite.
_Avoid_: native tool, builtin tool.

**Workflow signal**:
An observation about session behavior rather than a single action (repeated reads, skill
invocation, transcript coverage). An inspect concept, not a hook input.
_Avoid_: pattern, metric.

**Tool category**:
The single canonical classification of a tool event — `read`, `search`, `list`, `edit`,
`execute_adjacent`, `web`, `agent-orchestration`, `metadata`, `other`. One shared
classifier produces it for both the hook runtime and inspect; the hook's handling
strategy is derived from the category, never from a parallel enum.
_Avoid_: kind, type (as a second enum).

## Decisions and output

**Decision**:
The governance verdict the hook runtime reaches for a tool event: `allow`, `deny`, `ask`,
`rewrite`, or `suggest`. An internal representation, translated per host on the way out.
_Avoid_: action, result, permission.

**Projection**:
Reshaping a tool result into a shorter form that retains all critical content, or
returning raw when that is not possible. The posttool counterpart to command-proxy
filtering.
_Avoid_: compression (when content may be dropped), summary.

**Fail-open**:
Token Guard's own stance: any internal parse/config/policy error resolves to `allow`,
never a crash. Note the host's own failure mode may differ (Copilot CLI preToolUse is
fail-closed on crash/timeout), so the runtime must catch internally and emit explicit
`allow` rather than letting the process die.
_Avoid_: safe mode, default-allow.

## Evidence and recovery

**Raw evidence**:
Full commands, arguments, result text, paths, session ids, and repository names. Excluded
from default output and from telemetry; available only via explicit per-run opt-in.
_Avoid_: raw data, logs.

**Local recovery store**:
The user-level store of raw evidence and metrics used for recovery and measurement. Never
counted as provider token savings; never a model-input cache.
_Avoid_: cache (unqualified).

**User-level**:
Scope of every Token Guard write — `~/.token-guard/` for data, `~/.copilot/hooks/` for
hook wiring. The project repository is never written.
_Avoid_: global, local.

## Compression operations and evidence classes

These distinctions separate what `tg` always does from what RTK does that `tg` must
not blindly inherit. RTK collapses all of it under one word, "truncation".

**Noise-removal**:
Dropping output that does not change the agent's next action — ANSI, progress bars,
spinners, repeated blank lines, decorative borders, the verbose list of *passed*
tests, fully duplicate log lines, deterministically irrelevant directories
(`node_modules`, `.git`, `dist`). Lossless with respect to evidence; always permitted.
This is the core of `tg`'s [Projection](#decisions-and-output).
_Avoid_: truncation (the word hides whether evidence was dropped).

**Evidence-capping**:
Showing the first N items of an evidence set and marking the rest with an overflow marker
(`+N more`, `[+N more]`, `[N more lines]`, bare `+N`). **Banned outright in `tg`** — it is
the "fake completeness" PRINCIPLES.md forbids, and recovery does not redeem it. RTK's
always-on `CAP_*` constants and every `+N more` marker are removed. The only over-budget
reductions allowed are the **over-budget ladder** below.
_Avoid_: truncation, trimming, cap.

**Over-budget ladder**:
What a handler may do when the full listing exceeds the token budget, in order:
1. **Lossless reduction** — de-dup repeated lines, drop decoration/formatting, or (location-
   class) drop match content while keeping *every* location. No item is hidden.
2. **Complete-replacement summary** — if still over budget, replace the listing with an
   aggregate that hides no item dishonestly: a count (optionally per-file/per-group counts)
   plus the snapshot pointer. It shows *no partial list*.
A handler never shows "first N items + `+N more`". Step 2 is honest because it does not
pretend a partial list is complete; it shows none of the list and names where the full set is.
_Avoid_: cap-and-mark, top-N preview.

**Location-class evidence**:
Evidence whose value *is* the place the agent will open or edit: grep/rg matches,
`tsc`/`eslint`/`ruff`/`mypy` diagnostics, `file:line` references, diff hunks. **Never
evidence-capped.** Delivered in full, or as a lossless digest plus a raw pointer.
_Avoid_: search results, hits (when the class boundary matters).

**Flat all-evidence list**:
A list where every item is fully evidence and there is no content-vs-location split to
exploit and (over budget) no decoration left to drop: `pip list`, package-manager `list`,
`docker images`, `aws` resource lists, branch names, env `key=value`. Listed in full below
budget. Over budget it has no lossless reduction left, so it goes straight to a
**complete-replacement summary** (count + snapshot pointer) — never a top-N preview with
`+N more`. See the [over-budget ladder](#compression-operations-and-evidence-classes).
_Avoid_: list output (too broad — `git log` subjects are not flat all-evidence lists).

**Stream-class evidence**:
A temporally-ordered, unbounded log stream (`docker`/`kubectl`/`compose logs`, the file
`log` handler) where repeated lines are noise but every *unique* error/warning line is
evidence. Its only reduction is **de-duplicating repeated lines** (lossless); it never caps
with `+N more`. If the de-duped stream still exceeds budget, it goes to a complete-
replacement summary (counts by severity + snapshot pointer), never a truncated tail. A live
follow (`-f`/`--follow`) cannot be captured and passes through.
_Avoid_: log output (ambiguous with the file-`log` handler), inventory, tail.

**Lossless capture**:
The rule that a handler's capture-time command rewrite may only make output *more*
machine-readable (grep `-n`/`-H`, `docker ps --format`, `kubectl -o json`) and must
never drop evidence before `tg` sees it. Injecting a lossy fetch limit (`logs --tail N`)
is forbidden — it pre-truncates the very snapshot the [Recovery contract](#evidence-and-recovery)
relies on, so no later channel can recover what was never captured.
_Avoid_: capture filter (it does not filter, it must preserve).

**Lossless digest**:
A reformat of a large location-class set that retains every individual location while
dropping only repetition/formatting — e.g. "247 matches in 12 files" followed by every
`file:line`. A per-file *count* with line numbers dropped is **not** lossless and does
not qualify; it discards location evidence.
_Avoid_: summary, sample.

**Recovery contract**:
The condition that lets an overflow marker exist at all (per
[PRINCIPLES.md](docs/PRINCIPLES.md) and the audit prompt): the same turn persists
[Raw evidence](#evidence-and-recovery) **and** the compressed output names how to read
it back. The inline pointer cites the **persisted snapshot file path** (the exact bytes
the digest was derived from), not a `tg --raw <cmd>` re-run — a re-run re-executes the
command and can drift from what the agent is looking at once the repo changes mid-turn.
_Avoid_: re-run pointer (it can drift); raw pointer alone (the persisted store must exist).
