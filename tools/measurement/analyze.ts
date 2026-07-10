/**
 * analyze — E2 analysis (MEASUREMENT-DESIGN-V2 §2/§3/§4; supersedes P32 §4).
 *
 * Reads per-cell run rows (JSONL) and produces, PER REPO (never pooled — Q6/ADR0022):
 *   - the output table (per task: passA/passB, TOTAL-input medians, Δ, uncached audit)
 *   - the gate verdict (§4 decision rule): ESCALATE / HOLD / INSUFFICIENT_DATA / RUN_INVALID
 *   - a void-run report (never silently dropped — §2)
 *
 * v2 changes vs v1 (all logged in implementation-notes):
 *   - PRIMARY metric = paired TOTAL input tokens (§3/F3); uncached is a reported
 *     audit column. Anti-gaming inverts: a total-win with an uncached BLOWUP is flagged.
 *   - Void taxonomy (§2/F2): infra-voids excluded+counted; `tool_errors` never void a
 *     graded row; rows outside the grid-plan step list are CONTAMINATED (excluded).
 *   - Max-void bar (§2): task×arm valid iff ≥2/3 reps graded; a repo's grid valid iff
 *     infra-void ≤20% of planned cells — else RUN_INVALID (distinct from INSUFFICIENT_DATA).
 *   - Model-homogeneity assert (§2/E-7): mixed model labels ⇒ RUN_INVALID, no verdict.
 *   - Staleness guard (§2): the report records the runs.jsonl row count + sha256.
 *
 * Statistics (§7): unit = per-task MEDIAN of reps; primary = 90% paired-bootstrap
 * percentile CI on the MEDIAN of per-task Δ (B≥10,000; seeded).
 *
 * Usage:
 *   tsx analyze.ts --runs <runs.jsonl> [--out <report.json>] [--grid-plan <grid-plan.json>]
 *                  [--bootstrap 10000] [--seed 1]
 *   tsx analyze.ts --selftest        # hand-computed median/CI/gate + v2 guards
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readJson, readJsonl, writeJson } from "./lib.ts";

/** One graded cell. void => excluded from stats but reported (§2). */
export interface RunRow {
  task: string;
  repo: string;
  arm: "A" | "B";
  rep: number;
  model?: string; // pinned model the cell ran on (used to label + guard the claim)
  m1_uncached: number; // usage.input_tokens (audit)
  m1_total_input: number; // cache_read + cache_creation + input_tokens (PRIMARY, §3)
  pass: boolean | null; // accept_cmd exit==0 (M2) — separate from is_error
  turns?: number;
  cost_usd?: number;
  duration_ms?: number;
  is_error?: boolean;
  void_reason?: string; // infra-void: transport/budget/mcp-not-attached — excluded, reported
}

/** Guardrail on ≥8/11 tasks (Q9 amend). Expressed as a fraction so a scaled bank
 *  still yields ~8/11 at design size (ceil(8/11·11)=8, ceil(8/11·3)=3). */
const GATE_GUARDRAIL_FRACTION = 8 / 11;
const CI_LEVEL = 0.9; // 90% (Q9 — looser than R2's 95%)
/** §2 max-void bar. */
const MAX_INFRA_VOID_FRACTION = 0.2; // a repo's grid invalid above this
const MIN_GRADED_REPS_FRACTION = 2 / 3; // a task×arm valid iff ≥2/3 reps graded

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
  gradedRepsA: number;
  gradedRepsB: number;
  m1A: number; // median uncached (audit)
  m1B: number;
  totalA: number; // median total input (PRIMARY)
  totalB: number;
  turnsA: number;
  turnsB: number;
  deltaUncached: number; // A − B (positive = ctx saved) — audit
  deltaTotal: number; // A − B — PRIMARY
  deltaPct: number; // on total
}

export type Verdict = "ESCALATE_TO_R2" | "HOLD" | "INSUFFICIENT_DATA" | "RUN_INVALID";

