// The one tk diagnostics emitter, gated by `TK_DEBUG` — one env var lights up the
// whole tk runtime. Both the hook runtime AND the shim/compress path (src/cli.ts,
// via the gate decision) call `tkDebug`, so every compress-vs-passthrough decision
// leaves a footprint in the SAME place (D1: a debug switch that covered only the
// hook path produced confident-but-empty logs and cost hours on the VS Code case).
//
// The hook runtime is fail-open and SILENT by design: on any problem it emits
// empty stdout and exits 0, which keeps the agent unbroken but is opaque while
// DEVELOPING ("why didn't `git status` get rewritten just now?"). With
// `TK_DEBUG=1` set, each step writes a structured `tk debug: <scope> k=v …` line
// to **stderr** — never stdout, which carries the host's protocol JSON.
//
// Because the live hook is spawned by the host, its stderr is hard to watch, so
// the same line is ALSO appended (with a timestamp) to a default debug log at
// `$TOKEN_KILLER_HOME/debug.log` — `tail -f` it during a live session. This is a
// dedicated dev file, NOT the metrics ledger (`history.jsonl`/`governance.jsonl`)
// — debug noise must never pollute the accounting. Total: neither the format nor
// the file append ever throws, so debug output can never break a fail-open hook.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";

export function tkDebugEnabled(): boolean {
  return Boolean(process.env.TK_DEBUG);
}

// Default debug log location. Resolved per call so a test's TOKEN_KILLER_HOME
// override is always honored.
export function debugLogPath(): string {
  return join(tokenKillerHome(), "debug.log");
}

function formatValue(v: unknown): string {
  if (v === undefined) return "∅";
  if (typeof v === "string") return JSON.stringify(v);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

// Best-effort append to the debug log; swallow every error (a missing dir, a
// read-only FS — none of it may break the hook).
function appendToLog(line: string): void {
  try {
    const path = debugLogPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, line);
  } catch {
    /* the stderr copy already carried the diagnostic */
  }
}

// Emit one diagnostic line when TK_DEBUG is set; no-op otherwise. `undefined`
// fields are dropped so a trace only shows what actually applies. The stderr
// line stays clean; the file line is timestamped for correlation across a live
// session.
export function tkDebug(scope: string, fields: Record<string, unknown> = {}): void {
  if (!tkDebugEnabled()) return;
  try {
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${formatValue(v)}`);
    const body = `tk debug: ${scope}${parts.length ? ` ${parts.join(" ")}` : ""}`;
    process.stderr.write(`${body}\n`);
    appendToLog(`${timestamp()} ${body}\n`);
  } catch {
    /* diagnostics must never break the hook */
  }
}

function timestamp(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

// Persistent error log location, beside debug.log. Resolved per call so a test's
// TOKEN_KILLER_HOME override is honored.
export function errorLogPath(): string {
  return join(tokenKillerHome(), "errors.log");
}

// Best-effort append to errors.log; swallow every error (a logging failure must
// never replace or compound the real error).
function appendErrorLog(line: string): void {
  try {
    const path = errorLogPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, line);
  } catch {
    /* best-effort */
  }
}

// Record a FATAL tk error UNCONDITIONALLY — unlike tkDebug, this is NOT gated on
// TK_DEBUG. Rationale: when the host reports "PreToolUse hook errored", tk exited
// non-zero and its stderr was swallowed by the host; the user had no breadcrumb and
// no reason to have set TK_DEBUG beforehand. This is the crash-path writer — it
// fires only on the top-level catch, never on a healthy fail-open run (which exits
// 0 and never reaches here), so it can't grow on the hot path. Best-effort and
// total: never throws, so it can't compound a crash.
export function logFatalError(context: string, error: unknown): void {
  try {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const line = `${timestamp()} tk fatal: ${context}\n${detail}\n`;
    process.stderr.write(line);
    appendErrorLog(line);
  } catch {
    // a logging failure must never replace the original error
  }
}

// Record a hook ANOMALY that was handled FAIL-OPEN (the tool still ran) —
// UNCONDITIONALLY (not gated on TK_DEBUG), because a hook failure is observed only
// after the fact: the host shows a bare "hook error" with no detail (Copilot CLI's
// `preToolUse` denial message includes no hook output) or nothing at all, and the
// user cannot retroactively have set TK_DEBUG. So the reason must always land in
// errors.log, the one place reconstructable without prior setup. Kept OFF stdout
// (the host's protocol channel). `surfaceStderr` ALSO writes stderr — safe and
// correct on Copilot CLI, whose docs designate stderr a results-neutral debug
// channel; left off for hosts that surface a fail-open hook's stderr as an error.
// Best-effort and total: never throws (a fail-open path must stay unbroken).
export function recordHookError(
  context: string,
  error: unknown,
  opts: { surfaceStderr?: boolean } = {},
): void {
  try {
    const detail = error instanceof Error ? error.message : String(error);
    const line = `${timestamp()} tk hook-error: ${context}: ${detail}\n`;
    if (opts.surfaceStderr) process.stderr.write(line);
    appendErrorLog(line);
  } catch {
    /* a fail-open hook must never break on its own diagnostics */
  }
}
