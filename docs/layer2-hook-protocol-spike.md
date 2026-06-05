# Layer 2 Hook Protocol Spike — Findings

Empirical + documentation study of whether GitHub Copilot hosts actually honor the
hook outputs Token Killer's Layer 2 depends on (command rewrite, tool-result
replacement, governance, fail-open). This gates the Layer 2 slice plan.

- **Spike script (throwaway):** <https://gist.github.com/Cozy228/2068a2981779033cbf875c237bdaa19f>
- **Method:** a single Node hook (`tgspike-hook.mjs`) installed on each host. It
  auto-detects the payload dialect, logs every raw payload, and fires four
  marker-driven probes from chat. Run on Windows 11 (Copilot CLI in PowerShell,
  VS Code, IntelliJ IDEA).
- **Probes:** `TGREWRITE`→pretool rewrite · `tgread`→posttool result replace ·
  `TGCRASH`→pretool exit 1 · `TGBLOCK`→prompt block.

## 1. Empirical results (observed in chat)

| Probe | Copilot CLI | VS Code | IntelliJ IDEA |
|---|---|---|---|
| pretool rewrite (`modifiedArgs`/`updatedInput`) | ✅ honored | ❌ not honored | ❌ no effect |
| posttool replace (`modifiedResult`) | ✅ honored | ❌ not honored | ❌ no effect |
| fail-open vs closed (crash, exit 1) | ✅ fail-closed (denied) | ran (no effect) | ran (no effect) |
| prompt block (`TGBLOCK`) | ✅ honored | ⚠️ surfaced an ask/notification | ❌ nothing |

**Confounds (why the IDE negatives are not yet conclusive):**

1. **VS Code engine was off.** VS Code exposes two settings: `chat: use hooks`
   (GitHub-hooks engine; the user could **not** enable it — likely org/enterprise
   preview-policy gated) and `chat: use claude hooks` (Claude-style engine; was
   **off**). With the engine off, the hooks never ran as intended.
2. **Spike used the wrong config/output format for the IDE engine.** The spike
   emitted the GitHub-CLI config shape (`version` + `powershell`/`bash` keys) and a
   top-level `modifiedResult`. VS Code's Claude-style engine expects `command` +
   `windows/linux/osx` entries in `.claude/settings.json` / `.github/hooks/`, and
   wraps output in `hookSpecificOutput`. So the IDE may not have run the hook at all.
3. **IntelliJ hooks are preview + gated.** No hooks UI in the plugin; requires an
   admin-enabled "Editor preview features policy" (Business/Enterprise) and a full
   IDE restart to pick up `.github/hooks/`. Treated as not-loaded, not "unsupported".

The **Copilot CLI** results have no such confound (user-level `~/.copilot/hooks/`
loads by default) and are taken as authoritative.

## 1.5 Round 2 — real-environment retest (2026-06-05, VS Code 1.123.0, Windows 11)

A second round re-tested VS Code after clearing the round-1 confounds. **Outcome: the
round-1 IDE negatives were largely instrumentation bugs, not capability gaps — yet the
net conclusion for command-compression changed direction entirely (see §3).**

**Setup corrections found (round-1 framing was wrong):**

