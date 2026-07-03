# Backend = source assimilation of codegraph, not build / dependency / mergeable fork

**Status:** accepted (grilling 2026-06-21 D2; Product Contract `docs/codemap/DESIGN.md` §16)

The [codemap](../../CONTEXT.md#surfaces) backend is built by **assimilating** the MIT reference
`codegraph` (`@colbymchenry/codegraph`) as a source starting point, then fully owning and reshaping
it. codegraph is MIT, Node/TS, zero native dependencies (web-tree-sitter + tree-sitter-wasms +
jsonc-parser), same Node band, and its `src/` (db, context, mcp, resolution, extraction, graph,
search, sync) maps onto the layers tk needs.

## Decision

- **Inherit** the mature implementations: tree-sitter/WASM extraction, language & framework
  resolution (candidate generation + confidence + unresolved tracking + framework hooks), SQLite,
  incremental sync, file discovery, Windows/WSL handling, regression tests.
- **Do not inherit** its product boundary, canonical schema, MCP, daemon, installer, telemetry, or
  Claude-oriented ContextBuilder. tk builds its own unified canonical store, identity, extraction
  pipeline, and query engine ([ADR 0018](0018-unified-four-layer-bounded-product.md),
  [0019](0019-evidence-claim-arbitration.md)).
- Once assimilated, the source is **fully tk-owned**; upstream API compatibility and future
  mergeability are **not** constraints. Upstream remains a bug-fix / design source absorbed via
  agent-assisted selective port, **not** a long-term downstream fork.

## Considered options

- *Build from scratch* (re-type codegraph as a "reference"): spends the whole budget rebuilding a
  commodity backend, leaving none for tk's differentiators (token economy, host-LLM-only diet,
  VS Code delivery, measurement). Rejected.
- *`npm i @colbymchenry/codegraph` and wrap it*: cheapest, but tk loses control of the schema and
  output that the token economy depends on, is bound to upstream cadence, and drags its
  bin/installer/telemetry dead weight. Rejected.
- *Maintainable downstream fork* (keep it mergeable): forces a permanent adapter and dual
  schema/migration between upstream and tk models for a product with no release yet and no
  compatibility burden. Rejected.

## Consequences

- **Pro:** inherits years of extraction/resolution/Windows hardening immediately; license-clean (MIT
  with attribution).
- **Pro:** tk owns the unified schema needed for the four-layer model and token-budgeted projection.
- **Con:** no automatic upstream updates; importing future upstream fixes is a manual, agent-assisted
  port.
- **Con:** the assimilated code must be reshaped (not bolted on) before it fits the canonical store —
  upfront integration cost.
