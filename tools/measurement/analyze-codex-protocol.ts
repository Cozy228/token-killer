/**
 * analyze-codex-protocol — summarize Codex ctx adoption protocols.
 *
 * This report is diagnostic by design. It separates exposure/adoption metrics
 * (ctx call rate, early ctx call, ctx errors) from outcome metrics (pass/fail and
 * token/duration deltas versus the `none` baseline for the same task+rep).
 */
import { readJsonl, writeJson } from "./lib.ts";

interface ProtocolRow {
  task: string;
  repo: string;
  arm?: string;
  condition?: string;
  protocol?: string;
  rep: number;
  model?: string;
  m1_uncached?: number;
  m1_total_input?: number;
  output_tokens?: number;
  duration_ms?: number;
  turns?: number;
  tool_errors?: number;
  ctx_calls?: number;
  ctx_context_calls?: number;
  ctx_search_calls?: number;
  ctx_remember_calls?: number;
  ctx_errors?: number;
  ctx_before_first_command?: boolean;
  pass?: boolean | null;
  void_reason?: string;
}

interface ConditionSummary {
  condition: string;
  rows: number;
  graded: number;
  pass: number;
  fail: number;
  void: number;
  pass_rate_all: number;
  pass_rate_graded: number;
  ctx_metric_rows: number;
  ctx_used_rows: number;
  ctx_call_rate: number;
  ctx_context_call_rate: number;
  ctx_before_first_command_rate: number;
  ctx_errors: number;
  tool_error_rows: number;
  avg_m1_uncached: number;
  avg_m1_total_input: number;
  avg_output_tokens: number;
  avg_duration_ms: number;
  avg_turns: number;
}

interface PairSummary {
  condition: string;
  baseline: string;
  pairs: number;
  graded_pairs: number;
  both_pass: number;
  both_fail: number;
  condition_only_pass: number;
  baseline_only_pass: number;
  any_void: number;
  avg_delta_m1_uncached: number;
  avg_delta_m1_total_input: number;
  avg_delta_output_tokens: number;
  avg_delta_duration_ms: number;
}

interface ProtocolReport {
  models: string[];
  conditions: ConditionSummary[];
  tasks: ConditionSummary[];
  pairs_vs_none: PairSummary[];
  void_runs: { task: string; condition: string; rep: number; reason: string }[];
}

function conditionOf(row: ProtocolRow): string {
  return row.condition ?? row.protocol ?? row.arm ?? "<unknown>";
}

function isGraded(row: ProtocolRow): boolean {
  return !row.void_reason && (row.pass === true || row.pass === false);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function ratio(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function summarize(condition: string, rows: ProtocolRow[]): ConditionSummary {
  const graded = rows.filter(isGraded);
  const live = rows.filter((r) => !r.void_reason);
  const pass = graded.filter((r) => r.pass === true).length;
  const fail = graded.filter((r) => r.pass === false).length;
  const ctxMetricRows = rows.filter((r) => typeof r.ctx_calls === "number");
  const ctxUsed = ctxMetricRows.filter((r) => num(r.ctx_calls) > 0).length;
  const ctxContextUsed = ctxMetricRows.filter((r) => num(r.ctx_context_calls) > 0).length;
  const ctxBeforeCommand = ctxMetricRows.filter((r) => r.ctx_before_first_command === true).length;
  return {
    condition,
    rows: rows.length,
    graded: graded.length,
    pass,
    fail,
    void: rows.filter((r) => r.void_reason).length,
    pass_rate_all: ratio(pass, rows.length),
    pass_rate_graded: ratio(pass, graded.length),
    ctx_metric_rows: ctxMetricRows.length,
    ctx_used_rows: ctxUsed,
    ctx_call_rate: ratio(ctxUsed, ctxMetricRows.length),
    ctx_context_call_rate: ratio(ctxContextUsed, ctxMetricRows.length),
    ctx_before_first_command_rate: ratio(ctxBeforeCommand, ctxMetricRows.length),
    ctx_errors: rows.reduce((sum, r) => sum + num(r.ctx_errors), 0),
    tool_error_rows: rows.filter((r) => num(r.tool_errors) > 0).length,
    avg_m1_uncached: avg(live.map((r) => num(r.m1_uncached))),
    avg_m1_total_input: avg(live.map((r) => num(r.m1_total_input))),
    avg_output_tokens: avg(live.map((r) => num(r.output_tokens))),
    avg_duration_ms: avg(live.map((r) => num(r.duration_ms))),
    avg_turns: avg(live.map((r) => num(r.turns))),
  };
}

function by<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(row);
  }
  return out;
}

function pairKey(row: ProtocolRow): string {
  return `${row.repo}\0${row.task}\0${row.rep}`;
}

