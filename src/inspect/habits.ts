// Cost-tips habit analyzer — ctx's answer to Copilot CLI's `/chronicle cost tips`.
// Where the opportunity scan asks "which commands/tools are expensive?", this asks
// "what about HOW the user drives the agent costs tokens?" — the habits chronicle
// looks at: per-session tool-call depth (continuation steps), turn count, and prompt
// length. Privacy-preserving by construction: it records LENGTHS and COUNTS only,
// never a prompt's content, a command, or an argument (inspect-v1 "Raw Evidence
// Policy"). Grounded in published token-cost best practices — see costTipFindings.
//
// Source = the VS Code transcript typed-event stream (the reliable per-turn log):
//   session.start      → opens a session (data.sessionId)
//   user.message       → one prompt (data.content length = prompt size)
//   assistant.message  → one turn; data.toolRequests[].length = tool calls that turn
// chatSessions / flat dialects don't carry this turn structure, so they contribute
// nothing here (the opportunity scan still covers their tool counts).

import { readSourceText, type FileCache } from "./fileCache.js";
import { type CacheKey, type ExtractCache, statKey } from "./extractCache.js";
import type { SourceDiscovery } from "./sources.js";

// A prompt this long is worth flagging — "write as little context as required, as
// much as necessary"; over-long prompts are paid on every turn that re-sends them.
export const LONG_PROMPT_CHARS = 2000;

export type HabitStats = {
  // Sessions that produced at least one prompt or tool call.
  sessions: number;
  total_tool_calls: number;
  avg_tool_calls_per_session: number;
  max_tool_calls_in_session: number;
  prompt_count: number;
  avg_prompt_chars: number;
  max_prompt_chars: number;
  // Prompts over LONG_PROMPT_CHARS.
  long_prompt_count: number;
};

type Session = { tools: number; promptChars: number[] };

// A per-file habits accumulator that can be fed one already-parsed JSON line at a
// time. Factored out of extractFileHabits so the single-pass extractor (passes.ts)
// can drive the SAME state from the SAME JSON.parse the scan pass uses — the file is
// parsed once, both analyzers see every line. `current` threads the session id (or
// the file path until a session.start declares one) exactly as the standalone pass.
export type HabitAccumulator = {
  // Feed one parsed JSON value (one transcript line). Non-typed-event values are
  // ignored, matching the standalone walk.
  step(json: unknown): void;
  // Collapse the accumulated per-session state into the cacheable extract.
  finish(): FileHabitExtract;
};

export function makeHabitAccumulator(file: string): HabitAccumulator {
  const local = new Map<string, Session>();
  const sessionFor = (key: string): Session => {
    let s = local.get(key);
    if (!s) {
      s = { tools: 0, promptChars: [] };
      local.set(key, s);
    }
    return s;
  };
  let current = file;
  return {
    step(json: unknown): void {
      if (!isObject(json)) return;
      const type = typeof json.type === "string" ? json.type : "";
      const data = isObject(json.data) ? json.data : undefined;
      if (!data) return;
      if (type === "session.start") {
        const sid = typeof data.sessionId === "string" ? data.sessionId : undefined;
        if (sid) current = sid;
        sessionFor(current);
      } else if (type === "user.message") {
        sessionFor(current).promptChars.push(contentLength(data));
      } else if (type === "assistant.message") {
        const reqs = data.toolRequests;
        if (Array.isArray(reqs)) sessionFor(current).tools += reqs.length;
      }
    },
    finish(): FileHabitExtract {
      return {
        sessions: [...local.entries()].map(([key, s]) => ({
          key,
          tools: s.tools,
          promptChars: s.promptChars,
        })),
      };
    },
  };
}

// Fold one file's per-session habit contribution into a running session map (sum
// tool calls, concatenate prompt sizes), grouped by session key. Shared by the
// standalone analyzeHabits loop and the single-pass orchestrator so both produce a
// byte-identical aggregate.
export function foldHabitExtract(into: Map<string, Session>, extract: FileHabitExtract): void {
  for (const fs of extract.sessions) {
    let s = into.get(fs.key);
    if (!s) {
      s = { tools: 0, promptChars: [] };
      into.set(fs.key, s);
    }
    s.tools += fs.tools;
    s.promptChars.push(...fs.promptChars);
  }
}

