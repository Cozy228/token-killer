// Slice 4 — inspect scanner & aggregation (DESIGN §9, inspect-v1-design.md).
//
// Reads transcript/session files, normalizes each tool event via the SHARED hook
// normalizer, and aggregates ranked opportunities. Pure read-only and
// privacy-preserving: it records lengths and sanitized command/tool LABELS only —
// never command argument values, search terms, paths, or file/result content
// (inspect-v1-design.md "Raw Evidence Policy").

import { estimateTokensFromLength } from "../core/savings.js";
import { readSourceText, type FileCache } from "./fileCache.js";
import { type CacheKey, type ExtractCache, statKey } from "./extractCache.js";
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
  total_input_tokens: number;
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
  // Cross-invocation cache of each file's pre-extracted scan contribution, keyed by
  // (path, mtime, size). Lets a repeated `tk inspect` re-parse only NEW/CHANGED files.
  // Only consulted when no per-event filter is active (no `sinceMs` / `session`), since
  // the cached payload is the file's FULL, unfiltered aggregation.
  scanCache?: ExtractCache<FileScanExtract>;
  // Cross-invocation cache of each file's per-event stream (timestamp + session + the
  // already-sanitized per-event fields), keyed by (path, mtime, size). Unlike `scanCache`
  // (a folded full-file aggregate that can't be re-filtered), this stores enough per
  // event to apply --since / --session POST-load — so the windowed/session path reuses
  // the warm cache instead of re-parsing raw JSON. Consulted only when a filter is active.
  eventCache?: ExtractCache<FileEventExtract>;
};

// One file's complete, UNFILTERED contribution to a scan — the cacheable unit. Stores
// the file's per-key accumulators (already folded), whether it produced any event
// (transcript coverage), and how many lines failed to parse (coverage errors). Holds
// no raw content — only the sanitized counts the report is built from.
export type FileScanExtract = {
  accs: Accumulator[];
  hadEvent: boolean;
  parseErrors: number;
};

// One already-sanitized tool event, the unit a windowed/session scan folds. Carries the
// time/session fields the filters need PLUS the derived per-event measurements (so the
// expensive normalize/govern/rewrite work runs once, at extraction time, never on a warm
// hit). Holds no raw content — only the sanitized key/category and integer counts.
export type CachedEvent = {
  key: string;
  kind: "shell" | "direct";
  category: ToolCategory;
  ts?: number; // reliable timestamp (epoch-ms), undefined when none was found
  session?: string; // session id, undefined when none was found
  outChars: number;
  inChars: number;
  failure: boolean;
  large: boolean; // output ≥ LARGE_OUTPUT_CHARS
  compressible: boolean; // shell command the proxy could compress
  governed: "deny" | "suggest" | "none"; // direct-tool governance verdict
};

// One file's complete, UNFILTERED per-event stream — the cacheable unit for the windowed
// /session path. Re-filterable post-load (slice by ts/session), unlike FileScanExtract.
export type FileEventExtract = {
  events: CachedEvent[];
  parseErrors: number;
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

export type Accumulator = Omit<Opportunity, "share" | "avg_output_chars">;

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
    total_input_tokens: 0,
    max_input_chars: 0,
    success_count: 0,
    failure_count: 0,
    compressible: false,
    governed_deny: 0,
    governed_suggest: 0,
    large_output_count: 0,
  };
}

type ScanCounters = { toolEventCount: number; unknownTime: number };

// Reduce ONE flat tool record to its sanitized, UNFILTERED CachedEvent — the unit both
// the windowed/session cache and the live folder share. Runs the expensive
// normalize/govern/rewrite work exactly once (here), and retains the time/session fields
// the filters need plus the derived counts. No filtering happens here.
function recordToCachedEvent(record: Record<string, unknown>): CachedEvent {
  const ev = normalize(record);
  const isShell = ev.category === "execute_adjacent" && typeof ev.command === "string";
  const key = isShell ? shellKey(ev.command ?? "") : ev.toolName.toLowerCase() || classifyTool("");
  const kind: "shell" | "direct" = isShell ? "shell" : "direct";
  const outChars = outputLength(ev.toolResult);
  const inChars = isShell ? (ev.command ?? "").length : stringLength(ev.toolInput);

  let compressible = false;
  let governed: "deny" | "suggest" | "none" = "none";
  // Transient governance signals (Slice 5). The path/command stays local to this
  // iteration — only the resulting boolean/verdict is kept.
  if (isShell) {
    if (rewriteCommand(ev.command ?? "").decision === "rewrite") compressible = true;
  } else {
    const verdict = governDirectTool(ev).decision;
    if (verdict === "deny") governed = "deny";
    else if (verdict === "suggest") governed = "suggest";
  }

  return {
    key,
    kind,
    category: ev.category,
    ts: reliableTimestamp(record),
    session: recordSession(record),
    outChars,
    inChars,
    failure: isFailure(record, ev.toolResult),
    large: outChars >= LARGE_OUTPUT_CHARS,
    compressible,
    governed,
  };
}

