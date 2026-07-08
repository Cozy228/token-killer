---
status: accepted
---

# VS Code Copilot receives the usage guide as a user-level `.instructions.md`

VS Code Copilot users were getting **no effective usage guidance** — only the
~340-char "prefix with `ctx`" injection, written to
`<vscodeUserDir>/copilot-instructions.md`, a path VS Code does **not** auto-load.
We will instead deliver the **full `guidanceDoc()` inlined** into
`~/.copilot/instructions/contexa.instructions.md` (user-level, applies across
all workspaces), keeping ctx's user-level-default philosophy.

## Context

`ctx init` delivers the rich usage guide (`guidanceDoc()` → CTX.md) to claude-code
(via a `@CTX.md` import in `~/.claude/CLAUDE.md`) and copilot-cli (inlined into
`~/.copilot/copilot-instructions.md`). VS Code (`vscodeAdapter`) had
`guidancePath → undefined`, so it received only the injection block.

Verified against the VS Code docs (June 2026,
`code.visualstudio.com/docs/agent-customization/custom-instructions`):

- VS Code Copilot auto-loads, by priority: **Personal (user-level, highest)** →
  Repository (`.github/copilot-instructions.md` or `AGENTS.md`) → Organization.
- **User-level** auto-loaded locations exist: `~/.copilot/instructions/*.instructions.md`,
  `~/.claude/rules`, and `~/.claude/CLAUDE.md`. So ctx does **not** have to write a
  project/repo file to reach VS Code.
- `~/.claude/CLAUDE.md` is auto-loaded, but VS Code does **not** resolve Claude
  Code's `@file` imports — so ctx's existing `@CTX.md` line is read as literal text
  and the guide (in the separate `~/.claude/CTX.md`) never reaches VS Code. The
  delivered content must therefore be **inlined**, not imported.
- `.instructions.md` files use YAML frontmatter with an `applyTo` glob; `applyTo:
  '**'` makes them always-on.

## Decision

Deliver to VS Code the **full guidance, inlined**, in a **user-level**
`.instructions.md`:

- Path: `~/.copilot/instructions/contexa.instructions.md`.
- Body: `applyTo: '**'` frontmatter + the verbatim `guidanceDoc()` text (the same
  content the other hosts get — no @import indirection).
- Redirect the vscode injection (the shim-failed-fallback "prefix with `ctx`" block)
  off the inert `<vscodeUserDir>/copilot-instructions.md` onto a user-level file VS
  Code does load: `~/.copilot/instructions/contexa-prefix.instructions.md`
  (separate from the guide; a `.instructions.md` carries `applyTo: '**'` and is a
  ctx-owned whole file, deleted on uninstall).

## Considered alternatives

- **`~/.claude/rules/` (user-level, Claude format)** — also auto-loaded, but its
  semantics are "rules", not a usage guide; `~/.copilot/instructions` is the
  purpose-built instructions channel and matches ctx's existing `~/.copilot/` write.
- **Inline into `~/.claude/CLAUDE.md`** — would reach both VS Code and Claude Code,
  but breaks ctx's deliberate "CTX.md stays separate, never tangles CLAUDE.md"
  design and double-delivers to Claude Code (inline + the existing import).
- **Project-level `.github/copilot-instructions.md` (match RTK)** — definitely
  loaded, but it is a repo write and would force project scope as the default for
  VS Code, breaking the user-level-default philosophy. Available later behind
  `--project` for repo-shared guidance; not the default.

## Consequences

- New-host-via-one-adapter-entry holds: only `guidance.ts` (vscode branch) and
  `vscodeAdapter.guidancePath` change; `init.ts` picks vscode up automatically for
  install and `--uninstall`.
- VS Code's highest delivery tier is the shim, which wraps pipe tails — so VS Code
  is the host most exposed to the left-segment lossy-compression bug (issue #1).
  Shipping guidance there is independent of, but adjacent to, that fix.
