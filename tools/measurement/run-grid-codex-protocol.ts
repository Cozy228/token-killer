/**
 * run-grid-codex-protocol — Codex ctx protocol/adoption grid.
 *
 * This is a thin orchestrator around make-sandbox, run-cell-codex-protocol,
 * grade-cell, and analyze-codex-protocol. It does not touch Claude runners or
 * existing Claude result directories.
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

type Protocol = "none" | "optional" | "suggested" | "forced" | "forced-inspect";

const DEFAULT_PROTOCOLS: Protocol[] = ["none", "optional", "suggested", "forced", "forced-inspect"];
const VALID_PROTOCOLS = new Set<Protocol>(DEFAULT_PROTOCOLS);

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
  tasks: string[] | null;
  protocols: Protocol[];
  reps: number;
  model: string;
  reasoning: string;
  execute: boolean;
  allowDraft: boolean;
  resume: boolean;
}

interface Step {
  task: string;
  protocol: Protocol;
  rep: number;
}

interface RowSummary {
  pass?: boolean | null;
  void_reason?: string;
  tool_errors?: number;
  ctx_calls?: number;
}

function csv(value: string | undefined): string[] | null {
  if (!value) return null;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFlags(argv: string[]): Flags {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    raw[key] = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
  }
  const protocols = (csv(raw.protocols) ?? DEFAULT_PROTOCOLS) as Protocol[];
  return {
    bank: resolve(raw.bank ?? join(WORKSPACE, "tools", "measurement", "task-bank-draft.jsonl")),
    out: resolve(
      raw.out ?? join(WORKSPACE, "tools", "measurement", ".work", "r2-protocol-codex-gpt55"),
    ),
    tasks: csv(raw.tasks),
    protocols,
    reps: raw.reps ? Number(raw.reps) : 3,
    model: raw.model ?? "gpt-5.5",
    reasoning: raw.reasoning ?? "medium",
    execute: raw.execute === "true",
    allowDraft: raw["allow-draft"] === "true",
    resume: raw.resume === "true",
  };
}

function validateBank(rows: TaskBankRow[], flags: Flags): TaskBankRow[] {
  if (rows.length === 0) throw new Error(`bank has no tasks: ${flags.bank}`);
  if (!Number.isInteger(flags.reps) || flags.reps < 1)
    throw new Error("--reps must be a positive integer");
  if (flags.protocols.length === 0) throw new Error("--protocols must not be empty");
  for (const p of flags.protocols) {
    if (!VALID_PROTOCOLS.has(p)) throw new Error(`invalid protocol: ${p}`);
  }

  let selectedRows = rows;
  if (flags.tasks) {
    const wanted = new Set(flags.tasks);
    selectedRows = rows.filter((r) => wanted.has(r.task));
    const found = new Set(selectedRows.map((r) => r.task));
    const missing = [...wanted].filter((t) => !found.has(t));
    if (missing.length > 0) throw new Error(`--tasks not found in bank: ${missing.join(", ")}`);
  }

  const seen = new Set<string>();
  for (const r of selectedRows) {
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

  return selectedRows;
}

function nodeScript(script: string, args: string[]) {
  return run(
    "node",
    ["--import", `file://${TSX_LOADER}`, join(WORKSPACE, "tools", "measurement", script), ...args],
    { cwd: WORKSPACE, timeout: 1_200_000 },
  );
}

function mustRun(label: string, script: string, args: string[]): void {
  console.log(`\n# ${label}`);
  const r = nodeScript(script, args);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  if (r.code !== 0) throw new Error(`${label} failed with exit ${r.code}`);
}

function taskDir(out: string, task: string): string {
  return join(out, "tasks", task);
}

function cellDir(out: string, task: string, protocol: Protocol, rep: number): string {
  return join(out, "runs", `${task}.${protocol}.${rep}`);
}

function rowPath(out: string, task: string, protocol: Protocol, rep: number): string {
  return join(cellDir(out, task, protocol, rep), "row.json");
}

function isGraded(path: string): boolean {
  if (!existsSync(path)) return false;
  const row = readJson<RowSummary>(path);
  return row.pass === true || row.pass === false;
}

function rotate<T>(xs: T[], offset: number): T[] {
  if (xs.length === 0) return [];
  const n = offset % xs.length;
  return xs.slice(n).concat(xs.slice(0, n));
}

function buildOrder(rows: TaskBankRow[], flags: Flags): Step[] {
  const steps: Step[] = [];
  for (const [taskIndex, row] of rows.entries()) {
    for (let rep = 0; rep < flags.reps; rep++) {
      for (const protocol of rotate(flags.protocols, taskIndex + rep)) {
        steps.push({ task: row.task, protocol, rep });
      }
    }
  }
  return steps;
}

function collectRows(runsDir: string): unknown[] {
  if (!existsSync(runsDir)) return [];
  const rows: unknown[] = [];
  for (const e of readdirSync(runsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const rowFile = join(runsDir, e.name, "row.json");
    if (existsSync(rowFile)) rows.push(JSON.parse(readFileSync(rowFile, "utf8")));
  }
  return rows;
}

function countArtifacts(out: string, steps: Step[]): { row: number; raw: number; last: number } {
  let row = 0;
  let raw = 0;
  let last = 0;
  for (const s of steps) {
    const dir = cellDir(out, s.task, s.protocol, s.rep);
    if (existsSync(join(dir, "row.json"))) row += 1;
    if (existsSync(join(dir, "raw-output.json"))) raw += 1;
    if (existsSync(join(dir, "last-message.txt"))) last += 1;
  }
  return { row, raw, last };
}

function printProgress(out: string, steps: Step[], done: number): void {
  const rows = collectRows(join(out, "runs")) as RowSummary[];
  const graded = rows.filter((r) => r.pass === true || r.pass === false);
  const pass = graded.filter((r) => r.pass === true).length;
  const gradedFailed = graded.filter((r) => r.pass === false).length;
  const voids = rows.filter((r) => r.void_reason).length;
  const toolErrorRows = rows.filter((r) => (r.tool_errors ?? 0) > 0).length;
  const ctxRows = rows.filter((r) => (r.ctx_calls ?? 0) > 0).length;
  const artifacts = countArtifacts(out, steps);
  console.log(
    `progress: ${done}/${steps.length} cells; graded pass=${pass} graded-failed=${gradedFailed} void=${voids} tool-error-rows=${toolErrorRows} ctx-used-rows=${ctxRows}`,
  );
  console.log(
    `artifacts: row.json=${artifacts.row} raw-output.json=${artifacts.raw} last-message.txt=${artifacts.last}`,
  );
}

function printPlan(rows: TaskBankRow[], flags: Flags, steps: Step[]): void {
  console.log(`bank: ${flags.bank}`);
  console.log(`out: ${flags.out}`);
  console.log(`tasks: ${rows.length}${flags.tasks ? ` (${flags.tasks.join(",")})` : ""}`);
  console.log(`protocols: ${flags.protocols.join(",")}`);
  console.log(`reps: ${flags.reps}`);
  console.log(
    `cells: ${steps.length} (${rows.length} tasks x ${flags.reps} reps x ${flags.protocols.length} protocols)`,
  );
  console.log(`model: ${flags.model}`);
  console.log(`reasoning: ${flags.reasoning}`);
  console.log(`mode: ${flags.execute ? "EXECUTE" : "DRY-RUN"}`);
  console.log("\norder:");
  for (const s of steps) console.log(`  ${s.task} protocol ${s.protocol} rep ${s.rep}`);
}

function main(): number {
  const flags = parseFlags(process.argv.slice(2));
  const bankRows = readJsonl<TaskBankRow>(flags.bank);
  const rows = validateBank(bankRows, flags);
  const steps = buildOrder(rows, flags);
  printPlan(rows, flags, steps);
  if (!flags.execute) {
    console.log("\nDry run only. Re-run with --execute to launch Codex cells.");
    return 0;
  }

  if (!flags.resume && existsSync(flags.out)) rmSync(flags.out, { recursive: true, force: true });
  ensureDir(flags.out);
  mkdirSync(join(flags.out, "tasks"), { recursive: true });
  mkdirSync(join(flags.out, "runs"), { recursive: true });
  writeJson(join(flags.out, "grid-plan.json"), {
    bank: flags.bank,
    tasks: rows.map((r) => r.task),
    protocols: flags.protocols,
    reps: flags.reps,
    model: flags.model,
    reasoning: flags.reasoning,
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

  let done = 0;
  for (const step of steps) {
    const row = byTask.get(step.task);
    if (!row) throw new Error(`internal error: missing task ${step.task}`);
    const rp = rowPath(flags.out, step.task, step.protocol, step.rep);
    if (flags.resume && isGraded(rp)) {
      console.log(
        `\n# cell ${step.task} ${step.protocol} ${step.rep}: skip existing graded row (--resume)`,
      );
      done += 1;
      printProgress(flags.out, steps, done);
      continue;
    }
    mustRun(
      `run-cell-codex-protocol ${step.task} ${step.protocol} ${step.rep}`,
      "run-cell-codex-protocol.ts",
      [
        "--taskdir",
        taskDir(flags.out, step.task),
        "--protocol",
        step.protocol,
        "--rep",
        String(step.rep),
        "--out",
        join(flags.out, "runs"),
        "--model",
        flags.model,
        "--reasoning",
        flags.reasoning,
        "--model-label",
        `${flags.model}-${flags.reasoning}`,
      ],
    );
    mustRun(`grade-cell ${step.task} ${step.protocol} ${step.rep}`, "grade-cell.ts", [
      "--taskdir",
      taskDir(flags.out, step.task),
      "--runsdir",
      join(flags.out, "runs"),
      "--arm",
      step.protocol,
      "--rep",
      String(step.rep),
    ]);
    done += 1;
    printProgress(flags.out, steps, done);
  }

  const runRows = collectRows(join(flags.out, "runs"));
  const runsJsonl = join(flags.out, "runs.jsonl");
  writeJsonl(runsJsonl, runRows);
  mustRun("analyze-codex-protocol", "analyze-codex-protocol.ts", [
    "--runs",
    runsJsonl,
    "--out",
    join(flags.out, "protocol-report.json"),
  ]);
  console.log(`\nDone. Protocol report: ${join(flags.out, "protocol-report.json")}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
}
