// Slice 4 — inspect scanner & aggregation (DESIGN §9, inspect-v1-design.md).
//
// Reads transcript/session files, normalizes each tool event via the SHARED hook
// normalizer, and aggregates ranked opportunities. Pure read-only and
// privacy-preserving: it records lengths and sanitized command/tool LABELS only —
// never command argument values, search terms, paths, or file/result content
// (inspect-v1-design.md "Raw Evidence Policy").

import { estimateTokensFromLength } from "../core/savings.js";
import { readSourceText, type FileCache } from "./fileCache.js";
import { classifyTool, normalize, type ToolCategory } from "../hook/normalize.js";
import { governDirectTool } from "../hook/govern.js";
import { rewriteCommand } from "../hook/rewrite.js";
import type { InputType, SourceDiscovery } from "./sources.js";
import { extractVscodeRecords, type VscodeReadCtx } from "./vscodeReader.js";

// An output this large is a hotspot worth a guardrail (cost heuristic).
const LARGE_OUTPUT_CHARS = 8000;

// One ranked opportunity. `key` is a sanitized label (e.g. "git status",
// "read_file"), never raw arguments.
export type Opportunity = {
  key: string;
  kind: "shell" | "direct";
  category: ToolCategory;
  count: number;
  share: number;
  total_output_chars: number;
  total_output_tokens: number;
  avg_output_chars: number;
  max_output_chars: number;
  total_input_chars: number;
  max_input_chars: number;
  success_count: number;
  failure_count: number;
  // Transient governance/advice signals (Slice 5). Derived during the scan from
  // in-memory paths/commands; only COUNTS and a boolean are retained — never the
  // path, command, or content that produced them.
  compressible: boolean; // shell command the proxy could compress (run raw here)
  governed_deny: number; // direct reads of dependency dirs / lockfiles
  governed_suggest: number; // repo-wide searches
  large_output_count: number; // events with output over the hotspot threshold
};

export type ScanResult = {
  inputType: InputType;
  // Session inventory ≠ transcript coverage (must never be collapsed).
  session_inventory: number;
  transcript_coverage: number;
  tool_event_count: number;
  unknown_time_records: number;
  coverage_errors: number;
  opportunities: Opportunity[];
};

export type ScanOptions = {
  sinceMs?: number; // absolute epoch-ms cutoff; records older than this are dropped
  session?: string; // restrict to one session id
  // Per-file progress hook (decoupled from the reporter). Called after each
  // transcript/session file — and periodically WITHIN a large file — with the
  // running 1-based file count, the combined total, and a live detail string
  // (e.g. "transcripts · 12,403 events") so the counter visibly advances.
  onProgress?: (completed: number, total: number, detail?: string) => void;
  // Shared read-through cache so a file already read by another analyzer (habits)
  // in the same run is not read from disk again.
  fileCache?: FileCache;
};

// Multiplexer programs whose first sub-verb is a meaningful, non-sensitive label.
const MULTIPLEXERS = new Set([
  "git",
  "npm",
  "pnpm",
  "yarn",
  "npx",
  "docker",
  "kubectl",
  "cargo",
  "go",
  "dotnet",
  "mvn",
  "gradle",
  "gh",
  "glab",
  "pip",
  "pip3",
  "terraform",
  "bun",
]);

function basename(token: string): string {
  const norm = token.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? token;
}

// A sanitized signature for a shell command: program (+ first sub-verb for known
// multiplexers). Strips paths and NEVER includes file/pattern arguments.
function shellKey(command: string): string {
  let tokens = command.trim().split(/\s+/).filter(Boolean);
  // Strip leading `KEY=value` env-assignment tokens — environment setup, not the
  // program, and they can carry secrets/URLs that must never enter the key (H1).
  while (tokens.length > 0 && /^[A-Za-z_]\w*=/.test(tokens[0]!)) tokens = tokens.slice(1);
  if (tokens.length === 0) return "shell";
  const first = tokens[0]!;
  // A program slot that is itself a URL or assignment (not a plain name/path) is never
  // a stable label and may carry a secret — generalize it (H1).
  if (first.includes("://") || first.includes("=")) return "other";
  const program = basename(first).toLowerCase();
  if (MULTIPLEXERS.has(program)) {
    const sub = tokens.slice(1).find((t) => !t.startsWith("-"));
    if (sub && /^[a-z][\w-]*$/i.test(sub)) return `${program} ${sub.toLowerCase()}`;
  }
  return program;
}

