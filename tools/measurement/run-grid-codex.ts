/**
 * run-grid-codex — R1 grid orchestration using `codex exec`.
 *
 * Separate from run-grid.ts by design: the Claude harness remains untouched and
 * can be resumed from its existing output directory. This script writes its own
 * `runs.jsonl` and `report.json` under --out.
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
  model: string;
  reasoning: string;
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
  return {
    bank: resolve(raw.bank ?? join(WORKSPACE, "tools", "measurement", "task-bank-draft.jsonl")),
    out: resolve(
      raw.out ?? join(WORKSPACE, "tools", "measurement", ".work", "r1-grid-codex-gpt55-medium"),
    ),
    reps: raw.reps ? Number(raw.reps) : 3,
    model: raw.model ?? "gpt-5.5",
    reasoning: raw.reasoning ?? "medium",
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

function rowPath(out: string, task: string, arm: Arm, rep: number): string {
  return join(out, "runs", `${task}.${arm}.${rep}`, "row.json");
}

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
  console.log(`bank: ${flags.bank}`);
  console.log(`out: ${flags.out}`);
  console.log(`tasks: ${rows.length}`);
  console.log(`reps: ${flags.reps}`);
  console.log(`cells: ${steps.length} (${rows.length} tasks x ${flags.reps} reps x 2 arms)`);
  console.log(`model: ${flags.model}`);
  console.log(`reasoning: ${flags.reasoning}`);
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
    console.log("\nDry run only. Re-run with --execute to launch Codex cells.");
    return 0;
  }

  if (!flags.resume && existsSync(flags.out)) rmSync(flags.out, { recursive: true, force: true });
  ensureDir(flags.out);
  mkdirSync(join(flags.out, "tasks"), { recursive: true });
  mkdirSync(join(flags.out, "runs"), { recursive: true });
  writeJson(join(flags.out, "grid-plan.json"), {
    bank: flags.bank,
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
    mustRun(`run-cell-codex ${step.task} ${step.arm} ${step.rep}`, "run-cell-codex.ts", [
      "--taskdir",
      taskDir(flags.out, step.task),
      "--arm",
      step.arm,
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
    ]);
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
  mustRun("analyze", "analyze.ts", ["--runs", runsJsonl, "--out", join(flags.out, "report.json")]);
  console.log(`\nDone. Report: ${join(flags.out, "report.json")}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
}