interface RepoReport {
  repo: string;
  models: string[]; // distinct models across this repo's rows (should be exactly 1)
  n_tasks: number;
  tasks: TaskAgg[];
  void_runs: { task: string; arm: string; rep: number; reason: string }[];
  contaminated_runs: { task: string; arm: string; rep: number }[];
  under_graded_tasks: { task: string; arm: string; graded: number; needed: number }[];
  median_delta_total: number; // PRIMARY
  median_delta_uncached: number; // audit
  ci90_delta_total: { lo: number; hi: number }; // PRIMARY CI
  ci90_delta_uncached: { lo: number; hi: number }; // audit CI
  anti_gaming_flag: boolean; // total-win + uncached-blowup (§3, inverted)
  guardrail_pass_count: number;
  guardrail_needed: number;
  data_quality: {
    paired_tasks: number;
    void_cells: number;
    contaminated_cells: number;
    planned_cells: number;
    infra_void_fraction: number;
    max_void_breached: boolean;
    min_tasks_for_verdict: number;
    ci_degenerate: boolean;
    sufficient: boolean;
  };
  gate: {
    a_guardrail: boolean;
    b_median_positive: boolean; // on the PRIMARY (total)
    c_ci_excludes_zero: boolean; // on the PRIMARY (total)
    d_no_anti_gaming: boolean;
    verdict: Verdict;
  };
}

export interface AnalysisResult {
  run_valid: boolean;
  run_invalid_reasons: string[];
  models: string[]; // distinct model labels across the whole (in-plan) grid
  repos: RepoReport[];
}

/** A verdict below this many paired tasks is not decisional (the n=1 degenerate-CI
 *  trap). The design targets ~10; Q17 allows a scaled bank, but never n≈1. */
const MIN_TASKS_FOR_VERDICT = 5;

function medOf(rows: RunRow[], pick: (r: RunRow) => number): number {
  return median(rows.map(pick));
}

function stepKey(task: string, arm: string, rep: number): string {
  return `${task}|${arm}|${rep}`;
}

export interface AnalyzeOpts {
  bootstrap?: number;
  seed?: number;
  minTasks?: number;
  reps?: number; // planned reps per arm (for the max-void bar); inferred if absent
  planSteps?: Set<string>; // `${task}|${arm}|${rep}` — rows outside are contaminated
  plannedByRepo?: Map<string, number>; // planned cell count per repo (from grid-plan)
}

