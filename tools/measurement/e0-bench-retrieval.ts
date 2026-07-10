/**
 * e0-bench-retrieval — the E0 standalone ctx retrieval benchmark (MEASUREMENT-DESIGN-V2
 * §1b). Runs FIRST in the ladder; NO agent, NO model spend — pure local MCP calls
 * against a frozen store. A failing E0 stops the ladder (§1b gates).
 *
 * Per task it reuses the make-sandbox arm-B artifacts (frozen store + `.mcp.json`
 * wrapper), spawns `ctx mcp` once (warm), and for each ground-truth query runs
 * N reps of the `context` tool, then drills down each advertised handle once.
 *
 * Analysis is folded into this script (no separate e0-analyze.ts — DECISION, logged
 * in implementation-notes): one pass produces both `e0-rows.jsonl` (per-call rows)
 * and `e0-report.json` (reliability / relevance / drillability + verbatim miss
 * messages for the O-33 guidance check).
 *
 * Metrics (§1b):
 *   - reliability: completion rate (no timeout / no transport error), latency p50/p95;
 *   - relevance:   expected-hit fraction, computed ONLY where the ground truth's
 *                  `expected` is filled — otherwise reported as "ungated";
 *   - actionability: handle drill-down success rate + verbatim miss-message text.
 *
 * Usage:
 *   tsx e0-bench-retrieval.ts --ground-truth <gt.jsonl> --sandboxes <tasksdir> \
 *       [--out <dir>] [--reps 10] [--timeout 60000] [--tasks a,b] \
 *       [--drill-floor 1.0] [--relevance-floor 0.5]
 *
 * `--sandboxes` points at a dir with one make-sandbox output per task
 * (`<tasksdir>/<task>/cellB.env.json`), i.e. run-grid's `<out>/tasks`.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpClient, type CtxMcpConfig, type ToolCallOutcome } from "./mcp-client.ts";
import { readJson, readJsonl, writeJson, writeJsonl } from "./lib.ts";

interface GroundTruthRow {
  task: string;
  repo: string;
  queries: { q: string; mode: "task" | "ref" | "handle" }[];
  expected: { files: string[]; decisions: string[] };
  gates_note?: string;
}

interface CellBEnv {
  repo: string; // canonical armB/repo (cwd for the server)
  mcpConfig: string | null; // path to armB/.mcp.json
}

interface McpConfigFile {
  mcpServers?: { ctx?: CtxMcpConfig };
}

/** One recorded call (query rep or drill-down). */
interface BenchRow {
  task: string;
  repo: string;
  kind: "query" | "drill";
  query_index: number;
  query: string;
  mode: string;
  rep: number;
  handle: string | null;
  completion: ToolCallOutcome["completion"];
  is_error: boolean;
  latency_ms: number;
  n_handles: number;
  handles: string[];
  resolved: boolean | null; // drill-down only
  expected_hit: boolean | null; // gated queries only
  expected_coverage: number | null; // fraction of expected items present, gated only
  miss_message: string; // verbatim text when completion === "miss"
  note?: string;
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

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx] as number;
}

/** Which expected items (files + decisions) appear verbatim in a response? */
function expectedMatches(
  text: string,
  expected: { files: string[]; decisions: string[] },
): {
  hit: boolean;
  coverage: number;
} {
  const items = [...expected.files, ...expected.decisions].filter((s) => s.trim().length > 0);
  if (items.length === 0) return { hit: false, coverage: Number.NaN };
  const found = items.filter((it) => text.includes(it)).length;
  return { hit: found > 0, coverage: found / items.length };
}

function resolveCtxConfig(taskdir: string): { config: CtxMcpConfig; cwd: string } {
  const envPath = join(taskdir, "cellB.env.json");
  if (!existsSync(envPath))
    throw new Error(`no cellB.env.json in ${taskdir} (run make-sandbox first)`);
  const env = readJson<CellBEnv>(envPath);
  if (!env.mcpConfig || !existsSync(env.mcpConfig))
    throw new Error(`cellB.env.json has no usable mcpConfig for ${taskdir}`);
  const cfg = readJson<McpConfigFile>(env.mcpConfig);
  const ctx = cfg.mcpServers?.ctx;
  if (!ctx?.command) throw new Error(`no ctx server in ${env.mcpConfig}`);
  return { config: ctx, cwd: env.repo };
}