// Fold ONE sanitized event into `accs`, honoring the session/time filters in `opts` and
// updating `counters`. Returns true when the event passed the filters and was counted
// (drives coverage). Shared by every scan path (live, full-file extract, windowed cache)
// so all compute byte-identical aggregates.
function foldCachedEvent(
  ev: CachedEvent,
  accs: Map<string, Accumulator>,
  opts: { sinceMs?: number; session?: string },
  counters: ScanCounters,
): boolean {
  if (opts.session && ev.session !== opts.session) return false;

  // Time-window filter: events without a reliable timestamp are excluded from windowed
  // analysis and counted separately (never an mtime fallback).
  if (opts.sinceMs !== undefined) {
    if (ev.ts === undefined) {
      counters.unknownTime += 1;
      return false;
    }
    if (ev.ts < opts.sinceMs) return false;
  }

  const acc = accs.get(ev.key) ?? blankAcc(ev.key, ev.kind, ev.category);
  acc.count += 1;
  acc.total_output_chars += ev.outChars;
  acc.total_output_tokens += estimateTokensFromLength(ev.outChars);
  acc.max_output_chars = Math.max(acc.max_output_chars, ev.outChars);
  acc.total_input_chars += ev.inChars;
  acc.total_input_tokens += estimateTokensFromLength(ev.inChars);
  acc.max_input_chars = Math.max(acc.max_input_chars, ev.inChars);
  if (ev.failure) acc.failure_count += 1;
  else acc.success_count += 1;
  if (ev.large) acc.large_output_count += 1;
  if (ev.compressible) acc.compressible = true;
  if (ev.governed === "deny") acc.governed_deny += 1;
  else if (ev.governed === "suggest") acc.governed_suggest += 1;
  accs.set(ev.key, acc);
  counters.toolEventCount += 1;
  return true;
}

// Fold ONE flat tool record into `accs`, honoring the session/time filters in `opts` and
// updating `counters`. Convenience wrapper used by the live path; reduces then folds.
function accumulateRecord(
  record: Record<string, unknown>,
  accs: Map<string, Accumulator>,
  opts: { sinceMs?: number; session?: string },
  counters: ScanCounters,
): boolean {
  return foldCachedEvent(recordToCachedEvent(record), accs, opts, counters);
}

// Merge one file's accumulator into a running map (sum the additive fields, max the
// maxes, OR the compressible flag). Folds each per-file extract into the scan total.
export function mergeAcc(into: Map<string, Accumulator>, from: Accumulator): void {
  const acc = into.get(from.key);
  if (!acc) {
    // Clone so a cached payload (which may be reused within the run) is never mutated.
    into.set(from.key, { ...from });
    return;
  }
  acc.count += from.count;
  acc.total_output_chars += from.total_output_chars;
  acc.total_output_tokens += from.total_output_tokens;
  acc.max_output_chars = Math.max(acc.max_output_chars, from.max_output_chars);
  acc.total_input_chars += from.total_input_chars;
  acc.total_input_tokens += from.total_input_tokens;
  acc.max_input_chars = Math.max(acc.max_input_chars, from.max_input_chars);
  acc.success_count += from.success_count;
  acc.failure_count += from.failure_count;
  acc.governed_deny += from.governed_deny;
  acc.governed_suggest += from.governed_suggest;
  acc.large_output_count += from.large_output_count;
  acc.compressible = acc.compressible || from.compressible;
}

// Re-emit the counter every PROGRESS_LINE_STRIDE lines within a file so a single huge
// transcript does not look frozen on a cold (cache-miss) parse.
const PROGRESS_LINE_STRIDE = 4000;

// Exported for the single-pass orchestrator (passes.ts) so a large file's combined
// parse re-emits progress on the same line stride as the standalone scan.
export { PROGRESS_LINE_STRIDE };

