/**
 * run-cell — execute ONE measurement cell (task × arm × rep) via `claude -p`.
 *
 * Design §4 per-cell command, verbatim knobs:
 *   --output-format json · --model claude-opus-4-8 (pinned) · --max-budget-usd 3
 *   --permission-mode bypassPermissions · --add-dir <sandbox> · NO --bare · NO
 *   --max-turns (does not exist on v2.1.201). Arm B additionally passes
 *   --mcp-config <sandbox>/.mcp.json and the +3 ctx tools in --allowed-tools.
 *
 * Auth / isolation (A7 / goal §Scope 2) — two modes:
 *   --config-mode isolated (default): CLAUDE_CONFIG_DIR points at a per-run dir so
 *     the real ~/.claude is never written. It has NO login state, so it needs a
 *     token: set CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) or
 *     ANTHROPIC_API_KEY in the environment. (A custom config dir does NOT inherit
 *     the macOS-keychain login — verified — so a token is the clean, portable
 *     headless-auth path; extracting the keychain credential is out of scope.)
 *   --config-mode real: use the host's normal config/keychain auth. The instrument
 *     then writes ITS OWN session transcript under ~/.claude/projects/<sandbox-slug>
 *     + appends ~/.claude/history.jsonl. That is a documented deviation from A7's
 *     literal "untouched"; the caller verifies config/settings/memory/existing
 *     projects are unchanged and removes the instrument's own transcript.
 *
 * Each rep runs in a FRESH scratch copy of the arm repo (claude mutates the tree;
 * reps stay independent; the canonical armX/repo — and the frozen ctx store it
 * anchors — is reused read-only). Arm-order interleaving is the caller's job (§4/§7).
 *
 * Usage:
 *   tsx run-cell.ts --taskdir <dir> --arm <A|B> --rep <n> --out <runsdir>
 *       [--model claude-opus-4-8] [--budget 3]
 *       [--config-mode isolated|real] [--config-dir <dir>]
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ensureDir,
  PER_CELL_BUDGET_USD,
  PINNED_MODEL,
  type Protocol,
  readJson,
  run,
  withPreamble,
  writeJson,
} from "./lib.ts";

interface CellEnv {
  arm: "A" | "B";
  repo: string; // canonical armX/repo
  allowedTools: string;
  mcpConfig: string | null;
  prompt: string;
  accept_cmd: string;
  smoke: boolean;
}

/** Parsed metrics row (M1–M6, design §2). */
export interface CellRow {
  task: string;
  repo: string; // testbed repo name (from meta)
  arm: "A" | "B";
  rep: number;
  model: string; // pinned model this cell ran on (same across both arms of a task)
  // M1
  m1_uncached: number; // usage.input_tokens (primary)
  m1_total_input: number; // cache_read + cache_creation + input_tokens (audit + anti-gaming)
  cache_read: number;
  cache_creation: number;
  output_tokens: number;
  // M3 / M4 / M6
  duration_ms: number;
  duration_api_ms: number;
  turns: number;
  cost_usd: number;
  // M5 diagnostics + status
  is_error: boolean;
  stop_reason: string | null;
  permission_denials: number;
  // ---- adoption columns (V2 §1c / §4.3) — recovered from the session transcript ----
  protocol: Protocol; // preamble condition this cell ran under
  session_id: string | null; // from the result JSON; keys the transcript jsonl
  ctx_calls: number; // all mcp__ctx__* tool_use blocks
  ctx_context_calls: number;
  ctx_search_calls: number;
  ctx_remember_calls: number;
  ctx_errors: number; // ctx tool_results with is_error (product errors incl. detach)
  read_calls: number;
  grep_calls: number;
  glob_calls: number;
  edit_calls: number; // Edit/Write/MultiEdit/NotebookEdit
  bash_calls: number;
  first_ctx_event: number | null; // 1-based tool_use index of the first ctx call
  first_edit_event: number | null;
  first_command_event: number | null;
  ctx_before_first_edit: boolean | null; // PRIMARY adoption flag (§1c) — null if no ctx call
  ctx_before_first_command: boolean | null; // secondary
  mcp_attached: boolean | null; // did the ctx server actually attach? null = indeterminate
  transcript_found: boolean;
  // graded later by grade-cell (kept separate from is_error — §2 M2)
  pass: boolean | null;
  void_reason?: string;
  raw_path: string;
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

/** Seed an isolated CLAUDE_CONFIG_DIR. Auth comes from a token env var (see header);
 *  if a plain credentials FILE exists on the host we copy it (non-keychain installs). */
function seedConfigDir(dir: string): void {
  ensureDir(dir);
  const cred = join(homedir(), ".claude", ".credentials.json");
  const dst = join(dir, ".credentials.json");
  if (existsSync(cred) && !existsSync(dst)) cpSync(cred, dst);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function parseResult(stdout: string): {
  ok: boolean;
  usage: Record<string, number>;
  turns: number;
  duration_ms: number;
  duration_api_ms: number;
  cost_usd: number;
  is_error: boolean;
  stop_reason: string | null;
  permission_denials: number;
  session_id: string | null;
} | null {
  // --output-format json prints a single JSON object (may be preceded by warnings
  // on stderr — we only read stdout). Be lenient: find the last JSON object.
  const trimmed = stdout.trim();
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.lastIndexOf("\n{");
    if (start >= 0) {
      try {
        obj = JSON.parse(trimmed.slice(start + 1)) as Record<string, unknown>;
      } catch {
        obj = null;
      }
    }
  }
  if (!obj) return null;
  const usage = (obj.usage ?? {}) as Record<string, unknown>;
  const denials = Array.isArray(obj.permission_denials)
    ? obj.permission_denials.length
    : num(obj.permission_denials);
  return {
    ok: true,
    usage: {
      input_tokens: num(usage.input_tokens),
      cache_read_input_tokens: num(usage.cache_read_input_tokens),
      cache_creation_input_tokens: num(usage.cache_creation_input_tokens),
      output_tokens: num(usage.output_tokens),
    },
    turns: num(obj.num_turns),
    duration_ms: num(obj.duration_ms),
    duration_api_ms: num(obj.duration_api_ms),
    cost_usd: num(obj.total_cost_usd),
    is_error: obj.is_error === true,
    stop_reason: (obj.stop_reason as string) ?? null,
    permission_denials: denials,
    session_id: typeof obj.session_id === "string" ? obj.session_id : null,
  };
}

// ---------------------------------------------------------------------------
// Adoption extraction (V2 §1c / §4.3)
// ---------------------------------------------------------------------------
//
// EXTRACTION PATH (verified-against-tool, logged in implementation-notes): the
// authoritative M1–M6 result is read from `--output-format json` (unchanged, fully
// verified). Adoption is recovered POST-RUN from the session transcript jsonl that
// `claude -p` writes under the (isolated) CLAUDE_CONFIG_DIR / (real) ~/.claude —
// keyed by the result's `session_id`. A type-scan of real sonnet transcripts
// confirmed: assistant messages carry `message.content[]` with `tool_use` blocks
// (name = "mcp__ctx__context" | "Read" | "Grep" | "Edit" | "Bash" | …) in order,
// and user messages carry matching `tool_result` blocks (`tool_use_id`, `is_error`).
// The transcript has NO system/init event, so the ctx MCP handshake is NOT directly
// visible; `mcp_attached` is inferred from ctx tool activity (see below).

interface Adoption {
  ctx_calls: number;
  ctx_context_calls: number;
  ctx_search_calls: number;
  ctx_remember_calls: number;
  ctx_errors: number;
  read_calls: number;
  grep_calls: number;
  glob_calls: number;
  edit_calls: number;
  bash_calls: number;
  first_ctx_event: number | null;
  first_edit_event: number | null;
  first_command_event: number | null;
  ctx_before_first_edit: boolean | null;
  ctx_before_first_command: boolean | null;
  mcp_attached: boolean | null;
  transcript_found: boolean;
}

const EMPTY_ADOPTION: Adoption = {
  ctx_calls: 0,
  ctx_context_calls: 0,
  ctx_search_calls: 0,
  ctx_remember_calls: 0,
  ctx_errors: 0,
  read_calls: 0,
  grep_calls: 0,
  glob_calls: 0,
  edit_calls: 0,
  bash_calls: 0,
  first_ctx_event: null,
  first_edit_event: null,
  first_command_event: null,
  ctx_before_first_edit: null,
  ctx_before_first_command: null,
  mcp_attached: null,
  transcript_found: false,
};

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// A tool_result error text that means the ctx server never attached (vs a normal
// product-level guidance error, which still proves the server responded).
const MCP_DETACH_RE =
  /no such tool|not connected|tool .* (?:not found|is not available|unavailable)|failed to connect|mcp server .* (?:not|failed)|unknown tool/i;

/** Find `<projectsRoot>/<anySlug>/<sessionId>.jsonl` (one level deep). */
function locateTranscript(projectsRoot: string, sessionId: string): string | null {
  if (!existsSync(projectsRoot)) return null;
  const target = `${sessionId}.jsonl`;
  for (const slug of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    const p = join(projectsRoot, slug.name, target);
    if (existsSync(p)) return p;
  }
  return null;
}

function ctxSuffix(name: string): "context" | "search" | "remember" | null {
  if (name === "mcp__ctx__context") return "context";
  if (name === "mcp__ctx__search") return "search";
  if (name === "mcp__ctx__remember") return "remember";
  return null;
}

export function extractAdoption(projectsRoot: string, sessionId: string | null): Adoption {
  if (!sessionId) return { ...EMPTY_ADOPTION };
  const path = locateTranscript(projectsRoot, sessionId);
  if (!path) return { ...EMPTY_ADOPTION };
  const a: Adoption = { ...EMPTY_ADOPTION, transcript_found: true };
  const ctxUseIds = new Set<string>();
  let ctxDetach = false;
  let toolIndex = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (t.length === 0) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(t) as Record<string, unknown>;
    } catch {
      continue;
    }
    const msg = o.message as { content?: unknown } | undefined;
    if (!msg || !Array.isArray(msg.content)) continue;
    if (o.type === "assistant") {
      for (const b of msg.content as Record<string, unknown>[]) {
        if (b.type !== "tool_use") continue;
        toolIndex += 1;
        const name = typeof b.name === "string" ? b.name : "";
        const suffix = ctxSuffix(name);
        if (suffix) {
          a.ctx_calls += 1;
          if (suffix === "context") a.ctx_context_calls += 1;
          else if (suffix === "search") a.ctx_search_calls += 1;
          else a.ctx_remember_calls += 1;
          if (a.first_ctx_event === null) a.first_ctx_event = toolIndex;
          if (typeof b.id === "string") ctxUseIds.add(b.id);
        } else if (name === "Read") a.read_calls += 1;
        else if (name === "Grep") a.grep_calls += 1;
        else if (name === "Glob") a.glob_calls += 1;
        else if (EDIT_TOOLS.has(name)) {
          a.edit_calls += 1;
          if (a.first_edit_event === null) a.first_edit_event = toolIndex;
        } else if (name === "Bash") {
          a.bash_calls += 1;
          if (a.first_command_event === null) a.first_command_event = toolIndex;
        }
      }
    } else if (o.type === "user") {
      for (const b of msg.content as Record<string, unknown>[]) {
        if (b.type !== "tool_result") continue;
        const id = typeof b.tool_use_id === "string" ? b.tool_use_id : "";
        if (!ctxUseIds.has(id)) continue;
        if (b.is_error === true) {
          a.ctx_errors += 1;
          const text =
            typeof b.content === "string"
              ? b.content
              : Array.isArray(b.content)
                ? (b.content as Record<string, unknown>[])
                    .map((c) => (typeof c.text === "string" ? c.text : ""))
                    .join(" ")
                : "";
          if (MCP_DETACH_RE.test(text)) ctxDetach = true;
        }
      }
    }
  }
  a.ctx_before_first_edit =
    a.first_ctx_event === null
      ? null
      : a.first_edit_event === null || a.first_ctx_event < a.first_edit_event;
  a.ctx_before_first_command =
    a.first_ctx_event === null
      ? null
      : a.first_command_event === null || a.first_ctx_event < a.first_command_event;
  // MCP-attach inference (§1c). A detach error → not attached. Any ctx call that got
  // a real response (even a product-level error) proves the server was there → attached.
  // No ctx call at all → indeterminate (the transcript carries no init handshake).
  a.mcp_attached = ctxDetach ? false : a.ctx_calls > 0 ? true : null;
  return a;
}