async function benchTask(
  gt: GroundTruthRow,
  taskdir: string,
  reps: number,
  timeoutMs: number,
): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  const gated = gt.expected.files.length + gt.expected.decisions.length > 0;
  const { config, cwd } = resolveCtxConfig(taskdir);
  const client = new McpClient(config, cwd);
  try {
    await client.start(timeoutMs);
  } catch (e) {
    // Server failed to even start → every query for this task is a transport-error
    // (recorded, not thrown — the benchmark measures reliability).
    const note = e instanceof Error ? e.message : String(e);
    gt.queries.forEach((q, qi) => {
      for (let rep = 0; rep < reps; rep++) {
        rows.push(
          mkRow(
            gt,
            "query",
            qi,
            q.q,
            q.mode,
            rep,
            null,
            {
              latency_ms: 0,
              completion: "transport-error",
              is_error: true,
              text: "",
              handles: [],
              note,
            },
            gated,
          ),
        );
      }
    });
    client.stop();
    return rows;
  }

  try {
    for (let qi = 0; qi < gt.queries.length; qi++) {
      const q = gt.queries[qi] as { q: string; mode: string };
      const args: Record<string, unknown> =
        q.mode === "ref" ? { ref: q.q } : q.mode === "handle" ? { handle: q.q } : { task: q.q };
      let drillHandles: string[] = [];
      for (let rep = 0; rep < reps; rep++) {
        const outcome = await client.callContext(args, timeoutMs);
        const row = mkRow(gt, "query", qi, q.q, q.mode, rep, null, outcome, gated);
        rows.push(row);
        if (outcome.completion === "hit" && drillHandles.length === 0)
          drillHandles = outcome.handles.slice(0, 8);
      }
      // Drill-down: each advertised handle once (§1b actionability).
      for (const handle of drillHandles) {
        const outcome = await client.callContext({ handle }, timeoutMs);
        const row = mkRow(gt, "drill", qi, q.q, "handle", 0, handle, outcome, false);
        row.resolved = outcome.completion === "hit";
        rows.push(row);
      }
    }
  } finally {
    client.stop();
  }
  return rows;
}

function mkRow(
  gt: GroundTruthRow,
  kind: "query" | "drill",
  qi: number,
  query: string,
  mode: string,
  rep: number,
  handle: string | null,
  outcome: ToolCallOutcome,
  gated: boolean,
): BenchRow {
  const expected =
    kind === "query" && gated
      ? expectedMatches(outcome.text, gt.expected)
      : { hit: false, coverage: Number.NaN };
  return {
    task: gt.task,
    repo: gt.repo.split("/").pop() ?? gt.repo,
    kind,
    query_index: qi,
    query,
    mode,
    rep,
    handle,
    completion: outcome.completion,
    is_error: outcome.is_error,
    latency_ms: outcome.latency_ms,
    n_handles: outcome.handles.length,
    handles: outcome.handles.slice(0, 12),
    resolved: kind === "drill" ? outcome.completion === "hit" : null,
    expected_hit: kind === "query" && gated ? expected.hit : null,
    expected_coverage: kind === "query" && gated ? expected.coverage : null,
    miss_message: outcome.completion === "miss" ? outcome.text : "",
    ...(outcome.note ? { note: outcome.note } : {}),
  };
}

interface ReliabilityBlock {
  total_calls: number;
  completion_counts: Record<string, number>;
  completion_rate: number; // (hit+miss) / total — i.e. no timeout / no transport
  timeouts: number;
  transport_errors: number;
  latency_p50: number;
  latency_p95: number;
}

