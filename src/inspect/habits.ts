// Cost-tips habit analyzer — tk's answer to Copilot CLI's `/chronicle cost tips`.
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

import { readFileSync } from "node:fs";

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

export function analyzeHabits(discovery: SourceDiscovery): HabitStats {
  const sessions = new Map<string, Session>();

  function sessionFor(key: string): Session {
    let s = sessions.get(key);
    if (!s) {
      s = { tools: 0, promptChars: [] };
      sessions.set(key, s);
    }
    return s;
  }

  // Both transcripts and (rarely-populated) session files carry the typed stream.
  for (const file of [...discovery.transcriptFiles, ...discovery.sessionFiles]) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // Fall back to the file path as the session key until a session.start declares one.
    let current = file;
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isObject(json)) continue;
      const type = typeof json.type === "string" ? json.type : "";
      const data = isObject(json.data) ? json.data : undefined;
      if (!data) continue;

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
    }
  }

  // Aggregate only sessions that showed real activity.
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