export function analyzeRuns(allRows: RunRow[], opts: AnalyzeOpts = {}): AnalysisResult {
  const minTasks = opts.minTasks ?? MIN_TASKS_FOR_VERDICT;

  // Contamination (§2): rows not in the grid-plan step list are excluded + reported.
  const contaminated: RunRow[] = [];
  const inPlan: RunRow[] = [];
  for (const r of allRows) {
    if (opts.planSteps && !opts.planSteps.has(stepKey(r.task, r.arm, r.rep))) contaminated.push(r);
    else inPlan.push(r);
  }

  // Planned reps per arm — inferred from observed rep indices if not supplied.
  const reps = opts.reps ?? (inPlan.length ? Math.max(...inPlan.map((r) => r.rep)) + 1 : 1);

  // Model-homogeneity (§2/E-7): mixed labels across the grid ⇒ RUN_INVALID.
  const globalModels = [
    ...new Set(inPlan.map((r) => r.model).filter((m): m is string => Boolean(m))),
  ].sort();
  const runInvalidReasons: string[] = [];
  if (globalModels.length > 1)
    runInvalidReasons.push(`mixed model labels across the grid: ${globalModels.join(", ")}`);

  const byRepo = new Map<string, RunRow[]>();
  for (const r of inPlan) {
    if (!byRepo.has(r.repo)) byRepo.set(r.repo, []);
    (byRepo.get(r.repo) as RunRow[]).push(r);
  }

  const reports: RepoReport[] = [];
  for (const [repo, rows] of [...byRepo.entries()].sort()) {
    const voids = rows
      .filter((r) => r.void_reason)
      .map((r) => ({ task: r.task, arm: r.arm, rep: r.rep, reason: r.void_reason as string }));
    const contaminatedHere = contaminated
      .filter((r) => r.repo === repo)
      .map((r) => ({ task: r.task, arm: r.arm, rep: r.rep }));
    // graded = no void AND a real pass bit (§2 taxonomy: only graded rows enter stats).
    const graded = rows.filter((r) => !r.void_reason && (r.pass === true || r.pass === false));

    const byTask = new Map<string, RunRow[]>();
    for (const r of graded) {
      if (!byTask.has(r.task)) byTask.set(r.task, []);
      (byTask.get(r.task) as RunRow[]).push(r);
    }

    const tasks: TaskAgg[] = [];
    const underGraded: { task: string; arm: string; graded: number; needed: number }[] = [];
    const neededGraded = Math.ceil(MIN_GRADED_REPS_FRACTION * reps);
    for (const [task, trows] of [...byTask.entries()].sort()) {
      const A = trows.filter((r) => r.arm === "A");
      const B = trows.filter((r) => r.arm === "B");
      // Max-void bar (§2): a task×arm is valid only if ≥2/3 reps graded.
      let underBar = false;
      if (A.length < neededGraded) {
        underGraded.push({ task, arm: "A", graded: A.length, needed: neededGraded });
        underBar = true;
      }
      if (B.length < neededGraded) {
        underGraded.push({ task, arm: "B", graded: B.length, needed: neededGraded });
        underBar = true;
      }
      if (A.length === 0 || B.length === 0 || underBar) continue;
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
        gradedRepsA: A.length,
        gradedRepsB: B.length,
        m1A,
        m1B,
        totalA,
        totalB,
        turnsA: medOf(A, (r) => r.turns ?? 0),
        turnsB: medOf(B, (r) => r.turns ?? 0),
        deltaUncached: m1A - m1B,
        deltaTotal: totalA - totalB,
        deltaPct: totalA === 0 ? 0 : ((totalA - totalB) / totalA) * 100,
      });
    }

    const totalDiffs = tasks.map((t) => t.deltaTotal);
    const uncachedDiffs = tasks.map((t) => t.deltaUncached);
    const medDeltaTotal = median(totalDiffs);
    const medDeltaUncached = median(uncachedDiffs);
    const ciTotal =
      totalDiffs.length > 0
        ? bootstrapMedianCI(totalDiffs, CI_LEVEL, opts.bootstrap ?? 10_000, opts.seed ?? 1)
        : { lo: Number.NaN, hi: Number.NaN, medians: Number.NaN };
    const ciUncached =
      uncachedDiffs.length > 0
        ? bootstrapMedianCI(uncachedDiffs, CI_LEVEL, opts.bootstrap ?? 10_000, opts.seed ?? 1)
        : { lo: Number.NaN, hi: Number.NaN, medians: Number.NaN };
    const guardrailPass = tasks.filter((t) => t.passRateB >= t.passRateA).length;
    const guardrailNeeded = Math.ceil(GATE_GUARDRAIL_FRACTION * tasks.length);

    // §2 max-void bar (per repo).
    const plannedCells =
      opts.plannedByRepo?.get(repo) ?? new Set(rows.map((r) => r.task)).size * 2 * reps;
    const infraVoidFraction = plannedCells > 0 ? voids.length / plannedCells : 0;
    const maxVoidBreached = plannedCells > 0 && infraVoidFraction > MAX_INFRA_VOID_FRACTION;

    const models = [
      ...new Set(rows.map((r) => r.model).filter((m): m is string => Boolean(m))),
    ].sort();
    const repoModelsMixed = models.length > 1;

    const ciDegenerate = totalDiffs.length > 0 && ciTotal.lo === ciTotal.hi;
    const sufficient = tasks.length >= minTasks && !ciDegenerate;
    // Anti-gaming (§3, inverted): a total-input WIN with an uncached BLOWUP.
    const antiGaming = medDeltaTotal > 0 && medDeltaUncached < 0;

    const a = tasks.length > 0 && guardrailPass >= guardrailNeeded;
    const b = medDeltaTotal > 0; // PRIMARY
    const c = totalDiffs.length > 0 && ciTotal.lo > 0; // PRIMARY CI excludes 0
    const d = !antiGaming;

    const repoInvalid = globalModels.length > 1 || repoModelsMixed || maxVoidBreached;
    if (repoModelsMixed) runInvalidReasons.push(`repo ${repo}: mixed models ${models.join(", ")}`);
    if (maxVoidBreached)
      runInvalidReasons.push(
        `repo ${repo}: infra-void ${(infraVoidFraction * 100).toFixed(0)}% > ${(MAX_INFRA_VOID_FRACTION * 100).toFixed(0)}% of ${plannedCells} planned cells`,
      );

    const verdict: Verdict = repoInvalid
      ? "RUN_INVALID"
      : !sufficient
        ? "INSUFFICIENT_DATA"
        : a && b && c && d
          ? "ESCALATE_TO_R2"
          : "HOLD";

    reports.push({
      repo,
      models,
      n_tasks: tasks.length,
      tasks,
      void_runs: voids,
      contaminated_runs: contaminatedHere,
      under_graded_tasks: underGraded,
      median_delta_total: medDeltaTotal,
      median_delta_uncached: medDeltaUncached,
      ci90_delta_total: { lo: ciTotal.lo, hi: ciTotal.hi },
      ci90_delta_uncached: { lo: ciUncached.lo, hi: ciUncached.hi },
      anti_gaming_flag: antiGaming,
      guardrail_pass_count: guardrailPass,
      guardrail_needed: guardrailNeeded,
      data_quality: {
        paired_tasks: tasks.length,
        void_cells: voids.length,
        contaminated_cells: contaminatedHere.length,
        planned_cells: plannedCells,
        infra_void_fraction: infraVoidFraction,
        max_void_breached: maxVoidBreached,
        min_tasks_for_verdict: minTasks,
        ci_degenerate: ciDegenerate,
        sufficient,
      },
      gate: {
        a_guardrail: a,
        b_median_positive: b,
        c_ci_excludes_zero: c,
        d_no_anti_gaming: d,
        verdict,
      },
    });
  }

  return {
    run_valid: runInvalidReasons.length === 0,
    run_invalid_reasons: runInvalidReasons,
    models: globalModels,
    repos: reports,
  };
}

