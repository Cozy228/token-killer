// I3/I4 — VS Code session reader. The inspect scanner used to keep only records
// with a TOP-LEVEL `toolName`/`tool_name`/`tool` string, but VS Code Copilot writes
// neither. Two real on-disk shapes (verified against live storage 2026-06-11):
//
//  1. transcripts/<id>.jsonl — typed events `{type, data, id, timestamp, parentId}`.
//     Tool CALLS live on `assistant.message` events at `data.toolRequests[]`, each
//     `{toolCallId, name, arguments, type}` where `arguments` is a JSON string.
//     These are tool REQUESTS (name + args), NOT outputs — so output-volume can't be
//     derived from transcripts; frequency, compressibility, and governance can.
//
//  2. chatSessions/<id>.{json,jsonl} — a serialized ChatModel `{kind, v:{…,requests:[…]}}`.
//     Tool calls live under `v.requests[].response[]` parts. On many versions the
//     persisted snapshot leaves `requests:[]` (the live turns are in the transcript)
//     or serializes incrementally as JSON-Lines patches — both yield nothing here,
//     which is fine: the transcript is the reliable source. We still descend a
//     populated `v.requests[]` (e.g. a Windows full-snapshot `.json`), where the
//     response parts DO carry tool results, so output volume is available there.
//
// This module turns either shape into the flat, VS Code-dialect tool records that
// the shared `normalize()` already understands. It is total (never throws) and
// privacy-preserving by construction: it only forwards name/arguments/result that a
// later stage reduces to labels + lengths (the scanner never retains raw values).

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

// Carried across the lines of one transcript file so each tool record can be
// tagged with the session id declared once on the `session.start` event.
export type VscodeReadCtx = { session?: string };

type FlatRecord = Record<string, unknown>;

function fromTranscriptEvent(
  type: string,
  data: Record<string, unknown>,
  timestamp: string | undefined,
  ctx: VscodeReadCtx,
): FlatRecord[] {
  // The session id is declared once, on session.start; remember it for later events.
  if (type === "session.start") {
    const sid = firstString(data, ["sessionId", "session_id"]);
    if (sid) ctx.session = sid;
    return [];
  }
  const requests = data.toolRequests;
  if (!Array.isArray(requests)) return [];
  const out: FlatRecord[] = [];
  for (const tr of requests) {
    if (!isObject(tr)) continue;
    const name = firstString(tr, ["name", "toolName", "tool"]);
    if (!name) continue;
    // `arguments` is a JSON string; normalize()'s parseToolInput accepts a string.
    const rec: FlatRecord = { tool_name: name, tool_input: tr.arguments ?? tr.input ?? {} };
    if (timestamp) rec.timestamp = timestamp;
    if (ctx.session) rec.sessionId = ctx.session;
    out.push(rec);
  }
  return out;
}

function fromChatSession(requests: unknown[]): FlatRecord[] {
  const out: FlatRecord[] = [];
  for (const req of requests) {
    if (!isObject(req)) continue;
    const response = req.response;
    if (!Array.isArray(response)) continue;
    for (const part of response) {
      if (!isObject(part)) continue;
      // A tool-invocation part: its `kind` mentions "tool" and it carries a tool id.
      const kind = typeof part.kind === "string" ? part.kind.toLowerCase() : "";
      if (!kind.includes("tool")) continue;
      const name = firstString(part, ["toolName", "toolId", "name"]);
      if (!name) continue;
      const rec: FlatRecord = {
        tool_name: name,
        tool_input: part.toolInput ?? part.input ?? part.toolSpecificData ?? {},
      };
      // Unlike transcripts, chat snapshots can carry the tool result → output volume.
      const result = part.resultDetails ?? part.result ?? part.value;
      if (result !== undefined) rec.tool_response = result;
      out.push(rec);
    }
  }
  return out;
}

// Turn one parsed JSON value from a VS Code source file (a transcript event line or
// a chatSession object/line) into zero-or-more flat tool records. `ctx` threads the
// session id across the lines of a single file.
export function extractVscodeRecords(parsed: unknown, ctx: VscodeReadCtx = {}): FlatRecord[] {
  if (!isObject(parsed)) return [];

  // Transcript typed event.
  if (typeof parsed.type === "string" && isObject(parsed.data)) {
    const ts = typeof parsed.timestamp === "string" ? parsed.timestamp : undefined;
    return fromTranscriptEvent(parsed.type, parsed.data, ts, ctx);
  }

  // Serialized ChatModel snapshot: { kind, v: { requests: [...] } }.
  const v = parsed.v;
  if (isObject(v) && Array.isArray(v.requests)) {
    return fromChatSession(v.requests);
  }

  return [];
}
