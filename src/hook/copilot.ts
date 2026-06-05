// Slice 1 — `tg hook copilot` dispatcher (DESIGN §3.1, §3.8).
//
// The configured command the host invokes (mirrors RTK's `rtk hook copilot`).
// It reads a hook payload from stdin, normalizes it, dispatches by event, and for
// `preToolUse` either rewrites a shell command (prepend `tg`) or governs a direct
// tool. It ONLY prepends `tg`; the proxy compresses. No `modifiedResult`, ever.
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

const ALLOW: Decision = { decision: "allow" };

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
    process.stderr.write(`tg hook copilot: ${error instanceof Error ? error.message : String(error)}\n`);
    return ALLOW;
  }
}

async function readStdin(): Promise<string> {
  // No piped stdin (TTY) → empty payload → fail-open.
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolve) => {
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
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
    process.stderr.write(`tg hook copilot: failure-metric write skipped: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

// Runtime entry for `tg hook copilot`. Reads stdin, emits exactly one protocol
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
    process.stderr.write(`tg hook copilot: ${error instanceof Error ? error.message : String(error)}\n`);
    ev = null;
    decision = ALLOW;
  }

  process.stdout.write(JSON.stringify(decision));

  if (ev && ev.event === "errorOccurred") {
    await recordFailureMetric(ev);
  }
  return 0;
}
