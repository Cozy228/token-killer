# Plan 010: Spike — package tk as a GitHub Agent Plugin (Copilot CLI + VS Code distribution)

> **Executor instructions**: This is a SPIKE, not a feature build. The goal is a
> **go/no-go decision** backed by a minimal working package and live verification,
> NOT a production integration. Follow the steps, run every verification, and honor
> the STOP conditions. The spike produces a throwaway package under `spikes/` plus a
> written findings section appended to this plan; it does NOT modify `src/` unless
> Step 5's decision gate explicitly says to. When done, update the status row in
> `plans/README.md`.
>
> **Drift check (run first)**: confirm the external feature is still live and the
> format unchanged since this plan was written (2026-06-15) — both changelogs say
> "public preview, subject to change":
> - https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-plugins
> - https://code.visualstudio.com/docs/agent-customization/agent-plugins
> If the manifest fields or hook format diverge from "Current external state" below,
> re-pin them before proceeding; on a material divergence, treat it as a STOP.

## Status

- **Priority**: P3 (direction / distribution; no user-facing bug)
- **Effort**: M (spike) — S of code, M of live cross-host verification
- **Risk**: LOW (throwaway package, no `src/` changes until the decision gate)
- **Depends on**: none (soft: 001 CI, so any later productionization has a gate)
- **Category**: direction finding / distribution channel
- **Planned at**: commit `22579d2`, 2026-06-15 (direct user request)
- **Issue**: — (no tracker issue; user request)

## Why this matters

tk currently reaches its hosts by **manual wiring** — `tk install` writes a PATH shim
and per-host hook config (`~/.copilot/hooks/tk-rewrite.json`, Claude `settings.json`),
selected by `selectTier()` over the `hostAdapter` table. Every user runs `tk install`
on every machine; there is no marketplace presence and no fleet-wide push.

GitHub shipped a **shared plugin format** (an "Agent Plugin") that both Copilot CLI and
VS Code (≥ 1.122) consume, plus **enterprise-managed plugin standards**: an admin lists
default-enabled plugins in `<enterprise>/.github-private/settings.json`, and every user's
Copilot CLI + VS Code client auto-installs them on sign-in. For tk this is a **pure
distribution win** — marketplace discovery, VS Code auto-discovery of CLI-installed
plugins (`~/.copilot/installed-plugins/`), and an enterprise default-enable path that
makes per-machine `tk install` unnecessary.

**The catch (do not lose this):** the plugin format changes *delivery*, not *capability*.
In the VS Code host, a `PostToolUse` hook still cannot return `modifiedResult`, so tk
**cannot compress tool output post-hoc there** — confirmed in this repo's own findings
(memory `vscode-copilot-hook-no-modifiedresult`, ADR notes; `src/hook/` is built around
`PreToolUse` command *rewrite*, not output rewrite). The spike must therefore answer a
*distribution* question, and explicitly NOT claim it raises the VS Code ceiling.

## Current external state (pinned 2026-06-15 — re-verify in drift check)

Agent Plugin package layout (CLI + VS Code share this format):

```
<plugin>/
├── plugin.json          # manifest (required)
├── hooks/hooks.json     # Claude hook format: PreToolUse/PostToolUse/...
├── skills/<name>/SKILL.md
├── agents/<name>.agent.md
└── .mcp.json
```

- `plugin.json` required field: `name` (kebab-case, `[a-z0-9-]`, ≤64). Optional:
  `description`, `version`, `author`, `license`, `keywords`, `skills`, `agents`,
  `hooks` (path or inline), `mcpServers`.
- Manifest auto-detect order: `.plugin/plugin.json` → `plugin.json` (root) →
  `.github/plugin/plugin.json` → `.claude-plugin/plugin.json`.
