# Code graph as a graph-centered, search/read-lane surface

**Status:** proposed (grilling 2026-06-18; design `docs/reports/code-graph-design-20260618.md`)

tk grows a new **[Code graph](../../CONTEXT.md)** surface: a structural symbol/call/import
index that answers "how does X work / who calls Y / what breaks if I change Z" in one query
returning verbatim `file:line` source. It is positioned as a *synthesis* — the structural graph
is the center, and the best **search/read token-saving techniques** from other projects fold in
as enhancements — explicitly **not** a competitor to any single tool and **not** a port of
codegraph alone.

## Decision

- **Graph is the center; other families are enhancements**, drawn only in the
  search/read token-optimization lane (signature-collapse from Repomix, two-stage
  candidate→block from Probe, on-demand full-code fetch, conversation-seeded ranking from aider).
- The earlier `§8` differentiation claim ("no other tool foregrounds honesty") is **withdrawn** —
  the reference (codegraph) already ships provenance tags, low-confidence hand-back, and staleness
  banners. tk's real justification is **unification** (existing tk users get it with zero extra
  install, co-located with the compression layer, CLI output auto-compressed by the shim).

## The explicit no-s (as load-bearing as the yes-s)

- **Embeddings / semantic retrieval — out**, by tk invariant (needs model/key/code-egress; and a
  semantic match can be plausibly-related-but-wrong, the antithesis of "never fabricate").
- **Broad "context gateway" — out**: this surface does not expand into a general log/diff/JSON
  interception layer; those stay with the existing handler/`read` compression lines.
- **The framework-resolver moat — out** of scope (no React-rerender / Django-route / RN-ObjC
  bridging, no community detection, no flow tracing). Keeps the maintenance surface small.
- **Enterprise-locked VS Code Copilot — uncovered**, accepted: MCP is admin-default-OFF there and
  the only other door was a VS Code extension, which the npm-only constraint forbids.

## Considered options

- *Detect-and-recommend codegraph only* (build nothing): smallest maintenance, but reduces tk to a
  store-front and forgoes the unification value. Rejected.
- *Port codegraph and keep the honesty sales pitch*: the pitch is false (codegraph has it), rejected.

## Consequences

- **Pro:** a genuinely additive capability for tk's target hosts; one install; honest positioning.
- **Pro:** scope discipline caps the maintenance surface (risk #6) and dodges the embeddings
  invariant conflict.
- **Con:** tk takes on a meaningfully larger codebase than the current handler set.
- **Con:** users already running codegraph/Serena gain little; tk's angle is integration, not first-mover.
