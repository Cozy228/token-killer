/**
 * run-grid — thin orchestration for the R1 afternoon grid.
 *
 * This script intentionally adds no measurement logic. It only wires the existing
 * tools together:
 *   bank row -> make-sandbox -> run-cell -> grade-cell -> runs.jsonl -> analyze
 *
 * Defaults to dry-run. Use --execute to spend money. Draft banks require
 * --allow-draft so a maintainer has to consciously approve running them.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ensureDir,
  readJson,
  readJsonl,
  run,
  TSX_LOADER,
  WORKSPACE,
  writeJson,
  writeJsonl,
} from "./lib.ts";

type Arm = "A" | "B";

interface TaskBankRow {
  task: string;
  repo: string;
  sha: string;
  at: string;
  prompt: string;
  accept_cmd: string;
  draft?: boolean;
  memory_mode?: "empty" | "asof";
}

interface Flags {
  bank: string;
  out: string;
  reps: number;
  configMode: "isolated" | "real";
  model: string; // pinned model — used for BOTH arms (Q4: only ctx presence varies)
  protocol: "none" | "optional" | "forced"; // E2 uses forced (B=forced, A=placebo)
  execute: boolean;
  allowDraft: boolean;
  resume: boolean;
}

interface Step {
  task: string;
  arm: Arm;
  rep: number;
}

function parseFlags(argv: string[]): Flags {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    raw[key] = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
  }
  const configMode = (raw["config-mode"] ?? "isolated") as Flags["configMode"];
  if (configMode !== "isolated" && configMode !== "real") {
    throw new Error("--config-mode must be isolated or real");
  }
  const protocol = (raw.protocol ?? "none") as Flags["protocol"];
  if (!["none", "optional", "forced"].includes(protocol)) {
    throw new Error("--protocol must be none, optional, or forced");
  }
  return {
    bank: resolve(raw.bank ?? join(WORKSPACE, "tools", "measurement", "task-bank-draft.jsonl")),
    out: resolve(raw.out ?? join(WORKSPACE, "tools", "measurement", ".work", "grid")),
    reps: raw.reps ? Number(raw.reps) : 3,
    configMode,
    model: raw.model ?? "claude-opus-4-8", // design §4 default; both arms share it
    // E2 (§1): pass --protocol forced so arm B gets the FORCED preamble and arm A the
    // matched PLACEBO. Default `none` keeps the raw-prompt A/B (backward compatible).
    protocol,
    execute: raw.execute === "true",
    allowDraft: raw["allow-draft"] === "true",
    resume: raw.resume === "true",
  };
}

function validateBank(rows: TaskBankRow[], flags: Flags): void {
  if (rows.length === 0) throw new Error(`bank has no tasks: ${flags.bank}`);
  if (!Number.isInteger(flags.reps) || flags.reps < 1)
    throw new Error("--reps must be a positive integer");
  const seen = new Set<string>();
  for (const r of rows) {
    for (const key of ["task", "repo", "sha", "at", "prompt", "accept_cmd"] as const) {
      if (typeof r[key] !== "string" || r[key].trim().length === 0) {
        throw new Error(`task ${r.task ?? "<unknown>"} missing ${key}`);
      }
    }
    if (seen.has(r.task)) throw new Error(`duplicate task id: ${r.task}`);
    seen.add(r.task);
    if (!existsSync(r.repo)) throw new Error(`repo does not exist for ${r.task}: ${r.repo}`);
    if (r.draft === true && !flags.allowDraft) {
      throw new Error(
        `bank contains draft task ${r.task}; pass --allow-draft after maintainer review`,
      );
    }
  }
}

function nodeScript(
  script: string,
  args: string[],
): { code: number; stdout: string; stderr: string } {
  return run(
    "node",
    ["--import", `file://${TSX_LOADER}`, join(WORKSPACE, "tools", "measurement", script), ...args],
    {
      cwd: WORKSPACE,
      timeout: 1_200_000,
    },
  );
}

function mustRun(label: string, script: string, args: string[]): void {
  console.log(`\n# ${label}`);
  const r = nodeScript(script, args);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  if (r.code !== 0) throw new Error(`${label} failed with exit ${r.code}`);
}

/** Safeguard 1: reject a corrupted auth token BEFORE spending. A real token is a
 *  single printable-ASCII string; whitespace / escape codes / the setup-token
 *  banner mean the value was captured from an interactive TUI (the classic
 *  `export …=$(claude setup-token)` mistake), not a clean token. */
