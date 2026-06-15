// Slice 1 — `tk hook copilot` dispatcher (DESIGN §3.1, §3.8).
//
// The configured command the host invokes (mirrors RTK's `rtk hook copilot`).
// It reads a hook payload from stdin, normalizes it, dispatches by event, and for
// `preToolUse` either rewrites a shell command (prepend `tk`) or governs a direct
// tool. It ONLY prepends `tk`; the proxy compresses. No `modifiedResult`, ever.
//
// Fail-open (DESIGN §3.6, CONTEXT.md → Fail-open): any internal error (or a plain
// allow) emits NOTHING on stdout — the host then runs the call unchanged, exactly
// like RTK, which writes no JSON for a non-rewritten, non-governed call. A real
// decision emits the host-conformant shape (toHostOutput, ADR 0005); diagnostics
// go to stderr. Copilot CLI preToolUse is fail-closed on crash/timeout, so this
// must never throw.

import { isShellExecution, normalizeStdin, type ToolEvent } from "./normalize.js";
import { governDirectTool, type Decision } from "./govern.js";
import { rewriteCommand } from "./rewrite.js";
import { governPrompt } from "./prompt.js";
import { failureSourceAdapter, handleError } from "./error.js";
import { recordHookFailure } from "../core/history.js";
import { recordGovernance } from "../core/governance.js";
import { recordHookError, tkDebug } from "./debug.js";

const ALLOW: Decision = { decision: "allow" };

// Ground-truth reason the host shows for an auto-rewrite (tk analogue of RTK's
// "RTK auto-rewrite"; verified live against `rtk hook copilot`).
export const COPILOT_REWRITE_REASON = "tk auto-rewrite";

// The normalized lifecycle event → the host's hookEventName spelling. Only
// PreToolUse is contract-verified (ADR 0005, hookCommandTypes.ts); the rest reuse
// the same wrapper with their canonical name for additionalContext-style hints.
function hostEventName(event: ToolEvent["event"]): string {
  switch (event) {
    case "userPromptSubmitted":
      return "UserPromptSubmit";
    case "postToolUse":
    case "errorOccurred":
      return "PostToolUse";
    default:
      return "PreToolUse";
  }
}

// The host-neutral fields a decision contributes, before per-dialect wrapping.
// `null` ⇒ emit nothing (a plain allow with no hint — RTK emits no JSON at all
// for a non-rewritten, non-governed call, and so do we).
type HostFields = {
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  command?: string; // the rewritten command, applied via updatedInput / modifiedArgs
  additionalContext?: string;
};

function hostFields(d: Decision): HostFields | null {
  switch (d.decision) {
    case "rewrite":
      if (!d.rewritten_command) return null;
      // "allow" (not RTK's "ask") so the rewrite applies TRANSPARENTLY — no
      // confirmation prompt per command. Verified live in VS Code: "ask" surfaced a
      // prompt for `tk git status --short`; "allow" + updatedInput runs the rewritten
      // `tk <cmd>` silently, which is the point of transparent token savings.
      return {
        permissionDecision: "allow",
        permissionDecisionReason: COPILOT_REWRITE_REASON,
        command: d.rewritten_command,
      };
    case "deny":
      return { permissionDecision: "deny", permissionDecisionReason: d.reason };
    case "suggest":
      // Advisory only — never block; inject the hint as additionalContext.
      return { permissionDecision: "allow", additionalContext: d.reason ?? d.additional_context };
    case "allow":
    default:
      if (d.additional_context)
        return { permissionDecision: "allow", additionalContext: d.additional_context };
      return null;
  }
}