// Reduce a fully-folded session map into the public HabitStats. Shared so the
// single-pass path and the standalone path compute identical statistics.
export function summarizeHabits(sessions: Map<string, Session>): HabitStats {
  const active = [...sessions.values()].filter((s) => s.tools > 0 || s.promptChars.length > 0);
  const toolCounts = active.map((s) => s.tools);
  const promptChars = active.flatMap((s) => s.promptChars);
  const totalToolCalls = toolCounts.reduce((a, b) => a + b, 0);
  const totalPromptChars = promptChars.reduce((a, b) => a + b, 0);
  return {
    sessions: active.length,
    total_tool_calls: totalToolCalls,
    avg_tool_calls_per_session:
      active.length === 0 ? 0 : Math.round(totalToolCalls / active.length),
    max_tool_calls_in_session: toolCounts.length === 0 ? 0 : Math.max(...toolCounts),
    prompt_count: promptChars.length,
    avg_prompt_chars:
      promptChars.length === 0 ? 0 : Math.round(totalPromptChars / promptChars.length),
    max_prompt_chars: promptChars.length === 0 ? 0 : Math.max(...promptChars),
    long_prompt_count: promptChars.filter((n) => n > LONG_PROMPT_CHARS).length,
  };
}

// The session-map type used by the habits aggregate (exported so the single-pass
// orchestrator can hold the running map between fold and summarize).
export type HabitSessionMap = Map<string, Session>;

// One file's complete contribution to the habits aggregate — the cacheable unit.
// Sessions are keyed by their resolved id (or the file path until a session.start
// declares one), so the cross-run merge reproduces the global grouping exactly.
export type FileHabitExtract = {
  sessions: { key: string; tools: number; promptChars: number[] }[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function contentLength(data: Record<string, unknown>): number {
  const c = data.content;
  if (typeof c === "string") return c.length;
  // Some builds wrap content in parts; fall back to a stringified length, never the
  // content itself (we only keep the number).
  if (Array.isArray(c)) {
    try {
      return JSON.stringify(c).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

// Parse one file's typed-event stream into its per-session habit contribution — the
// unit the cross-run cache stores. Threads `current` (session id, or file path until a
// session.start declares one) across the file's lines exactly as the global pass did.
export function extractFileHabits(text: string, file: string): FileHabitExtract {
  const acc = makeHabitAccumulator(file);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    acc.step(json);
  }
  return acc.finish();
}

export function analyzeHabits(
  discovery: SourceDiscovery,
  onProgress?: (completed: number, total: number, detail?: string) => void,
  fileCache?: FileCache,
  habitsCache?: ExtractCache<FileHabitExtract>,
): HabitStats {
  const sessions: HabitSessionMap = new Map<string, Session>();

  // Fold one file's per-session contribution into the global grouping (by session key).
  const fold = (extract: FileHabitExtract): void => foldHabitExtract(sessions, extract);

  // Serve an unchanged file from the cross-run cache; otherwise parse it once and
  // write the extract back. Returns undefined on read failure (contributes nothing).
  function loadExtract(file: string): FileHabitExtract | undefined {
    const key: CacheKey | undefined = habitsCache ? statKey(file) : undefined;
    if (habitsCache && key) {
      const hit = habitsCache.get(file, key);
      if (hit) return hit;
    }
    const text = readSourceText(file, fileCache);
    if (text === undefined) return undefined;
    const extract = extractFileHabits(text, file);
    if (habitsCache && key) habitsCache.set(file, key, extract);
    return extract;
  }

  // Both transcripts and (rarely-populated) session files carry the typed stream.
  const files = [...discovery.transcriptFiles, ...discovery.sessionFiles];
  let processed = 0;
  const tick = (): void =>
    onProgress?.(processed, files.length, `${sessions.size.toLocaleString()} sessions`);
  for (const file of files) {
    const extract = loadExtract(file);
    if (extract) fold(extract);
    processed += 1;
    tick();
  }

  // Aggregate only sessions that showed real activity.
  return summarizeHabits(sessions);
}
