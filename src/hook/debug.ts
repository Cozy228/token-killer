// Opt-in hook diagnostics, gated by the same `TK_DEBUG` switch the compress path
// uses (src/cli.ts) — one env var lights up the whole tk runtime.
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

export function hookDebugEnabled(): boolean {
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
export function hookDebug(scope: string, fields: Record<string, unknown> = {}): void {
  if (!hookDebugEnabled()) return;
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
