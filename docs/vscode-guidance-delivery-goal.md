# Goal — VS Code guidance delivery + pipe-compression grilling outcomes

This doc lands the outcomes of a design grilling that started on "pipe
compression" and ended on three concrete results. It is the spec the VS Code fix
implements, plus a record of what was investigated and decided.

## Session outcomes (the whole account)

| # | Topic | Outcome | Artifact |
|---|---|---|---|
| 1 | Pipe-tail compression ("filter-mode") | **Declined.** Safe lossless payback < 1% of total tokens; the 46% mass (`head`/`tail`) is prose the agent already bounded with `-N`, lossy-unsafe to cut. | [ADR 0007](adr/0007-pipe-tail-compression-declined.md) |
| 2 | Pipe **head**-segment compression | **Bug.** Hook rewrites `git diff \| grep …` → `tk git diff \| grep …`; the filter sees tk's lossy output and returns wrong results. | [issue #1](https://github.com/Cozy228/token-killer/issues/1) |
| 3 | VS Code guidance delivery | **Gap + fix (this doc).** Pure-VS-Code users get ~0 effective guidance today. | [ADR 0008](adr/0008-vscode-guidance-delivery.md) |

### Evidence that killed pipe compression (don't re-litigate)

Measured 85 Claude Code sessions (2026-06-05…08), 2549 Bash calls, 3.15M output
chars:
- Pipes = 68% of output bytes. Of those, **94% have a tail with no tk handler**
  (`head` 38% of ALL bytes, `tail` 8%, `sort`/`sed`/`echo`/`cat`).
- `head`/`tail` outputs: p50=543B, no fat tail (top-20 = 11.5%), lines>200ch =
  0.9%, dup-line bytes = 2.5% → lossless headroom ≈ 3% of total, and the content
  is source/diff/doc prose the agent deliberately bounded.
- Only handler-backed tail with real headroom is `grep`/`rg` (~0.6% of total),
  already compressible — blocked only by the hook's deliberate RHS-skip.
- Delivery here is the **hook** (`tk hook claude`), not the shim. `rewrite.ts`
  skips the RHS of `|` by design, which is why tails are raw and the head is
  compressed (→ bug #2).
- tk's true savings lever is **guidance** steering the agent to native terse forms
  (`git --stat/--short/--oneline`, the Read/Grep tools), not the compressor.

## The VS Code fix — implementation plan

### Verified platform facts (June 2026 VS Code docs)

- VS Code Copilot auto-loads user-level instructions: `~/.copilot/instructions/*.instructions.md`,
  `~/.claude/rules`, `~/.claude/CLAUDE.md`. Priority: Personal > Repository > Org.
- It does **not** expand Claude Code `@file` imports → content must be inlined.
- `.instructions.md` uses YAML frontmatter; `applyTo: '**'` = always-on across all
  workspaces.

### Target

`~/.copilot/instructions/token-killer.instructions.md`, user-level, containing:

```
---
applyTo: '**'
---
<the verbatim guidanceDoc() body>
```

### Touchpoints

1. `src/shim/guidance.ts`
   - `guidanceFilePath("vscode")` → `~/.copilot/instructions/token-killer.instructions.md`.
   - VS Code's guidance file IS the loaded file (no `@import` indirection like
     claude-code, no separate host instructions file like copilot-cli). Write the
     frontmatter + inlined `guidanceDoc()` directly. Factor a small helper for the
     frontmatter wrapper so the body stays the single source of truth.
2. `src/shim/hostAdapter.ts` — `vscodeAdapter.guidancePath` returns the new path;
   `init.ts` `guidanceHosts` then includes vscode for install + `--uninstall`
   automatically (no init.ts edit).
3. Drop the inert vscode user-level `copilot-instructions.md` injection (VS Code
   never read it). Keep the injection tier for hosts that still need it.
4. Tests: vscode now writes a guidance file (assert path + `applyTo: '**'` +
   inlined body); `--uninstall` removes it; injection no longer targets the dead
   vscode user path.

### Out of scope / later

- `--project` writing `.github/copilot-instructions.md` for repo-shared guidance
  (lower priority than personal; opt-in only).
- The pipe head-segment bug (issue #1) — separate track, but VS Code (shim tier)
  is the most exposed host.
- Adding the "Don't shell out for multi-file read/search" guidance section
  (drafted in the grilling) once delivery reaches all hosts — it is +186 tokens of
  resident context, so land it where it actually changes behavior.
