/**
 * analyze — R1 analysis (design §4 output table + decision rule).
 *
 * Reads per-cell run rows (JSONL) and produces, PER REPO (never pooled — Q6/ADR0022):
 *   - the §4 output table (per task: passA/passB, M1 medians, Δ, Δ%, turnsΔ)
 *   - the four-condition gate verdict (design §4 decision rule)
 *   - a void-run report (never silently dropped — §7)
 *
 * Statistics (design §7):
 *   - unit of analysis = per-task MEDIAN of reps (reps are NOT i.i.d. — T14)
 *   - primary = 90% paired-bootstrap percentile CI on the MEDIAN of per-task Δ
 *     (B≥10,000; seeded for reproducibility)
 *
 * Usage:
 *   tsx analyze.ts --runs <runs.jsonl> [--out <report.json>] [--bootstrap 10000] [--seed 1]
 *   tsx analyze.ts --selftest        # A6: reproduce a hand-computed median/CI/gate
 */
import { readJsonl, writeJson } from "./lib.ts";

/** One graded cell. void => excluded from stats but reported (§7). */
export interface RunRow {
  task: string;
  repo: string;
  arm: "A" | "B";
  rep: number;
  model?: string; // pinned model the cell ran on (used to label + guard the claim)
  m1_uncached: number; // usage.input_tokens (primary)
  m1_total_input: number; // cache_read + cache_creation + input_tokens (audit + anti-gaming)
  pass: boolean; // accept_cmd exit==0 (M2) — separate from is_error
  turns?: number;
  cost_usd?: number;
  duration_ms?: number;
  is_error?: boolean;
  void_reason?: string; // transport/budget/flaky — excluded, reported
}

const GATE_GUARDRAIL_FRACTION = 0.8; // ≥8/10 tasks pass_B ≥ pass_A (Q9)
const CI_LEVEL = 0.9; // 90% (Q9 — looser than R2's 95%)

// ---- small stats (documented, hand-checkable) -----------------------------

/** Deterministic PRNG (mulberry32) so bootstrap CIs reproduce across machines. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** Percentile by nearest-rank on the sorted sample (p in [0,1]); simple + reproducible. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx] as number;
}

/** Paired bootstrap percentile CI on the MEDIAN of a difference vector (§7). */
export function bootstrapMedianCI(
  diffs: number[],
  level = CI_LEVEL,
  B = 10_000,
  seed = 1,
): { lo: number; hi: number; medians: number } {
  const rand = mulberry32(seed);
  const n = diffs.length;
  const meds: number[] = new Array(B);
  for (let b = 0; b < B; b++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) sample[i] = diffs[Math.floor(rand() * n)] as number;
    meds[b] = median(sample);
  }
  meds.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  return { lo: percentile(meds, alpha), hi: percentile(meds, 1 - alpha), medians: median(meds) };
}

// ---- aggregation ----------------------------------------------------------

interface TaskAgg {
  task: string;
  passRateA: number;
  passRateB: number;
  m1A: number; // median of reps
  m1B: number;
  totalA: number;
  totalB: number;
  turnsA: number;
  turnsB: number;
  deltaUncached: number; // A − B (positive = ctx saved)
  deltaTotal: number; // A − B
  deltaPct: number;
}

interface RepoReport {
  repo: string;
  models: string[]; // distinct models across this repo's rows (should be exactly 1)
  n_tasks: number;
  tasks: TaskAgg[];
  void_runs: { task: string; arm: string; rep: number; reason: string }[];
  median_delta_uncached: number;
  median_delta_total: number;
  ci90_delta_uncached: { lo: number; hi: number };
  guardrail_pass_count: number;
  guardrail_needed: number;
  data_quality: {
    paired_tasks: number; // tasks with live reps in BOTH arms
    void_cells: number; // cells excluded (errors / limits / no accept_cmd)
    min_tasks_for_verdict: number;
    ci_degenerate: boolean; // lo==hi ⇒ too few distinct task-deltas for a real interval
    sufficient: boolean;
  };
  gate: {
    a_guardrail: boolean;
    b_median_positive: boolean;
    c_ci_excludes_zero: boolean;
    d_total_not_ballooned: boolean;
    verdict: "ESCALATE_TO_R2" | "HOLD" | "INSUFFICIENT_DATA";
  };
}

