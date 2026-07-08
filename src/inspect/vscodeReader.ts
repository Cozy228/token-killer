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
//
// `copilot` flips on when the file is a Copilot CLI event log (its session.start
// declares producer "copilot-agent"). The Copilot stream is richer than VS Code's:
// a tool call spans an `assistant.message` (name + args), a `tool.execution_start`
// (name + args) and a `tool.execution_complete` (RESULT + success). We pair them by
// `toolCallId` and emit ONE enriched record from the completion — so output volume
// and failure are captured — instead of the input-only record VS Code transcripts
// allow. `pendingArgs` holds each call's arguments until its completion arrives.
export type VscodeReadCtx = {
  session?: string;
  copilot?: boolean;
  // Per-call name + arguments remembered from the request / start event, keyed by
  // toolCallId — `tool.execution_complete` carries NEITHER (only result + success).
  pending?: Map<string, { name?: string; args?: unknown }>;
};

type FlatRecord = Record<string, unknown>;

function rememberCall(
  ctx: VscodeReadCtx,
  callId: string | undefined,
  name: string | undefined,
  args: unknown,
): void {
  if (!callId) return;
  const map = (ctx.pending ??= new Map());
  const prev = map.get(callId) ?? {};
  map.set(callId, { name: name ?? prev.name, args: args ?? prev.args });
}

// Copilot `tool.execution_complete`: the authoritative tool record — carries the
// result (output volume) and success flag, but NOT the tool name or arguments. We
// graft on the name + args remembered from the matching start/request so the single
// record has BOTH input and output.
function fromCopilotToolComplete(
  data: Record<string, unknown>,
  timestamp: string | undefined,
  ctx: VscodeReadCtx,
): FlatRecord[] {
  const callId = firstString(data, ["toolCallId", "tool_call_id", "id"]);
  const pending = callId ? ctx.pending?.get(callId) : undefined;
  if (callId) ctx.pending?.delete(callId);
  const name = firstString(data, ["toolName", "name", "tool"]) ?? pending?.name;
  if (!name) return [];
  const args = pending?.args;
  // result is `{ content, detailedContent }`; content is the model-visible output.
  const result = isObject(data.result)
    ? (data.result.content ?? data.result.detailedContent ?? data.result)
    : data.result;
  const rec: FlatRecord = {
    tool_name: name,
    tool_input: args ?? {},
    tool_response: result,
    // success === false ⇒ failure; isFailure() reads this top-level flag.
    isError: data.success === false,
  };
  if (timestamp) rec.timestamp = timestamp;
  if (ctx.session) rec.sessionId = ctx.session;
  return [rec];
}

function fromTranscriptEvent(
  type: string,
  data: Record<string, unknown>,
  timestamp: string | undefined,
  ctx: VscodeReadCtx,
): FlatRecord[] {
  // The session id is declared once, on session.start; remember it for later events.
  // Copilot's session.start also names the producer — the dialect signal we branch on.
  if (type === "session.start") {
    const sid = firstString(data, ["sessionId", "session_id"]);
    if (sid) ctx.session = sid;
    if (data.producer === "copilot-agent" || typeof data.copilotVersion === "string") {
      ctx.copilot = true;
    }
    return [];
  }

  // Copilot dialect: pair start/complete by toolCallId; the completion is the record.
  if (ctx.copilot) {
    if (type === "tool.execution_start") {
      rememberCall(
        ctx,
        firstString(data, ["toolCallId", "tool_call_id", "id"]),
        firstString(data, ["toolName", "name", "tool"]),
        data.arguments,
      );
      return [];
    }
    if (type === "tool.execution_complete") {
      return fromCopilotToolComplete(data, timestamp, ctx);
    }
    if (type === "assistant.message" && Array.isArray(data.toolRequests)) {
      // Stash each request's name + args (the start event may be absent), but DON'T
      // emit: the matching tool.execution_complete is the record so output isn't lost.
      for (const tr of data.toolRequests) {
        if (isObject(tr)) {
          rememberCall(
            ctx,
            firstString(tr, ["toolCallId", "tool_call_id", "id"]),
            firstString(tr, ["name", "toolName", "tool"]),
            tr.arguments,
          );
        }
      }
      return [];
    }
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
