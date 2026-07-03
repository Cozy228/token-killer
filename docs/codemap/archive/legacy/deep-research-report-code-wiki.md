# Superseded: Code Wiki Deep Research Report

This draft has been merged into the canonical code-graph design:

- [`code-graph-design-20260618.md`](./code-graph-design-20260618.md)

The original draft was committed first in `docs: add code wiki next-stage research`
so the raw research is preserved in git history. The canonical design is now the
implementation contract for CodeGraph work.

Reasons for superseding this file:

- It overlapped heavily with what is now the canonical design.
- It contained chat-style citation markers that are not durable Markdown links.
- It assumed the live `tk` repository was unavailable, which is false for this
  workspace.
- It proposed richer MCP tool names without reconciling them with ADRs 0013-0016.
- It used paths that do not match the existing `docs/reports/` convention.

Use the canonical design for the implementation contract:

- adopt/avoid decisions
- unified graph architecture
- graph/storage/query model
- CLI and MCP spec
- Code Wiki block format
- GUI and VS Code/Copilot integration
- token reduction mechanics
- roadmap and first engineering tasks

Use the remaining research and landscape reports for project-by-project evidence.
