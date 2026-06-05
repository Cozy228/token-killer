---
status: accepted
---

# PATH-shim delivery tier, narrow compression scope, and the passthrough path

## Context

Command-compression needs a way to get the agent to invoke the [Command
proxy](../../CONTEXT.md#surfaces). A long hook investigation (see
`docs/layer2-hook-protocol-spike.md`) concluded that GitHub Copilot hooks are a **dead
end in the user's enterprise VS Code env**: `chat.enableHooks` is policy-locked off and
the Claude-format hook silently never executes. Hooks remain viable on Copilot CLI.

The reference tool, RTK, has **no PATH shim at all**. Its entire delivery is (a) hook
rewrite where hooks fire, and (b) `CLAUDE.md` / instruction injection where they don't
(e.g. native Windows). It therefore never faces the two problems a shim creates: spawn
recursion and interactive-output capture.

`tg`'s premise is reducing *unconscious* token inflation (CONTEXT.md). Instruction
injection is conscious and probabilistic — it depends on the model remembering to prefix
`tg`. That defeats the premise wherever it is the only path, which is exactly the user's
VS Code env.

## Decision

1. **Three ordered delivery tiers: Hook > Shim > Instruction injection.** A host uses the
   highest tier it can support. Hook stays primary where it fires (Copilot CLI, and VS
   Code if an org ever enables it). The **shim** is the deterministic fallback for hosts
   where hooks don't fire; **injection** is the last resort. See CONTEXT.md, *Delivery*.

2. **The shim is narrow.** Only a [specific match](../../CONTEXT.md#delivery) (a real
   handler, not the generic fall-through) is eligible for compression. Everything else is
   [passthrough](../../CONTEXT.md#delivery). This mirrors RTK's registry/exit-1 model and
   keeps the shim's surface equal to the existing handler set.

3. **Interactivity is gated by TTY + a small denylist.** Compress only when the proxy's
   stdout is **not** a TTY (it was piped to the agent) *and* the command is a specific
   match. If stdout is a TTY (a human is watching) or the invocation hits a small
   interactive denylist (`commit` w/o `-m`/`-F`, `rebase -i`, `add -p`, `*login`), it is
   passthrough'd. A handler match alone is *not* sufficient — `git commit` matches
   `git-commit` (`extended.ts` keys only on `args[0]`) yet opens an editor.

4. **Recursion is prevented dynamically.** `executor.ts` strips the shim dir (located via
   the `TG_SHIM_DIR` env written at install) from the child's PATH at spawn time, plus a
   sentinel that hard-errors if a resolved tool path still lands inside the shim dir.

5. **One installer, `tg init`, auto-detects the host and wires the highest available
   tier.** Copilot CLI → hook; VS Code → shim (`terminal.integrated.env` + `TG_SHIM_DIR`);
   neither → instruction injection. The user runs one command and the tool picks the tier
   — the same auto-degrade logic as the runtime ladder. Modeled on `rtk init`'s surface
   (`-g` global, `--auto-patch` non-interactive, `--show` status, restart prompt). A
   lower-level `tg shim install` may remain as an internal step / escape hatch.

## Considered options

- **No shim, injection-only for VS Code (the RTK model).** Rejected: probabilistic
  coverage contradicts the "unconscious inflation" premise. Kept as the bottom tier only.
- **Full shim** wrapping every tool with runtime TTY/interactive detection. Rejected for
  v1: PTY handling and signal forwarding are large; the narrow scope reuses routing.
- **Static absolute tool paths recorded at install** (instead of dynamic PATH strip).
  Rejected: version managers (nvm, rbenv, pyenv, asdf) rewrite tool paths per-directory,
  so a recorded path resolves the wrong version. Dynamic strip always finds the live tool.

## Consequences

- `executor.ts` gains a real **passthrough** mode (`stdio: inherit`); today it always
  buffers, and even `--raw` captures-then-prints — so interactive commands cannot work
  until this lands. `--raw` and passthrough are now distinct.
- The router must expose **specific-match vs generic fall-through**; today `routeCommand`
  masks it with a `?? generic` whose `matches()` is always true.
- The TTY gate makes the shim **invisible to humans**: a person typing a shimmed `git log`
  gets native output (TTY → passthrough), which also makes PATH injection safe on shared
  terminals.
- Install must write `TG_SHIM_DIR` and prepend PATH per host — VS Code via
  `terminal.integrated.env.{windows,osx,linux}` (RC files are skipped by non-interactive
  `run_in_terminal` shells), Copilot CLI / plain terminals via shell RC / `$PROFILE`.

## Fail-open boundary (precondition: tg integrity)

The "fail toward the real tool" guardrail is scoped to **tg-internal errors** — a handler
that throws, a compression bug, or `ShimRecursionError` all fall back to passthrough of the
real tool. It is **not** a guarantee that survives a broken tg *binary*. Because the shim
wrapper has already shadowed the real tool on PATH and handed control to tg, if the tg
entrypoint itself is unrunnable (missing/corrupt `cli.js`, broken Node), the wrapper cannot
fail open: there is no safe in-wrapper retry (blindly re-running the real tool could
double-execute a mutating command). So **tg binary integrity is a precondition of the
shim tier**, not something the guard can recover. Two mitigations: (1) wrappers invoke tg
by the resolved **absolute** Node + `cli.js` path (never the shebang's PATH lookup), so a
shimmed interpreter cannot hijack startup; (2) `tg shim status` runs a health check
(interception probe + manifest read) the user can run to confirm the entrypoint resolves
before relying on the shim. Interpreters/shells are also hard-excluded from the wrapper set
(see `src/shim/programs.ts`) so tg's own runtime can never be shimmed.
