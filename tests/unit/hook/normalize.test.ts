import { describe, expect, test } from "vitest";

import {
  classifyTool,
  isShellExecution,
  normalize,
  normalizeStdin,
  type ToolCategory,
} from "../../../src/hook/normalize.js";

// Build a Copilot CLI (camelCase) payload. `toolArgs` is a JSON string per dialect.
function cli(opts: {
  event?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event: opts.event ?? "preToolUse",
    toolName: opts.toolName ?? "bash",
    toolArgs: JSON.stringify(opts.args ?? {}),
    ...opts.extra,
  };
  if (opts.result !== undefined) payload.toolResult = opts.result;
  return payload;
}

// Build a VS Code (snake_case) payload. `tool_input` is already an object.
function vscode(opts: {
  event?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    hook_event_name: opts.event ?? "PreToolUse",
    tool_name: opts.toolName ?? "run_in_terminal",
    tool_input: opts.input ?? {},
    ...opts.extra,
  };
  if (opts.result !== undefined) payload.tool_response = opts.result;
  return payload;
}

describe("classifyTool — canonical category (CONTEXT.md)", () => {
  const cases: Array<[string, ToolCategory]> = [
    ["bash", "execute_adjacent"],
    ["run_in_terminal", "execute_adjacent"],
    ["powershell", "execute_adjacent"],
    ["read_file", "read"],
    ["view", "read"],
    ["grep_search", "search"],
    ["rg", "search"],
    ["list_dir", "list"],
    ["file_search", "list"],
    ["glob", "list"],
    ["apply_patch", "edit"],
    ["replace_string_in_file", "edit"],
    ["fetch_webpage", "web"],
    ["run_task", "agent-orchestration"],
    ["manage_todo_list", "agent-orchestration"],
    ["get_errors", "metadata"],
    ["totally_unknown_tool", "other"],
  ];
  for (const [name, expected] of cases) {
    test(`${name} → ${expected}`, () => {
      expect(classifyTool(name)).toBe(expected);
    });
  }

  test("is case-insensitive and matches camelCase tool names", () => {
    expect(classifyTool("ReadFile")).toBe("read");
    expect(classifyTool("runInTerminal")).toBe("execute_adjacent");
  });

  test("heuristic: unseen *_terminal tool → execute_adjacent", () => {
    expect(classifyTool("vendor_run_in_terminal_v2")).toBe("execute_adjacent");
  });

  test("empty name → other", () => {
    expect(classifyTool("")).toBe("other");
  });
});

describe("normalize — both dialects, each category", () => {
  test("CLI shell execution extracts command + flags as shell execution", () => {
    const ev = normalize(cli({ toolName: "bash", args: { command: "git status" } }));
    expect(ev.dialect).toBe("cli");
    expect(ev.event).toBe("preToolUse");
    expect(ev.category).toBe("execute_adjacent");
    expect(ev.command).toBe("git status");
    expect(isShellExecution(ev)).toBe(true);
  });

  test("VS Code run_in_terminal extracts command", () => {
    const ev = normalize(
      vscode({ toolName: "run_in_terminal", input: { command: "npm test", isBackground: false } }),
    );
    expect(ev.dialect).toBe("vscode");
    expect(ev.category).toBe("execute_adjacent");
    expect(ev.command).toBe("npm test");
    expect(isShellExecution(ev)).toBe(true);
  });

  test("CLI direct read parses toolArgs JSON string into toolInput", () => {
    const ev = normalize(cli({ toolName: "read_file", args: { filePath: "src/cli.ts" } }));
    expect(ev.category).toBe("read");
    expect(ev.toolInput.filePath).toBe("src/cli.ts");
    expect(ev.command).toBeUndefined();
    expect(isShellExecution(ev)).toBe(false);
  });

  test("VS Code direct search keeps structured input, no command", () => {
    const ev = normalize(vscode({ toolName: "grep_search", input: { query: "TODO" } }));
    expect(ev.category).toBe("search");
    expect(ev.toolInput.query).toBe("TODO");
    expect(ev.command).toBeUndefined();
  });

  test("direct list (file_search) classifies as list, not search", () => {
    expect(
      normalize(vscode({ toolName: "file_search", input: { query: "**/*.ts" } })).category,
    ).toBe("list");
  });

  test("direct web fetch", () => {
    expect(
      normalize(cli({ toolName: "fetch_webpage", args: { urls: ["https://x"] } })).category,
    ).toBe("web");
  });

  test("edit/mutation never carries a command", () => {
    const ev = normalize(vscode({ toolName: "apply_patch", input: { patch: "..." } }));
    expect(ev.category).toBe("edit");
    expect(ev.command).toBeUndefined();
  });

  test("posttool carries the result through untouched (both dialects)", () => {
    const cliEv = normalize(cli({ event: "postToolUse", toolName: "bash", result: "OUT" }));
    expect(cliEv.event).toBe("postToolUse");
    expect(cliEv.toolResult).toBe("OUT");

    const vsEv = normalize(
      vscode({ event: "PostToolUse", toolName: "read_file", result: { content: "x" } }),
    );
    expect(vsEv.event).toBe("postToolUse");
    expect(vsEv.toolResult).toEqual({ content: "x" });
  });

  test("extracts cwd, session, and model when present", () => {
    const ev = normalize(
      cli({
        toolName: "bash",
        args: { command: "ls" },
        extra: { cwd: "/repo", sessionId: "sess-1", model: "claude-opus-4-8" },
      }),
    );
    expect(ev.cwd).toBe("/repo");
    expect(ev.session).toBe("sess-1");
    expect(ev.model).toBe("claude-opus-4-8");
  });

  test("model probed from nested context; absent → undefined (no guess)", () => {
    const withCtx = normalize(
      cli({ toolName: "bash", args: {}, extra: { context: { model: "m" } } }),
    );
    expect(withCtx.model).toBe("m");
    const without = normalize(cli({ toolName: "bash", args: {} }));
    expect(without.model).toBeUndefined();
  });

  test("userPromptSubmitted exposes prompt text", () => {
    const ev = normalize({ event: "userPromptSubmitted", prompt: "implement feature X" });
    expect(ev.event).toBe("userPromptSubmitted");
    expect(ev.prompt).toBe("implement feature X");
  });

  test("unrecognized event name normalizes to unknown", () => {
    expect(normalize(cli({ event: "somethingElse", toolName: "bash" })).event).toBe("unknown");
  });
});