function stringLength(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

// Result text length (output volume heuristic). Prefer a content-bearing field;
// fall back to the stringified whole. Length only — content is never retained.
function outputLength(result: unknown): number {
  if (result === undefined || result === null) return 0;
  if (typeof result === "string") return result.length;
  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    for (const key of ["content", "output", "stdout", "text", "result"]) {
      if (typeof obj[key] === "string") return (obj[key] as string).length;
    }
  }
  return stringLength(result);
}

function reliableTimestamp(record: Record<string, unknown>): number | undefined {
  for (const key of ["timestamp", "ts", "time", "createdAt", "created_at", "eventTime"]) {
    const v = record[key];
    if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
    if (typeof v === "string") {
      const parsed = Date.parse(v);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function recordSession(record: Record<string, unknown>): string | undefined {
  for (const key of ["sessionId", "session_id", "session", "conversationId", "conversation_id"]) {
    const v = record[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

// Failure detection from explicit, non-content signals only.
function isFailure(record: Record<string, unknown>, result: unknown): boolean {
  for (const key of ["exitCode", "exit_code"]) {
    const v = record[key];
    if (typeof v === "number" && v !== 0) return true;
  }
  for (const key of ["isError", "error", "failed"]) {
    if (record[key] === true) return true;
  }
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (obj.isError === true || obj.error === true) return true;
    if (typeof obj.exitCode === "number" && obj.exitCode !== 0) return true;
  }
  return false;
}

// A record is a flat tool event if it carries a recognizable top-level tool field
// (Copilot CLI dialect, or a host that already writes flat records).
function isToolRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.toolName === "string" ||
    typeof record.tool_name === "string" ||
    typeof record.tool === "string"
  );
}

// One parsed JSON value → the flat tool record(s) it represents. A value that is
// already a flat tool event yields itself (CLI dialect); otherwise we try the VS
// Code typed-event / chatSession shapes (I3/I4). Anything unrecognized yields [].
function flatToolRecords(
  parsed: Record<string, unknown>,
  ctx: VscodeReadCtx,
): Record<string, unknown>[] {
  if (isToolRecord(parsed)) return [parsed];
  return extractVscodeRecords(parsed, ctx);
}

type Accumulator = Omit<Opportunity, "share" | "avg_output_chars">;

function blankAcc(key: string, kind: "shell" | "direct", category: ToolCategory): Accumulator {
  return {
    key,
    kind,
    category,
    count: 0,
    total_output_chars: 0,
    total_output_tokens: 0,
    max_output_chars: 0,
    total_input_chars: 0,
    max_input_chars: 0,
    success_count: 0,
    failure_count: 0,
    compressible: false,
    governed_deny: 0,
    governed_suggest: 0,
    large_output_count: 0,
  };
}

export function scan(discovery: SourceDiscovery, opts: ScanOptions = {}): ScanResult {
  const accs = new Map<string, Accumulator>();
  let toolEventCount = 0;
  let unknownTime = 0;
  let coverageErrors = 0;
  let transcriptCoverage = 0;

  // Accumulate ONE flat tool record into the opportunity map. Returns true when the
  // record passed the session/time filters and was counted (drives coverage).
  function accumulate(record: Record<string, unknown>): boolean {
    if (opts.session && recordSession(record) !== opts.session) return false;

    // Time-window filter: records without a reliable timestamp are excluded from
    // windowed analysis and counted separately (never an mtime fallback).
    if (opts.sinceMs !== undefined) {
      const ts = reliableTimestamp(record);
      if (ts === undefined) {
        unknownTime += 1;
        return false;
      }
      if (ts < opts.sinceMs) return false;
    }

    const ev = normalize(record);
    const isShell = ev.category === "execute_adjacent" && typeof ev.command === "string";
    const key = isShell
      ? shellKey(ev.command ?? "")
      : ev.toolName.toLowerCase() || classifyTool("");
    const kind: "shell" | "direct" = isShell ? "shell" : "direct";

    const acc = accs.get(key) ?? blankAcc(key, kind, ev.category);
    const outChars = outputLength(ev.toolResult);
    const inChars = isShell ? (ev.command ?? "").length : stringLength(ev.toolInput);

    acc.count += 1;
    acc.total_output_chars += outChars;
    acc.total_output_tokens += estimateTokensFromLength(outChars);
    acc.max_output_chars = Math.max(acc.max_output_chars, outChars);
    acc.total_input_chars += inChars;
    acc.max_input_chars = Math.max(acc.max_input_chars, inChars);
    if (isFailure(record, ev.toolResult)) acc.failure_count += 1;
    else acc.success_count += 1;
    if (outChars >= LARGE_OUTPUT_CHARS) acc.large_output_count += 1;

    // Transient governance signals (Slice 5). The path/command stays local to this
    // iteration — only the resulting counts/boolean are kept.
    if (isShell) {
      if (rewriteCommand(ev.command ?? "").decision === "rewrite") acc.compressible = true;
    } else {
      const verdict = governDirectTool(ev).decision;
      if (verdict === "deny") acc.governed_deny += 1;
      else if (verdict === "suggest") acc.governed_suggest += 1;
    }
    accs.set(key, acc);
    toolEventCount += 1;
    return true;
  }

  // Combined total spans BOTH loops so the counter runs 0→100% across the whole
  // scan, not twice.
  const totalFiles = discovery.transcriptFiles.length + discovery.sessionFiles.length;
  let processed = 0;

  // Live counter line. `group` names which pass we are in so the user sees what the
  // scan is "continuing on", and the running event tally makes the line move even
  // while a single large file is being parsed.
  function tick(group: string): void {
    opts.onProgress?.(
      processed,
      totalFiles,
      `${group} · ${toolEventCount.toLocaleString()} events`,
    );
  }

  // Re-emit the counter every PROGRESS_LINE_STRIDE lines within a file so a single
  // huge transcript does not look frozen.
  const PROGRESS_LINE_STRIDE = 4000;

  // Read one source file, extract+accumulate every tool record it carries. A fresh
  // VscodeReadCtx per file threads the session id across that file's lines. Returns
  // whether the file contributed any event (for transcript coverage).
  function processFile(file: string, group: string): boolean {
    const text = readSourceText(file, opts.fileCache);
    if (text === undefined) {
      coverageErrors += 1;
      return false;
    }
    const ctx: VscodeReadCtx = {};
    let hadEvent = false;
    let lineNo = 0;
    for (const line of text.split(/\r?\n/)) {
      lineNo += 1;
      if (lineNo % PROGRESS_LINE_STRIDE === 0) tick(group);
      if (line.trim().length === 0) continue;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        coverageErrors += 1;
        continue;
      }
      if (typeof json !== "object" || json === null) continue;
      for (const record of flatToolRecords(json as Record<string, unknown>, ctx)) {
        if (accumulate(record)) hadEvent = true;
      }
    }
    return hadEvent;
  }

  for (const file of discovery.transcriptFiles) {
    if (processFile(file, "transcripts")) transcriptCoverage += 1;
    processed += 1;
    tick("transcripts");
  }

  // Session inventory = count of distinct SESSIONS discovered (one chatSessions file
  // = one session), NOT a line count. The lines inside a chatSessions file are an
  // incremental snapshot+patch serialization of a single session, so summing them
  // produced a meaningless inflated number (e.g. "187") that read like real activity
  // when it was not. Distinct from transcript coverage. Session files ALSO go through
  // extraction so a populated snapshot contributes tool events (I4); on most versions
  // their requests are empty and only the session count lands here.
  let sessionInventory = 0;
  for (const file of discovery.sessionFiles) {
    const text = readSourceText(file, opts.fileCache);
    if (text === undefined) {
      coverageErrors += 1;
    } else {
      sessionInventory += 1;
      const ctx: VscodeReadCtx = {};
      let lineNo = 0;
      for (const line of text.split(/\r?\n/)) {
        lineNo += 1;
        if (lineNo % PROGRESS_LINE_STRIDE === 0) tick("sessions");
        if (line.trim().length === 0) continue;
        let json: unknown;
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof json !== "object" || json === null) continue;
        for (const record of flatToolRecords(json as Record<string, unknown>, ctx)) {
          accumulate(record);
        }
      }
    }
    // Advance the counter for every session file, read-failures included, so the
    // progress total always reaches 100%.
    processed += 1;
    tick("sessions");
  }

  const opportunities: Opportunity[] = [...accs.values()]
    .map((a) => ({
      ...a,
      share: toolEventCount === 0 ? 0 : Number((a.count / toolEventCount).toFixed(4)),
      avg_output_chars: a.count === 0 ? 0 : Math.round(a.total_output_chars / a.count),
    }))
    // Rank by output volume (primary cost), then frequency.
    .sort((x, y) => y.total_output_chars - x.total_output_chars || y.count - x.count);

  return {
    inputType: discovery.inputType,
    session_inventory: sessionInventory,
    transcript_coverage: transcriptCoverage,
    tool_event_count: toolEventCount,
    unknown_time_records: unknownTime,
    coverage_errors: coverageErrors,
    opportunities,
  };
}

// Parse a `--since` duration like `7d`, `24h`, `30m` into milliseconds. Returns
// undefined for an invalid format (the CLI maps that to exit 1).
export function parseSince(value: string): number | undefined {
  const m = /^(\d+)([dhm])$/.exec(value.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2];
  const ms = unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000;
  return n * ms;
}
