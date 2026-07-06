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
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ensureDir, PER_CELL_BUDGET_USD, PINNED_MODEL, readJson, run, writeJson } from "./lib.ts";

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
  };
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

  const args = [
    "-p",
    env.prompt,
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
    // Budget-cap / transport aborts are VOID (non-task reasons — §7), not a saving.
    if (parsed.stop_reason === "budget" || (parsed.is_error && row.m1_uncached === 0)) {
      row.void_reason = `is_error/stop_reason=${parsed.stop_reason}`;
    }
  }
  writeJson(join(cellDir, "row.json"), row);
  console.log(
    `cell ${meta.task} arm ${arm} rep ${rep}: exit=${res.code} ` +
      `M1_uncached=${row.m1_uncached} total=${row.m1_total_input} turns=${row.turns} ` +
      `cost=$${row.cost_usd.toFixed(4)} is_error=${row.is_error}` +
      (row.void_reason ? ` VOID(${row.void_reason})` : ""),
  );
  return 0;
}

process.exitCode = main();