- Hook format = **the same Claude hook format tk already emits** — events
  `SessionStart`/`UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`PreCompact`/
  `SubagentStart`/`SubagentStop`/`Stop`; `${CLAUDE_PLUGIN_ROOT}` expands to the plugin
  dir and is also set as an env var in the hook process.
- Install/discovery: marketplace via Extensions view; `Chat: Install Plugin From Source`
  (Git URL); CLI-installed plugins auto-appear in VS Code's "Agent Plugins - Installed".
- Enterprise: `<enterprise>/.github-private/settings.json` lists marketplaces +
  default-enabled plugins; applied on Copilot CLI sign-in to both CLI and VS Code.

## Current state (tk internals we measure against — do not reinvent)

- **Copilot hook writer** — `src/hook/install.ts`: `buildCopilotHookConfig(command)`
  emits `{ managedBy: "token-killer", hooks: { PreToolUse: [{ type:"command", command,
  cwd, timeout }] } }` to `~/.copilot/hooks/tk-rewrite.json` (`installCopilotHookConfig`,
  `:` near the writer). The command string comes from `resolveHookCommand("copilot")` —
  **already an absolute `node + cli.js` invocation** (ADR 0005 §5: a bare `tk` is inert on
  Windows PowerShell), so it is directly reusable inside a plugin `hooks.json`.
- **Claude hook writer** — `src/hook/claudeInstall.ts`: `installClaudeHook` /
  `planClaudeHookInstall` (settings.json patch, marker-guarded).
- **Host seam** — `src/shim/hostAdapter.ts`: `HostAdapter` interface + `adapters`
  table (`copilot-cli`, `claude-code`), `dialect` (`cli` camelCase vs `vscode`
  snake_case), `supportedTiers`. `src/shim/init.ts` drives install off `selectTier()`;
  `src/shim/detect.ts` defines `Host`/`Tier`.
- **Guidance / injection** — `guidanceFilePath` (`src/shim/guidance.ts`, the TK.md
  usage guide), `userInjectionPath` (`src/shim/injection.ts`).
- **The runtime handler is unchanged either way** — `tk hook copilot` (`src/hook/cli.ts`
  → `rewrite.ts`/`govern.ts`/`copilot.ts`) is what runs regardless of whether the hook
  config is delivered by `tk install` or by a plugin. The spike does NOT touch it.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Build the cli | `pnpm build` | exit 0; `dist/cli.js` present |
| Resolve the hook command tk would emit | `node dist/cli.js install --host copilot-cli --dry-run` | prints the absolute `node … cli.js hook copilot` command + target path |
| Inspect current copilot config | `cat ~/.copilot/hooks/tk-rewrite.json` (if present) | shows the live `{ managedBy, hooks }` shape |
| Copilot CLI plugin install (live box) | `copilot` → `/plugin install <git-url-or-path>` (per current CLI help) | plugin appears in `~/.copilot/installed-plugins/` |
| VS Code discovery (live box) | Extensions sidebar → search `@agentPlugins` → "Installed" | tk plugin listed |

> The live install/verify commands depend on the operator having Copilot CLI ≥ the
> preview build and VS Code ≥ 1.122. If either is unavailable, run Steps 1–3 (build +
> static validation) and record Steps 4–5 as BLOCKED with the missing prerequisite —
> do not fake a live result.

## Scope

**In scope (spike artifacts only):**
- New throwaway dir `spikes/agent-plugin/` containing a minimal `plugin.json` +
  `hooks/hooks.json` that points `PreToolUse` at tk's existing `tk hook copilot`
  handler. `spikes/` is gitignored working space (mirrors `rtk/`/`ztk/` convention) —
  confirm it is ignored or add it; the spike package is NOT shipped from this plan.
- A short generator note or one-off script that derives `hooks/hooks.json` from
  `resolveHookCommand()` output (prove the existing command string drops in unchanged).
- Findings written into the "Spike findings" section at the bottom of THIS file.

**Out of scope (do NOT touch — needs the Step 5 decision + its own plan):**
- Any change to `src/` (no new `tk install --as-plugin`, no `hostAdapter` entry, no
  `src/hook/install.ts` rewrite). Productionization is a *separate* plan gated on the
  go decision.
- `package.json` publish config / npm packaging of the plugin.
- The enterprise `.github-private/settings.json` rollout (org-admin action; document
  the path, do not perform it).
- Any attempt to make VS Code `PostToolUse` compress output — known dead end.

## Steps

### Step 1 — Pin the external format (drift check, written)
Fetch the two pinned URLs; confirm `plugin.json` required/optional fields and the
hook event list still match "Current external state". Record the doc revision date and
any field renames in the findings section. **STOP if** the hook format no longer accepts
a `command`-type `PreToolUse` entry (that would invalidate the whole approach).

### Step 2 — Build the minimal plugin package
- `pnpm build` so `dist/cli.js` exists.
- `node dist/cli.js install --host copilot-cli --dry-run` → capture the absolute
  `node … cli.js hook copilot` command it would write.
- Write `spikes/agent-plugin/plugin.json`:
  ```json
  {
    "name": "token-killer",
    "description": "Compresses verbose tool output before it reaches the model (60–90% on common dev commands).",
    "version": "0.0.0-spike",
    "hooks": "./hooks/hooks.json"
  }
  ```
- Write `spikes/agent-plugin/hooks/hooks.json` reusing the **exact** command from the
  dry-run (decide and record: hard-absolute path vs `${CLAUDE_PLUGIN_ROOT}`-relative —
  a plugin can bundle `dist/`, but the spike may point at the dev `dist/` for speed):
  ```json
  {
    "hooks": {
      "PreToolUse": [
        { "type": "command", "command": "<command from dry-run>", "timeout": 10 }
      ]
    }
  }
  ```
- **Verify**: `node -e "JSON.parse(require('fs').readFileSync('spikes/agent-plugin/plugin.json'))"`
  and same for `hooks.json` → both parse. Confirm the command string is byte-identical
  to what `tk install` writes today (the whole point: zero handler change).

### Step 3 — Static contract check
Confirm the plugin's `PreToolUse` payload contract matches tk's normalizer:
- The plugin hook fires with the **host's** dialect (Copilot CLI = camelCase `toolName`/
  `toolArgs`; VS Code = snake_case). `src/hook/normalize.ts` already handles both
  (`hostAdapter` `dialect` field). Confirm by inspection that `tk hook copilot` invoked
  via a plugin sees the same stdin it sees today via `~/.copilot/hooks/tk-rewrite.json`
  — i.e. delivery path differs, payload does not. Record any uncertainty as a live-test
  item for Step 4.
- **STOP if** the plugin invocation model passes arguments differently (e.g. argv
  instead of stdin JSON) — that would need a handler change and a re-scope.

### Step 4 — Live verification (requires the preview builds)
On a box with Copilot CLI (preview) + VS Code ≥ 1.122:
1. Install the spike plugin from `spikes/agent-plugin/` (Git URL or local source per
   current CLI/VS Code install command — pin the exact command in findings).
2. Confirm it lands in `~/.copilot/installed-plugins/` and shows in VS Code's
   "Agent Plugins - Installed" (`@agentPlugins`).
3. In **Copilot CLI**: run a known-verbose command through an agent turn (e.g. a big
   `git log`/`rg`) and confirm tk compresses it (compare against the same command with
   the plugin disabled). This is the capability that should still work.
4. In **VS Code**: confirm the `PreToolUse` rewrite path fires (command gets the `tk`
   treatment) AND document that `PostToolUse` output compression does NOT (expected
   ceiling). Capture both observations verbatim.
5. Note any conflict if BOTH the legacy `~/.copilot/hooks/tk-rewrite.json` and the
   plugin are present (double-rewrite? precedence?) — a real productionization hazard.

### Step 5 — Decision gate (the deliverable)
Write a **go / no-go / defer** recommendation in the findings section, answering:
- **Distribution value**: does the plugin meaningfully beat `tk install` for reach
  (marketplace + VS Code auto-discovery + enterprise default-enable)?
- **Capability**: confirmed no regression vs today's hooks in Copilot CLI; confirmed
  no VS Code output-compression gain (document, don't relitigate).
- **Cost to productionize**: estimate the real `src/` work — most likely a
  `tk install --as-plugin` / `tk plugin build` that emits the package from
  `resolveHookCommand()` + `buildCopilotHookConfig` shapes, plus a `hostAdapter`
  note. Size it; do NOT build it here.
- **Coexistence**: how legacy hook config and plugin avoid double-application.
- **Enterprise path**: the exact `.github-private/settings.json` entry an admin would
  add (document it; it is an org action, not tk code).

If **go**, this plan ends by spawning a follow-up implementation plan (011) — it does
not implement here.

## Done criteria

Machine-/operator-checkable. ALL must hold:
- [ ] `spikes/agent-plugin/plugin.json` + `hooks/hooks.json` exist and parse; the hook
      command is byte-identical to `tk install --host copilot-cli --dry-run` output.
- [ ] `spikes/` is gitignored (the spike package is not committed/shipped).
- [ ] No files under `src/` changed (`git status --short`).
- [ ] Step 1 drift check + Step 5 decision are written into the "Spike findings"
      section with the doc revision date pinned.
- [ ] Live results (Step 4) are recorded with the exact install command, OR Steps 4–5
      are marked BLOCKED with the specific missing prerequisite (no faked live result).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:
- The external plugin format diverged materially from "Current external state" (the
  feature is preview, "subject to change") — report the delta, do not guess a fix.
- The plugin invocation model is argv-based rather than stdin-JSON (would require a
  `src/hook/` change — re-scope, don't patch the spike into prod).
- A live test shows the plugin double-applies with the legacy hook config — report the
  coexistence hazard before any productionization.
- Any step would require editing `src/` to make the spike "work" — that is the signal
  this is no longer a spike; stop and convert to an implementation plan.

## Spike findings

_(Executor fills this in. Capture: pinned doc revision date; the byte-identical command
proof; live CLI + VS Code observations; the go/no-go/defer decision with productionization
size estimate; the enterprise settings.json snippet; the coexistence resolution.)_