/** A verdict below this many paired tasks is not decisional — a single task gives a
 *  degenerate bootstrap CI (lo==hi) that trivially "excludes 0" (the n=1 trap). The
 *  design targets 10; Q17 allows a scaled-down bank, but never n≈1. */
const MIN_TASKS_FOR_VERDICT = 5;

function medOf(rows: RunRow[], pick: (r: RunRow) => number): number {
  return median(rows.map(pick));
}

export function analyzeRuns(
  allRows: RunRow[],
  opts: { bootstrap?: number; seed?: number; minTasks?: number } = {},
): RepoReport[] {
  const minTasks = opts.minTasks ?? MIN_TASKS_FOR_VERDICT;
  const byRepo = new Map<string, RunRow[]>();
  for (const r of allRows) {
    if (!byRepo.has(r.repo)) byRepo.set(r.repo, []);
    (byRepo.get(r.repo) as RunRow[]).push(r);
  }
  const reports: RepoReport[] = [];
  for (const [repo, rows] of [...byRepo.entries()].sort()) {
    const voids = rows
      .filter((r) => r.void_reason)
      .map((r) => ({ task: r.task, arm: r.arm, rep: r.rep, reason: r.void_reason as string }));
    const live = rows.filter((r) => !r.void_reason);

    const byTask = new Map<string, RunRow[]>();
    for (const r of live) {
      if (!byTask.has(r.task)) byTask.set(r.task, []);
      (byTask.get(r.task) as RunRow[]).push(r);
    }

    const tasks: TaskAgg[] = [];
    for (const [task, trows] of [...byTask.entries()].sort()) {
      const A = trows.filter((r) => r.arm === "A");
      const B = trows.filter((r) => r.arm === "B");
      if (A.length === 0 || B.length === 0) {
        // A task with no live reps in one arm cannot be paired — report as void.
        voids.push({ task, arm: A.length === 0 ? "A" : "B", rep: -1, reason: "no live reps" });
        continue;
      }
      const passRateA = A.filter((r) => r.pass).length / A.length;
      const passRateB = B.filter((r) => r.pass).length / B.length;
      const m1A = medOf(A, (r) => r.m1_uncached);
      const m1B = medOf(B, (r) => r.m1_uncached);
      const totalA = medOf(A, (r) => r.m1_total_input);
      const totalB = medOf(B, (r) => r.m1_total_input);
      tasks.push({
        task,
        passRateA,
        passRateB,
        m1A,
        m1B,
        totalA,
        totalB,
        turnsA: medOf(A, (r) => r.turns ?? 0),
        turnsB: medOf(B, (r) => r.turns ?? 0),
        deltaUncached: m1A - m1B,
        deltaTotal: totalA - totalB,
        deltaPct: m1A === 0 ? 0 : ((m1A - m1B) / m1A) * 100,
      });
    }

    const diffs = tasks.map((t) => t.deltaUncached);
    const medDeltaUncached = median(diffs);
    const medDeltaTotal = median(tasks.map((t) => t.deltaTotal));
    const ci =
      diffs.length > 0
        ? bootstrapMedianCI(diffs, CI_LEVEL, opts.bootstrap ?? 10_000, opts.seed ?? 1)
        : { lo: Number.NaN, hi: Number.NaN, medians: Number.NaN };
    const guardrailPass = tasks.filter((t) => t.passRateB >= t.passRateA).length;
    const guardrailNeeded = Math.ceil(GATE_GUARDRAIL_FRACTION * tasks.length);

    const ciDegenerate = diffs.length > 0 && ci.lo === ci.hi; // <2 distinct deltas
    const sufficient = tasks.length >= minTasks && !ciDegenerate;
    const a = tasks.length > 0 && guardrailPass >= guardrailNeeded;
    const b = medDeltaUncached > 0;
    const c = diffs.length > 0 && ci.lo > 0; // CI excludes 0 (all-positive)
    const d = medDeltaTotal >= 0; // total not ballooned (anti-gaming, §2 M1)
    // A positive verdict is only decisional with enough paired tasks — otherwise a
    // single surviving task's degenerate CI (lo==hi) would falsely "ESCALATE".
    const verdict = !sufficient
      ? "INSUFFICIENT_DATA"
      : a && b && c && d
        ? "ESCALATE_TO_R2"
        : "HOLD";
    const models = [
      ...new Set(rows.map((r) => r.model).filter((m): m is string => Boolean(m))),
    ].sort();
    reports.push({
      repo,
      models,
      n_tasks: tasks.length,
      tasks,
      void_runs: voids,
      median_delta_uncached: medDeltaUncached,
      median_delta_total: medDeltaTotal,
      ci90_delta_uncached: { lo: ci.lo, hi: ci.hi },
      guardrail_pass_count: guardrailPass,
      guardrail_needed: guardrailNeeded,
      data_quality: {
        paired_tasks: tasks.length,
        void_cells: voids.length,
        min_tasks_for_verdict: minTasks,
        ci_degenerate: ciDegenerate,
        sufficient,
      },
      gate: {
        a_guardrail: a,
        b_median_positive: b,
        c_ci_excludes_zero: c,
        d_total_not_ballooned: d,
        verdict,
      },
    });
  }
  return reports;
}