describe("fail-open (DESIGN §3.6)", () => {
  test("non-object payload → unknown/other event", () => {
    const ev = normalize(42 as unknown);
    expect(ev.event).toBe("unknown");
    expect(ev.category).toBe("other");
    expect(ev.dialect).toBe("unknown");
    expect(isShellExecution(ev)).toBe(false);
  });

  test("null payload → unknown event", () => {
    expect(normalize(null).event).toBe("unknown");
  });

  test("malformed toolArgs JSON → empty toolInput, no throw", () => {
    const ev = normalize({ event: "preToolUse", toolName: "bash", toolArgs: "{not json" });
    expect(ev.toolInput).toEqual({});
    expect(ev.command).toBeUndefined();
  });

  test("normalizeStdin: empty string → unknown event", () => {
    expect(normalizeStdin("").event).toBe("unknown");
    expect(normalizeStdin("   ").event).toBe("unknown");
  });

  test("normalizeStdin: invalid JSON → unknown event, no throw", () => {
    expect(normalizeStdin("}{").event).toBe("unknown");
  });

  test("normalizeStdin: valid CLI payload round-trips", () => {
    const raw = JSON.stringify(cli({ toolName: "bash", args: { command: "git diff" } }));
    const ev = normalizeStdin(raw);
    expect(ev.category).toBe("execute_adjacent");
    expect(ev.command).toBe("git diff");
  });

  // Windows hosts prepend 1–2 UTF-8 BOMs to hook stdin (confirmed for Cursor;
  // same risk for VS Code / Copilot CLI on Windows). Without stripping them,
  // JSON.parse throws → fail-open → the rewrite silently never happens. The
  // payload must still parse and the command must still be extracted.
  test("normalizeStdin: strips a leading UTF-8 BOM before parse", () => {
    const raw = JSON.stringify(cli({ toolName: "bash", args: { command: "git status" } }));
    const ev = normalizeStdin(`\uFEFF${raw}`);
    expect(ev.event).toBe("preToolUse");
    expect(ev.command).toBe("git status");
  });

  test("normalizeStdin: strips a double UTF-8 BOM (Windows Cursor 3.2.x shape)", () => {
    const raw = JSON.stringify(cli({ toolName: "bash", args: { command: "git status" } }));
    const ev = normalizeStdin(`\uFEFF\uFEFF${raw}`);
    expect(ev.command).toBe("git status");
  });

  test("missing tool name → other category, empty toolName", () => {
    const ev = normalize({ event: "preToolUse" });
    expect(ev.toolName).toBe("");
    expect(ev.category).toBe("other");
  });
});
