// Slice 0 — Tool-event normalizer (foundation for the hook runtime and inspect).
//
// Reads a host hook payload (already JSON-parsed, or a raw string) from either
// dialect and emits a single host-agnostic `ToolEvent`. Both dialects must parse
// because this module is SHARED with inspect, which reads VS Code transcripts,
// even though the live hook runtime only acts on the Copilot CLI dialect.
//
// Classification note (reconciliation): the goal sketch lists a coarse
// `kind: terminal | direct_read | …` enum, but CONTEXT.md — the locked glossary
// named by the goal as a spec source of truth — supersedes it with ONE canonical
// `category` classifier shared by the hook runtime and inspect, and explicitly
// forbids a parallel `kind` enum. We therefore carry `category`, with the goal's
// coarse kinds mapped onto it (terminal → execute_adjacent, direct_read → read,
// direct_search → search, direct_list → list, direct_web → web, edit → edit,
// unknown → other). `isShellExecution` derives the rewrite-eligible grouping.
//
// Fail-open (CONTEXT.md / DESIGN §3.6): any parse error yields an `unknown` event
// that downstream maps to `allow` / no rewrite. This module never throws.

// The single canonical classification of a tool event (CONTEXT.md "Tool category").
export type ToolCategory =
  | "read"
  | "search"
  | "list"
  | "edit"
  | "execute_adjacent"
  | "web"
  | "agent-orchestration"
  | "metadata"
  | "other";

// Normalized lifecycle event name (canonicalized to the CLI camelCase spelling).
export type HookEventName =
  | "preToolUse"
  | "postToolUse"
  | "userPromptSubmitted"
  | "errorOccurred"
  | "sessionStart"
  | "sessionEnd"
  | "unknown";

export type Dialect = "cli" | "vscode" | "unknown";

// The host-agnostic normalized representation of one tool invocation.
export type ToolEvent = {
  // Lifecycle event the host is firing. The dispatcher (Slice 1+) branches on it.
  event: HookEventName;
  // The single canonical classifier (CONTEXT.md). Drives the hook's handling
  // strategy; never a second parallel enum.
  category: ToolCategory;
  // Raw tool name as reported by the host ("" when absent / not a tool event).
  toolName: string;
  // Parsed tool input/args, normalized to an object ({} when absent/unparseable).
  toolInput: Record<string, unknown>;
  // Present on posttool events; the host's tool result, shape left to the caller.
  toolResult?: unknown;
  // Extracted shell command string. Only populated for `execute_adjacent` events.
  command?: string;
  // Prompt text, for userPromptSubmitted events.
  prompt?: string;
  cwd?: string;
  // Best-effort model name. Absent → downstream falls back to L2 governance
  // (DESIGN §3.7); we never guess.
  model?: string;
  session?: string;
  // Which payload dialect produced this event. "unknown" on fail-open.
  dialect: Dialect;
};

// A shell execution is the only kind eligible for command rewrite (CONTEXT.md).
// Derived from the canonical category — not a stored second flag.
export function isShellExecution(event: ToolEvent): boolean {
  return event.category === "execute_adjacent" && typeof event.command === "string";
}

// ---------------------------------------------------------------------------
// Tool-name → category classifier (shared by hook runtime and inspect).
// Exact-match tables first (lowercased), then conservative substring heuristics
// so unseen tools degrade to a sensible category rather than crashing.
// ---------------------------------------------------------------------------