// ---- rendering ------------------------------------------------------------

function fmt(n: number): string {
  return Number.isNaN(n) ? "—" : n.toLocaleString("en-US");
}

export function renderReport(reports: RepoReport[]): string {
  const out: string[] = [];
  for (const r of reports) {
    out.push(`\n## repo: ${r.repo}  (n=${r.n_tasks} paired tasks)`);
    out.push(`model(s): ${r.models.length ? r.models.join(", ") : "unlabeled"}`);
    if (r.models.length > 1)
      out.push(
        `⚠ MIXED MODELS in one repo — pairing is invalid; re-run each arm on the same model.`,
      );
    out.push("| task | passA/passB | M1_A | M1_B | Δ=A−B | Δ% | turnsΔ |");
    out.push("|---|---|---|---|---|---|---|");
    for (const t of r.tasks) {
      out.push(
        `| ${t.task} | ${t.passRateA.toFixed(2)}/${t.passRateB.toFixed(2)} | ${fmt(t.m1A)} | ${fmt(
          t.m1B,
        )} | ${fmt(t.deltaUncached)} | ${t.deltaPct.toFixed(1)}% | ${fmt(t.turnsA - t.turnsB)} |`,
      );
    }
    out.push(
      `\nmedian Δ uncached = ${fmt(r.median_delta_uncached)}  ·  ` +
        `90% CI = [${fmt(r.ci90_delta_uncached.lo)}, ${fmt(r.ci90_delta_uncached.hi)}]  ·  ` +
        `median Δ total = ${fmt(r.median_delta_total)}`,
    );
    out.push(
      `guardrail (pass_B ≥ pass_A): ${r.guardrail_pass_count}/${r.n_tasks} ` +
        `(need ≥ ${r.guardrail_needed})`,
    );
    const dq = r.data_quality;
    out.push(
      `data quality: ${dq.paired_tasks} paired task(s), ${dq.void_cells} void cell(s); ` +
        `need ≥ ${dq.min_tasks_for_verdict} tasks for a decisional verdict` +
        (dq.ci_degenerate ? " · ⚠ CI degenerate (lo==hi — too few distinct task-deltas)" : ""),
    );
    if (!dq.sufficient)
      out.push(
        `⚠ INSUFFICIENT DATA — the gate below is NOT decisional (too few paired tasks / degenerate CI).`,
      );
    const g = r.gate;
    out.push(
      `gate: (a) guardrail ${g.a_guardrail ? "✓" : "✗"} · (b) median Δ>0 ${
        g.b_median_positive ? "✓" : "✗"
      } · (c) CI excludes 0 ${g.c_ci_excludes_zero ? "✓" : "✗"} · ` +
        `(d) total not ballooned ${g.d_total_not_ballooned ? "✓" : "✗"}`,
    );
    out.push(`VERDICT: ${g.verdict}`);
    if (r.void_runs.length > 0) {
      out.push(`\nvoid runs (reported, not dropped — §7):`);
      for (const v of r.void_runs) out.push(`  - ${v.task} arm ${v.arm} rep ${v.rep}: ${v.reason}`);
    }
  }
  return out.join("\n");
}