// ---- rendering ------------------------------------------------------------

function fmt(n: number): string {
  return Number.isNaN(n) ? "—" : n.toLocaleString("en-US");
}

export function renderReport(result: AnalysisResult): string {
  const out: string[] = [];
  if (!result.run_valid) {
    out.push(`\n⛔ RUN_INVALID — no verdict. Reasons:`);
    for (const r of result.run_invalid_reasons) out.push(`  - ${r}`);
    out.push(`(fix the harness/grid and re-run; this is distinct from INSUFFICIENT_DATA.)`);
  }
  for (const r of result.repos) {
    out.push(`\n## repo: ${r.repo}  (n=${r.n_tasks} paired tasks)`);
    out.push(`model(s): ${r.models.length ? r.models.join(", ") : "unlabeled"}`);
    if (r.models.length > 1)
      out.push(`⚠ MIXED MODELS in one repo — RUN_INVALID; re-run each arm on the same model.`);
    out.push(
      "| task | passA/passB | total_A | total_B | Δtotal=A−B | Δ% | uncachedΔ(audit) | turnsΔ |",
    );
    out.push("|---|---|---|---|---|---|---|---|");
    for (const t of r.tasks) {
      out.push(
        `| ${t.task} | ${t.passRateA.toFixed(2)}/${t.passRateB.toFixed(2)} | ${fmt(t.totalA)} | ${fmt(
          t.totalB,
        )} | ${fmt(t.deltaTotal)} | ${t.deltaPct.toFixed(1)}% | ${fmt(t.deltaUncached)} | ${fmt(
          t.turnsA - t.turnsB,
        )} |`,
      );
    }
    out.push(
      `\nPRIMARY median Δ total = ${fmt(r.median_delta_total)}  ·  ` +
        `90% CI = [${fmt(r.ci90_delta_total.lo)}, ${fmt(r.ci90_delta_total.hi)}]`,
    );
    out.push(
      `audit  median Δ uncached = ${fmt(r.median_delta_uncached)}  ·  ` +
        `90% CI = [${fmt(r.ci90_delta_uncached.lo)}, ${fmt(r.ci90_delta_uncached.hi)}]` +
        (r.anti_gaming_flag ? "  ·  ⚠ ANTI-GAMING FLAG (total win + uncached blowup)" : ""),
    );
    out.push(
      `guardrail (pass_B ≥ pass_A): ${r.guardrail_pass_count}/${r.n_tasks} (need ≥ ${r.guardrail_needed})`,
    );
    const dq = r.data_quality;
    out.push(
      `data quality: ${dq.paired_tasks} paired · ${dq.void_cells} infra-void · ` +
        `${dq.contaminated_cells} contaminated · ${dq.planned_cells} planned ` +
        `(infra-void ${(dq.infra_void_fraction * 100).toFixed(0)}%${dq.max_void_breached ? " ⛔>20%" : ""})` +
        (dq.ci_degenerate ? " · ⚠ CI degenerate" : ""),
    );
    if (r.under_graded_tasks.length > 0)
      out.push(
        `under-graded task×arm (excluded, <2/3 reps graded): ` +
          r.under_graded_tasks.map((u) => `${u.task}/${u.arm} ${u.graded}<${u.needed}`).join(", "),
      );
    const g = r.gate;
    out.push(
      `gate: (a) guardrail ${g.a_guardrail ? "✓" : "✗"} · (b) median Δtotal>0 ${
        g.b_median_positive ? "✓" : "✗"
      } · (c) CI excludes 0 ${g.c_ci_excludes_zero ? "✓" : "✗"} · (d) no anti-gaming ${
        g.d_no_anti_gaming ? "✓" : "✗"
      }`,
    );
    out.push(`VERDICT: ${g.verdict}`);
    if (r.void_runs.length > 0) {
      out.push(`\ninfra-void runs (reported, not dropped — §2):`);
      for (const v of r.void_runs) out.push(`  - ${v.task} arm ${v.arm} rep ${v.rep}: ${v.reason}`);
    }
    if (r.contaminated_runs.length > 0) {
      out.push(`\ncontaminated runs (outside grid-plan, excluded — §2):`);
      for (const v of r.contaminated_runs) out.push(`  - ${v.task} arm ${v.arm} rep ${v.rep}`);
    }
  }
  return out.join("\n");
}