// ADR 0005: emit the shape the real host actually reads. tk's old
// `{ decision, rewritten_command }` was read by NO host, so the hook was inert.
// VS Code Copilot Chat (snake_case `tool_name`/`tool_input` dialect) reads
// `hookSpecificOutput.{permissionDecision, permissionDecisionReason, updatedInput,
// additionalContext}`; Copilot CLI (camelCase `toolName`/`toolArgs`) reads a flat
// `{permissionDecision, modifiedArgs, …}`. Internal ledger fields
// (`governance_kind`, `estimated_tokens`) never appear here. Returns null to emit
// nothing (fail-open / plain allow).
export function toHostOutput(ev: ToolEvent, d: Decision): Record<string, unknown> | null {
  const f = hostFields(d);
  if (f === null) return null;

  if (ev.dialect === "cli") {
    // Copilot CLI: flat shape. `modifiedArgs` REPLACES the tool args wholesale
    // (not a merge — confirmed via RTK's modifiedArgs handling). So we must rebuild
    // the full args object from what the host sent (`ev.toolInput`, the parsed
    // `toolArgs`) and overwrite only `command`. Emitting `{ command }` alone would
    // DROP host-supplied fields the tool needs (`description`, `initial_wait`,
    // `mode`, …), degrading or breaking the rewritten call. Mirrors RTK
    // (test_copilot_cli_preserves_extra_args_fields).
    const out: Record<string, unknown> = {};
    if (f.permissionDecision !== undefined) out.permissionDecision = f.permissionDecision;
    if (f.permissionDecisionReason !== undefined)
      out.permissionDecisionReason = f.permissionDecisionReason;
    if (f.command !== undefined) out.modifiedArgs = { ...ev.toolInput, command: f.command };
    if (f.additionalContext !== undefined) out.additionalContext = f.additionalContext;
    return out;
  }

  // VS Code (and Claude-family / unknown dialects): the hookSpecificOutput wrapper
  // with `updatedInput` for the transparent rewrite.
  const hook: Record<string, unknown> = { hookEventName: hostEventName(ev.event) };
  if (f.permissionDecision !== undefined) hook.permissionDecision = f.permissionDecision;
  if (f.permissionDecisionReason !== undefined)
    hook.permissionDecisionReason = f.permissionDecisionReason;
  if (f.command !== undefined) hook.updatedInput = { command: f.command };
  if (f.additionalContext !== undefined) hook.additionalContext = f.additionalContext;
  return { hookSpecificOutput: hook };
}

// Decide the governance verdict for a normalized event. Pure and total — no I/O;
// history recording happens in the runtime entry, not here.
export function decide(ev: ToolEvent): Decision {
  switch (ev.event) {
    case "preToolUse":
      return decidePreTool(ev);
    case "userPromptSubmitted":
      return governPrompt(ev);
    case "errorOccurred":
      return handleError(ev);
    // postToolUse (success-path result compression) is deferred — no modifiedResult.
    default:
      return ALLOW;
  }
}

function decidePreTool(ev: ToolEvent): Decision {
  if (isShellExecution(ev)) {
    // ADR 0009: carry the host session id (normalize.ts parses it) through the
    // rewritten command so the separate `tk` subprocess stamps session_id.
    const r = rewriteCommand(ev.command ?? "", ev.session);
    switch (r.decision) {
      case "rewrite":
        return { decision: "rewrite", rewritten_command: r.rewritten };
      case "suggest":
        return { decision: "suggest", reason: r.reason };
      case "deny":
        return { decision: "deny", reason: r.reason };
      case "pass":
      default:
        return ALLOW;
    }
  }

  // Direct tool action → governance only (never rewrite/compress).
  return governDirectTool(ev);
}

// Decide from a raw stdin string. Total: any parse/logic error → allow.
export function decideFromStdin(raw: string): Decision {
  try {
    return decide(normalizeStdin(raw));
  } catch (error) {
    // Fail-open: a malformed/truncated payload is handled by allowing the tool.
    // Persist the reason to errors.log UNCONDITIONALLY (reconstructable after the
    // fact — TK_DEBUG can't be set retroactively, and Copilot CLI's preToolUse
    // denial message carries no hook output). stderr IS surfaced here: Copilot CLI's
    // docs designate stderr a results-neutral debug/log channel, so it's safe and
    // gives the user the reason in the host's own logs without breaking fail-open.
    recordHookError("copilot: stdin parse (fail-open, tool allowed)", error, {
      surfaceStderr: true,
    });
    tkDebug("copilot:parse-error", {
      message: error instanceof Error ? error.message : String(error),
      bytes: (raw ?? "").length,
    });
    return ALLOW;
  }
}

