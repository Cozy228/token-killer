# tk becomes an MCP server (per-session stdio, hand-rolled JSON-RPC)

**Status:** proposed (grilling 2026-06-18)

To deliver the [Code graph](../../CONTEXT.md), tk grows `tk serve --mcp`: a Model Context
Protocol server exposing 4 graph tools directly into the agent's tool loop. This is tk's first
time **being a server** rather than a stateless one-shot command proxy.

## Decision

- The server is a **per-session stdio child** the host spawns and tears down with the session —
  **not a resident daemon** (the watcher + daemon stay deferred, see design §7).
- **Transport is hand-rolled newline-delimited JSON-RPC 2.0 over stdio** — no
  `@modelcontextprotocol/sdk` dependency, preserving tk's minimal-dep ethos.
- **4 tools** (`tk_explore`, `tk_node`, `tk_search`, `tk_callers`) — the measured "fewer tools
  steer better" finding; `initialize` ships server-instructions; **registers no tools when the
  project is un-indexed** (indexing stays the user's decision).
- Delivery is the **full triad in v1**: MCP server + shim-compressed CLI + instruction marker,
  including the per-host MCP-config writers.

## Why this over the alternatives

- *CLI-only, defer the server*: relies on the agent choosing to shell out to `tk explore` — the
  research shows instruction-only steering is the **weakest** path, so the graph would be
  cold-shouldered. Rejected.
- *Take the MCP SDK dependency*: simpler protocol code, but adds a production dep tk has avoided;
  codegraph proves the hand-rolled transport is small and sufficient. Rejected.

## Consequences

- **Pro:** the only delivery that reliably gets the tools used; reaches every non-locked host.
- **Pro:** no SDK dep; per-session lifecycle avoids daemon hazards (lockfiles, sockets, Windows pipes).
- **Con:** contradicts the previously-stateless proxy identity — a real architectural surface to own.
- **Con:** a long-ish-lived child process is new operational ground for tk (crash/timeout, fail-open
  must extend to the server loop, not just handlers).