// A per-file UNFILTERED scan accumulator that can be fed already-parsed JSON values
// (one transcript line each). Factored out of extractFileScan so the single-pass
// extractor can drive the SAME state from the SAME JSON.parse the habits pass uses —
// the file is parsed once, both analyzers see every line. `parseFailed()` records a
// line the caller could not JSON.parse, mirroring the inline try/catch counter.
export type ScanAccumulator = {
  // Feed one parsed JSON value (one transcript line). Non-object / non-tool values
  // are ignored, matching the standalone walk.
  step(json: unknown): void;
  // Count one line that failed to JSON.parse (coverage error for transcripts).
  parseFailed(): void;
  // Running tool-event tally (drives the progress detail string).
  events(): number;
  // Collapse into the cacheable extract.
  finish(): FileScanExtract;
};

export function makeScanAccumulator(): ScanAccumulator {
  const accs = new Map<string, Accumulator>();
  const counters: ScanCounters = { toolEventCount: 0, unknownTime: 0 };
  const ctx: VscodeReadCtx = {};
  let parseErrors = 0;
  let hadEvent = false;
  return {
    step(json: unknown): void {
      if (typeof json !== "object" || json === null) return;
      for (const record of flatToolRecords(json as Record<string, unknown>, ctx)) {
        if (accumulateRecord(record, accs, {}, counters)) hadEvent = true;
      }
    },
    parseFailed(): void {
      parseErrors += 1;
    },
    events(): number {
      return counters.toolEventCount;
    },
    finish(): FileScanExtract {
      return { accs: [...accs.values()], hadEvent, parseErrors };
    },
  };
}

// Parse one file's text into its complete, UNFILTERED scan contribution — the unit the
// cross-run cache stores. `onLine` fires every PROGRESS_LINE_STRIDE lines (with the
// running event tally) so a large file still advances the progress counter.
function extractFileScan(text: string, onLine?: (events: number) => void): FileScanExtract {
  const acc = makeScanAccumulator();
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNo += 1;
    if (lineNo % PROGRESS_LINE_STRIDE === 0) onLine?.(acc.events());
    if (line.trim().length === 0) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      acc.parseFailed();
      continue;
    }
    acc.step(json);
  }
  return acc.finish();
}

// Parse one file's text into its complete, UNFILTERED per-event stream — the unit the
// windowed/session cross-run cache stores. Each record is reduced to a CachedEvent here
// (the costly normalize/govern work), so a warm hit only re-applies the cheap filter.
// `onLine` fires every PROGRESS_LINE_STRIDE lines so a large file still advances the bar.
function extractFileEvents(text: string, onLine?: (events: number) => void): FileEventExtract {
  const events: CachedEvent[] = [];
  const ctx: VscodeReadCtx = {};
  let parseErrors = 0;
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNo += 1;
    if (lineNo % PROGRESS_LINE_STRIDE === 0) onLine?.(events.length);
    if (line.trim().length === 0) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }
    if (typeof json !== "object" || json === null) continue;
    for (const record of flatToolRecords(json as Record<string, unknown>, ctx)) {
      events.push(recordToCachedEvent(record));
    }
  }
  return { events, parseErrors };
}

export type ScanTotals = {
  sessionInventory: number;
  transcriptCoverage: number;
  toolEventCount: number;
  unknownTime: number;
  coverageErrors: number;
};

// Rank the merged accumulators and assemble the ScanResult. A deterministic key
// tiebreak keeps the order stable regardless of which path (live vs cached) produced
// the map, so equal-volume opportunities never reorder between runs.
export function finishScan(
  discovery: SourceDiscovery,
  accs: Map<string, Accumulator>,
  totals: ScanTotals,
): ScanResult {
  const opportunities: Opportunity[] = [...accs.values()]
    .map((a) => ({
      ...a,
      share: totals.toolEventCount === 0 ? 0 : Number((a.count / totals.toolEventCount).toFixed(4)),
      avg_output_chars: a.count === 0 ? 0 : Math.round(a.total_output_chars / a.count),
    }))
    // Rank by output volume (primary cost), then frequency, then key (stable).
    .sort(
      (x, y) =>
        y.total_output_chars - x.total_output_chars ||
        y.count - x.count ||
        (x.key < y.key ? -1 : x.key > y.key ? 1 : 0),
    );

  return {
    inputType: discovery.inputType,
    session_inventory: totals.sessionInventory,
    transcript_coverage: totals.transcriptCoverage,
    tool_event_count: totals.toolEventCount,
    unknown_time_records: totals.unknownTime,
    coverage_errors: totals.coverageErrors,
    opportunities,
  };
}

