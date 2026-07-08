---
status: accepted
amends: 0002
---

# VS Code agent hooks DO fire — capability ceiling, protocol gap, and delivery-tier update

> **Operationalized by [ADR 0012](0012-vscode-hook-shim-additive-delivery.md) (2026-06-15):**
> the complementary VS Code hook tier proven in decision #5 is now wired **additively** alongside
> the shim (issue #22). The protocol-conformance prerequisite (decision #6) for the rewrite path
> is issue #19; the `modifiedResult` boundary (decision #3) is reaffirmed — Copilot-CLI-only result
> compression is tracked separately in #24.

## Context

[ADR 0002](0002-shim-delivery-tier-and-passthrough.md) made the PATH shim the primary
VS Code delivery on the premise that **GitHub Copilot hooks are a dead end in the user's
enterprise VS Code env** (`chat.enableHooks` policy-locked off, hook silently never
executes). Two findings update that premise:

1. **Empirical (spike Round 2, 2026-06-05, `docs/layer2-hook-protocol-spike.md` §1.5).**
   On the target machine (cozyultra, VS Code 1.123, Win11) VS Code **does execute**
   command hooks. The round-1 "not executed" negatives were instrumentation bugs (bare
   `node` not on the hook's PATH → ENOENT; synchronous fd-0 stdin read → empty payload),
   not a policy lock. `/hooks` lists installed hooks; the engine is driven by
   `chat.hookFilesLocations` (defaults: `.github/hooks/*.json`, `.claude/settings*.json`,
   `~/.claude/settings.json`).

2. **Source-confirmed contract (2026-06-06).** Read directly from the shipping extension
   `microsoft/vscode-copilot-chat`, `src/platform/chat/common/hookCommandTypes.ts`:

   ```ts
   interface IPreToolUseHookSpecificCommandOutput {
     hookEventName?; permissionDecision?: 'allow'|'deny'|'ask';
     permissionDecisionReason?; updatedInput?: object; additionalContext?;
   }
   interface IPostToolUseHookSpecificCommandOutput { hookEventName?; additionalContext?; }
   ```

   PreToolUse **has `updatedInput`** (transparent input rewrite). PostToolUse has **only
   `additionalContext`** — no `modifiedResult` / result replacement anywhere (grep zero
   hits; matches the spike §2 repo-asymmetry finding). RTK relies on exactly this:
   `rtk/src/hooks/hook_cmd.rs::handle_vscode` returns `"updatedInput":{"command":rewritten}`.

## Decision

1. **Retire ADR 0002's "policy-locked dead end" framing.** Replace with: *VS Code agent
   hooks fire (Preview), but their output contract is narrower than Copilot CLI's —
   governance + `additionalContext` + `updatedInput`, but no `modifiedResult`.*

2. **The PATH shim STAYS the primary terminal-compression delivery on VS Code.** ADR 0002's
   shim decision is unchanged. Rationale holds independent of hooks: the shim is
   policy-independent, host-agnostic, and **Preview-independent**. Hooks are Preview (the
   contract "might change"), and per-org policy can still disable them. The shim already
   ships; do not regress it.

3. **`modifiedResult`-based direct-tool OUTPUT compression on VS Code stays KILLED**
   (DESIGN §66). Re-confirmed from source: the field does not exist in the VS Code
   contract. Update the *reason* in DESIGN §3.3 / §13.1 / §66 from "hooks don't fire on
   VS Code" to "VS Code PostToolUse has no `modifiedResult` field." Transparent
   direct-tool output compression on VS Code is not achievable by any host mechanism.

4. **New capability to capture — governance + recovery hints now reach the primary host.**
   Previously assumed Copilot-CLI-only. Now available on VS Code, non-invasively and
   fail-open, **without depending on the model choosing ctx**:
   - **PreToolUse governance** — `permissionDecision: deny|ask` + reason on expensive
     direct reads/searches (node_modules, lockfiles, huge files, full-repo grep). Prevents
     waste it cannot compress.
   - **PostToolUse `additionalContext`** — recovery hints injected same-turn (VS Code
     ≥1.118, [vscode#311138](https://github.com/microsoft/vscode/issues/311138)).
   These are the actionable expansion of `ctx hook copilot` to VS Code.

5. **Transparent terminal rewrite via PreToolUse `updatedInput` is a CANDIDATE tier —
   runtime honor-test now PASSED (2026-06-06).** The open question "does VS Code actually
   honor `updatedInput`" is resolved **YES**. Isolated probe on cozyultra (VS Code Copilot
   Chat Agent mode, GitHub-format `.github/hooks/ctx-probe.json`, absolute node path)
   rewrote every `run_in_terminal` command (`git status`, `cd … && git status`, `dir`) to
   `echo CTX_UPDATEDINPUT_HONORED` via `hookSpecificOutput.updatedInput`. Runtime proof: the
   Copilot agent's own transcript reasoning (`…workspaceStorage\…\GitHub.copilot-chat\
   transcripts\fa8c6303-…jsonl`, entry 8) reads *"it's showing CTX_UPDATEDINPUT_HONORED,
   which could point to a bug"* — i.e. the executed command was the rewritten one, not the
   agent's requested `git status`. The probe log confirms the emitted union JSON. So
   transparent terminal-command rewrite via hook IS viable on VS Code. It still does **not**
   replace the shim until out of Preview (the shim is Preview/policy-independent per point
   2); it is now a proven complementary tier, not an open spike item.

   Two corollaries proven in the same run:
   - **Config format `{type:"command", command:"…"}` IS accepted by VS Code Copilot Chat**
     (the real `~/.copilot/hooks/ctx-rewrite.json` fired — its error proves execution). The
     spike §1.5 worry that the validator requires `bash`/`powershell` keys does not apply to
     VS Code; it is a Copilot-CLI concern. VS Code also loads user-level `~/.copilot/hooks/`
     in addition to workspace `.github/hooks/` (both fired; user saw 3 hooks in `/hooks`).
   - **Bare `ctx` in the hook command fails** with `CommandNotFoundException` — `ctx` is not on
     the hook subprocess's PowerShell PATH. This is the live manifestation of the install bug
     in Consequences below: the probe worked **only** because it used an absolute node path.
     `ctx init` must write an absolute executable path, never bare `ctx`.

6. **Prerequisite bug: ctx's hook stdout protocol is non-conformant.** `src/hook/copilot.ts`
   `toProtocol()` emits ctx's invented shape `{ decision, rewritten_command, reason,
   additional_context }`. No real host reads this: VS Code expects
   `hookSpecificOutput.{permissionDecision, updatedInput, additionalContext}`; Copilot CLI
   expects `permissionDecision` + `modifiedArgs` (applied only when permissionDecision is
   allow/absent). **Until a host-protocol adapter is added, the shipped hook does nothing
   on a real host** — "shipped (Copilot-CLI-only)" in DESIGN is overstated. This must be
   fixed before any hook tier (governance, hints, or rewrite) is wired live.

## Considered options

- **Switch VS Code primary delivery to hook `updatedInput`.** Rejected (now): Preview,
  runtime honor unproven, shim already ships and is policy/Preview-independent.
- **Keep ignoring VS Code hooks entirely (pre-this-ADR status quo).** Rejected: forgoes
  governance + same-turn recovery hints now available on the primary host.
- **Emit only the union superset of all host fields and let each host ignore extras.**
  Partially viable (RTK does this for the outer Copilot/Claude wrapper) but the dialects
  conflict (`updatedInput` vs `modifiedArgs`, nested vs flat, `hookSpecificOutput` wrap);
  a real per-dialect adapter is required, not a naive union.

## Consequences

- **Add a host-protocol adapter** to `src/hook/copilot.ts`: detect dialect (VS Code
  snake_case `tool_name`/`tool_input` → `hookSpecificOutput` with `permissionDecision` +
  `updatedInput`; Copilot CLI camelCase `toolName`/`toolArgs` → `permissionDecision` +
  `modifiedArgs`). Without it, point 6 means the hook is inert on real hosts.
- **Governance + error-hint events become VS Code-eligible** in `ctx init` host wiring
  (write `.claude/settings.local.json` or `.github/hooks`, absolute node path, streamed
  stdin, `powershell` value starting with `&`, `bash` plain — the config bugs the spike
  already diagnosed).
- **Spike backlog:** ~~one clean `updatedInput` honor-test on VS Code~~ DONE 2026-06-06 —
  honored (point 5). Remaining: ship the host-protocol adapter + absolute-path `ctx init` so
  the real hook stops emitting the ctx-invented shape and stops calling bare `ctx`.
- **Preview-risk mitigation:** a CI probe that diffs `hookCommandTypes.ts` and alerts if
  `modifiedResult` ever appears (would reopen direct-tool output compression on VS Code).
- DESIGN §3.3 / §13.1 / §66 reason text updates; ADR 0002 premise annotated as amended.
- Memory: [[vscode-copilot-hook-no-modifiedresult]], [[rtk-delivery-mechanisms]].