// ---- A6 selftest: reproduce a hand-computed median/CI/gate -----------------

function selftest(): number {
  // Fixture: 3 tasks, Δ_uncached vector = [10, 20, 30] (hand median = 20).
  // Bootstrap-median PMF over {10,20,30} (3 draws w/ replacement):
  //   P(med=10)=7/27, P(med=20)=13/27, P(med=30)=7/27  ⇒ analytic 90% CI = [10, 30].
  // pass_B ≥ pass_A on all 3 tasks (guardrail 3/3 ≥ 3). total Δ ≥ 0 on all. ⇒ ESCALATE.
  const rows: RunRow[] = [];
  const deltas = [10, 20, 30];
  deltas.forEach((d, i) => {
    // one rep each arm; make M1_A = 100+d, M1_B = 100 so Δ = d.
    rows.push({
      task: `t${i}`,
      repo: "fix",
      arm: "A",
      rep: 0,
      m1_uncached: 100 + d,
      m1_total_input: 200,
      pass: true,
    });
    rows.push({
      task: `t${i}`,
      repo: "fix",
      arm: "B",
      rep: 0,
      m1_uncached: 100,
      m1_total_input: 200,
      pass: true,
    });
  });
  // minTasks:1 so the 3-task analytic fixture exercises the ESCALATE path.
  const [rep] = analyzeRuns(rows, { bootstrap: 10_000, seed: 42, minTasks: 1 });
  const checks: [string, boolean][] = [
    ["median Δ uncached == 20", rep!.median_delta_uncached === 20],
    ["CI lo == 10", rep!.ci90_delta_uncached.lo === 10],
    ["CI hi == 30", rep!.ci90_delta_uncached.hi === 30],
    ["CI excludes 0", rep!.gate.c_ci_excludes_zero === true],
    ["guardrail 3/3", rep!.guardrail_pass_count === 3 && rep!.guardrail_needed === 3],
    [
      "median Δ total == 0 (not ballooned)",
      rep!.median_delta_total === 0 && rep!.gate.d_total_not_ballooned,
    ],
    ["verdict ESCALATE", rep!.gate.verdict === "ESCALATE_TO_R2"],
  ];
  // Reproducibility: a different seed must give the same analytic CI on this fixture.
  const [rep2] = analyzeRuns(rows, { bootstrap: 10_000, seed: 7, minTasks: 1 });
  checks.push([
    "CI seed-stable [10,30]",
    rep2!.ci90_delta_uncached.lo === 10 && rep2!.ci90_delta_uncached.hi === 30,
  ]);
  // n=1 guard: a single surviving task must NOT ESCALATE (the degenerate-CI trap).
  const one = analyzeRuns(
    rows.filter((r) => r.task === "t1"),
    { bootstrap: 10_000, seed: 42 },
  );
  checks.push([
    "n=1 → INSUFFICIENT_DATA (not ESCALATE)",
    one[0]!.gate.verdict === "INSUFFICIENT_DATA" && one[0]!.data_quality.ci_degenerate === true,
  ]);

  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  console.log(ok ? "\nA6 selftest: OK" : "\nA6 selftest: FAILED");
  return ok ? 0 : 1;
}

// ---- entry ----------------------------------------------------------------

function parseFlags(argv: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
      f[key] = val;
    }
  }
  return f;
}

function main(): number {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.selftest) return selftest();
  if (!flags.runs) {
    console.error("usage: tsx analyze.ts --runs <runs.jsonl> [--out <report.json>] | --selftest");
    return 2;
  }
  const rows = readJsonl<RunRow>(flags.runs);
  const reports = analyzeRuns(rows, {
    bootstrap: flags.bootstrap ? Number(flags.bootstrap) : 10_000,
    seed: flags.seed ? Number(flags.seed) : 1,
  });
  console.log(renderReport(reports));
  if (flags.out) {
    writeJson(flags.out, reports);
    console.log(`\nwrote ${flags.out}`);
  }
  return 0;
}

process.exitCode = main();