// Fail-fast budget for reading the hook payload. The hook sits in the critical
// path of every tool call, and the host (Copilot CLI) is fail-CLOSED on hook
// timeout — so if a host opens stdin but never closes it, an unbounded read
// would hang the agent until the host's own (longer) timeout fires and BLOCKS
// the command. We cap the wait well under that: on timeout we stop waiting,
// release stdin, and fall open with whatever arrived (normally nothing → ALLOW),
// so the tool call proceeds unwrapped rather than stalling. (CONTEXT.md →
// Fail-open; user directive: never let the agent hang or get confused.)
export const STDIN_READ_TIMEOUT_MS = 2000;

type StdinLike = NodeJS.ReadableStream & {
  isTTY?: boolean;
  destroy?: () => void;
  removeAllListeners(event?: string): unknown;
};

// Read a hook-payload stream to a string, bounded by `timeoutMs` (fail-fast).
// Exported for tests; `readStdin` binds it to `process.stdin`.
export async function readStreamWithTimeout(
  stream: StdinLike,
  timeoutMs: number = STDIN_READ_TIMEOUT_MS,
): Promise<string> {
  // No piped stdin (TTY) → empty payload → fail-open.
  if (stream.isTTY) return "";
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.removeAllListeners("data");
      stream.removeAllListeners("end");
      stream.removeAllListeners("error");
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const timer = setTimeout(() => {
      // Stop waiting and release the handle so the process can exit promptly.
      stream.destroy?.();
      finish();
    }, timeoutMs);
    // Don't let the timer itself keep the event loop alive once `end` fires.
    timer.unref?.();
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", finish);
    stream.on("error", finish);
  });
}

async function readStdin(): Promise<string> {
  return readStreamWithTimeout(process.stdin);
}

// Best-effort failure-metric recording for errorOccurred (DESIGN §3.4, §8.1).
// Never throws — a write error must not break the fail-open hook.
async function recordFailureMetric(ev: ToolEvent): Promise<void> {
  try {
    await recordHookFailure({
      cwd: ev.cwd ?? process.cwd(),
      sourceAdapter: failureSourceAdapter(ev),
      handler: ev.category,
      exitCode: 1,
    });
  } catch (error) {
    process.stderr.write(
      `tk hook copilot: failure-metric write skipped: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

// Best-effort ③ governance-event recording (metrics-ledger Gap C, §0.1.3). Writes
// one governance.jsonl row per deny/suggest that carries a `governance_kind`.
// `rewrite`/`allow` and the non-cost routing-hint suggest carry no kind, so they
// are never written — the executed-rewrite exclusion is physical. Never throws.
async function recordGovernanceMetric(ev: ToolEvent, decision: Decision): Promise<void> {
  if (!decision.governance_kind) return;
  if (decision.decision !== "deny" && decision.decision !== "suggest") return;
  try {
    await recordGovernance(ev.cwd ?? process.cwd(), {
      ts: new Date().toISOString(),
      kind: decision.governance_kind,
      decision: decision.decision,
      category: ev.category,
      estimated_tokens: decision.estimated_tokens,
    });
  } catch (error) {
    process.stderr.write(
      `tk hook copilot: governance-metric write skipped: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

// Runtime entry for `tk hook copilot`. Reads stdin, emits exactly one protocol
// JSON object on stdout, exits 0 (fail-open — never block the tool call).
export async function runHookCopilot(): Promise<number> {
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    raw = "";
  }

  tkDebug("copilot:stdin", { bytes: raw.length });
  let ev: ToolEvent | null = null;
  let decision: Decision = ALLOW;
  try {
    ev = normalizeStdin(raw);
    decision = decide(ev);
  } catch (error) {
    process.stderr.write(
      `tk hook copilot: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    ev = null;
    decision = ALLOW;
  }

  tkDebug("copilot:decision", {
    event: ev?.event,
    category: ev?.category,
    decision: decision.decision,
    reason: decision.reason,
    rewritten: decision.rewritten_command,
  });
  // Emit the host-shaped output (ADR 0005). null ⇒ nothing on stdout (plain allow),
  // matching RTK, which emits no JSON for a non-rewritten, non-governed call.
  const output = ev ? toHostOutput(ev, decision) : null;
  if (output) process.stdout.write(JSON.stringify(output));

  if (ev) {
    await recordGovernanceMetric(ev, decision);
    if (ev.event === "errorOccurred") {
      await recordFailureMetric(ev);
    }
  }
  return 0;
}
