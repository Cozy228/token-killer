/**
 * run-cell-codex-protocol — execute ONE Codex measurement cell for a ctx protocol.
 *
 * Protocols:
 *   none            arm A checkout, no ctx MCP server
 *   optional        arm B checkout, ctx available but not mentioned in the prompt
 *   suggested       ctx available, prompt suggests using it when useful
 *   forced          ctx available, prompt requires one context call before edits
 *   forced-inspect  ctx available, prompt requires context + inspection of returned refs
 *
 * Tool failures are diagnostics, not voids. A run is void only when Codex exits
 * non-zero, usage is missing, or no final agent message is produced.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readJson, run, writeJson } from "./lib.ts";

type Protocol = "none" | "optional" | "suggested" | "forced" | "forced-inspect";

const PROTOCOLS = new Set<Protocol>(["none", "optional", "suggested", "forced", "forced-inspect"]);

interface CellEnv {
  arm: "A" | "B";
  repo: string;
  mcpConfig: string | null;
  prompt: string;
  accept_cmd: string;
}

interface McpConfig {
  mcpServers?: {
    ctx?: {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    };
  };
}

interface ProtocolRow {
  task: string;
  repo: string;
  arm: string;
  source_arm: "A" | "B";
  condition: Protocol;
  protocol: Protocol;
  rep: number;
  model: string;
  m1_uncached: number;
  m1_total_input: number;
  cache_read: number;
  cache_creation: number;
  output_tokens: number;
  duration_ms: number;
  duration_api_ms: number;
  turns: number;
  cost_usd: number;
  is_error: boolean;
  stop_reason: string | null;
  permission_denials: number;
  tool_errors: number;
  ctx_calls: number;
  ctx_context_calls: number;
  ctx_search_calls: number;
  ctx_remember_calls: number;
  ctx_errors: number;
  ctx_first_event: number | null;
  first_command_event: number | null;
  ctx_before_first_command: boolean;
  pass: boolean | null;
  void_reason?: string;
  raw_path: string;
}

interface CodexUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
}

function flags(argv: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--"))
      f[a.slice(2)] =
        argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
  }
  return f;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function tomlString(s: string): string {
  return JSON.stringify(s);
}

function tomlArray(xs: string[]): string {
  return `[${xs.map(tomlString).join(",")}]`;
}

function tomlInlineTable(record: Record<string, string>): string {
  return `{${Object.entries(record)
    .map(([k, v]) => `${k}=${tomlString(v)}`)
    .join(",")}}`;
}

function codexMcpConfigArgs(configPath: string): string[] {
  const config = readJson<McpConfig>(configPath);
  const ctx = config.mcpServers?.ctx;
  if (!ctx?.command) throw new Error(`missing ctx mcp command in ${configPath}`);
  return [
    "-c",
    `mcp_servers.ctx.command=${tomlString(ctx.command)}`,
    "-c",
    `mcp_servers.ctx.args=${tomlArray(ctx.args ?? [])}`,
    "-c",
    `mcp_servers.ctx.env=${tomlInlineTable(ctx.env ?? {})}`,
  ];
}

function promptForProtocol(protocol: Protocol, prompt: string): string {
  if (protocol === "none" || protocol === "optional") return prompt;
  if (protocol === "suggested") {
    return [
      "Context tool policy:",
      "The ctx MCP server may contain relevant prior decisions, file pointers, and tests.",
      "If this task touches project history, design intent, cross-module behavior, or unfamiliar code, consider calling mcp__ctx__context before editing.",
      "If local code search is clearly sufficient, proceed without ctx.",
      "",
      "Task:",
      prompt,
    ].join("\n");
  }
  if (protocol === "forced") {
    return [
      "Context tool policy:",
      "Before any source edit, call mcp__ctx__context exactly once with a concise task description.",
      "Treat ctx as evidence, not authority. Verify relevant file references in the repository before editing.",
      "If ctx is unavailable or irrelevant, say so and continue from local code.",
      "",
      "Task:",
      prompt,
    ].join("\n");
  }
  return [
    "Context tool policy:",
    "Before any source edit, call mcp__ctx__context with a concise task description.",
    "Then inspect 1-3 concrete files or line references returned by ctx using normal repository inspection commands before editing.",
    "Treat ctx as evidence, not authority. If ctx returns no relevant references, say so and proceed from local code.",
    "",
    "Task:",
    prompt,
  ].join("\n");
}

function parseCodexJsonl(stdout: string): {
  usage: CodexUsage | null;
  turns: number;
  finalText: string;
  toolErrors: number;
  ctxCalls: number;
  ctxContextCalls: number;
  ctxSearchCalls: number;
  ctxRememberCalls: number;
  ctxErrors: number;
  ctxFirstEvent: number | null;
  firstCommandEvent: number | null;
  ctxBeforeFirstCommand: boolean;
} {
  let usage: CodexUsage | null = null;
  let turns = 0;
  let finalText = "";
  let toolErrors = 0;
  let eventIndex = 0;
  let ctxFirstEvent: number | null = null;
  let firstCommandEvent: number | null = null;
  const seenCtxIds = new Set<string>();
  const ctxErrorIds = new Set<string>();
  const ctxToolCounts = new Map<string, number>();

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    eventIndex += 1;
    if (obj.type === "turn.completed") {
      turns += 1;
      const u = (obj.usage ?? {}) as Record<string, unknown>;
      usage = {
        input_tokens: num(u.input_tokens),
        cached_input_tokens: num(u.cached_input_tokens),
        output_tokens: num(u.output_tokens),
        reasoning_output_tokens: num(u.reasoning_output_tokens),
      };
    }
    if (obj.type !== "item.started" && obj.type !== "item.completed") continue;
    const item = (obj.item ?? {}) as Record<string, unknown>;
    if (item.type === "agent_message" && typeof item.text === "string") finalText = item.text;
    if (obj.type === "item.completed" && item.status === "failed") toolErrors += 1;
    if (item.type === "command_execution" && firstCommandEvent === null) {
      firstCommandEvent = eventIndex;
    }
    if (item.type !== "mcp_tool_call" || item.server !== "ctx") continue;
    const id = typeof item.id === "string" ? item.id : `ctx-${eventIndex}`;
    if (ctxFirstEvent === null) ctxFirstEvent = eventIndex;
    if (!seenCtxIds.has(id)) {
      seenCtxIds.add(id);
      const tool = typeof item.tool === "string" ? item.tool : "<unknown>";
      ctxToolCounts.set(tool, (ctxToolCounts.get(tool) ?? 0) + 1);
    }
    if (item.status === "failed" || (item.error !== null && item.error !== undefined)) {
      ctxErrorIds.add(id);
    }
  }

  return {
    usage,
    turns,
    finalText,
    toolErrors,
    ctxCalls: seenCtxIds.size,
    ctxContextCalls: ctxToolCounts.get("context") ?? 0,
    ctxSearchCalls: ctxToolCounts.get("search") ?? 0,
    ctxRememberCalls: ctxToolCounts.get("remember") ?? 0,
    ctxErrors: ctxErrorIds.size,
    ctxFirstEvent,
    firstCommandEvent,
    ctxBeforeFirstCommand:
      ctxFirstEvent !== null && (firstCommandEvent === null || ctxFirstEvent < firstCommandEvent),
  };
}

function main(): number {
  const f = flags(process.argv.slice(2));
  for (const r of ["taskdir", "protocol", "rep", "out"])
    if (!f[r]) {
      console.error(`missing --${r}`);
      return 2;
    }

  const protocol = f.protocol as Protocol;
  if (!PROTOCOLS.has(protocol)) {
    console.error(`invalid --protocol ${f.protocol}`);
    return 2;
  }
  const taskdir = f.taskdir as string;
  const sourceArm: "A" | "B" = protocol === "none" ? "A" : "B";
  const rep = Number(f.rep);
  const runsDir = resolve(f.out as string);
  const model = f.model ?? "gpt-5.5";
  const reasoning = f.reasoning ?? "medium";
  const modelLabel = f["model-label"] ?? `${model}-${reasoning}`;

  const meta = readJson<{ task: string; repo: string }>(join(taskdir, "meta.json"));
  const env = readJson<CellEnv>(join(taskdir, `cell${sourceArm}.env.json`));
  const repoName = meta.repo.split("/").pop() ?? meta.repo;

  const cellDir = join(runsDir, `${meta.task}.${protocol}.${rep}`);
  if (existsSync(cellDir)) rmSync(cellDir, { recursive: true, force: true });
  mkdirSync(cellDir, { recursive: true });
  const scratchRepo = join(cellDir, "repo");
  cpSync(env.repo, scratchRepo, { recursive: true });

  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--dangerously-bypass-approvals-and-sandbox",
    "-C",
    scratchRepo,
    "-m",
    model,
    "-c",
    `model_reasoning_effort=${tomlString(reasoning)}`,
  ];
  if (sourceArm === "B" && env.mcpConfig) args.push(...codexMcpConfigArgs(env.mcpConfig));
  args.push(promptForProtocol(protocol, env.prompt));

  const started = Date.now();
  const res = run("codex", args, { cwd: scratchRepo, timeout: 900_000 });
  const wall = Date.now() - started;
  const rawPath = join(cellDir, "raw-output.json");
  const rawOutput = {
    exit: res.code,
    stdout: res.stdout,
    stderr: res.stderr,
    wall_ms: wall,
    args,
    protocol,
    source_arm: sourceArm,
  };
  writeJson(rawPath, rawOutput);
  writeJson(join(cellDir, `run.${meta.task}.${protocol}.${rep}.json`), rawOutput);

  const parsed = parseCodexJsonl(res.stdout);
  const row: ProtocolRow = {
    task: meta.task,
    repo: repoName,
    arm: protocol,
    source_arm: sourceArm,
    condition: protocol,
    protocol,
    rep,
    model: modelLabel,
    m1_uncached: 0,
    m1_total_input: 0,
    cache_read: 0,
    cache_creation: 0,
    output_tokens: 0,
    duration_ms: wall,
    duration_api_ms: 0,
    turns: parsed.turns,
    cost_usd: 0,
    is_error: res.code !== 0,
    stop_reason: null,
    permission_denials: 0,
    tool_errors: parsed.toolErrors,
    ctx_calls: parsed.ctxCalls,
    ctx_context_calls: parsed.ctxContextCalls,
    ctx_search_calls: parsed.ctxSearchCalls,
    ctx_remember_calls: parsed.ctxRememberCalls,
    ctx_errors: parsed.ctxErrors,
    ctx_first_event: parsed.ctxFirstEvent,
    first_command_event: parsed.firstCommandEvent,
    ctx_before_first_command: parsed.ctxBeforeFirstCommand,
    pass: null,
    raw_path: rawPath,
  };

  if (!parsed.usage) {
    row.is_error = true;
    row.void_reason = res.code !== 0 ? `codex exit ${res.code} / no usage` : "codex no usage";
  } else {
    row.cache_read = parsed.usage.cached_input_tokens;
    row.output_tokens = parsed.usage.output_tokens;
    row.m1_total_input = parsed.usage.input_tokens;
    row.m1_uncached = Math.max(0, parsed.usage.input_tokens - parsed.usage.cached_input_tokens);
    if (res.code !== 0 || parsed.finalText.length === 0) {
      row.is_error = true;
      row.void_reason = res.code !== 0 ? `codex exit ${res.code}` : "codex empty final";
    }
  }

  writeFileSync(join(cellDir, "last-message.txt"), parsed.finalText);
  writeJson(join(cellDir, "row.json"), row);
  console.log(
    `cell ${meta.task} protocol ${protocol} rep ${rep}: exit=${res.code} ` +
      `M1_uncached=${row.m1_uncached} total=${row.m1_total_input} turns=${row.turns} ` +
      `ctx=${row.ctx_calls} tool_errors=${row.tool_errors} is_error=${row.is_error}` +
      (row.void_reason ? ` VOID(${row.void_reason})` : ""),
  );
  return 0;
}

process.exitCode = main();