// ---- selftest: hand-computed median/CI/gate + v2 guards --------------------

function pairRows(
  task: string,
  repo: string,
  totalA: number,
  totalB: number,
  uncA: number,
  uncB: number,
  passA: boolean,
  passB: boolean,
  model?: string,
): RunRow[] {
  return [
    { task, repo, arm: "A", rep: 0, m1_uncached: uncA, m1_total_input: totalA, pass: passA, model },
    { task, repo, arm: "B", rep: 0, m1_uncached: uncB, m1_total_input: totalB, pass: passB, model },
  ];
}

function selftest(): number {
  const checks: [string, boolean][] = [];

  // --- Fixture ESCALATE: PRIMARY=total drives the gate ---------------------
  // Δtotal vector = [10,20,30] (median 20; analytic 90% CI [10,30]); uncached not
  // blown up (Δuncached = +10 each); pass_B ≥ pass_A all → ESCALATE.
  const esc: RunRow[] = [];
  [10, 20, 30].forEach((d, i) =>
    esc.push(...pairRows(`t${i}`, "fix", 100 + d, 100, 50, 40, true, true)),
  );
  const escR = analyzeRuns(esc, { bootstrap: 10_000, seed: 42, minTasks: 1 }).repos[0]!;
  checks.push(["ESC: median Δtotal == 20", escR.median_delta_total === 20]);
  checks.push(["ESC: total CI lo == 10", escR.ci90_delta_total.lo === 10]);
  checks.push(["ESC: total CI hi == 30", escR.ci90_delta_total.hi === 30]);
  checks.push(["ESC: (c) CI excludes 0", escR.gate.c_ci_excludes_zero === true]);
  checks.push(["ESC: no anti-gaming flag", escR.anti_gaming_flag === false]);
  checks.push(["ESC: verdict ESCALATE", escR.gate.verdict === "ESCALATE_TO_R2"]);
  // seed-stability of the analytic CI.
  const esc2 = analyzeRuns(esc, { bootstrap: 10_000, seed: 7, minTasks: 1 }).repos[0]!;
  checks.push([
    "ESC: total CI seed-stable [10,30]",
    esc2.ci90_delta_total.lo === 10 && esc2.ci90_delta_total.hi === 30,
  ]);

  // --- Fixture (e): total-win + uncached-BLOWUP → anti-gaming flag → HOLD ---
  // Δtotal = [10,20,30] (win), but Δuncached = [-20,-20,-20] (B uses MORE uncached).
  const gAme: RunRow[] = [];
  [10, 20, 30].forEach((d, i) =>
    gAme.push(...pairRows(`t${i}`, "fix", 100 + d, 100, 40, 60, true, true)),
  );
  const gAmeR = analyzeRuns(gAme, { bootstrap: 10_000, seed: 42, minTasks: 1 }).repos[0]!;
  checks.push(["(e) anti-gaming flag set", gAmeR.anti_gaming_flag === true]);
  checks.push(["(e) gate (d) fails", gAmeR.gate.d_no_anti_gaming === false]);
  checks.push(["(e) median Δtotal still > 0", gAmeR.gate.b_median_positive === true]);
  checks.push(["(e) verdict HOLD (not ESCALATE)", gAmeR.gate.verdict === "HOLD"]);

  // --- Fixture (c): PRIMARY CI includes 0 → gate (c) fails → HOLD -----------
  // Δtotal = [-5,20,25]: median 20>0 but bootstrap-median CI reaches -5.
  const ci0: RunRow[] = [];
  [-5, 20, 25].forEach((d, i) =>
    ci0.push(...pairRows(`t${i}`, "fix", 100 + d, 100, 50, 40, true, true)),
  );
  const ci0R = analyzeRuns(ci0, { bootstrap: 10_000, seed: 42, minTasks: 1 }).repos[0]!;
  checks.push(["(c) CI includes 0 → (c) fails", ci0R.gate.c_ci_excludes_zero === false]);
  checks.push(["(c) verdict HOLD", ci0R.gate.verdict === "HOLD"]);

  // --- Fixture (c-homogeneity): mixed model labels → RUN_INVALID -----------
  const mixed: RunRow[] = [
    ...pairRows("t0", "fix", 110, 100, 50, 40, true, true, "claude-opus-4-8"),
    ...pairRows("t1", "fix", 120, 100, 50, 40, true, true, "gpt-5.5-fast"),
  ];
  const mixedRes = analyzeRuns(mixed, { bootstrap: 10_000, seed: 42, minTasks: 1 });
  checks.push(["(c) mixed models → run_valid false", mixedRes.run_valid === false]);
  checks.push([
    "(c) mixed models → verdict RUN_INVALID",
    mixedRes.repos[0]!.gate.verdict === "RUN_INVALID",
  ]);

  // --- Fixture (d): infra-void > 20% of planned → RUN_INVALID --------------
  // 5 tasks × 2 arms × 1 rep = 10 planned; 3 infra-void = 30% > 20%.
  const voidy: RunRow[] = [];
  for (let i = 0; i < 5; i++) voidy.push(...pairRows(`t${i}`, "fix", 110, 100, 50, 40, true, true));
  // Mark 3 cells as infra-void (replace their pass with a void_reason).
  voidy[0]!.void_reason = "claude exit 143";
  voidy[0]!.pass = null;
  voidy[2]!.void_reason = "mcp not attached";
  voidy[2]!.pass = null;
  voidy[4]!.void_reason = "is_error/stop_reason=budget";
  voidy[4]!.pass = null;
  const voidyR = analyzeRuns(voidy, { bootstrap: 10_000, seed: 42, minTasks: 1, reps: 1 })
    .repos[0]!;
  checks.push(["(d) max-void breached", voidyR.data_quality.max_void_breached === true]);
  checks.push(["(d) verdict RUN_INVALID", voidyR.gate.verdict === "RUN_INVALID"]);

  // --- Fixture: contamination filtering (§2) -------------------------------
  const cont: RunRow[] = [];
  [10, 20, 30].forEach((d, i) =>
    cont.push(...pairRows(`t${i}`, "fix", 100 + d, 100, 50, 40, true, true)),
  );
  cont.push(...pairRows("leftover", "fix", 999, 100, 50, 40, true, true)); // not in plan
  const planSteps = new Set<string>();
  for (let i = 0; i < 3; i++) {
    planSteps.add(stepKey(`t${i}`, "A", 0));
    planSteps.add(stepKey(`t${i}`, "B", 0));
  }
  const contR = analyzeRuns(cont, { bootstrap: 10_000, seed: 42, minTasks: 1, planSteps })
    .repos[0]!;
  checks.push(["contamination: leftover excluded", contR.n_tasks === 3]);
  checks.push(["contamination: leftover reported", contR.contaminated_runs.length === 2]);
  checks.push([
    "contamination: verdict ESCALATE on the clean 3",
    contR.gate.verdict === "ESCALATE_TO_R2",
  ]);

  // --- Guard: n=1 paired task → INSUFFICIENT_DATA (degenerate-CI trap) ------
  const one = analyzeRuns(
    esc.filter((r) => r.task === "t1"),
    { bootstrap: 10_000, seed: 42 },
  ).repos[0]!;
  checks.push([
    "n=1 → INSUFFICIENT_DATA (not ESCALATE)",
    one.gate.verdict === "INSUFFICIENT_DATA" && one.data_quality.ci_degenerate === true,
  ]);

  // --- Guard: under-graded task×arm (<2/3 reps) excluded --------------------
  // 1 task, 3 planned reps, but arm B has only 1 graded rep (needs ≥2).
  const ug: RunRow[] = [
    { task: "u", repo: "fix", arm: "A", rep: 0, m1_uncached: 50, m1_total_input: 110, pass: true },
    { task: "u", repo: "fix", arm: "A", rep: 1, m1_uncached: 50, m1_total_input: 110, pass: true },
    { task: "u", repo: "fix", arm: "B", rep: 0, m1_uncached: 40, m1_total_input: 100, pass: true },
  ];
  const ugR = analyzeRuns(ug, { bootstrap: 10_000, seed: 42, minTasks: 1, reps: 3 }).repos[0]!;
  checks.push(["under-graded: task excluded", ugR.n_tasks === 0]);
  checks.push(["under-graded: reported", ugR.under_graded_tasks.some((u) => u.arm === "B")]);

  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  console.log(ok ? "\nselftest: OK" : "\nselftest: FAILED");
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

interface GridPlan {
  reps?: number;
  model?: string;
  steps?: { task: string; arm: "A" | "B"; rep: number }[];
}

function main(): number {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.selftest) return selftest();
  if (!flags.runs) {
    console.error(
      "usage: tsx analyze.ts --runs <runs.jsonl> [--out <report.json>] [--grid-plan <plan.json>] | --selftest",
    );
    return 2;
  }
  const rowsText = existsSync(flags.runs) ? readFileSync(flags.runs, "utf8") : "";
  const rows = readJsonl<RunRow>(flags.runs);

  // Staleness guard (§2): record the runs.jsonl row count + content hash.
  const source = {
    runs_path: flags.runs,
    row_count: rows.length,
    sha256: createHash("sha256").update(rowsText).digest("hex"),
  };

  const opts: AnalyzeOpts = {
    bootstrap: flags.bootstrap ? Number(flags.bootstrap) : 10_000,
    seed: flags.seed ? Number(flags.seed) : 1,
  };
  // Contamination + max-void planning from the grid-plan, when supplied.
  if (flags["grid-plan"] && existsSync(flags["grid-plan"])) {
    const plan = readJson<GridPlan>(flags["grid-plan"]);
    if (plan.reps) opts.reps = plan.reps;
    if (Array.isArray(plan.steps) && plan.steps.length) {
      opts.planSteps = new Set(plan.steps.map((s) => stepKey(s.task, s.arm, s.rep)));
      // planned cells per repo — map each plan task to its repo via the rows.
      const taskRepo = new Map<string, string>();
      for (const r of rows) if (!taskRepo.has(r.task)) taskRepo.set(r.task, r.repo);
      const plannedByRepo = new Map<string, number>();
      for (const s of plan.steps) {
        const repo = taskRepo.get(s.task);
        if (!repo) continue;
        plannedByRepo.set(repo, (plannedByRepo.get(repo) ?? 0) + 1);
      }
      opts.plannedByRepo = plannedByRepo;
    }
  }

  const result = analyzeRuns(rows, opts);
  console.log(renderReport(result));

  if (flags.out) {
    writeJson(flags.out, { source, ...result });
    console.log(`\nwrote ${flags.out}`);
  }
  return 0;
}

process.exitCode = main();
