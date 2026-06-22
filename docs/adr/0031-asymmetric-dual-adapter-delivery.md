# Agent delivery = one Core, two asymmetric adapters (MCP host-neutral reference + VS Code managed), entry by org policy

Status: accepted (supersedes the F.1 "extension-primary" framing)

F.1's premise was wrong. It claimed enterprise Copilot defaults to locking MCP and that the
LM Tool API is therefore the only robust channel to Copilot's built-in read/search. The actual
VS Code behavior (per user; flagged for official re-check, see the docs checklist):

- `chat.mcp.access` defaults to **`all`**, not locked; enterprises *can* set it to `none`, but
  that is not the default.
- Extension LM Tools have **their own** central governance — `chat.extensionTools.enabled` can
  be turned off, and extension install is gated by the `extensions.allowed` allowlist. So an
  extension is **not** a natural bypass of enterprise MCP governance; it has its own kill
  switches.
- An extension does **not** take over Copilot's built-in read/search. VS Code defines built-in
  tools, extension tools, and MCP tools as **three parallel tool types**. An extension's value
  is that it can call VS Code APIs and offers better install + editor integration.

So neither channel is a guaranteed-robust global primary. The delivery model is:

- **Repository Intelligence Core** — the single implementation (one QueryPlan + one result
  contract; never two retrieval stacks).
- **`tk mcp`** — the **canonical, host-neutral reference adapter**.
- **VS Code extension** — the **Copilot-specific managed adapter** (value: VS Code APIs,
  install, editor integration), sharing the same QueryPlan + result contract.

The actual entry point is **determined by org policy**, not fixed:

- extension tools approved → docs recommend the extension;
- only MCP allowed → use `tk mcp`;
- MCP banned but extension tools allowed → the extension is the only Agent channel;
- both banned → only the CLI / codeguide (Human) surface remains;
- Claude Code, Codex CLI, and other terminal hosts → use MCP directly.

## Consequences

- It is **not** "extension is the global PRIMARY" (F.1) and **not** "two equal
  implementations" — it is one Core with two asymmetric adapters and a policy-determined entry,
  plus a graceful-degradation ladder down to the CLI/Human surface.
- No retrieval logic is duplicated: both adapters compile to the same QueryPlan (ADR 0029) and
  return the same result contract.
- The exact VS Code policy keys (`chat.mcp.access`, `chat.extensionTools.enabled`,
  `extensions.allowed`) and their defaults are added to the official-docs re-check checklist;
  the architecture holds regardless of their default values.
