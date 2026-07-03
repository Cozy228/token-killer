# pi-context-prune

> Source: <https://github.com/championswimmer/pi-context-prune>
> Fetched: 2026-06-26

A [Pi coding-agent](https://github.com/badlogic/pi-mono) extension that
**summarizes completed tool-call batches**, prunes raw tool outputs from future
LLM context, and exposes a `context_tree_query` escape hatch to recover any
original output on demand.

## Related Extensions

- **[pi-context-usage](https://github.com/championswimmer/pi-context-usage)** —
  Visualizes the current size of your LLM context and breaks it down to show
  exactly what is taking up space (system prompt, user messages, tool calls,
  tool results, etc.). The perfect way to see *why* you need pruning, and to
  inspect context before/after a prune to measure savings.
- **[pi-cache-graph](https://github.com/championswimmer/pi-cache-graph)** —
  Plots your provider's prefix cache hits and misses as a live graph inside the
  TUI. Lets you see the real-time effect of your chosen `pruneOn` mode on cache
  stability.

## Why

As long agent sessions grow, every tool call adds token-heavy output to the
context window. Most of it is not needed verbatim after the first use. This
extension:

1. **Detects** when an assistant turn finishes calling tools (`turn_end`).
2. **Summarizes** that batch of tool calls using your configured model.
3. **Injects** a compact hidden summary message before the next LLM call
   (`deliverAs: "steer"`).
4. **Prunes** the original verbose tool outputs from future context
   (`context` event).
5. **Preserves** every original output in the session index — retrievable at any
   time via `context_tree_query`.

The session file is never modified. Pruning only affects the next request's
context build.

## Installation

```bash
# Install from npm (stable releases)
pi install npm:pi-context-prune        # global (all projects)
pi install -l npm:pi-context-prune     # current project only

# Install from GitHub (cutting-edge / main branch)
pi install git:github.com/championswimmer/pi-context-prune
pi install -l git:github.com/championswimmer/pi-context-prune

# Try without installing
pi -e npm:pi-context-prune             # this session only, no install
pi -e git:github.com/championswimmer/pi-context-prune

# From source (development)
git clone https://github.com/championswimmer/pi-context-prune
cd pi-context-prune
pi -e .

# Manage installed extensions
pi list
pi remove pi-context-prune
```

Once installed, the extension is auto-loaded every time you run `pi`. No flags
needed. To upgrade, re-run the install command.

## Prune-On Modes

The extension supports five trigger modes controlling **when** summarization and
pruning happen.

### Cache-aware guidance

This extension rewrites the **future request context** by replacing old raw
`toolResult` messages with a compact summary. That saves tokens, but it also
changes the prompt prefix seen by the model.

On providers with **prefix / prompt caching** (for example Anthropic-style
prompt caching), cache hits require the earlier prompt prefix to stay identical.
If you keep changing earlier context, the provider has to recompute from the
point of change onward, which means **higher latency, higher input cost, and
fewer cache hits**. In other words: pruning too often can save tokens in-context
while still hurting overall performance by repeatedly busting the provider cache.

That is why **`agent-message` is the default**: it batches a whole stretch of
tool work, prunes **once** when the agent is done and sends a final text reply,
and then leaves the new shorter context stable again. You usually pay one cache
bust per meaningful work batch instead of one cache bust per tool turn.

References:
- Anthropic prompt caching docs: <https://docs.claude.com/en/docs/build-with-claude/prompt-caching>
- AWS Bedrock prompt caching overview: <https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html>
- `pi-context` extension: <https://github.com/ttttmr/pi-context>

### Mode trade-offs

| Mode | Trigger | Pros | Cons / cache impact | Recommendation |
|------|---------|------|---------------------|----------------|
| `every-turn` | Immediately after each tool-calling turn | Smallest raw context as fast as possible; easiest to reason about | Busts prompt cache the most often; adds summarizer latency every turn; can cost more overall despite saving context tokens | **Debugging only.** |
| `on-context-tag` | When `context_checkpoint` is called | Align pruning with explicit milestones / save-points; fewer cache busts than `every-turn` if you tag sparingly | Only auto-triggers if you have `pi-context` installed (provides `context_checkpoint`; legacy `context_tag` still recognized); tagging too often still churns cache; forgetting → pending batches grow | Good if you already use `pi-context` and think in checkpoints |
| `on-demand` | Only when you run `/pruner now` | Maximum manual control; easiest to preserve cache; good for long investigations | Easy to forget; pending batches can grow large; you must manage timing | Advanced users wanting explicit control |
| `agent-message` | When the agent sends a final text-only response, or the loop ends | Best balance of automation, savings, cache friendliness; batches many turns into one prune; future requests highly cacheable again | No mid-batch reclaim; very long runs before final reply can grow more than aggressive modes | **Recommended default.** |
| `agentic-auto` | The model decides by calling `context_prune` | Lets the agent compact before context grows; good for long autonomous runs when the model is disciplined | Depends on model judgment; over-calling churns cache like `every-turn`; less predictable | Good for long autonomous sessions after prompt-tuning |

### How each mode works

- **`every-turn`** — Every tool-calling turn is summarized and pruned
  immediately. Intentionally aggressive; useful for debugging/validating
  summaries, but usually rewrites the prompt prefix too frequently and hurts
  provider-side prompt caching.
- **`on-context-tag`** — Tool-call turns are queued until `context_checkpoint`
  is called, then all pending batches are summarized in one LLM call and pruned
  together. Meant to pair with `pi-context`. Legacy tool name `context_tag` is
  still recognized.
- **`on-demand`** — Tool-call turns are batched but never summarized
  automatically. You decide when to flush with `/pruner now`. Most manual, and
  easiest to keep cache-friendly.
- **`agent-message`** — Tool-call turns are batched. When the agent finally
  replies with a normal text answer (no tool calls), all pending batches are
  summarized and pruned together. If the loop ends first, a safety-net flush
  runs on `agent_end`. Default because it usually causes just one context
  rewrite per meaningful task batch.
- **`agentic-auto`** — The `context_prune` tool is activated and exposed to the
  LLM. The system prompt tells the model to use it only after a meaningful batch
  of related tool calls, not after every small step.

## Commands

The extension registers the `/pruner` command:

| Command | Effect |
|---------|--------|
| `/pruner` | Interactive picker over all subcommands |
| `/pruner settings` | Opens an interactive settings overlay |
| `/pruner on` | Enable pruning |
| `/pruner off` | Disable pruning |
| `/pruner status` | Show enabled state, summarizer model, thinking level, prune trigger, cumulative stats |
| `/pruner model` | Show current summarizer model |
| `/pruner model <id>` | Set summarizer model (e.g. `anthropic/claude-haiku-3-5`) |
| `/pruner model <id>:<thinking>` | Set summarizer model and thinking together (e.g. `openai/gpt-5-mini:low`) |
| `/pruner thinking` | Show current summarizer thinking level |
| `/pruner thinking <level>` | Set summarizer thinking (`default`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`) |
| `/pruner prune-on` | Interactive picker over all trigger modes |
| `/pruner prune-on <mode>` | Set trigger mode directly |
| `/pruner stats` | Show cumulative summarizer token/cost stats |
| `/pruner tree` | Browse pruned tool calls in a foldable tree browser; `Ctrl-O` on a summary opens it in a bordered overlay |
| `/pruner now` | Flush pending tool calls immediately (all modes) with a live progress overlay showing streamed received-character counts per batch |
| `/pruner help` | Show full help text |

### Settings overlay

`/pruner settings` opens a TUI overlay with five interactive items:

1. **Enabled** — toggle pruning on/off
2. **Prune status line** — show/hide the footer status widget and queued-turn notifications
3. **Prune trigger** — cycle through all five `pruneOn` modes
4. **Summarizer model** — Enter opens a searchable submenu listing `"default"` plus all available models
5. **Summarizer thinking** — cycle through the thinking/reasoning level for summarizer calls

All changes are saved immediately to `~/.pi/agent/context-prune/settings.json`.

## Tools

### `context_tree_query`

When pruning is on, the LLM sees compact summary messages instead of raw tool
outputs. Each summary ends with short aliases such as:

```
Summarized tool refs: `t1`, `t2`
Use `context_tree_query` with these refs to retrieve the original full outputs.
```

Those short refs are mapped back to the real `toolCallId`s in the summary
message metadata. The LLM only sees the short refs in future context; the full
IDs stay in the stored details used by `context_tree_query` and internal
tree/browser recovery. The tool is always available when the extension is loaded.

### `context_prune` (agentic-auto mode only)

When `pruneOn` is `agentic-auto`, the `context_prune` tool is activated and made
available to the LLM (removed from the active tool list in all other modes).
When the model calls it:

- All pending tool-call batches are summarized together (parallel one-call-per-batch
  by default, or sequentially in `/pruner now` so the overlay can show live progress).
- While running, compact live progress is streamed into the tool output box
  (e.g. `Context prune running… batch 2/4 · 1.2k chars received`).
- If the summary is smaller than the raw tool-result text it would replace, the
  originals are pruned from future context and a summary message is injected as
  a steer.
- If the summary is larger, pruning is skipped for that range: the original tool
  results remain, but the prune frontier still advances so the next attempt
  starts after that range instead of retrying it forever.

## Configuration

Config is stored in `~/.pi/agent/context-prune/settings.json` (global,
project-independent):

```json
{
  "enabled": false,
  "showPruneStatusLine": true,
  "summarizerModel": "default",
  "summarizerThinking": "default",
  "pruneOn": "agent-message",
  "remindUnprunedCount": true
}
```

| Key | Values | Default |
|-----|--------|---------|
| `enabled` | `true` / `false` | `false` |
| `showPruneStatusLine` | `true` / `false` | `true` |
| `summarizerModel` | `"default"` or `"provider/model-id"` | `"default"` |
| `summarizerThinking` | `"default"`, `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` | `"default"` |
| `pruneOn` | `"every-turn"`, `"on-context-tag"`, `"on-demand"`, `"agent-message"`, `"agentic-auto"` | `"agent-message"` |
| `remindUnprunedCount` | `true` / `false` | `true` |

- `showPruneStatusLine: true` keeps the prune footer widget and queued-turn
  notice visible.
- `remindUnprunedCount: true` appends a small ephemeral `<pruner-note>` to the
  last tool result before each LLM call to remind the model of the number of
  unpruned tool calls in context. Only effective in `agentic-auto`.
- `summarizerModel: "default"` means the current active Pi model.
- `summarizerThinking: "default"` adds no explicit thinking option. `"off"`
  requests no reasoning where supported; `"minimal"`/`"low"` are best for cheap
  background summarization.

### Choosing a Summarizer Model

The default reuses whatever model you have active in Pi — **convenient but
wasteful**: you don't need a powerful coding model to write a bullet-point
summary. **Rule of thumb: pick the smallest/fastest model available on your
plan.**

| Subscription / API plan | Recommended summarizer model |
|-------------------------|------------------------------|
| GitHub Copilot / Codex | `openai/gpt-4.1-mini` or `google/gemini-2.5-flash` or `xai/grok-3-fast` |
| OpenRouter | `openrouter/qwen/qwen3-30b-a3b` (fast MoE, very cheap) |
| Anthropic direct | `anthropic/claude-haiku-3-5` |
| Google AI direct | `google/gemini-2.5-flash` |

```bash
/pruner model openai/gpt-4.1-mini
/pruner thinking low
/pruner model openai/gpt-4.1-mini:low   # both at once
```

## Architecture

```
index.ts                    — entry point, wires events + modules
src/
  types.ts                  — shared types, constants, PruneOn modes
  config.ts                 — load/save ~/.pi/agent/context-prune/settings.json
  batch-capture.ts          — serialize turn_end event → CapturedBatch
  summarizer.ts             — resolve model, call LLM, build summary text
  indexer.ts                — Map<toolCallId, ToolCallRecord> + session persistence
  pruner.ts                 — filter context event messages
  query-tool.ts             — context_tree_query tool registration
  context-prune-tool.ts     — context_prune tool registration (agentic-auto)
  frontier.ts               — persisted prune-frontier tracker
  stats.ts                  — StatsAccumulator for cumulative token/cost tracking
  tree-browser.ts           — foldable tree browser for /pruner tree
  commands.ts               — /pruner command + settings overlay + message renderer
```

### Event flow

```
session_start
  └─► loadConfig() · indexer.reconstruct() · statsAccum.reconstruct()
      · frontier.reconstruct() · syncToolActivation()
session_tree
  └─► reconstruct index/stats/frontier (branch may differ) · clear pendingBatches
turn_end (tool calls present + enabled)
  └─► captureBatch() · trim against index/frontier · push to pendingBatches
      · if every-turn: flushPending() · else notify pending count + trigger
tool_execution_end (context_checkpoint / legacy context_tag, on-context-tag)
  └─► flushPending()
agent_end
  └─► update footer status only if batches remain pending
context_prune tool call (agentic-auto)
  └─► flushPending()
flushPending()
  └─► scan branch for completed unpruned tool results (incl. mid-turn subsets)
  └─► trim against index/frontier · summarizeBatches() → summary + usage
  └─► compare summary chars vs raw tool-result chars
  └─► if smaller: persist index + inject summary, advance frontier
  └─► if larger: keep originals, skip writes, still advance frontier
  └─► statsAccum.add()/persist()
context (enabled + index non-empty)
  └─► pruneMessages() — remove toolResult messages in the index
before_agent_start (agentic-auto)
  └─► append AGENTIC_AUTO_SYSTEM_PROMPT to system prompt
```

### Session persistence

- **Config** in `~/.pi/agent/context-prune/settings.json` (extension's own file).
- **Index** via `pi.appendEntry("context-prune-index", { toolCalls })` — one
  entry per summarized batch, NOT in LLM context.
- **Prune frontier** via `pi.appendEntry("context-prune-frontier", …)` — records
  the last attempted prune boundary even when an oversized summary is rejected.
- **Summaries** injected as hidden `custom_message` entries with
  `customType: "context-prune-summary"` — these ARE in LLM context (replacing
  raw outputs only when pruning is accepted) but not rendered into Pi's main
  message window. Text uses short refs; `details.toolCallRefs` metadata keeps the
  full `toolCallId` mapping for later recovery.
- The underlying session JSONL file **always retains the original
  `ToolResultMessage` entries unchanged**.

### Footer status widget

- `prune: OFF (On agent message)` — disabled, showing the mode it would use
- `prune: ON (On agent message)` — active with the current trigger mode
- `prune: ON (Every turn) │ ↑1.2k ↓340 $0.003` — active with cumulative stats
- `prune: 3 pending` — batches queued, waiting for the trigger
- `prune: summarizing…` — running the summarizer LLM call

## v1 Limitations

- Summarization only runs when pruning is **enabled**; enabling mid-session does
  not retroactively summarize earlier turns.
- `context_tree_query` is only active when the extension is loaded.
- `context_prune` is only activated in `agentic-auto` mode.
- The summarizer call happens synchronously inside `turn_end`, adding inter-turn
  latency proportional to the summarizer model's response time.
- Mid-turn pruning supports completed subsets of a longer tool chain, but
  batching is still based on assistant-message groups, not arbitrary semantic
  task labels.
- `/pruner tree` shows pruned tool calls grouped under summaries (`Ctrl-O` opens
  the full summary), but does not recover full original outputs inline — use
  `context_tree_query`.
- Summary grouping across multiple turns is a follow-up item.

## Follow-up ideas

- Auto-summarize older unsummarized turns on `/pruner on`.
- Batch multiple turn summaries into a single meta-summary at compaction time.
- Configurable pruning policy (prune only large tool results, prune by token
  count threshold).
- Tighter `/settings` integration once Pi exposes a settings UI API.