function pairSummaries(rows: ProtocolRow[]): PairSummary[] {
  const baseline = "none";
  const baselineRows = new Map(
    rows.filter((r) => conditionOf(r) === baseline).map((r) => [pairKey(r), r]),
  );
  const conditions = [...new Set(rows.map(conditionOf).filter((c) => c !== baseline))].sort();
  return conditions.map((condition) => {
    const pairs: [ProtocolRow, ProtocolRow][] = [];
    for (const row of rows.filter((r) => conditionOf(r) === condition)) {
      const base = baselineRows.get(pairKey(row));
      if (base) pairs.push([base, row]);
    }
    const gradedPairs = pairs.filter(([base, row]) => isGraded(base) && isGraded(row));
    return {
      condition,
      baseline,
      pairs: pairs.length,
      graded_pairs: gradedPairs.length,
      both_pass: gradedPairs.filter(([base, row]) => base.pass === true && row.pass === true)
        .length,
      both_fail: gradedPairs.filter(([base, row]) => base.pass === false && row.pass === false)
        .length,
      condition_only_pass: gradedPairs.filter(
        ([base, row]) => base.pass === false && row.pass === true,
      ).length,
      baseline_only_pass: gradedPairs.filter(
        ([base, row]) => base.pass === true && row.pass === false,
      ).length,
      any_void: pairs.filter(([base, row]) => Boolean(base.void_reason || row.void_reason)).length,
      avg_delta_m1_uncached: avg(
        gradedPairs.map(([base, row]) => num(base.m1_uncached) - num(row.m1_uncached)),
      ),
      avg_delta_m1_total_input: avg(
        gradedPairs.map(([base, row]) => num(base.m1_total_input) - num(row.m1_total_input)),
      ),
      avg_delta_output_tokens: avg(
        gradedPairs.map(([base, row]) => num(base.output_tokens) - num(row.output_tokens)),
      ),
      avg_delta_duration_ms: avg(
        gradedPairs.map(([base, row]) => num(base.duration_ms) - num(row.duration_ms)),
      ),
    };
  });
}

function analyze(rows: ProtocolRow[]): ProtocolReport {
  const conditionRows = [...by(rows, conditionOf).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([condition, rs]) => summarize(condition, rs));
  const taskRows = [...by(rows, (r) => `${r.task} / ${conditionOf(r)}`).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([condition, rs]) => summarize(condition, rs));
  const models = [
    ...new Set(rows.map((r) => r.model).filter((m): m is string => Boolean(m))),
  ].sort();
  return {
    models,
    conditions: conditionRows,
    tasks: taskRows,
    pairs_vs_none: pairSummaries(rows),
    void_runs: rows
      .filter((r) => r.void_reason)
      .map((r) => ({
        task: r.task,
        condition: conditionOf(r),
        rep: r.rep,
        reason: r.void_reason as string,
      })),
  };
}

function fmt(n: number): string {
  if (Number.isNaN(n)) return "-";
  if (Math.abs(n) < 1) return n.toFixed(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function render(report: ProtocolReport): string {
  const out: string[] = [];
  out.push("# Codex ctx protocol report");
  out.push(`models: ${report.models.length ? report.models.join(", ") : "unlabeled"}`);
  out.push("");
  out.push("## conditions");
  out.push(
    "| condition | rows | graded | pass/fail/void | pass graded | ctx metric rows | ctx used | ctx before command | tool-error rows | avg M1 | avg total | avg duration ms |",
  );
  out.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const s of report.conditions) {
    out.push(
      `| ${s.condition} | ${s.rows} | ${s.graded} | ${s.pass}/${s.fail}/${s.void} | ${pct(
        s.pass_rate_graded,
      )} | ${s.ctx_metric_rows} | ${pct(s.ctx_call_rate)} | ${pct(
        s.ctx_before_first_command_rate,
      )} | ${s.tool_error_rows} | ${fmt(s.avg_m1_uncached)} | ${fmt(
        s.avg_m1_total_input,
      )} | ${fmt(s.avg_duration_ms)} |`,
    );
  }
  out.push("");
  out.push("## paired vs none");
  out.push(
    "| condition | pairs | graded | both pass | condition only pass | none only pass | both fail | any void | delta M1 none-condition | delta total | delta duration ms |",
  );
  out.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const p of report.pairs_vs_none) {
    out.push(
      `| ${p.condition} | ${p.pairs} | ${p.graded_pairs} | ${p.both_pass} | ${
        p.condition_only_pass
      } | ${p.baseline_only_pass} | ${p.both_fail} | ${p.any_void} | ${fmt(
        p.avg_delta_m1_uncached,
      )} | ${fmt(p.avg_delta_m1_total_input)} | ${fmt(p.avg_delta_duration_ms)} |`,
    );
  }
  if (report.void_runs.length > 0) {
    out.push("");
    out.push("## void runs");
    for (const v of report.void_runs) {
      out.push(`- ${v.task} ${v.condition} rep ${v.rep}: ${v.reason}`);
    }
  }
  return out.join("\n");
}

function parseFlags(argv: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      f[key] = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
    }
  }
  return f;
}

function main(): number {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.runs) {
    console.error("usage: tsx analyze-codex-protocol.ts --runs <runs.jsonl> [--out <report.json>]");
    return 2;
  }
  const rows = readJsonl<ProtocolRow>(flags.runs);
  const report = analyze(rows);
  console.log(render(report));
  if (flags.out) {
    writeJson(flags.out, report);
    console.log(`\nwrote ${flags.out}`);
  }
  return 0;
}

process.exitCode = main();
