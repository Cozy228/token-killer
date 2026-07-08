---
status: accepted
amends: 0002, 0005
---

# VS Code is hook-capable: additive hook + shim delivery (tiers are complementary, not exclusive)

> Decided 2026-06-15. Source: `docs/archive/rtk-vscode-copilot-windows-research-20260615.md`.
> Lands via #19 (prerequisite), #20, #22 (wiring), #23, #26 (status as capability matrix).

## Context

[ADR 0002](0002-shim-delivery-tier-and-passthrough.md) defined three **mutually exclusive**
delivery tiers — *Hook > Shim > Injection*, "a host uses the highest tier it can support;
lower tiers are fallbacks, not parallel paths" (CONTEXT.md *Delivery*). On that model VS Code
resolved to **shim only**, and `src/shim/hostAdapter.ts` encodes it: the `vscode` adapter has
no `installHook`.

[ADR 0005](0005-vscode-hooks-fire-capability-and-protocol-gap.md) then proved VS Code agent
hooks **do** fire (Preview) and **do** honor PreToolUse `updatedInput` (runtime honor-test
PASSED, 0005 §5), calling the hook "a proven **complementary** tier, not an open spike item" —
but it deliberately stopped short of wiring it, leaving the shim as the sole installed VS Code
tier. So today VS Code leaves a working, policy-independent enhancement on the table: a hook
catches the agent's `run_in_terminal` at the protocol layer even when PATH injection hasn't
taken effect (fresh terminal, RC not sourced), and it can run direct-tool governance on the
primary host.

The 2026-06-15 research confirmed both host protocols and the remaining ctx-side gaps
(issues #19, #20, #22, #23, #26).

## Decision

1. **Tiers are preference-ordered but NOT mutually exclusive.** A host may install multiple
   *complementary* tiers. This amends ADR 0002 decision #1 and the CONTEXT.md *Delivery*
   sentence "lower tiers are fallbacks, not parallel paths" — for a host that supports both,
   hook and shim run as parallel, non-conflicting paths.

2. **VS Code = hook + shim, additive.** Add `installHook`/`planHook` to the `vscode` adapter
   (`supportedTiers: ["hook","shim","injection"]`) reusing `installCopilotHookConfig`: VS Code
   reads the same locations the Copilot CLI writer already targets — `~/.copilot/hooks/` (user)
   and `.github/hooks/` (project), per ADR 0005 §5 corollary. `runInstall` installs the hook
   **and** the shim for VS Code instead of returning after the first tier.

3. **The shim stays PRIMARY / authoritative on VS Code** (reaffirms ADR 0005 §2). The hook is
   Preview and per-org-policy-revocable, so the shim is the floor; the hook is an additive
   enhancement. If policy disables hooks, the shim still works — additive means graceful
   degradation, not breakage.

4. **Prerequisite: full `updatedInput` (#19).** The VS Code branch of `toHostOutput` must emit
   `{ ...ev.toolInput, command }`, not `{ command }` — VS Code schema-rejects a partial input
   and silently ignores the rewrite, so the tier no-ops without #19. This closes ADR 0005 §6's
   protocol-conformance prerequisite for the VS Code rewrite path.

5. **No double-compression — two existing guards.** The hook skips already-`ctx` commands
   (`rewrite.ts` eligibility, "already a ctx command"); the shim never wraps `ctx` (`NEVER_WRAP`,
   `programs.ts`) and strips `CTX_SHIM_DIR` from the child PATH (`path.ts`). A hook rewrite of
   `git status` → `ctx git status` therefore cannot be re-intercepted by the shim. A round-trip
   regression test pins this.

6. **`modifiedResult` result compression is out of scope here.** VS Code cannot (`modifiedResult`
   absent from its contract — reaffirms ADR 0005 §3; the 0005 §126 CI probe stays). Copilot-CLI-only
   result compression via `postToolUse.modifiedResult` is tracked in #24 and, if accepted, gets its
   own ADR; this ADR does **not** decide it, and the "No `modifiedResult`, ever" guards stay until then.

7. **Delivery state becomes a capability matrix (#26).** Because a host can now hold multiple live
   tiers, the single "active tier" (`selectTier`) is no longer a faithful description of installed
   state. `ctx status` reports a per-host matrix {hook installed/fired/blocked-by-policy, shim
   installed/probe/TTY, instructions}, plus last-verified + host version. `selectTier` is retained
   for preference ordering; it no longer implies the other tiers are absent.

## Considered options

- **Switch VS Code primary to the hook (drop/relegate the shim).** Rejected — reaffirms ADR 0005 #2:
  the hook is Preview and policy-revocable; the shim is the policy/Preview-independent floor.
- **Keep VS Code shim-only (status quo).** Rejected — forgoes a proven (0005 §5), policy-independent
  enhancement that covers the gap where PATH injection hasn't taken effect, plus direct-tool
  governance on the primary host.
- **A separate VS Code hook file/writer.** Rejected — VS Code and Copilot CLI read the same locations
  (0005 §5 corollary); one marker-guarded `ctx-rewrite.json` + one uninstall path is simpler and
  already exists.

## Consequences

- `src/shim/hostAdapter.ts`: the `vscode` adapter gains `installHook`/`planHook` and `"hook"` in
  `supportedTiers`; `tests/unit/shim/hostAdapter.test.ts` (asserts `vscode.installHook` undefined)
  flips. `src/shim/init.ts` `runInstall` installs hook+shim additively for VS Code (reuse the
  existing additive block).
- Shared file: both `copilot-cli` and `vscode` adapters write `~/.copilot/hooks/ctx-rewrite.json`;
  marker-guarded uninstall already removes it once. Documented so no one assumes a separate VS Code
  file.
- Depends on #19 (prerequisite) and #20 (the conformant dual-schema config the VS Code hook reuses).
- `ctx status` / delivery state move to the capability matrix (#26); `selectTier` stays for ordering only.
- Docs: CONTEXT.md *Delivery* exclusivity sentence amended; DESIGN.md "VS Code uses the shim / hook is
  Copilot-CLI-only" statements annotated; ADR 0002 and 0005 annotated. The full descriptive rewrite of
  DESIGN.md §3 lands with the #22 implementation.