function assertUsableAuth(): void {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? "";
  if (token.length === 0) {
    throw new Error(
      "isolated mode requires CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in the environment",
    );
  }
  if (/[\s\x00-\x1f\x7f]/.test(token) || /welcome to claude/i.test(token)) {
    throw new Error(
      "auth token looks corrupted (contains whitespace / escape codes / banner text).\n" +
        "`claude setup-token` is INTERACTIVE and does not print a clean token to stdout — " +
        "do NOT use `export …=$(claude setup-token)`.\n" +
        "Fix: run `claude setup-token` in a terminal, copy the token it displays, then\n" +
        "  export CLAUDE_CODE_OAUTH_TOKEN=<paste>\n" +
        "and re-run (verify with `echo` that it has no `[?2004h`-style codes).",
    );
  }
  if (token.length < 20) {
    throw new Error(
      `auth token is implausibly short (${token.length} chars) — check it was pasted in full`,
    );
  }
}

/** Safeguard 2: detect a SYSTEMIC failure in a just-run cell so the grid aborts
 *  instead of burning the remaining cells (all would fail identically). Two kinds,
 *  both account-global: `auth` (bad/expired token) and `limit` (session/usage/rate
 *  cap — resume after it resets). */
const AUTH_ERR_RE =
  /not logged in|invalid value: 'Bearer|API Error: Header|invalid api key|authentication_error|\b401\b|please run \/login/i;
const LIMIT_ERR_RE = /session limit|usage limit|rate limit|\b429\b|quota|overloaded|resets \d/i;
function cellFatalError(
  out: string,
  task: string,
  arm: Arm,
  rep: number,
): { kind: "auth" | "limit"; msg: string } | null {
  const raw = join(out, "runs", `${task}.${arm}.${rep}`, `run.${task}.${arm}.${rep}.json`);
  if (!existsSync(raw)) return null;
  try {
    const stdout = readJson<{ stdout?: string }>(raw).stdout ?? "";
    let msg = stdout;
    try {
      msg = String((JSON.parse(stdout.trim()) as { result?: unknown }).result ?? stdout);
    } catch {
      /* not JSON — scan the raw text */
    }
    const short = msg.replace(/\s+/g, " ").slice(0, 200);
    if (LIMIT_ERR_RE.test(msg)) return { kind: "limit", msg: short };
    if (AUTH_ERR_RE.test(msg)) return { kind: "auth", msg: short };
    return null;
  } catch {
    return null;
  }
}

function taskDir(out: string, task: string): string {
  return join(out, "tasks", task);
}

function rowPath(out: string, task: string, arm: Arm, rep: number): string {
  return join(out, "runs", `${task}.${arm}.${rep}`, "row.json");
}

/** A cell is "done" (skippable on --resume) if it produced a real graded result, OR
 *  it ran cleanly but is ungradable for a NON-transient reason (e.g. missing
 *  accept_cmd — re-running the paid call won't help). A SYSTEMIC void (is_error /
 *  session-limit / transport) is NOT done — --resume re-runs it once the cause lifts.
 *  (The old rule skipped every void, so a limit-killed grid could never be finished.) */
function isDone(path: string): boolean {
  if (!existsSync(path)) return false;
  const row = readJson<{ pass?: boolean | null; is_error?: boolean; void_reason?: string }>(path);
  if (row.pass === true || row.pass === false) return true;
  return row.is_error === false && row.void_reason !== undefined;
}

function buildOrder(rows: TaskBankRow[], reps: number): Step[] {
  const steps: Step[] = [];
  for (const [taskIndex, row] of rows.entries()) {
    for (let rep = 0; rep < reps; rep++) {
      const order: Arm[] = (taskIndex + rep) % 2 === 0 ? ["A", "B"] : ["B", "A"];
      for (const arm of order) steps.push({ task: row.task, arm, rep });
    }
  }
  return steps;
}

function collectRows(dir: string): unknown[] {
  const out: unknown[] = [];
  const walk = (p: string): void => {
    if (!existsSync(p)) return;
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const child = join(p, e.name);
      if (e.isDirectory()) walk(child);
      else if (e.isFile() && e.name === "row.json")
        out.push(JSON.parse(readFileSync(child, "utf8")));
    }
  };
  walk(dir);
  return out;
}

function printPlan(rows: TaskBankRow[], flags: Flags, steps: Step[]): void {
  const cells = steps.length;
  console.log(`bank: ${flags.bank}`);
  console.log(`out: ${flags.out}`);
  console.log(`tasks: ${rows.length}`);
  console.log(`reps: ${flags.reps}`);
  console.log(`cells: ${cells} (${rows.length} tasks x ${flags.reps} reps x 2 arms)`);
  console.log(`config-mode: ${flags.configMode}`);
  console.log(`model: ${flags.model} (both arms — only ctx presence varies)`);
  console.log(
    `protocol: ${flags.protocol}` +
      (flags.protocol === "forced" ? " (arm B=forced preamble, arm A=matched placebo — E2)" : ""),
  );
  console.log(
    `max budget exposure: $${cells * 3} (${cells} cells x $3 cap; actual << this on cheaper models)`,
  );
  console.log(`mode: ${flags.execute ? "EXECUTE" : "DRY-RUN"}`);
  console.log("\norder:");
  for (const s of steps) console.log(`  ${s.task} arm ${s.arm} rep ${s.rep}`);
}