const CATEGORY_BY_TOOL: Record<string, ToolCategory> = {
  // Shell / terminal execution (rewrite-eligible).
  bash: "execute_adjacent",
  sh: "execute_adjacent",
  shell: "execute_adjacent",
  zsh: "execute_adjacent",
  pwsh: "execute_adjacent",
  powershell: "execute_adjacent",
  cmd: "execute_adjacent",
  terminal: "execute_adjacent",
  run_in_terminal: "execute_adjacent",
  runinterminal: "execute_adjacent",
  execute_command: "execute_adjacent",
  run_command: "execute_adjacent",
  runcommand: "execute_adjacent",

  // Read.
  read_file: "read",
  readfile: "read",
  read: "read",
  view: "read",
  cat: "read",
  open_file: "read",
  get_file_contents: "read",

  // Search.
  grep_search: "search",
  grepsearch: "search",
  grep: "search",
  rg: "search",
  ripgrep: "search",
  semantic_search: "search",
  text_search: "search",
  findtextinfiles: "search",
  search: "search",

  // List / glob.
  list_dir: "list",
  listdir: "list",
  list_directory: "list",
  read_directory: "list",
  glob: "list",
  file_search: "list",
  filesearch: "list",
  ls: "list",

  // Edit / mutation.
  apply_patch: "edit",
  applypatch: "edit",
  edit: "edit",
  edit_file: "edit",
  create_file: "edit",
  createfile: "edit",
  replace_string_in_file: "edit",
  insert_edit_into_file: "edit",
  multi_replace_string_in_file: "edit",
  str_replace: "edit",
  write: "edit",
  write_file: "edit",

  // Web / fetch.
  fetch_webpage: "web",
  fetchwebpage: "web",
  fetch: "web",
  open_url: "web",
  web_search: "web",
  open_simple_browser: "web",

  // Agent / subagent orchestration.
  run_task: "agent-orchestration",
  runtask: "agent-orchestration",
  create_and_run_task: "agent-orchestration",
  new_task: "agent-orchestration",
  manage_todo_list: "agent-orchestration",
  todo: "agent-orchestration",
  runsubagent: "agent-orchestration",
  agent: "agent-orchestration",

  // Metadata / introspection (no large evidence body to compress).
  get_errors: "metadata",
  get_changed_files: "metadata",
  get_terminal_output: "metadata",
  terminal_last_command: "metadata",
  list_code_usages: "metadata",
  usages: "metadata",
  get_task_output: "metadata",
  test_search: "metadata",
};

// Conservative substring heuristics for unseen tool names. Order matters: the
// most specific signal wins. Never throws; falls through to "other".
function classifyByHeuristic(lower: string): ToolCategory {
  if (lower.includes("terminal") || lower.includes("shell") || lower.includes("bash")) {
    return "execute_adjacent";
  }
  if (
    lower.includes("apply_patch") ||
    lower.includes("edit") ||
    lower.includes("replace") ||
    lower.includes("create_file")
  ) {
    return "edit";
  }
  if (lower.includes("grep") || lower.includes("search")) {
    // file_search is a list/glob op; everything else search-ish is a search.
    return lower.includes("file_search") || lower.includes("filesearch") ? "list" : "search";
  }
  if (lower.includes("list") || lower.includes("glob") || lower.includes("dir")) {
    return "list";
  }
  if (lower.includes("read") || lower.includes("view") || lower.includes("cat")) {
    return "read";
  }
  if (lower.includes("fetch") || lower.includes("web") || lower.includes("url")) {
    return "web";
  }
  if (lower.includes("task") || lower.includes("agent") || lower.includes("todo")) {
    return "agent-orchestration";
  }
  return "other";
}

export function classifyTool(toolName: string): ToolCategory {
  if (!toolName) return "other";
  const lower = toolName.trim().toLowerCase();
  return CATEGORY_BY_TOOL[lower] ?? classifyByHeuristic(lower);
}

// ---------------------------------------------------------------------------
// Field extraction helpers. Every helper is total (never throws) and tolerant of
// both dialects, since payload shapes vary across host versions.
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

// Parse a tool-input value that may be either an object (VS Code `tool_input`) or
// a JSON string (Copilot CLI `toolArgs`). Anything else → {}.
function parseToolInput(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (isObject(parsed)) return parsed;
    } catch {
      // Not JSON — leave as empty input rather than throwing.
    }
  }
  return {};
}

const EVENT_ALIASES: Record<string, HookEventName> = {
  pretooluse: "preToolUse",
  posttooluse: "postToolUse",
  userpromptsubmitted: "userPromptSubmitted",
  userpromptsubmit: "userPromptSubmitted",
  erroroccurred: "errorOccurred",
  sessionstart: "sessionStart",
  sessionend: "sessionEnd",
};

function normalizeEventName(raw: unknown): HookEventName {
  if (typeof raw !== "string") return "unknown";
  return EVENT_ALIASES[raw.trim().toLowerCase()] ?? "unknown";
}

// Pull the shell command string out of a parsed tool input. Hosts disagree on the
// key (`command`, `commandLine`, `script`, …); probe the common ones.
function extractCommand(input: Record<string, unknown>): string | undefined {
  return firstString(input, ["command", "commandLine", "cmd", "script", "shellCommand", "input"]);
}

function detectDialect(payload: Record<string, unknown>): Dialect {
  if ("toolName" in payload || "toolArgs" in payload || "toolResult" in payload) return "cli";
  if (
    "tool_name" in payload ||
    "tool_input" in payload ||
    "tool_response" in payload ||
    "tool_result" in payload
  ) {
    return "vscode";
  }
  return "unknown";
}