export function scan(discovery: SourceDiscovery, opts: ScanOptions = {}): ScanResult {
  // A per-event filter (--since / --session) makes the FULL-file cached extract
  // inapplicable (it's already folded and can't be re-filtered). But the per-EVENT cache
  // CAN serve it: load each file's sanitized event stream once, then slice it by the
  // time/session filter post-load (issue #38). With an event cache available the windowed
  // /session run reuses the warm cache instead of re-parsing raw JSON every time; without
  // one it falls back to the live, uncached parse. Everything else (the common case:
  // default inspect, --json, --fail-on, optimize-triggered) takes the full-file extract
  // path, which the cross-run cache turns near-instant on repeat.
  const filtered = opts.sinceMs !== undefined || opts.session !== undefined;
  if (filtered) return opts.eventCache ? scanWindowed(discovery, opts) : scanLive(discovery, opts);
  return scanCached(discovery, opts);
}

// Live (uncached) path — honors --since / --session, parsing every line every run.
function scanLive(discovery: SourceDiscovery, opts: ScanOptions): ScanResult {
  const accs = new Map<string, Accumulator>();
  const counters: ScanCounters = { toolEventCount: 0, unknownTime: 0 };
  let coverageErrors = 0;
  let transcriptCoverage = 0;
  let sessionInventory = 0;

  const totalFiles = discovery.transcriptFiles.length + discovery.sessionFiles.length;
  let processed = 0;
  const tick = (group: string): void =>
    opts.onProgress?.(
      processed,
      totalFiles,
      `${group} · ${counters.toolEventCount.toLocaleString()} events`,
    );

  // Read one source file, accumulate every tool record it carries. A fresh
  // VscodeReadCtx per file threads the session id across that file's lines. JSON parse
  // failures are coverage errors only for transcripts (a chatSessions snapshot is one
  // serialized object; partial lines there are normal, not errors).
  function processFile(file: string, group: string): { read: boolean; had: boolean } {
    const text = readSourceText(file, opts.fileCache);
    if (text === undefined) return { read: false, had: false };
    const ctx: VscodeReadCtx = {};
    let had = false;
    let lineNo = 0;
    for (const line of text.split(/\r?\n/)) {
      lineNo += 1;
      if (lineNo % PROGRESS_LINE_STRIDE === 0) tick(group);
      if (line.trim().length === 0) continue;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        if (group === "transcripts") coverageErrors += 1;
        continue;
      }
      if (typeof json !== "object" || json === null) continue;
      for (const record of flatToolRecords(json as Record<string, unknown>, ctx)) {
        if (accumulateRecord(record, accs, opts, counters)) had = true;
      }
    }
    return { read: true, had };
  }

  for (const file of discovery.transcriptFiles) {
    const r = processFile(file, "transcripts");
    if (!r.read) coverageErrors += 1;
    else if (r.had) transcriptCoverage += 1;
    processed += 1;
    tick("transcripts");
  }
  // Session inventory = count of distinct SESSIONS discovered (one chatSessions file =
  // one session), NOT a line count. Session files ALSO go through extraction so a
  // populated snapshot contributes tool events (I4); on most versions their requests
  // are empty and only the session count lands here.
  for (const file of discovery.sessionFiles) {
    const r = processFile(file, "sessions");
    if (!r.read) coverageErrors += 1;
    else {
      sessionInventory += 1;
      // A session file that itself carries tool activity (Copilot CLI events.jsonl,
      // or a populated VS Code snapshot) is also a session WITH readable activity.
      if (r.had) transcriptCoverage += 1;
    }
    processed += 1;
    tick("sessions");
  }

  return finishScan(discovery, accs, {
    sessionInventory,
    transcriptCoverage,
    toolEventCount: counters.toolEventCount,
    unknownTime: counters.unknownTime,
    coverageErrors,
  });
}

