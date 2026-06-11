// Runtime handler for `tk hook claude` — the Claude Code PreToolUse (Bash) seam.
//
// Claude Code's ~/.claude/settings.json wires a PreToolUse hook with
// `matcher: "Bash"` to this command (mirrors RTK's `rtk hook claude`). We read
// the PreToolUse payload from stdin and, for a rewritable Bash command, emit the
// `hookSpecificOutput` JSON that tells Claude Code to run `tk <cmd>` instead.
// Everything else — non-Bash, non-rewritable, pass, parse error, internal
// failure — produces **empty stdout, exit 0** (fail-open; CONTEXT.md →
// Fail-open), so Claude Code runs the command unchanged and the agent never
// hangs or gets confused.
//
// Claude Code keys its rewrite off `updatedInput` alone (no `permissionDecision`),
// so this builds the output directly rather than reusing copilot.ts's per-dialect
// `toHostOutput` (which adds `permissionDecision`/`modifiedArgs` for VS Code +
// Copilot CLI). The only shared pieces are `rewriteCommand` (the engine) and
// `readStreamWithTimeout` (bounded stdin).
// Bash-only by design: no prompt/error governance, no postToolUse/result
// compression — the host's hook uses `matcher: "Bash"`.

import { rewriteCommand } from "./rewrite.js";
import { readStreamWithTimeout } from "./copilot.js";
import { recordHookError, tkDebug } from "./debug.js";

// Ground-truth reason string Claude Code shows for the auto-rewrite (the tk
// analogue of RTK's "RTK auto-rewrite").
export const CLAUDE_REWRITE_REASON = "tk auto-rewrite";

type ClaudePreToolUse = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: string };
  // Claude Code stamps the conversation id at the top level of every hook payload.
  // Carried into the rewrite as `--session <id>` so tk's history stamps it (ADR 0009).
  session_id?: string;
};

// The exact output Claude Code honors as a command rewrite (verified live
// against `rtk hook claude`). Built only for a Bash command that rewriteCommand
// decides to rewrite; `null` everywhere else (⇒ emit nothing ⇒ run unchanged).
export type ClaudeHookOutput = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecisionReason: string;
    updatedInput: { command: string };
  };
};

// Pure, total decision: parsed payload → rewrite output or null. No I/O.
export function decide(input: unknown): ClaudeHookOutput | null {
  if (!input || typeof input !== "object") {
    tkDebug("claude:skip", { reason: "non-object payload" });
    return null;
  }
  const payload = input as ClaudePreToolUse;
  // The host's hook matches `Bash` only; ignore anything else defensively.
  if (payload.tool_name !== "Bash") {
    tkDebug("claude:skip", { reason: "non-Bash tool", tool: payload.tool_name });
    return null;
  }
  const command = payload.tool_input?.command;
  if (typeof command !== "string" || command.length === 0) {
    tkDebug("claude:skip", { reason: "empty command" });
    return null;
  }

  const r = rewriteCommand(command, payload.session_id);
  // The load-bearing diagnostic: WHY a command was / wasn't rewritten.
  tkDebug("claude:decision", {
    command,
    decision: r.decision,
    reason: r.reason,
    rewritten: r.rewritten,
  });
  if (r.decision !== "rewrite" || !r.rewritten) return null;

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecisionReason: CLAUDE_REWRITE_REASON,
      updatedInput: { command: r.rewritten },
    },
  };
}

// Decide from a raw stdin string. Total: empty / malformed / any error → null
// (fail-open). Diagnostics go to stderr only — stdout carries the rewrite JSON
// or nothing.
export function decideFromStdin(raw: string): ClaudeHookOutput | null {
  try {
    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0) return null;
    return decide(JSON.parse(trimmed));
  } catch (error) {
    // Fail-open: a malformed or TRUNCATED payload (e.g. a long command whose JSON
    // the host streamed in slower than the stdin-read budget, so it arrived cut off
    // mid-string) is handled by running the command unchanged. Persist the reason to
    // errors.log UNCONDITIONALLY so the scene is reconstructable after the fact —
    // the host shows only a bare "hook error" (or nothing) and TK_DEBUG cannot be
    // set retroactively. Kept OFF stderr: Claude Code surfaces a fail-open hook's
    // stderr as a spurious error for a command that actually ran fine.
    recordHookError("claude: stdin parse (fail-open, command ran unchanged)", error);
    tkDebug("claude:parse-error", {
      message: error instanceof Error ? error.message : String(error),
      bytes: (raw ?? "").length,
    });
    return null;
  }
}

async function readStdin(): Promise<string> {
  return readStreamWithTimeout(process.stdin);
}

// Runtime entry for `tk hook claude`. Emits the rewrite JSON on stdout (or
// nothing) and always exits 0 (fail-open — never block the Bash tool call).
export async function runHookClaude(): Promise<number> {
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    raw = "";
  }
  tkDebug("claude:stdin", { bytes: raw.length });
  const output = decideFromStdin(raw);
  if (output) process.stdout.write(JSON.stringify(output));
  tkDebug("claude:emit", { rewrote: Boolean(output) });
  return 0;
}
