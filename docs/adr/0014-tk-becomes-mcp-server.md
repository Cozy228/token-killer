# tk exposes graph retrieval through MCP and CLI

**Status:** accepted (grilling 2026-06-18)

To deliver the [Code graph](../../CONTEXT.md), tk grows a graph-specific MCP server and local CLI
commands. The server is an additive retrieval surface: it offers tools the agent can choose, but it
does not intercept or replace host-owned built-in tool results.

## Decision

- The server entrypoint is **`tk graph serve --mcp`**, implemented as a per-session stdio child,
  not a resident daemon.
- Transport is hand-rolled newline-delimited JSON-RPC 2.0 over stdio. No MCP SDK dependency in v1.
- v1 exposes exactly **4 MCP tools**: `tk_map`, `tk_read`, `tk_search`, and `tk_verify`.
  `callers` is a `tk_search` mode, not a separate tool. Symbol/source reads stay under `tk_read`.
- CLI mirrors the tool behavior under `tk graph`: `index`, `map`, `read`, `search`, `verify`,
  `doctor`, and `serve --mcp`.
- Installation is explicit: **`tk install --graph`**. Plain `tk install` keeps today's delivery
  behavior and does not enable graph MCP. Graph guidance is written only after graph MCP is installed
  or verified available.
- v1 writes MCP config for existing host adapters where supported and prints honest diagnostics when
  enterprise policy blocks MCP.

## Why this over the alternatives

- *CLI-only*: useful for local use, but too weak for an enterprise pilot where the agent needs a
  first-class retrieval tool. Rejected.
- *More tools*: clearer separate callers/source tools cost resident schema tokens and compete with the
  "few tools steer better" finding. Rejected.
- *Plain `tk install` enables graph*: convenient, but it would silently enlarge default install
  side effects. Rejected.

## Consequences

- **Pro:** graph is reachable through both agent tools and terminal workflows without turning tk into
  a gateway.
- **Pro:** `tk install --graph` is explicit enough for enterprise pilots and reversible through the
  existing uninstall/purge-data semantics.
- **Con:** additive tools require guidance and good tool descriptions; Copilot may still choose built-ins.
- **Con:** server lifecycle and MCP config writing are new operational surfaces for tk.
