# Superseded: Code Wiki Deep Research Report

This draft has been merged into the canonical next-stage architecture report:

- [`codegraph-codewiki-next-stage-20260618.md`](./codegraph-codewiki-next-stage-20260618.md)

The original draft was committed first in `docs: add code wiki next-stage research`
so the raw research is preserved in git history. The merged report is now the
implementation contract for the CodeGraph + Code Wiki next-stage work.

Reasons for superseding this file:

- It overlapped heavily with the canonical next-stage report.
- It contained chat-style citation markers that are not durable Markdown links.
- It assumed the live `tk` repository was unavailable, which is false for this
  workspace.
- It proposed richer MCP tool names without reconciling them with ADRs 0013-0016.
- It used paths that do not match the existing `docs/reports/` convention.

Use the canonical report for:

- project-by-project analysis
- adopt/avoid decisions
- unified graph architecture
- graph/storage/query model
- CLI and MCP spec
- Code Wiki block format
- GUI and VS Code/Copilot integration
- token reduction mechanics
- roadmap and first engineering tasks