function reliabilityOf(rows: BenchRow[]): ReliabilityBlock {
  const counts: Record<string, number> = {};
  const lats: number[] = [];
  for (const r of rows) {
    counts[r.completion] = (counts[r.completion] ?? 0) + 1;
    if (r.completion === "hit" || r.completion === "miss") lats.push(r.latency_ms);
  }
  lats.sort((a, b) => a - b);
  const total = rows.length;
  const completed = (counts.hit ?? 0) + (counts.miss ?? 0);
  return {
    total_calls: total,
    completion_counts: counts,
    completion_rate: total === 0 ? 0 : completed / total,
    timeouts: counts.timeout ?? 0,
    transport_errors: counts["transport-error"] ?? 0,
    latency_p50: percentile(lats, 0.5),
    latency_p95: percentile(lats, 0.95),
  };
}

function buildReport(
  rows: BenchRow[],
  meta: { ground_truth: string; tasks: number; reps: number; timeout_ms: number },
  gates: { drillFloor: number; relevanceFloor: number | null },
): Record<string, unknown> {
  const queryRows = rows.filter((r) => r.kind === "query");
  const drillRows = rows.filter((r) => r.kind === "drill");

  // relevance — gated queries only.
  const gatedQ = queryRows.filter((r) => r.expected_hit !== null);
  const ungatedQ = queryRows.length - gatedQ.length;
  const expectedHitFraction =
    gatedQ.length === 0
      ? null
      : gatedQ.filter((r) => r.expected_hit === true).length / gatedQ.length;

  // per-repo reliability.
  const repos = [...new Set(rows.map((r) => r.repo))].sort();
  const perRepo: Record<string, ReliabilityBlock> = {};
  for (const repo of repos) perRepo[repo] = reliabilityOf(rows.filter((r) => r.repo === repo));

  // per-task relevance summary.
  const perTask = [...new Set(queryRows.map((r) => r.task))].sort().map((task) => {
    const tq = queryRows.filter((r) => r.task === task);
    const g = tq.filter((r) => r.expected_hit !== null);
    return {
      task,
      gated: g.length > 0,
      expected_hit_fraction:
        g.length === 0 ? null : g.filter((r) => r.expected_hit).length / g.length,
      queries: tq.length,
    };
  });

  // drillability.
  const resolved = drillRows.filter((r) => r.resolved === true).length;
  const drillRate = drillRows.length === 0 ? Number.NaN : resolved / drillRows.length;

  // verbatim miss messages (deduped w/ counts) — the O-33 guidance check surface.
  const missMap = new Map<string, number>();
  for (const r of rows)
    if (r.miss_message) missMap.set(r.miss_message, (missMap.get(r.miss_message) ?? 0) + 1);
  const missMessages = [...missMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([text, count]) => ({ count, text }));

  const overall = reliabilityOf(rows);
  const timeoutRate = overall.total_calls === 0 ? 0 : overall.timeouts / overall.total_calls;

  // gate verdict (§1b): timeout ≈ 0 · drillability ≈ 1 · relevance floor (only if provided).
  const timeoutOk = overall.timeouts === 0;
  const drillOk = Number.isNaN(drillRate) ? true : drillRate >= gates.drillFloor;
  let relevanceVerdict: "PASS" | "FAIL" | "UNGATED";
  if (gates.relevanceFloor === null || expectedHitFraction === null) relevanceVerdict = "UNGATED";
  else relevanceVerdict = expectedHitFraction >= gates.relevanceFloor ? "PASS" : "FAIL";
  const verdict =
    !timeoutOk || !drillOk || relevanceVerdict === "FAIL"
      ? "FAIL"
      : relevanceVerdict === "UNGATED"
        ? "PARTIAL_UNGATED"
        : "PASS";

  return {
    source: meta,
    reliability: { overall, per_repo: perRepo },
    relevance: {
      gated_queries: gatedQ.length,
      ungated_queries: ungatedQ,
      expected_hit_fraction: expectedHitFraction,
      per_task: perTask,
    },
    drillability: { total_drills: drillRows.length, resolved, rate: drillRate },
    miss_messages: missMessages,
    gates: {
      timeout_rate: timeoutRate,
      timeout_ok: timeoutOk,
      drill_floor: gates.drillFloor,
      drillability_ok: drillOk,
      relevance_floor: gates.relevanceFloor,
      relevance_verdict: relevanceVerdict,
      verdict,
    },
  };
}