const UNKNOWN_EVENT: ToolEvent = {
  event: "unknown",
  category: "other",
  toolName: "",
  toolInput: {},
  dialect: "unknown",
};

// Normalize an already-parsed payload object into a ToolEvent. Total: any shape,
// including a non-object, yields a fail-open `unknown` event.
export function normalize(payload: unknown): ToolEvent {
  if (!isObject(payload)) return { ...UNKNOWN_EVENT };

  const dialect = detectDialect(payload);

  const toolName = firstString(payload, ["toolName", "tool_name", "tool", "name"]) ?? "";
  const toolInput = parseToolInput(
    payload.toolArgs ?? payload.tool_input ?? payload.toolInput ?? payload.input,
  );
  const rawResult = payload.toolResult ?? payload.tool_response ?? payload.tool_result;

  const rawEvent =
    payload.event ?? payload.eventName ?? payload.hookEventName ?? payload.hook_event_name;
  let event = normalizeEventName(rawEvent);
  // Copilot CLI's NATIVE preToolUse entry sends NO event-name field — it scopes the
  // event by the hook-config key it fired under (verified live against 1.0.62, see
  // docs/reports/windows-copilot-1.0.62-live-verification-20260615.md §5). Without
  // this, that payload normalizes to `unknown` → `decide()` allows it → the rewrite
  // silently never happens on the camelCase path. Infer preToolUse from the shape: a
  // recognized-dialect tool call carrying a name + input but NO result is a pre-call.
  // Guarded to a genuinely ABSENT event field — an event name that is present but
  // unrecognized stays `unknown` (it may be a future event we must not mislabel).
  // Safe even when the dual-schema PascalCase entry ALSO rewrites the same call —
  // rewriteCommand is idempotent on an already-`ctx` command (eligibility guards it).
  if (
    event === "unknown" &&
    rawEvent === undefined &&
    dialect !== "unknown" &&
    toolName.length > 0 &&
    rawResult === undefined
  ) {
    event = "preToolUse";
  }

  const category = classifyTool(toolName);

  const ev: ToolEvent = {
    event,
    category,
    toolName,
    toolInput,
    dialect,
  };

  // Result is only meaningful on posttool; carry it through untouched when present.
  if (rawResult !== undefined) ev.toolResult = rawResult;

  // Command string only for shell executions.
  if (category === "execute_adjacent") {
    const command = extractCommand(toolInput);
    if (command !== undefined) ev.command = command;
  }

  const prompt = firstString(payload, ["prompt", "promptText", "userPrompt"]);
  if (prompt !== undefined) ev.prompt = prompt;

  const cwd = firstString(payload, [
    "cwd",
    "workingDirectory",
    "workspaceRoot",
    "workspace_folder",
    "workspaceFolder",
  ]);
  if (cwd !== undefined) ev.cwd = cwd;

  // Model: probe top-level then a `context`/`metadata` nesting. Never guess.
  let model = firstString(payload, ["model", "modelName", "model_name"]);
  if (model === undefined && isObject(payload.context)) {
    model = firstString(payload.context, ["model", "modelName", "model_name"]);
  }
  if (model === undefined && isObject(payload.metadata)) {
    model = firstString(payload.metadata, ["model", "modelName", "model_name"]);
  }
  if (model !== undefined) ev.model = model;

  const session = firstString(payload, [
    "session",
    "sessionId",
    "session_id",
    "conversationId",
    "conversation_id",
  ]);
  if (session !== undefined) ev.session = session;

  return ev;
}

// Parse a raw stdin string and normalize it. Fail-open: invalid JSON or empty
// input yields an `unknown` event (downstream → allow / no rewrite). Never throws.
export function normalizeStdin(raw: string): ToolEvent {
  if (typeof raw !== "string") return { ...UNKNOWN_EVENT };
  // Windows hosts prepend one or two UTF-8 BOMs (`EF BB BF`) to hook stdin —
  // confirmed for Cursor (1–2 BOMs), and the same risk applies to VS Code /
  // Copilot CLI on Windows. JSON.parse rejects a leading BOM, so without this
  // strip the parse throws and the hook fails open → the rewrite silently never
  // happens (the worst failure mode: token savings vanish with no error). Mirror
  // RTK's strip_leading_bom, which exists for exactly this Windows behavior.
  const cleaned = raw.replace(/^\uFEFF+/, "").trim();
  if (cleaned.length === 0) return { ...UNKNOWN_EVENT };
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ...UNKNOWN_EVENT };
  }
  return normalize(parsed);
}