function main(): number {
  const f = flags(process.argv.slice(2));
  for (const r of ["taskdir", "arm", "rep", "out"])
    if (!f[r]) {
      console.error(`missing --${r}`);
      return 2;
    }
  const taskdir = f.taskdir as string;
  const arm = f.arm as "A" | "B";
  const rep = Number(f.rep);
  // Absolutize: claude runs with cwd = scratchRepo, so --add-dir / --mcp-config and
  // the cell paths MUST be absolute or the child re-anchors them against its cwd.
  const runsDir = resolve(f.out as string);
  const model = f.model ?? PINNED_MODEL;
  const budget = f.budget ? Number(f.budget) : PER_CELL_BUDGET_USD;
  const protocol = (f.protocol ?? "none") as Protocol;
  if (!["none", "optional", "forced"].includes(protocol)) {
    console.error(`invalid --protocol ${protocol} (none|optional|forced)`);
    return 2;
  }

  const meta = readJson<{ task: string; repo: string }>(join(taskdir, "meta.json"));
  const env = readJson<CellEnv>(join(taskdir, `cell${arm}.env.json`));
  const repoName = meta.repo.split("/").pop() ?? meta.repo;

  // Fresh scratch copy for this rep (claude mutates it; grade-cell reads it after).
  const cellDir = join(runsDir, `${meta.task}.${arm}.${rep}`);
  if (existsSync(cellDir)) rmSync(cellDir, { recursive: true, force: true });
  mkdirSync(cellDir, { recursive: true });
  const scratchRepo = join(cellDir, "repo");
  cpSync(env.repo, scratchRepo, { recursive: true });

  const configMode = f["config-mode"] ?? "isolated";
  let configDir: string | null = null;
  if (configMode === "isolated") {
    configDir = f["config-dir"] ?? join(cellDir, ".claude-config");
    seedConfigDir(configDir);
  } // 'real' → leave CLAUDE_CONFIG_DIR unset (host auth; A7 caveat — see header)

  // Apply the frozen protocol preamble (§1/§1c): forced→arm B gets FORCED, arm A the
  // matched PLACEBO; none/optional→raw prompt. Byte-identical checkout otherwise.
  const promptForCell = withPreamble(protocol, arm, env.prompt);

  const args = [
    "-p",
    promptForCell,
    "--output-format",
    "json",
    "--model",
    model,
    "--max-budget-usd",
    String(budget),
    "--permission-mode",
    "bypassPermissions",
    "--add-dir",
    scratchRepo,
    "--allowed-tools",
    env.allowedTools,
  ];
  if (arm === "B" && env.mcpConfig) {
    // Point --mcp-config at the scratch copy's .mcp.json (absolute internals → the
    // frozen store still resolves). The canonical config would work too; the copy
    // travels with the tree so a moved cellDir stays self-consistent.
    args.push("--mcp-config", join(scratchRepo, ".mcp.json"));
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  if (configDir) childEnv.CLAUDE_CONFIG_DIR = configDir;
  const started = Date.now();
  const res = run("claude", args, { cwd: scratchRepo, env: childEnv, timeout: 900_000 });
  const wall = Date.now() - started;

  const rawPath = join(cellDir, `run.${meta.task}.${arm}.${rep}.json`);
  writeJson(rawPath, {
    exit: res.code,
    stdout: res.stdout,
    stderr: res.stderr,
    wall_ms: wall,
    args,
  });

  const parsed = parseResult(res.stdout);
  const row: CellRow = {
    task: meta.task,
    repo: repoName,
    arm,
    rep,
    model,
    m1_uncached: 0,
    m1_total_input: 0,
    cache_read: 0,
    cache_creation: 0,
    output_tokens: 0,
    duration_ms: 0,
    duration_api_ms: 0,
    turns: 0,
    cost_usd: 0,
    is_error: false,
    stop_reason: null,
    permission_denials: 0,
    protocol,
    session_id: null,
    ...EMPTY_ADOPTION,
    pass: null,
    raw_path: rawPath,
  };
  if (!parsed) {
    row.void_reason =
      res.code !== 0 ? `claude exit ${res.code} / unparseable json` : "unparseable json";
    row.is_error = true;
  } else {
    const u = parsed.usage;
    row.m1_uncached = u.input_tokens as number;
    row.cache_read = u.cache_read_input_tokens as number;
    row.cache_creation = u.cache_creation_input_tokens as number;
    row.output_tokens = u.output_tokens as number;
    row.m1_total_input = row.m1_uncached + row.cache_read + row.cache_creation;
    row.duration_ms = parsed.duration_ms;
    row.duration_api_ms = parsed.duration_api_ms;
    row.turns = parsed.turns;
    row.cost_usd = parsed.cost_usd;
    row.is_error = parsed.is_error;
    row.stop_reason = parsed.stop_reason;
    row.permission_denials = parsed.permission_denials;
    row.session_id = parsed.session_id;
    // Budget-cap / transport aborts are VOID (non-task reasons — §7), not a saving.
    if (parsed.stop_reason === "budget" || (parsed.is_error && row.m1_uncached === 0)) {
      row.void_reason = `is_error/stop_reason=${parsed.stop_reason}`;
    }
  }

  // Adoption recovery (§1c / §4.3): read the session transcript for ctx usage.
  // Projects root: isolated → <configDir>/projects; real → ~/.claude/projects.
  const projectsRoot = configDir
    ? join(configDir, "projects")
    : join(homedir(), ".claude", "projects");
  const adoption = extractAdoption(projectsRoot, row.session_id);
  Object.assign(row, adoption);

  // MCP-connection assertion (§1c): a treatment cell (arm B, or any non-`none`
  // protocol) whose ctx server SILENTLY FAILED to attach is infra-void, not a
  // "0 adoption" data point. We can only assert this positively on a detach signal
  // (an mcp__ctx__* call that errored "not connected"); a cell that never called ctx
  // is indeterminate (mcp_attached=null) and is NOT voided here — see notes.
  const isTreatment = arm === "B" || protocol !== "none";
  if (!row.void_reason && isTreatment && row.mcp_attached === false) {
    row.void_reason = "mcp not attached";
    row.is_error = true;
  }

  writeJson(join(cellDir, "row.json"), row);
  console.log(
    `cell ${meta.task} arm ${arm} rep ${rep} [${protocol}]: exit=${res.code} ` +
      `M1_uncached=${row.m1_uncached} total=${row.m1_total_input} turns=${row.turns} ` +
      `cost=$${row.cost_usd.toFixed(4)} is_error=${row.is_error} ` +
      `ctx=${row.ctx_calls}(ctx<edit=${row.ctx_before_first_edit}) mcp=${row.mcp_attached}` +
      (row.void_reason ? ` VOID(${row.void_reason})` : ""),
  );
  return 0;
}

// Only run when invoked directly (so extractAdoption can be imported for tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