async function main(): Promise<number> {
  const f = flags(process.argv.slice(2));
  if (!f["ground-truth"] || !f.sandboxes) {
    console.error(
      "usage: tsx e0-bench-retrieval.ts --ground-truth <gt.jsonl> --sandboxes <tasksdir> " +
        "[--out <dir>] [--reps 10] [--timeout 60000] [--tasks a,b] [--drill-floor 1.0] [--relevance-floor 0.5]",
    );
    return 2;
  }
  const gtPath = resolve(f["ground-truth"]);
  const sandboxes = resolve(f.sandboxes);
  const outDir = resolve(f.out ?? join(sandboxes, "..", "e0"));
  const reps = f.reps ? Number(f.reps) : 10;
  const timeoutMs = f.timeout ? Number(f.timeout) : 60_000;
  const drillFloor = f["drill-floor"] ? Number(f["drill-floor"]) : 1.0;
  const relevanceFloor = f["relevance-floor"] ? Number(f["relevance-floor"]) : null;
  const taskFilter = f.tasks ? new Set(f.tasks.split(",").map((s) => s.trim())) : null;

  if (timeoutMs >= 300_000)
    console.error(
      `warn: --timeout ${timeoutMs}ms is at/above the 300s hang ceiling — E-9 wants it well below`,
    );

  let gt = readJsonl<GroundTruthRow>(gtPath);
  if (taskFilter) gt = gt.filter((r) => taskFilter.has(r.task));
  if (gt.length === 0) {
    console.error(`no ground-truth rows to run (path ${gtPath}, filter ${f.tasks ?? "none"})`);
    return 1;
  }

  const allRows: BenchRow[] = [];
  for (const row of gt) {
    const taskdir = join(sandboxes, row.task);
    if (!existsSync(taskdir)) {
      console.error(`skip ${row.task}: no sandbox at ${taskdir}`);
      continue;
    }
    console.log(`E0 task ${row.task}: ${row.queries.length} query × ${reps} reps …`);
    const rows = await benchTask(row, taskdir, reps, timeoutMs);
    allRows.push(...rows);
    const q = rows.filter((r) => r.kind === "query");
    const to = q.filter((r) => r.completion === "timeout").length;
    const te = q.filter((r) => r.completion === "transport-error").length;
    console.log(
      `  ${q.length} query calls · timeouts=${to} transport-errors=${te} · ` +
        `drills=${rows.filter((r) => r.kind === "drill").length}`,
    );
  }

  if (allRows.length === 0) {
    console.error("no calls recorded (no sandboxes found?)");
    return 1;
  }

  const rowsPath = join(outDir, "e0-rows.jsonl");
  const reportPath = join(outDir, "e0-report.json");
  writeJsonl(rowsPath, allRows);
  const report = buildReport(
    allRows,
    { ground_truth: gtPath, tasks: gt.length, reps, timeout_ms: timeoutMs },
    { drillFloor, relevanceFloor },
  );
  writeJson(reportPath, report);

  const gates = report.gates as Record<string, unknown>;
  console.log(`\nE0 verdict: ${gates.verdict}`);
  console.log(
    `  reliability: timeout_rate=${gates.timeout_rate} · drillability=${
      (report.drillability as { rate: number }).rate
    } (floor ${drillFloor})`,
  );
  console.log(
    `  relevance: ${gates.relevance_verdict} (expected-hit fraction=${
      (report.relevance as { expected_hit_fraction: number | null }).expected_hit_fraction
    }, floor ${relevanceFloor ?? "unset"})`,
  );
  console.log(`  rows → ${rowsPath}\n  report → ${reportPath}`);
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});
