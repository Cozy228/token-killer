# Code graph as additive retrieval, not a gateway

**Status:** accepted (grilling 2026-06-18; design `docs/reports/code-graph-design-20260618.md`)

tk grows a new **[Code graph](../../CONTEXT.md)** surface: an additive retrieval plane for
orientation, targeted reads, callers-style search, and local verification. It is **not** an
API gateway, not a VS Code extension in v1, and not hook-time projection of Copilot's built-in
`read_file` / `search` results.

## Decision

- v1 is an **enterprise VS Code Copilot pilot** with a hard prerequisite: the organization must allow
  MCP or the graph tools cannot reach the direct-tool surface. CLI graph commands still work locally.
- v1 ships a **static** AST/import/PageRank-style graph only. LSP precision is a v2 candidate; no
  language server is started or required in v1.
- v1 includes `light_edit_window` as an explicit `tk_read` mode and `tk_verify` for local diff /
  test-failure summaries. It does not implement a general edit loop, prompt rewriting, model routing,
  history compaction, or full payload proxying.
- A VS Code extension is a **v2 delivery candidate** after the retrieval core stabilizes. It is not
  part of v1.

## The explicit no-s (as load-bearing as the yes-s)

- **Gateway/proxy — out.** tk will not sit between the agent and model provider for this feature.
- **Direct tool result projection — still out.** Existing hook no-go remains true; graph tools are
  new additive tools, not modified host results.
- **Embeddings — out.** No model/key/code-egress dependency for v1.
- **LSP — out for v1.** Record as a v2 candidate only.
- **VS Code extension — out for v1.** Record as a v2 candidate only.

## Considered options

- *API gateway / BYOK proxy*: highest theoretical leverage, but it would turn tk into a different
  product category and is off the default GitHub-hosted Copilot path. Rejected.
- *VS Code extension first*: best long-term direct-tool channel, but adds extension packaging,
  enterprise allow-listing, VS Code API testing, and release surface before the retrieval core exists.
  Deferred to v2.
- *LSP-first retrieval*: better reference precision, but requires per-language server install/startup
  and a much larger enterprise support matrix. Deferred to v2.

## Consequences

- **Pro:** keeps v1 buildable inside tk's Node/TypeScript product shape while addressing the highest
  new retrieval opportunity.
- **Pro:** documents the enterprise prerequisite honestly instead of pretending MCP policy can be
  bypassed.
- **Con:** locked enterprise VS Code without MCP enabled cannot use the graph tools from the agent loop.
- **Con:** LSP-grade reference precision and extension delivery wait for v2.
