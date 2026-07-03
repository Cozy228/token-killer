# pi-context — Agentic Context Management for Pi

> Source: <https://pi.dev/packages/pi-context> · Repo: <https://github.com/ttttmr/pi-context>
> Fetched: 2026-06-26

"An Agentic Context Management tool that helps AI agents keep long conversations
focused by maintaining a clean working set" via checkpoint anchors, history
inspection, and state summaries.

## Package info

- **Version:** 2.0.0 · **Published:** Jun 17, 2026 · **Author:** ttttmr · **License:** MIT
- **Size:** 68.1 KB · **Downloads:** 1,251/mo · 648/wk
- **Types:** extension, skill · **Deps:** 0 dependencies · 3 peers

## Installation

```
pi install npm:pi-context
```

## Usage — for humans

```
/acm        # enable Agentic Context Management for the current session
/context    # visual dashboard: context-window usage + token distribution
```

## Usage — for agents

Adds the `context-management` skill with three core tools:

1. **🔖 Anchor (`context_checkpoint`)** — Label meaningful conversation nodes
   with semantic names like `parser-fix-start` or `timeout-investigation-search`.
2. **📊 Inspect (`context_timeline`)** — View the active path as a structural map
   of checkpoints, summaries, branch points, user turns, and current position.
3. **⏪ Compact (`context_compact`)** — Create a summarized continuation branch
   from an earlier checkpoint, restoring useful state: current task, decisions,
   external side effects, validation state, source anchors, next steps.

## Naming migration

Earlier versions used Git-like names (`context_tag`, `context_log`,
`context_checkout`). Current versions use conversation-native names
(`context_checkpoint`, `context_timeline`, `context_compact`) — these manage
conversation history, not repository state.

## Security note

Pi packages can execute code and influence agent behavior. Review the source
before installing third-party packages.
