// Measured token detail (issue: Copilot CLI sessions).
//
// Unlike the rest of inspect — which ESTIMATES token volume from output character
// counts — the Copilot CLI persists GROUND-TRUTH token accounting on its
// `session.shutdown` event. This module reads those events straight off disk and
// aggregates them into a per-run "measured" view: real input / output / cache /
// reasoning tokens, premium-request cost, and a per-model breakdown.
//
// `session.shutdown.data` (verified against copilot 1.0.63) carries:
//   tokenDetails: { input, cache_read, cache_write, output }  // each { tokenCount }
//     — a clean, NON-overlapping split of the session's tokens.
//   modelMetrics: { <model>: { requests:{count,cost}, usage:{ inputTokens,
//     outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens } } }
//   totalPremiumRequests, systemTokens, conversationTokens, toolDefinitionsTokens
//
// Privacy: only numeric counts and model names are read — never message content.
// Total (never throws): a missing/garbled shutdown line is skipped, not fatal.

import { basename, dirname } from "node:path";

import { type FileCache, readSourceText } from "./fileCache.js";
import type { SourceDiscovery } from "./sources.js";

// Per-model measured usage, summed across every analyzed session.
export type ModelTokens = {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  // Premium requests (a.k.a. AI credits) billed for this model.
  cost: number;
};

// The standing context split from a single session's shutdown — the per-session cost
// the user pays on every turn (system prompt + tool schemas + conversation so far).
export type ContextSplit = { system: number; conversation: number; tool_definitions: number };

// One session's own measured totals (from its shutdown record). `prompt` is the
// non-overlapping sum input + cache_read + cache_write; `cache_hit` is cache_read /
// prompt. `model` is the session's primary (highest-volume) model.
export type SessionRow = {
  id: string;
  model: string;
  prompt: number;
  output: number;
  cache_hit: number;
  premium: number;
};

export type SessionTokenDetail = {
  // Sessions that carried a measured `session.shutdown` record.
  sessions: number;
  // Aggregate, non-overlapping token split across all measured sessions.
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  reasoning: number;
  // Premium requests (AI credits) across all measured sessions.
  premium_requests: number;
  // Per-model breakdown, ranked by total (in + out) volume.
  models: ModelTokens[];
  // Per-session breakdown, ranked by prompt-token spend (the report shows the top N).
  bySession: SessionRow[];
  // Context split from the most-recent session (representative standing cost).
  last_context?: ContextSplit;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Read `{ tokenCount }` out of a tokenDetails sub-object.
function tokenCount(v: unknown): number {
  return isObject(v) ? num(v.tokenCount) : 0;
}

// Mutable accumulator (one ModelTokens per model name).
type Acc = {
  sessions: number;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  reasoning: number;
  premium_requests: number;
  models: Map<string, ModelTokens>;
  rows: SessionRow[];
  lastStart: number;
  last_context?: ContextSplit;
};

// Full session id derived from the file path: the per-session directory name (a
// UUID) for the modern layout, else the file's own basename. Not truncated — the
// report shows the whole id so a session can be located unambiguously.
function sessionLabel(file: string): string {
  const dir = basename(dirname(file));
  return dir && dir !== "session-state" ? dir : basename(file).replace(/\.jsonl$/, "");
}

function blankModel(model: string): ModelTokens {
  return {
    model,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    cost: 0,
  };
}

// Fold one `session.shutdown` payload into the accumulator. `label` identifies the
// session (for the per-session row).
function foldShutdown(acc: Acc, data: Record<string, unknown>, label: string): void {
  acc.sessions += 1;

  const td = isObject(data.tokenDetails) ? data.tokenDetails : {};
  const sIn = tokenCount(td.input);
  const sOut = tokenCount(td.output);
  const sRead = tokenCount(td.cache_read);
  const sWrite = tokenCount(td.cache_write);
  acc.input += sIn;
  acc.output += sOut;
  acc.cache_read += sRead;
  acc.cache_write += sWrite;
  acc.premium_requests += num(data.totalPremiumRequests);

  // Per-session row: the primary (highest in+out) model names the session.
  let primaryModel = "";
  let primaryVol = -1;
  const mm = isObject(data.modelMetrics) ? data.modelMetrics : {};
  for (const [model, raw] of Object.entries(mm)) {
    if (!isObject(raw)) continue;
    const usage = isObject(raw.usage) ? raw.usage : {};
    const reqs = isObject(raw.requests) ? raw.requests : {};
    const m = acc.models.get(model) ?? blankModel(model);
    m.requests += num(reqs.count);
    m.cost += num(reqs.cost);
    m.inputTokens += num(usage.inputTokens);
    m.outputTokens += num(usage.outputTokens);
    m.cacheReadTokens += num(usage.cacheReadTokens);
    m.cacheWriteTokens += num(usage.cacheWriteTokens);
    m.reasoningTokens += num(usage.reasoningTokens);
    acc.reasoning += num(usage.reasoningTokens);
    acc.models.set(model, m);
    const vol = num(usage.inputTokens) + num(usage.outputTokens);
    if (vol > primaryVol) {
      primaryVol = vol;
      primaryModel = model;
    }
  }

  const prompt = sIn + sRead + sWrite;
  acc.rows.push({
    id: label,
    model: primaryModel,
    prompt,
    output: sOut,
    cache_hit: prompt > 0 ? sRead / prompt : 0,
    premium: Number(num(data.totalPremiumRequests).toFixed(2)),
  });

  // Keep the context split from the latest session (by start time, falling back to
  // last seen) — it represents the standing per-turn cost most recently observed.
  const start = num(data.sessionStartTime);
  if (acc.sessions === 1 || start >= acc.lastStart) {
    acc.lastStart = start;
    acc.last_context = {
      system: num(data.systemTokens),
      conversation: num(data.conversationTokens),
      tool_definitions: num(data.toolDefinitionsTokens),
    };
  }
}

// Scan a session/transcript file for `session.shutdown` events and fold them in.
function scanFile(acc: Acc, text: string, label: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("session.shutdown")) continue; // cheap pre-filter
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(json) || json.type !== "session.shutdown" || !isObject(json.data)) continue;
    foldShutdown(acc, json.data, label);
  }
}

// Aggregate measured token detail across every discovered session/transcript file.
// Returns undefined when no session carried a measured shutdown record (e.g. a
// VS Code-only run, or sessions that never cleanly exited) — callers omit the
// section entirely rather than render a misleading all-zero block.
export function analyzeSessionTokens(
  discovery: SourceDiscovery,
  fileCache?: FileCache,
): SessionTokenDetail | undefined {
  const acc: Acc = {
    sessions: 0,
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    reasoning: 0,
    premium_requests: 0,
    models: new Map(),
    rows: [],
    lastStart: 0,
  };

  for (const file of [...discovery.sessionFiles, ...discovery.transcriptFiles]) {
    const text = readSourceText(file, fileCache);
    if (text === undefined) continue;
    scanFile(acc, text, sessionLabel(file));
  }

  if (acc.sessions === 0) return undefined;

  const models = [...acc.models.values()].sort(
    (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  );
  const bySession = acc.rows.sort((a, b) => b.prompt - a.prompt);

  return {
    sessions: acc.sessions,
    input: acc.input,
    output: acc.output,
    cache_read: acc.cache_read,
    cache_write: acc.cache_write,
    reasoning: acc.reasoning,
    premium_requests: Number(acc.premium_requests.toFixed(2)),
    models,
    bySession,
    ...(acc.last_context ? { last_context: acc.last_context } : {}),
  };
}