- There is **no `chat: use hooks` setting**. VS Code's hook engine is driven by
  **`chat.hookFilesLocations`**; the default locations are `.github/hooks/*.json`,
  `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`
  (`~/.copilot/hooks` is **not** a default). The `/hooks` chat command (or "Chat: Open
  Customizations") is the real entry point.
- **`matcher` is a non-factor:** VS Code currently **ignores matcher values** and runs
  every hook on every tool invocation (so a `run_in_terminal` vs `powershell` tool-name
  mismatch never blocks firing).

**Observed (in order):**

1. The hook engine **is active** — `/hooks` lists the installed hooks; the opened
   workspace was the `--repo` repo, so `.github/hooks` loaded.
2. With **Claude-format** config (`.claude/settings.local.json`, `command` key) + an
   **absolute node path**, VS Code **executed** the `UserPromptSubmit` hook (a log line
   appeared) — but the payload arrived with **empty stdin**, so the spike's synchronous
   `fs.readFileSync(0)` read nothing → `parseError`. So VS Code *does* invoke command
   hooks and *does* deliver the payload over stdin (matching its docs); the spike's
   sync read was simply unreliable on the Windows pipe.
3. Two **instrumentation bugs** explained every round-1 "zero logs / no honor":
   - **Bare `node` was not on the hook's PATH** → silent spawn failure (ENOENT) → not a
     single log line. Fixed by baking `process.execPath` (absolute node) into the config.
   - **Synchronous fd-0 stdin read** → empty payload on VS Code's async pipe → parse
     error. Fixed by consuming `process.stdin` as a stream (with a timeout net).
4. After fixing both and switching to **GitHub-format only** (`~/.copilot/hooks` +
   `<repo>/.github/hooks`), `/hooks` listed them and `deny` was not honored — but the
   **VS Code logs named two config bugs, not a capability gap** (this retracts an earlier
   "listed but not executed" reading; VS Code *does* execute these hooks):
   - `Neither 'bash' nor 'powershell' specified in hook command configuration` —
     **source-level root cause** (validator reverse-engineered from the copilot-cli
     bundle; throws since 1.0.14): **Copilot is one engine that MERGES `.github/hooks/*`
     + `.claude/settings*.json`** into its own pipeline. For the Claude *nested* shape
     `{ matcher, hooks:[{type,command}] }`, Copilot validates/executes the **OUTER
     matcher-group object**, and its validator reads **only top-level `bash`/`powershell`
     — it ignores `command` and never descends into `hooks[]`:
     `if(!entry.bash && !entry.powershell) throw …`. The outer wrapper has neither →
     throws. (So VS Code has **no separate "Claude runner"**; the "different Claude logs"
     were this throw.) **Fix:** put `bash` + `powershell` (the latter with `&`) + `type`
     + `timeoutSec` on the **OUTER** wrapper (for Copilot), keep nested `hooks[].command`
     (for Claude Code, which ignores the extra outer fields). Flat `.github/hooks` entries
     were never the failure source — they already carry `bash`. (My first two fixes
     mis-placed the keys on the inner hook object and mis-blamed "leftover entries".)
   - `preToolUse … fail-closed … hook command failed with code 1` — the spike's
     `powershell` value was a **bare quoted exe path**, which PowerShell parses as a
     string literal (`"node.exe" "script"` → `ParserError`, exit 1 — reproduced with
     `pwsh 7.6`). **VS Code fail-closes preToolUse**, so the broken hook *blocked every
     tool call*. The hook ran; it just exited 1.
   - **Fixed in the spike:** `powershell` now starts with the call operator `&`, `bash`
     stays plain, the `command`-only shape is dropped.

**Net read (corrected):** VS Code **does execute** GitHub-format command hooks and
**does enforce fail-closed preToolUse governance** — earlier "no honor / not executed"
was a malformed `powershell` command + leftover config, now fixed. What VS Code actually
honors with a *working* hook (deny / `updatedInput` rewrite / `modifiedResult`) is
**pending a clean re-test** and is no longer assumed. Independently, command-compression
is still best **decoupled from hooks** via a **PATH shim** (§3) — host-agnostic and not
dependent on per-host hook quirks — but the shim is now a *design preference*, not forced
by "VS Code hooks don't work."

## 2. Documented capability ceiling (read directly from product sources)

Independent of the spike, the hosts' own references fix what each CAN honor:

| Capability | Copilot CLI / Cloud Agent | VS Code (hooks) | IntelliJ (hooks) |
|---|---|---|---|
| Command rewrite (`modifiedArgs` / `updatedInput`) | ✅ yes | ⚠️ `updatedInput` only in the GitHub-hooks variant, and only if it **exactly matches the tool input schema**; absent from the Claude-hooks contract | preview / unverified |
| **Result replacement (`modifiedResult`)** | ✅ yes | ❌ **not in any VS Code contract** (only `decision: block` + `systemMessage`) | preview / unverified |
| Context injection | `additionalContext` (≤10 KB) | ✅ `hookSpecificOutput.additionalContext`, same-turn since **1.118** ([vscode#311138](https://github.com/microsoft/vscode/issues/311138)) | flaky — events don't reliably fire ([#1653](https://github.com/microsoft/copilot-intellij-feedback/issues/1653)) |
| Permission governance | `allow/deny/ask` | `hookSpecificOutput.permissionDecision` (`allow/ask/deny`) + `decision: block` | preview |
| Prompt block/modify | `userPromptSubmitted` (notification-only per ref) | `UserPromptSubmit` (surfaces ask) | preview |
| Failure mode on hook crash | **fail-closed** (deny; exit 2 = deny) | exit 2 = blocking error; others = non-blocking warning | preview |

Key sources: [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference),
[Copilot CLI post-tool-use](https://docs.github.com/en/copilot/how-tos/copilot-sdk/hooks/post-tool-use),
[VS Code agent hooks](https://code.visualstudio.com/docs/agent-customization/hooks),
[VS Code Claude-hooks reference](https://github.com/microsoft/vscode-copilot-chat/blob/main/assets/prompts/skills/agent-customization/references/hooks.md).

### The decisive fact

**Transparent rewrite and tool-result compression are a Copilot CLI / Cloud Agent
capability. The VS Code and JetBrains IDE plugins do not implement `modifiedResult`
at all** — at most they govern (allow/ask/deny/block) and inject context hints. No
setting unlocks result replacement in the IDEs; it is not in their contract.

> **But command-compression does not depend on `modifiedResult`.** Like RTK, Token
> Guard compresses by running a wrapper (`tk <cmd>`) that emits less — the hook only
> ever needed to *prepend* `tk`, never to replace a result. `modifiedResult` being
> CLI-only therefore bounds **native-direct-tool** compression (read/grep/list), not
> terminal-command compression, which a PATH shim delivers host-agnostically (§3).

### Version & issue evidence

- **VS Code `additionalContext` works (1.118+).** [vscode#311138](https://github.com/microsoft/vscode/issues/311138)
  ("PostToolUse hook additionalContext not injected into same-turn model request")
  is **closed/completed, milestone 1.118.0** (2026-04-24). On VS Code ≥ 1.118, a
  PostToolUse hook returning `hookSpecificOutput.additionalContext` is injected into
  the same turn. This fix does **not** add `modifiedResult` — result replacement is
  still unsupported. Implication: an earlier "no honor" in VS Code is most likely the
  `chat: use claude hooks` engine being **off**, not a capability gap, for
  additionalContext + governance.
- **`modifiedResult` is a Copilot CLI/SDK surface, absent from VS Code.** There is no
  single "VS Code won't support modifiedResult" issue; the evidence is a repo
  asymmetry: **zero** mentions of `modifiedResult` anywhere in `microsoft/vscode` or
  `microsoft/vscode-copilot-chat` (docs or tracker), while VS Code posttool issues only
  ever concern `additionalContext` / `decision:block` / reading `tool_response`
  ([vscode#311238](https://github.com/microsoft/vscode/issues/311238)). Meanwhile
  `modifiedResult` is first-class and bug-tracked in the GitHub repos
  ([copilot-cli#3361](https://github.com/github/copilot-cli/issues/3361)). VS Code's own
  hook reference enumerates supported outputs and `modifiedResult` is not among them.
- **On Copilot CLI, use the command-hook path, not the SDK extension.**
  [copilot-cli#3361](https://github.com/github/copilot-cli/issues/3361) shows
  `modifiedResult` from an SDK **extension** `onPostToolUse` is not applied to the
  model's context (TUI-only). The spike confirmed the **command-hook** path
  (`~/.copilot/hooks/` + stdin/stdout) does apply it. Target command hooks.
- **IntelliJ hooks are nominally-supported but flaky.** [copilot-intellij-feedback#1653](https://github.com/microsoft/copilot-intellij-feedback/issues/1653)
  is **open**: the JetBrains event set is limited
  (`sessionStart/sessionEnd/userPromptSubmitted/preToolUse/postToolUse/errorOccurred`)
  and multiple users on the latest stable plugin (IDEA 2026.1.x) report that even
  basic events do not fire (errors in `idea.log`). No "fixed in version X" exists. The
  IntelliJ negative is a platform gap, not a user-config error.

## 3. Implications for Token Killer Layer 2

**Two delivery layers (decoupled after Round 2):**

- **Layer A — terminal-command compression (host-agnostic, via PATH shim).** Install
  `tk`-wrapper shims (named `git`, `pnpm`, `npx`, `cargo`, …) ahead on `PATH`. Any host
  that runs commands through a terminal hits the shim → real tool → `tk` handler
  compresses the output the model sees. No hook required. In VS Code this covers the
  **entire** command-execution surface: per the session report, `run_in_terminal` is
  ~32% of tool calls and **all** git/node/shell commands flow through it.
- **Layer B — native-direct-tool compression (Copilot-CLI-only, via hook).** The hook's
  `modifiedResult` is the only way to compress a host's *native* tools (`read_file`,
  `grep_search`, `list_dir`) that never touch a shell. This is genuinely CLI-only.

| Host | Layer A (shim) | Layer B (hook) | Notes |
|---|---|---|---|
| **Copilot CLI** | ✅ shim or pretool rewrite to `tk <cmd>` | ✅ `modifiedResult` on native tools | Full capability; pretool is fail-closed, so internal fail-open must never crash. |
| **VS Code** | ✅ **shim** (all commands route via `run_in_terminal`) | ❌ no `modifiedResult` in contract; GitHub-format hooks did not execute, Claude-format only governs | Optional: `additionalContext` hints + deny/ask governance via Claude-format hook (works ≥1.118), if ever wanted. |
| **IntelliJ IDEA** | ✅ **shim** (terminal commands) | ❌ hooks flaky/don't fire ([#1653](https://github.com/microsoft/copilot-intellij-feedback/issues/1653)) | Shim sidesteps the broken hook surface entirely. |

Consequences (revised — supersedes the round-1 "CLI-only headline"):

- **The headline value is NOT Copilot-CLI-only.** Terminal-command compression (Layer A)
  ships to **every** host via the PATH shim — including the largest population (VS Code).
  Only native-direct-tool compression (Layer B) stays CLI-only. Lead with the shim.
- The shim is the **rtk model**: RTK never takes over hook results — its Claude Code
  hook only rewrites `git status` → `rtk git status`, and the `rtk` wrapper does the
  compression. The hook is just one *delivery* of that prefix; a PATH shim is another,
  host-independent one. **Compression handlers (`src/handlers/*`) are unchanged** — only
  the delivery layer is new.
- Shim contract to get right: transparent pass-through of exit code, stdin/TTY,
  arguments, and any output the model still needs; safe-by-default (never corrupt
  output); easy opt-out. Provide a zero-config fallback via an instruction file
  (`.github/copilot-instructions.md`: "prefix commands with `tk`") for hosts where
  modifying `PATH` is undesirable.
- `tk hook init` stays **Copilot-CLI-focused** (GitHub-hooks `~/.copilot/hooks/`); VS
  Code/IntelliJ are served by `tk shim install` (PATH), not by hook config.
- Prompt-side governance is record-only + session-start injection; no host blocks a
  submitted prompt (see [CONTEXT.md](../CONTEXT.md) decisions).

## 4. Status after Round 2 / what is left open

Settled by Round 2 (§1.5): the round-1 IDE negatives were instrumentation bugs
(node-PATH + sync stdin read), not the whole story; VS Code *does* run command hooks
but only the Claude-format path fired and result replacement is absent regardless. The
strategic response is the **PATH shim** (§3), which makes the hook question moot for
command-compression. **Direction is locked: ship the shim; do not keep chasing the IDE
hook surface for compression.**

Still open, only if IDE-side **governance** (not compression) is later wanted:

1. Confirm whether VS Code's **Claude-format** hook honors `permissionDecision: deny` /
   `additionalContext` once the spike reads stdin correctly (the stdin bug masked this;
   the deny probe was never cleanly observed on VS Code).
2. Why the **GitHub-format** config is listed by `/hooks` yet not executed in VS Code,
   while the Claude-format config executed — a parser/shape gap, not pursued.
3. IntelliJ: admin preview policy + full restart; check whether a hooks UI appears.

Neither changes the decisive facts: result replacement is Copilot-CLI-only, and
command-compression does not need it.