function main(): number {
  const flags = parseFlags(process.argv.slice(2));
  const rows = readJsonl<TaskBankRow>(flags.bank);
  validateBank(rows, flags);
  const steps = buildOrder(rows, flags.reps);
  printPlan(rows, flags, steps);
  if (!flags.execute) {
    console.log("\nDry run only. Re-run with --execute to launch cells.");
    return 0;
  }

  if (flags.configMode === "isolated") assertUsableAuth();

  if (!flags.resume && existsSync(flags.out)) rmSync(flags.out, { recursive: true, force: true });
  ensureDir(flags.out);
  mkdirSync(join(flags.out, "tasks"), { recursive: true });
  mkdirSync(join(flags.out, "runs"), { recursive: true });
  writeJson(join(flags.out, "grid-plan.json"), {
    bank: flags.bank,
    reps: flags.reps,
    configMode: flags.configMode,
    model: flags.model,
    protocol: flags.protocol,
    steps,
  });

  const byTask = new Map(rows.map((r) => [r.task, r]));
  for (const row of rows) {
    const dir = taskDir(flags.out, row.task);
    if (flags.resume && existsSync(join(dir, "meta.json"))) {
      console.log(`\n# sandbox ${row.task}: reuse existing (--resume)`);
      continue;
    }
    mustRun(`make-sandbox ${row.task}`, "make-sandbox.ts", [
      "--task",
      row.task,
      "--repo",
      row.repo,
      "--sha",
      row.sha,
      "--at",
      row.at,
      "--prompt",
      row.prompt,
      "--accept-cmd",
      row.accept_cmd,
      "--out",
      dir,
      "--memory-mode",
      row.memory_mode ?? "empty",
    ]);
  }

  for (const step of steps) {
    const row = byTask.get(step.task);
    if (!row) throw new Error(`internal error: missing task ${step.task}`);
    const rp = rowPath(flags.out, step.task, step.arm, step.rep);
    if (flags.resume && isDone(rp)) {
      console.log(
        `\n# cell ${step.task} ${step.arm} ${step.rep}: skip existing graded row (--resume)`,
      );
      continue;
    }
    mustRun(`run-cell ${step.task} ${step.arm} ${step.rep}`, "run-cell.ts", [
      "--taskdir",
      taskDir(flags.out, step.task),
      "--arm",
      step.arm,
      "--rep",
      String(step.rep),
      "--out",
      join(flags.out, "runs"),
      "--config-mode",
      flags.configMode,
      "--model",
      flags.model,
      "--protocol",
      flags.protocol,
    ]);
    // Safeguard 2: systemic errors (auth or account limit) are account-global — if
    // a cell hits one, abort rather than burn the rest (all fail identically, as the
    // 42-VOID auth run and the 34-VOID session-limit run both showed). The failed
    // cells stay re-runnable, so `--resume` picks up where the limit/auth cut off.
    const fatal = cellFatalError(flags.out, step.task, step.arm, step.rep);
    if (fatal) {
      const fix =
        fatal.kind === "limit"
          ? "Account limit hit — wait for it to reset, then re-run with --resume to finish the remaining cells."
          : "Fix login/token, then re-run with --resume.";
      throw new Error(
        `ABORT after cell ${step.task} ${step.arm} ${step.rep}: ${fatal.kind} error — ${fatal.msg}\n` +
          `Every remaining cell would fail the same way. ${fix}`,
      );
    }
    mustRun(`grade-cell ${step.task} ${step.arm} ${step.rep}`, "grade-cell.ts", [
      "--taskdir",
      taskDir(flags.out, step.task),
      "--runsdir",
      join(flags.out, "runs"),
      "--arm",
      step.arm,
      "--rep",
      String(step.rep),
    ]);
  }

  const runRows = collectRows(join(flags.out, "runs"));
  const runsJsonl = join(flags.out, "runs.jsonl");
  writeJsonl(runsJsonl, runRows);
  mustRun("analyze", "analyze.ts", [
    "--runs",
    runsJsonl,
    "--out",
    join(flags.out, "report.json"),
    // Pass the grid-plan so analyze can filter contaminated rows + apply the max-void bar (§2).
    "--grid-plan",
    join(flags.out, "grid-plan.json"),
  ]);
  console.log(`\nDone. Report: ${join(flags.out, "report.json")}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
}
