// Slice 1 — `tk hook copilot` dispatcher (DESIGN §3.1, §3.8).
//
// The configured command the host invokes (mirrors RTK's `rtk hook copilot`).
// It reads a hook payload from stdin, normalizes it, dispatches by event, and for
// `preToolUse` either rewrites a shell command (prepend `tk`) or governs a direct
// tool. It ONLY prepends `tk`; the proxy compresses. No `modifiedResult`, ever.
//
// Fail-open (DESIGN §3.6, CONTEXT.md → Fail-open): any internal error resolves to
// `{ "decision": "allow" }`. stdout carries ONLY the protocol JSON; diagnostics
// go to stderr. Copilot CLI preToolUse is fail-closed on crash/timeout, so this
// must never throw.

import { isShellExecution, normalizeStdin, type ToolEvent } from "./normalize.js";
import { governDirectTool, type Decision } from "./govern.js";
import { rewriteCommand } from "./rewrite.js";
import { governPrompt } from "./prompt.js";
import { failureSourceAdapter, handleError } from "./error.js";
import { recordHookFailure } from "../core/history.js";
import { recordGovernance } from "../core/governance.js";

const ALLOW: Decision = { decision: "allow" };

// The host protocol JSON — only the wire fields. Internal ledger fields
// (`governance_kind`, `estimated_tokens`) are recording metadata and must never
// reach the host's decision payload.
export function toProtocol(d: Decision): Record<string, unknown> {
  const out: Record<string, unknown> = { decision: d.decision };
  if (d.rewritten_command !== undefined) out.rewritten_command = d.rewritten_command;
  if (d.reason !== undefined) out.reason = d.reason;
  if (d.additional_context !== undefined) out.additional_context = d.additional_context;
  return out;
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
    const r = rewriteCommand(ev.command ?? "");
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
    process.stderr.write(`tk hook copilot: ${error instanceof Error ? error.message : String(error)}\n`);
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
    process.stderr.write(`tk hook copilot: failure-metric write skipped: ${error instanceof Error ? error.message : String(error)}\n`);
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
    process.stderr.write(`tk hook copilot: governance-metric write skipped: ${error instanceof Error ? error.message : String(error)}\n`);
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

  let ev: ToolEvent | null = null;
  let decision: Decision = ALLOW;
  try {
    ev = normalizeStdin(raw);
    decision = decide(ev);
  } catch (error) {
    process.stderr.write(`tk hook copilot: ${error instanceof Error ? error.message : String(error)}\n`);
    ev = null;
    decision = ALLOW;
  }

  process.stdout.write(JSON.stringify(toProtocol(decision)));

  if (ev) {
    await recordGovernanceMetric(ev, decision);
    if (ev.event === "errorOccurred") {
      await recordFailureMetric(ev);
    }
  }
  return 0;
}
