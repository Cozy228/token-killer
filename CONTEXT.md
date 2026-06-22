# Token Killer

Token Killer (`tk`) is a local Copilot cost-control companion. It reduces unconscious
token inflation in GitHub Copilot workflows through a command proxy, a hook runtime, and
a read-only session scanner. This glossary fixes the project's canonical vocabulary; it
is not a spec and carries no implementation detail.

## Surfaces

**Command proxy**:
The `tk <command>` entry point that runs a real command and compresses its output.
_Avoid_: wrapper, RTK clone.

**Hook runtime**:
The Layer 2 surface that sits inside the Copilot tool-call loop, governing tool events
before and after they run. Distinct from the command proxy.
_Avoid_: plugin, middleware.

**Inspect**:
Token Killer's single read-only analysis entry, `tk inspect`, runnable anywhere. It runs
every analyzer over two evidence classes: [Runtime evidence](#evidence-classes) (local
Copilot session history, always analyzed) and [Static context](#evidence-classes). Static
context is [scope](#evidence-classes)-aware: the default scope is **user-level** global
context; `--project` selects the current repo. Diagnostic only, never enforcement; it
produces one unified set of [Findings](#findings-and-optimization).
_Avoid_: audit, monitor, session scanner (it is no longer session-only).

**codemap**:
tk's project-local code-intelligence product (one complete, bounded product — never sliced by
version). A unified canonical backend over git-tracked source feeds two co-equal Required
surfaces: the [Agent Surface](#surfaces) and the [codeguide](#surfaces). The backend holds
four Required, capability-bounded knowledge layers — [Code Graph layer](#codemap-layers),
[Behavior Graph](#codemap-layers), [Domain Graph](#codemap-layers), [Evidence
Graph](#codemap-layers) — each with real producers, `file:line` anchors, and an authority
level. It is not an API gateway and does not intercept Copilot's built-in `read_file` / `search`.
The full binding spec is `docs/codemap/codemap-action-plan-20260620.md` (Product Contract).
_Avoid_: context gateway (the broad "wrap every tool output" framing — deliberately rejected),
direct tool projection (hook-time rewriting of host-owned tool results); **"codegraph" (lowercase,
`@colbymchenry/codegraph`) = the MIT reference assimilated into the backend, not tk's product**
([ADR 0017](docs/adr/0017-source-assimilate-codegraph.md)).

**Additive retrieval tool**:
A `tk`-owned tool the agent may choose instead of broad search/read loops, exposed through the
[Agent Surface](#surfaces) (VS Code LM Tool API primary, hand-rolled stdio MCP secondary). It is
additive because the host still owns its built-in tools; `tk` can describe and guide these tools
but cannot force Copilot to use them. The default surface is **four operation-contract tools** —
`tk_explore` (primary exploration), `tk_search` (cheap search), `tk_node` (precise node read),
`tk_callers` (reverse calls) — the codegraph-validated set (tiny repos drop to three). Each tool
compiles narrow parameters into an internal [QueryPlan](#codemap-layers); the six [projection
profiles](#codemap-layers) are QueryPlan presets, **not** tool names. Domain/Evidence layers are
reached via `tk_explore.layers` / `tk_node.include`, not new tools, until tk's own harness proves a
dedicated tool earns its place ([ADR 0029](docs/adr/0029-agent-tool-surface-operation-contracts-queryplan.md)).
_Avoid_: direct tool interception, modifiedResult, gateway, intent classifier (the agent picks a
tool + narrow params; tk does not guess intent); profile-as-tool-name (profiles are internal presets).

**Canonical store**:
The local materialized read model for the [codemap](#surfaces), kept out-of-tree under
`~/.token-killer/projects/<fingerprint>/`. It materializes FactClaims, identity bindings,
ArbitrationDecisions, canonical edges, and function-local CFG/def-use/effect facts; cross-function
flow, impact paths, Context Packets, and query-local PageRank are computed per query, not stored.
Exact read slices still come from the live workspace source file.
_Avoid_: source cache, vector store, in-repo index, graph index (superseded), overlay on an
external DB (the backend is tk's own unified store, not a layer over codegraph's DB).

**Agent Surface**:
The Required, action-oriented face of the [codemap](#surfaces): a sparse, token-budgeted
projection the agent consumes through [additive retrieval tools](#surfaces). One Repository
Intelligence Core is reached through **two asymmetric adapters** sharing one [QueryPlan](#codemap-layers)
+ result contract: **`tk mcp`** — the host-neutral hand-rolled zero-dependency stdio JSON-RPC MCP
reference adapter (Claude Code, Codex CLI, all terminal hosts); and the **VS Code extension** — the
Copilot-specific managed adapter (Language Model Tool API + programmatic MCP; value = VS Code APIs +
install + editor integration). The actual entry point is decided by **org policy**, not fixed —
extension-tools-allowed / MCP-only / extension-only / both-banned (→ CLI + codeguide only) — with no
duplicated retrieval ([ADR 0031](docs/adr/0031-asymmetric-dual-adapter-delivery.md)).
_Avoid_: gateway, extension-as-global-primary (entry is policy-determined), the second product (it
shares the backend with the codeguide but not the final Context Packet).

**codeguide**:
The Required, **read-only**, bounded understanding face of the [codemap](#surfaces). It provides
human-specific navigation and read models over all four [layers](#codemap-layers) — Repository
Overview / Symbol Inspector / Flow Inspector / Domain Inspector / Evidence Drawer — but owns no
separate truth, indexing, arbitration, authored-content lifecycle, arbitrary graph exploration, or
collaboration workflow. Deep drill-down is on-demand; the capability boundary is closed.
_Avoid_: wiki, editor, collaboration surface (those are [outside current product
scope](#codemap-layers)); generic graph debugger; second indexing/arbitration pipeline.

## codemap layers

The four Required, capability-bounded knowledge layers of the [codemap](#surfaces) backend, plus
the governing vocabulary. Anchor: `#codemap-layers`.

**Code Graph layer**:
Deterministic structure from tree-sitter — symbols, calls, imports, inheritance,
override/implements, symbol-level reads/writes/returns — each with a precise `file:line` span.

**Behavior Graph**:
A closed Behavior IR: Structural Execution (all supported languages), Intraprocedural CFG and
scalar def-use (Behavior language set: TS/JS/TSX/JSX, Python, Java, C#, Go), and Dispatch/Effect
over a **closed framework profile catalog**. Outside the catalog records `coverage=unspecified`.
_Avoid_: PDG, taint analysis, whole-program analysis (all [unsupported](#codemap-layers)).

**Domain Graph**:
A Deterministic Domain Core (operational with no LLM — entities, resources, glossary terms,
candidates) plus on-demand host-LLM Semantic Promotion (Inferred, non-load-bearing). Static only
produces what it can prove: `ContextCandidate` not `BoundedContext`, `UseCaseSkeleton`,
`RuleCandidate`.
_Avoid_: business model (the deterministic core names candidates, not confirmed business truth).

**Evidence Graph**:
The connective layer: producers submit immutable **FactClaims**; an independent arbitration layer
produces a reconstructible canonical view. Every fact carries source/revision/producer/authority/
confidence/freshness and typed support/conflict relations.
_Avoid_: provenance string (it is a claim+arbitration model, not a single tag).

**Authority level**:
A fact's credibility tier, coexisting in one product (never a development phase): **Observed**
(direct source fact), **Derived** (computed — CFG, clustering), **Inferred** (host-LLM proposal),
**Confirmed** (authoritative document or human-approved).
_Avoid_: phase, stage, version.

**Capability state**:
The only allowed way to describe a capability (see Terminology Law in the Product Contract):
**Required**, **Optional at runtime**, **On-demand**, **Profile-specific**, **Capability-bounded**,
**Unsupported**, **Outside current product scope**, **Implementation dependency**.
_Avoid_: v1, v2, MVP, thin slice, 留槽, defer, roadmap phase — all banned; complexity is controlled
by capability boundaries, build order by implementation dependencies.

**FactClaim** / **CanonicalSymbol** / **ArbitrationDecision** / **canonical view**:
A **FactClaim** is an immutable producer assertion. A **CanonicalSymbol** is a stable opaque-ID
identity (a SCIP symbol is external identity only, never replacing it). An **ArbitrationDecision**
is a materialized canonical edge referencing supporting + conflicting claims, chosen by a
predicate-specific policy with declared cardinality (single / set / possible-set). The **canonical
view** is the reconstructible accepted-edge graph that ranking, behavior, and projection read.
_Avoid_: merged edge (raw claims are never fused), best-match (arbitration is cross-producer, typed).

**Selection Graph** vs **Projection Graph**:
All four layers participate in candidate retrieval, ranking, and disambiguation (**Selection**), but
only facts the current [projection profile](#codemap-layers) needs are serialized into agent
context (**Projection**). A layer earns a profile's default output budget only by a measured
improvement in correctness or [portable utility](#hosts-and-dialects) — never on
[proxy-host](#hosts-and-dialects) token savings alone ([ADR 0022](docs/adr/0022-measurement-and-claim-boundaries.md)).
_Avoid_: force-feed (projecting every layer into every answer — it inflates tokens and defeats the
token-saving goal).

**QueryPlan**:
The internal protocol every [additive retrieval tool](#surfaces) compiles its narrow parameters
into; never exposed to the agent. It has three orthogonal dimensions: **selection** (which
[layers](#codemap-layers) to query), **traversal** (graph direction — callers / callees / flow /
impact), and **projection** (output mode — understanding / editing / verification × locations /
outline / source / evidence). Decomposing it this way is why the six profiles are presets, not
tools: they mix dimensions (locate/understand are goals, flow/impact are traversal, domain is a
layer, verify is a trust mode) ([ADR 0029](docs/adr/0029-agent-tool-surface-operation-contracts-queryplan.md)).
_Avoid_: CodeQuery (the rejected single-tool monolith), purpose enum (flattens the three dimensions).

**Projection profile**:
A named **QueryPlan preset** (internal, not an agent-declared tool name): **locate** (leanest —
code anchors + trust envelope), **understand** (bounded Behavior slice + Domain labels), **flow** /
**impact** / **domain** / **verify** (promote Behavior / Domain / Evidence respectively). The agent
selects a profile implicitly by choosing a tool + narrow params, not by naming it. The char budget
is a hard ceiling, not a fill quota; at the cap it returns omitted counts + expansion handles, never
a silent truncation.
_Avoid_: dump, fill-to-budget, profile-as-tool-name.

## Delivery

How the agent comes to invoke the [Command proxy](#surfaces) at all. The proxy is the
same code regardless of delivery; these terms name the wiring in front of it.

**Delivery tier**:
One of the three ordered ways the proxy reaches the agent, used in strict preference
order: **Hook** (the [Hook runtime](#surfaces), when the host's hooks are enabled and
fire), then **Shim**, then **Instruction injection**. A host uses the highest tier it
can actually support; lower tiers are fallbacks, not parallel paths.
_Exception ([ADR 0012](docs/adr/0012-vscode-hook-shim-additive-delivery.md)):_ a host that
supports several **complementary** tiers may install them together — VS Code runs **hook + shim**
additively (shim primary/authoritative, hook an additive enhancement). `selectTier` then expresses
preference order, not exclusivity.
_Avoid_: mode, channel, layer (overloaded with "Layer 2").

**Shim**:
A delivery tier that places per-tool wrapper executables (`git`, `git.cmd`, …) ahead of
the real tools on the agent's PATH; each wrapper just calls `tk <tool> "$@"`. Host-agnostic
and deterministic (0-token, 100% coverage), unlike injection. The proxy, not the wrapper,
decides whether to compress.
_Avoid_: wrapper (the wrapper file is one part of the shim), RTK shim (RTK has none).

**Instruction injection**:
The lowest delivery tier: a `.github/copilot-instructions.md` (or equivalent) telling the
model to prefix commands with `tk`. Relies on model compliance, so coverage is
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
A Copilot surface that invokes Token Killer hooks. The two in scope are Copilot CLI and
VS Code Copilot Chat. GitHub Copilot hooks are one unified system shared across them.
_Avoid_: editor, client, IDE.

**Proxy host** vs **Target host**:
An [evaluation](#hosts-and-dialects)-role distinction (not the hook sense of [Host](#hosts-and-dialects)
above). The **proxy host** is **Claude Code headless** — the only runner that exposes clean
`uncached_input_tokens`, so it is where the [codemap](#surfaces)'s token deltas are measured. The
**target host** is **VS Code Copilot on Windows** — the surface the product is primarily optimized for,
which exposes no clean token (only [opportunity facts](#metrics-ledgers)). A token number measured on the
proxy carries a footer and never speaks as a target number; product defaults are decided by
correctness + Copilot/human-observable [portable utility](#hosts-and-dialects), not by the proxy token
alone ([ADR 0022](docs/adr/0022-measurement-and-claim-boundaries.md)).
_Avoid_: test host, runner, eval host (use proxy/target host).

**Portable utility**:
The host-independent value signals that decide product defaults: human task signals (`hit@1`,
`time-to-file`) and [target-host](#hosts-and-dialects)-observable signals (tool calls, avoided raw
reads, expansion requests, payload reduction). It is the primary axis for whether a layer earns a
profile's default budget; [proxy-host](#hosts-and-dialects) token savings are only a guardrail and
tie-breaker.
_Avoid_: token savings (that is the proxy-only secondary signal), benchmark score.

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
returning raw when that is not possible. The same retention-first contract as
command-proxy filtering; posttool result projection is not built (see DESIGN
"明确不做").
_Avoid_: compression (when content may be dropped), summary.

**Fail-open**:
Token Killer's own stance: any internal parse/config/policy error resolves to `allow`,
never a crash. Note the host's own failure mode may differ (Copilot CLI preToolUse is
fail-closed on crash/timeout), so the runtime must catch internally and emit explicit
`allow` rather than letting the process die.
_Avoid_: safe mode, default-allow.

## Metrics ledgers

Token Killer's value accounting. Four separate accounts, shown side by side and **never
summed**; honesty is the moat, so a measured number is never added to an estimated one.

**Ledger**:
One of the four independent value accounts Token Killer keeps: **measured command savings**
(account ①), **optimizer deltas** (②), **governance opportunities** (③), and **quality
guardrails** (④). Each is independently serializable and rendered as its own section; no
ledger references another's totals. The read-side join is [Report](#metrics-ledgers).
_Avoid_: total, score, value (as a single combined figure).

**Report**:
`tk report` — the read-only command that joins all four [Ledgers](#metrics-ledgers) into four
separate sections with no grand total and no cross-ledger arithmetic. Distinct from
[`tk gain`](#metrics-ledgers), which renders ledger ① alone. It owns no new storage; it reads
the existing scattered stores.
_Avoid_: dashboard, summary (it deliberately produces no single summary number).

**Gain**:
`tk gain` — the ledger-①-only analytics surface (RTK-`gain` parity): measured command
savings over time, per-project, per-handler. The only place `saved_tokens` is a valid name.
_Avoid_: report (that is the four-ledger superset).

**estimate_kind**:
The provenance tag every ledger figure carries: `measured` (a real diff or count) versus
`opportunity` / `heuristic` (an estimate). It is what physically separates the accounts so a
measured figure is never silently combined with an estimate.
_Avoid_: confidence (a multiplier — banned in ②), accuracy.

**exposure_class**:
How often a [Context surface](#findings-and-optimization) loads, recorded as a **category and
never a multiplier**: `always-on` (instructions/`AGENTS.md`/`CLAUDE.md`/stable prompt prefix),
`path-scoped` (`*.instructions.md` with `applyTo`), `on-invocation` (prompts/agents/skills).
The optimizer-delta ledger uses it to qualify a trim without manufacturing a `load_count`.
_Avoid_: load_count, frequency, weight (it is none of these; it never multiplies a token total).

**saved_tokens**:
The measured `raw − delivered` token figure of a single compressed command. Reserved for
ledger ① alone; no other ledger or output field may use this name.
_Avoid_: reusing for estimates, optimizer deltas, or governance figures.

## Evidence and recovery

**Raw evidence**:
Full commands, arguments, result text, paths, session ids, and repository names. Excluded
from default output and from telemetry; available only via explicit per-run opt-in.
_Avoid_: raw data, logs.

**Support bundle**:
The diagnostic artifact `tk support` assembles to share with whoever a deployment routes
support to — the machine-state diagnostic (environment, delivery health, the proxied
command history with its captured output, recent crashes), home directory scrubbed. It carries full
technical evidence but **never any chat-prompt text**; tk only opens a pre-filled mail
draft, Teams chat, or GitHub issue referencing it and never transmits — the user sends by hand, and
that act is the explicit per-run opt-in [Raw evidence](#evidence-and-recovery) requires.
_Avoid_: support report (collides with [Report](#reporting-and-telemetry)), crash report.

**Local recovery store**:
The user-level store of raw evidence and metrics used for recovery and measurement. Never
counted as provider token savings; never a model-input cache.
_Avoid_: cache (unqualified).

**User-level**:
Scope of every Token Killer write — `~/.token-killer/` for data, `~/.copilot/hooks/` for
hook wiring. The project repository is never written.
_Avoid_: global, local.

## Evidence classes

The two evidence classes [Inspect](#surfaces) covers. Both flow into one unified
[Finding](#findings-and-optimization) set; `source` distinguishes them.

**Runtime evidence**:
Local Copilot session history and tool-call records — the behavioral evidence inspect has
always scanned (terminal commands, direct tool reads/searches, prompt/output volume).
Findings carry `source = runtime` and aggregate metrics.
_Avoid_: session evidence (now one class of two), telemetry.

**Static context**:
The context **surfaces** Copilot loads into the model as instructions, prompts, agents, or
skills — read from files, not session storage. Findings carry `source = static_context` and a
[Context surface](#findings-and-optimization) locator. Reading these files is not source-code
analysis; only curated context files are read, never arbitrary source.
_Avoid_: repo context (that is the opt-in lightweight-metadata add-on), source scan.

**Scope**:
Which static-context files Inspect reads. **User scope** (the default) is global context that
loads into every session — `~/.claude/CLAUDE.md`, `~/.claude/skills`,
`~/.copilot/copilot-instructions.md`; it is the default because it has the highest token
leverage. **Project scope** (`--project`) is the current repo's `.github/**`, `AGENTS.md`,
`CLAUDE.md`, `GEMINI.md`. The two persist to separate buckets so global findings are never
duplicated per project. [Runtime evidence](#evidence-classes) is orthogonal to scope and
always analyzed.
_Avoid_: level, global/local (overloaded — use user/project scope).

## Findings and optimization

**Finding**:
One unified diagnostic record inspect emits, across both [evidence classes](#evidence-classes).
Carries `id`, `source`, `type`, `severity`, `confidence`, `evidence`, `recommendation`, and
a [Fix class](#findings-and-optimization). The persisted unified report is what
[Optimize](#findings-and-optimization) consumes.
_Avoid_: recommendation (one of its fields), issue, warning.

**Context surface**:
The narrowest place a static-context rule belongs — `.github/copilot-instructions.md`
(always-on), `.github/instructions/*.instructions.md` (path-specific), `.github/prompts`,
`.github/agents`, a Claude skill, or the stable prompt prefix. The optimizer's stance is to
move each rule to the narrowest surface that still enforces it.
_Avoid_: file, location, layer.

**Adapter**:
The ecosystem a single finding's mechanism belongs to (`copilot`, `claude`, `gemini`,
`codex`, `generic`). Tagged per finding by the surface/mechanism, never by file name — so a
shared `AGENTS.md` carries `generic` bloat findings yet `copilot` findings for Copilot-only
mechanisms like `applyTo`. A Claude-only skill field is never recommended as a Copilot feature.
_Avoid_: ecosystem (use adapter), target (overloaded).

**Fix class**:
How a finding may be acted on: `safe_mechanical` (user-level/managed marker writes only),
`suggested_diff` (printed, never auto-written to project files), `advisory` (judgment call
for the team), `delivery` (a runtime finding whose action is installing shim/hook via
`tk init`), or `non_goal`.
_Avoid_: severity (orthogonal), action.

**Optimize**:
The downstream consumer `tk optimize context`. It reads inspect's persisted unified report
(or triggers a full inspect when absent), takes only `source = static_context` findings, and
applies safe mechanical fixes or emits suggested diffs/advice. Never a second scanner.
_Avoid_: optimizer scan, fixer, rewriter (it does not rewrite project files by default).

## Compression operations and evidence classes

These distinctions separate what `tk` always does from what RTK does that `tk` must
not blindly inherit. RTK collapses all of it under one word, "truncation".

**Noise-removal**:
Dropping output that does not change the agent's next action — ANSI, progress bars,
spinners, repeated blank lines, decorative borders, the verbose list of *passed*
tests, fully duplicate log lines, deterministically irrelevant directories
(`node_modules`, `.git`, `dist`). Lossless with respect to evidence; always permitted.
This is the core of `tk`'s [Projection](#decisions-and-output).
_Avoid_: truncation (the word hides whether evidence was dropped).

**Evidence-capping**:
Showing the first N items of an evidence set and marking the rest with an overflow marker
(`+N more`, `[+N more]`, `[N more lines]`, bare `+N`). **Banned outright in `tk`** — it is
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
never drop evidence before `tk` sees it. Injecting a lossy fetch limit (`logs --tail N`)
is forbidden — it pre-truncates the very snapshot the [Recovery contract](#evidence-and-recovery)
relies on, so no later channel can recover what was never captured.
_Avoid_: capture filter (it does not filter, it must preserve).

**Lossless digest**:
A reformat of a large location-class set that retains every individual location while
dropping only repetition/formatting — e.g. "247 matches in 12 files" followed by every
`file:line`. A per-file *count* with line numbers dropped is **not** lossless and does
not qualify; it discards location evidence.
_Avoid_: summary, sample.

## Reporting and telemetry

**Ledger**:
One of four value accounts Token Killer keeps separately — ① measured command savings,
② optimizer deltas, ③ governance opportunities, ④ quality guardrails. Displayed side by
side, **never summed**; honesty is the moat. The field `saved_tokens` names a quantity in
ledger ① and nowhere else.
_Avoid_: total value, combined savings, grand total.

**Gain**:
The user-facing savings-analytics command (`tk gain`), scoped to [ledger](#reporting-and-telemetry)
① only — measured command savings read from `history.jsonl` (summary, per-project `--user`,
time buckets, graph, history, failures, quota). It never sums across ledgers and never invents
estimates. Distinct from `tk report`, the future four-ledger superset.
_Avoid_: report (that is the four-ledger view), stats.

**Device hash**:
The anonymous, stable, purgeable install identifier carried only by opt-in network
[telemetry](#reporting-and-telemetry) — `SHA-256` of a one-time random salt held in
`telemetry-state.json`. It contains no hostname, username, or path, and exists so an
enterprise operator can count installs and retention. `tk telemetry purge` resets it.
_Avoid_: device id, machine id, installation id (the inspect-v1 disallowed term this supersedes).

**Telemetry consent**:
Two independent opt-ins, neither implying the other: `telemetryExport` (write the aggregate
payload to a local file) and `telemetry` (upload it over the build-time endpoint). Network
upload requires `telemetry` true **and** a non-empty baked-in endpoint; otherwise it writes
the local file and warns. A user who enabled only local export is never silently upgraded to
network upload.
_Avoid_: telemetry flag (ambiguous between the two), tracking.

**Recovery contract**:
The condition that lets an overflow marker exist at all (per
[PRINCIPLES.md](docs/PRINCIPLES.md) and the audit prompt): the same turn persists
[Raw evidence](#evidence-and-recovery) **and** the compressed output names how to read
it back. The inline pointer cites the **persisted snapshot file path** (the exact bytes
the digest was derived from), not a `tk --raw <cmd>` re-run — a re-run re-executes the
command and can drift from what the agent is looking at once the repo changes mid-turn.
_Avoid_: re-run pointer (it can drift); raw pointer alone (the persisted store must exist).