// Cached path — no per-event filter, so each file's full extract is reusable. Serves
// an unchanged file (matching mtime+size) from the cross-run cache; otherwise parses
// it once and writes the extract back. Identical ScanResult to scanLive for the same
// (unfiltered) inputs.
function scanCached(discovery: SourceDiscovery, opts: ScanOptions): ScanResult {
  const accs = new Map<string, Accumulator>();
  let toolEventCount = 0;
  let coverageErrors = 0;
  let transcriptCoverage = 0;
  let sessionInventory = 0;

  const totalFiles = discovery.transcriptFiles.length + discovery.sessionFiles.length;
  let processed = 0;
  const tick = (group: string, partial = 0): void =>
    opts.onProgress?.(
      processed,
      totalFiles,
      `${group} · ${(toolEventCount + partial).toLocaleString()} events`,
    );

  function loadExtract(file: string, group: string): FileScanExtract | undefined {
    const key: CacheKey | undefined = opts.scanCache ? statKey(file) : undefined;
    if (opts.scanCache && key) {
      const hit = opts.scanCache.get(file, key);
      if (hit) return hit;
    }
    const text = readSourceText(file, opts.fileCache);
    if (text === undefined) return undefined;
    const extract = extractFileScan(text, (partial) => tick(group, partial));
    if (opts.scanCache && key) opts.scanCache.set(file, key, extract);
    return extract;
  }

  function fold(ex: FileScanExtract): void {
    for (const a of ex.accs) {
      mergeAcc(accs, a);
      toolEventCount += a.count;
    }
  }

  for (const file of discovery.transcriptFiles) {
    const ex = loadExtract(file, "transcripts");
    if (ex === undefined) {
      coverageErrors += 1;
    } else {
      fold(ex);
      if (ex.hadEvent) transcriptCoverage += 1;
      coverageErrors += ex.parseErrors;
    }
    processed += 1;
    tick("transcripts");
  }
  for (const file of discovery.sessionFiles) {
    const ex = loadExtract(file, "sessions");
    if (ex === undefined) {
      coverageErrors += 1;
    } else {
      sessionInventory += 1;
      fold(ex);
      // A session file carrying tool activity also counts as readable coverage.
      if (ex.hadEvent) transcriptCoverage += 1;
      // Session-file parse errors are NOT coverage errors (see processFile above).
    }
    processed += 1;
    tick("sessions");
  }

  return finishScan(discovery, accs, {
    sessionInventory,
    transcriptCoverage,
    toolEventCount,
    unknownTime: 0,
    coverageErrors,
  });
}

// Windowed/session cached path (issue #38) — honors --since / --session WHILE reusing the
// cross-run cache. Each file's UNFILTERED sanitized event stream is the cached unit: an
// unchanged file (matching mtime+size) is served from the event cache, otherwise it's
// parsed once and written back. The --since / --session filter is then applied per event
// post-load, so a repeated windowed run pays only for NEW/CHANGED files. Best-effort: a
// cache miss / corruption / unreadable file falls back to a live parse without error.
// Yields the same ScanResult as scanLive for the same (filtered) inputs.
function scanWindowed(discovery: SourceDiscovery, opts: ScanOptions): ScanResult {
  const accs = new Map<string, Accumulator>();
  const counters: ScanCounters = { toolEventCount: 0, unknownTime: 0 };
  let coverageErrors = 0;
  let transcriptCoverage = 0;
  let sessionInventory = 0;

  const totalFiles = discovery.transcriptFiles.length + discovery.sessionFiles.length;
  let processed = 0;
  const tick = (group: string, partial = 0): void =>
    opts.onProgress?.(
      processed,
      totalFiles,
      `${group} · ${(counters.toolEventCount + partial).toLocaleString()} events`,
    );

  function loadEvents(file: string, group: string): FileEventExtract | undefined {
    const key: CacheKey | undefined = opts.eventCache ? statKey(file) : undefined;
    if (opts.eventCache && key) {
      const hit = opts.eventCache.get(file, key);
      if (hit) return hit;
    }
    const text = readSourceText(file, opts.fileCache);
    if (text === undefined) return undefined;
    const extract = extractFileEvents(text, (partial) => tick(group, partial));
    if (opts.eventCache && key) opts.eventCache.set(file, key, extract);
    return extract;
  }

  for (const file of discovery.transcriptFiles) {
    const ex = loadEvents(file, "transcripts");
    if (ex === undefined) {
      coverageErrors += 1;
    } else {
      let had = false;
      for (const ev of ex.events) {
        if (foldCachedEvent(ev, accs, opts, counters)) had = true;
      }
      if (had) transcriptCoverage += 1;
      coverageErrors += ex.parseErrors;
    }
    processed += 1;
    tick("transcripts");
  }
  for (const file of discovery.sessionFiles) {
    const ex = loadEvents(file, "sessions");
    if (ex === undefined) {
      coverageErrors += 1;
    } else {
      sessionInventory += 1;
      let had = false;
      for (const ev of ex.events) {
        if (foldCachedEvent(ev, accs, opts, counters)) had = true;
      }
      // A session file carrying tool activity also counts as readable coverage.
      if (had) transcriptCoverage += 1;
      // Session-file parse errors are NOT coverage errors (see scanLive.processFile).
    }
    processed += 1;
    tick("sessions");
  }

  return finishScan(discovery, accs, {
    sessionInventory,
    transcriptCoverage,
    toolEventCount: counters.toolEventCount,
    unknownTime: counters.unknownTime,
    coverageErrors,
  });
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
