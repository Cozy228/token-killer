# Copilot in IntelliJ IDEA: Hooks and Rewrite Risk

Date: 2026-07-08

## Summary

GitHub's current public signals are inconsistent:

- GitHub's 2026-03-11 JetBrains changelog says agent hooks for JetBrains IDEs were in public preview, with support for `userPromptSubmitted`, `preToolUse`, `postToolUse`, and `errorOccurred` events in `.github/hooks/*.json`.
  Source: https://github.blog/changelog/2026-03-11-major-agentic-capabilities-improvements-in-github-copilot-for-jetbrains-ides/
- GitHub's 2026-06-02 JetBrains changelog says agent hooks are generally available in JetBrains IDEs.
  Source: https://github.blog/changelog/2026-06-02-introducing-copilot-cli-and-agentic-capabilities-enhancements-in-jetbrains-ides/
- GitHub Docs still have conflicting surface tables: the hooks reference describes hooks for Copilot CLI and Copilot cloud agent, while the customization cheat sheet marks hooks as not supported in JetBrains IDEs.
  Sources:
  - https://docs.github.com/en/copilot/reference/hooks-reference
  - https://docs.github.com/en/copilot/reference/customization-cheat-sheet

Practical conclusion: treat JetBrains hooks as present on recent Copilot for JetBrains builds, but do not assume they have VS Code / Copilot CLI rewrite parity.

## Triggering Findings

The most important distinction is "hook installed/enabled" versus "hook actually
triggered." The JetBrains path appears to have a narrower discovery contract than
Copilot CLI:

- GitHub's March 2026 JetBrains changelog says JetBrains agent hooks are configured
  from `.github/hooks/` in the repository, and lists `userPromptSubmitted`,
  `preToolUse`, `postToolUse`, and `errorOccurred`.
  Source: https://github.blog/changelog/2026-03-11-major-agentic-capabilities-improvements-in-github-copilot-for-jetbrains-ides/
- GitHub's general hooks reference says Copilot CLI loads policy, repo, user,
  inline, and plugin hooks, including user-level `~/.copilot/hooks/`.
  Source: https://docs.github.com/en/copilot/reference/hooks-reference
- A JetBrains feedback thread reports the observed failure mode directly: IDEA
  logs showed `enableHooks: true` and `customHook.enabled: true`, but no execution
  trace. The later working recipe says JetBrains' bundled agent loaded only:

```text
<git-repo-root>/.github/hooks/**/*.json
```

  It explicitly says user/global hook locations such as `~/.copilot/hooks/` are
  silently ignored by the JetBrains plugin.
  Source: https://github.com/microsoft/copilot-intellij-feedback/issues/1653#issuecomment-4702522430

That matches the remembered test result: a hook can be "enabled" by policy/config
and still never trigger if ctx only wrote the shared user-level Copilot hook file.
For JetBrains native plugin sessions, the decisive test is not `ctx status`; it is
whether a repo-local `.github/hooks/*.json` command hook logs a `preToolUse`
payload when the agent runs a terminal command.

Minimal trigger-only probe for JetBrains:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "printf '%s %s\\n' \"$(date -Is)\" \"$(cat)\" >> /tmp/copilot-hook-debug.log",
        "cwd": ".",
        "timeoutSec": 10
      }
    ]
  }
}
```

Place it at `<repo>/.github/hooks/debug.json`, restart the IDE, ask the agent to
run a terminal command, and inspect `/tmp/copilot-hook-debug.log`.

Additional JetBrains-specific gotchas from the same thread:

- event names are camelCase (`preToolUse`), not PascalCase (`PreToolUse`);
- command hooks need `type: "command"` and a platform field (`bash` or
  `powershell`);
- use absolute paths for real hook binaries/scripts because the hook runs in a
  non-interactive shell and may not inherit the user's normal PATH;
- the path is resolved from the git repository root, so the project must be a git
  repo.

## Harness Split

JetBrains now has two relevant agent paths:

- the older JetBrains local agent harness, where the feedback evidence points to
  repo-local `.github/hooks/**/*.json` discovery only;
- the Copilot CLI harness running under JetBrains, which GitHub says is being
  rolled out as the default agent provider.

Source: https://devblogs.microsoft.com/java/github-copilot-for-jetbrains-is-moving-to-copilot-cli-as-the-default-agent-harness/

This means a live IDEA test must record which provider was selected in the agent
picker. If the session is truly Copilot CLI, the general Copilot CLI hook
locations may apply. If it is the JetBrains local harness, user-level
`~/.copilot/hooks/` is not enough based on the current field evidence.

## Known Risk After Trigger

The currently relevant JetBrains feedback issue says the JetBrains agent path can execute `preToolUse` hooks but only acts on `permissionDecision: "deny"`, ignoring transparent input rewrite carriers such as `modifiedArgs` and `hookSpecificOutput.updatedInput`.

Source: https://github.com/microsoft/copilot-intellij-feedback/issues/1819

That would break ctx's transparent command-rewrite model in JetBrains even when the hook fires, because ctx currently emits:

- flat `modifiedArgs` for camelCase / Copilot CLI dialect;
- `hookSpecificOutput.updatedInput` for VS Code-style snake_case dialect.

## Payload Shape to Watch

The rtk issue captured a JetBrains terminal-tool payload shaped like:

```json
{
  "toolName": "run_in_terminal",
  "toolArgs": "{\"command\":\"git log --oneline -20\",\"explanation\":\"Show local git history\",\"isBackground\":false}"
}
```

Source: https://github.com/rtk-ai/rtk/issues/2443

ctx already recognizes `run_in_terminal` as `execute_adjacent` in `src/hook/normalize.ts`, so it does not have the same "only bash" detection gap described there. A local probe on this repo produced a `modifiedArgs` rewrite for the simplified payload:

```json
{
  "permissionDecision": "allow",
  "permissionDecisionReason": "ctx auto-rewrite",
  "modifiedArgs": {
    "command": "ctx git log --oneline -20",
    "explanation": "Show local git history",
    "isBackground": false
  }
}
```

If the JetBrains host ignores `modifiedArgs`, this output is still inert for transparent rewrite.

## Recommendation

Keep VS Code and Copilot CLI on hook-based delivery where the host honors rewrites. Keep JetBrains on a measured/experimental path until a live JetBrains probe proves one of these:

1. The current JetBrains host honors `modifiedArgs` or `hookSpecificOutput.updatedInput`.
2. ctx adds a JetBrains-specific fallback that denies the raw command with a suggested rewritten command, accepting the extra rejected turn.
3. Users run Copilot CLI inside the JetBrains integrated terminal, where the CLI hook contract applies.
