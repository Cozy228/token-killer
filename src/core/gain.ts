// `tk gain` — RTK-parity savings analytics (ADR 0004 §4). Cold path, read-only,
// fail-open: a missing or corrupt store yields an empty section, never a crash.
// Reads the incremental rollup cache (history.jsonl remains the source of truth).

import { randomUUID } from "node:crypto";

import type { GainSummary, TimeBucket } from "./aggregate.js";
import { projectFingerprint } from "./dataDir.js";
import { readProjectMeta } from "./history.js";
import {
  DEFAULT_INPUT_PRICE_PER_MTOK,
  estimateSavingsUsdFromRollup,
  priceForModel,
} from "./pricing.js";
import {
  allDaysFromRollup,
  dailyBucketsFromRollup,
  emptyRollup,
  ensureProjectRollup,
  listProjectRollups,
  mergeRollups,
  monthBucketsFromRollup,
  rollupToGainSummary,
  weekBucketsFromRollup,
  type MergedRollup,
  type ProjectRollup,
  type RollupFailure,
  type RollupRecent,
} from "./rollup.js";
import { runColdPathTelemetry, type DispatchParams } from "../telemetry/dispatch.js";

type Bucketing = "none" | "daily" | "weekly" | "monthly" | "all";
type Format = "text" | "json" | "csv";

type GainArgs = {
  user: boolean;
  bucketing: Bucketing;
  graph: boolean;
  history?: number;
  failures: boolean;
  quota: boolean;
  quotaModel?: string;
  format: Format;
  error?: string;
};

type GainContext = {
  rollup: MergedRollup;
  perProject: ProjectRollup[];
  userRollup: MergedRollup;
};

const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";

export function parseGainArgs(argv: string[]): GainArgs {
  const args: GainArgs = {
    user: false,
    bucketing: "none",
    graph: false,
    failures: false,
    quota: false,
    format: "text",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--user") args.user = true;
    else if (token === "-p" || token === "--project") args.user = false;
    else if (token === "--daily") args.bucketing = "daily";
    else if (token === "--weekly") args.bucketing = "weekly";
    else if (token === "--monthly") args.bucketing = "monthly";
    else if (token === "--all") args.bucketing = "all";
    else if (token === "--graph") args.graph = true;
    else if (token === "--failures") args.failures = true;
    else if (token === "--quota") args.quota = true;
    else if (token === "-t" || token === "--model") {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined) args.error = `${token} requires a model name`;
      else {
        args.quotaModel = value;
        args.quota = true;
      }
    } else if (token === "--history") {
      const value = argv[i + 1];
      if (value !== undefined && /^\d+$/.test(value)) {
        args.history = Number(value);
        i += 1;
      } else {
        args.history = 10;
      }
    } else if (token === "--json") args.format = "json";
    else if (token === "--csv") args.format = "csv";
    else if (token === "--format") {
      const value = argv[i + 1];
      i += 1;
      if (value === "json" || value === "csv" || value === "text") args.format = value;
      else args.error = `invalid --format '${value ?? ""}' (expected json | csv | text)`;
    } else {
      args.error = `unknown flag '${token}'`;
    }
  }
  return args;
}

async function loadGainContext(cwd: string, user: boolean): Promise<GainContext> {
  try {
    const allProjects = await listProjectRollups();
    const userRollup = mergeRollups(allProjects);
    if (user) {
      return { rollup: userRollup, perProject: allProjects, userRollup };
    }
    const rollup = await ensureProjectRollup(cwd);
    return { rollup, perProject: [rollup], userRollup };
  } catch {
    const empty = emptyRollup(projectFingerprint(cwd));
    return { rollup: empty, perProject: [], userRollup: empty };
  }
}

export async function runGain(
  argv: string[],
  cwd: string = process.cwd(),
  now: Date = new Date(),
  dispatchTelemetry: (params: DispatchParams) => void = runColdPathTelemetry,
): Promise<number> {
  const args = parseGainArgs(argv);
  if (args.error) {
    process.stderr.write(`tk gain: ${args.error}\n`);
    return 1;
  }

  const ctx = await loadGainContext(cwd, args.user);

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(buildGainJson(ctx.rollup, args, now), null, 2)}\n`);
  } else if (args.format === "csv") {
    process.stdout.write(renderCsv(ctx.rollup, args, now));
  } else {
    process.stdout.write(await renderText(ctx, args, now));
  }

  try {
    dispatchTelemetry({ rollup: ctx.userRollup, now, runId: randomUUID() });
  } catch {
    // telemetry must never break gain
  }
  return 0;
}

function buildGainJson(rollup: MergedRollup, args: GainArgs, now: Date): Record<string, unknown> {
  const summary = rollupToGainSummary(rollup);
  const json: Record<string, unknown> = { ...summary };

  const buckets = bucketsFor(rollup, args.bucketing, now);
  if (buckets) json.buckets = buckets;
  if (args.graph) json.daily_30d = dailyBucketsFromRollup(rollup, 30, now);
  if (args.history !== undefined) {
    json.history = recentRows(rollup.recent, args.history).map((r) => ({
      timestamp: r.timestamp,
      handler: r.handler,
      savings_pct: r.savings_pct,
    }));
  }
  if (args.failures) {
    json.failures = rollup.failures.map((r) => ({
      timestamp: r.timestamp,
      handler: r.handler,
      quality_status: r.quality_status,
      exit_code: r.exit_code,
    }));
  }
  if (args.quota) json.estimated_savings_usd = quotaObject(rollup, args.quotaModel);
  return json;
}

function quotaObject(rollup: MergedRollup, override?: string) {
  return {
    estimate_kind: "heuristic" as const,
    value_usd: round2(estimateSavingsUsdFromRollup(rollup.saved_tokens_by_model, override)),
    model: override ?? "per_row",
    price_per_mtok: override ? priceForModel(override) : DEFAULT_INPUT_PRICE_PER_MTOK,
  };
}

function renderCsv(rollup: MergedRollup, args: GainArgs, now: Date): string {
  const buckets = bucketsFor(rollup, args.bucketing, now);
  if (buckets) {
    return [
      "key,commands,raw_tokens,saved_tokens,savings_pct",
      ...buckets.map((b) => `${b.key},${b.commands},${b.raw},${b.saved},${b.pct}`),
      "",
    ].join("\n");
  }
  const s = rollupToGainSummary(rollup);
  return [
    "commands,raw_tokens,output_tokens,saved_tokens,savings_pct",
    `${s.commands},${s.raw_tokens},${s.output_tokens},${s.saved_tokens},${s.savings_pct}`,
    "",
  ].join("\n");
}

async function renderText(ctx: GainContext, args: GainArgs, now: Date): Promise<string> {
  const summary = rollupToGainSummary(ctx.rollup);
  const sections: string[] = [renderSummary(summary, args.user ? "all projects" : "this project")];

  if (args.user) sections.push(await renderPerProject(ctx.perProject));

  const buckets = bucketsFor(ctx.rollup, args.bucketing, now);
  if (buckets) sections.push(renderBuckets(args.bucketing, buckets));

  if (args.graph) sections.push(renderGraph(dailyBucketsFromRollup(ctx.rollup, 30, now)));

  if (args.history !== undefined) {
    sections.push(renderHistory(recentRows(ctx.rollup.recent, args.history)));
  }

  if (args.failures) sections.push(renderFailures(ctx.rollup.failures));

  if (args.quota) sections.push(renderQuota(ctx.rollup, args.quotaModel));

  return `${sections.join("\n\n")}\n`;
}

function renderSummary(s: GainSummary, scope: string): string {
  const top = s.by_handler
    .slice(0, 5)
    .map((h) => `  - ${h.handler}: ${h.pct}% (${h.saved} saved, ${h.count}×)`)
    .join("\n");
  const quality = Object.entries(s.quality_status_counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `  - ${status}: ${count}`)
    .join("\n");
  return [
    `Token savings — ${scope}`,
    `  Commands: ${s.commands}`,
    `  Raw: ${s.raw_tokens} tokens`,
    `  Saved: ${s.saved_tokens} tokens (${s.savings_pct}%)`,
    `  Avg saved/command: ${s.avg_savings_per_command} tokens`,
    "Top handlers:",
    top || "  - none",
    "Quality:",
    quality || "  - none",
  ].join("\n");
}

async function renderPerProject(projects: ProjectRollup[]): Promise<string> {
  const rows = await Promise.all(
    projects.map(async (project) => {
      const s = rollupToGainSummary(project);
      const fingerprint = project.project_fingerprint;
      const meta = fingerprint === "unknown" ? undefined : await readProjectMeta(fingerprint);
      const label = meta?.label ?? shortFingerprint(fingerprint);
      return { label, saved: s.saved_tokens, pct: s.savings_pct, commands: s.commands };
    }),
  );
  rows.sort((a, b) => b.saved - a.saved);
  const lines = rows.map(
    (r) => `  - ${r.label}: ${r.saved} saved (${r.pct}%, ${r.commands} commands)`,
  );
  return ["By project:", lines.join("\n") || "  - none"].join("\n");
}

function renderBuckets(bucketing: Bucketing, buckets: TimeBucket[]): string {
  const title = bucketing === "all" ? "All time (per day)" : `${capitalize(bucketing)} savings`;
  const lines = buckets.map((b) => `  ${b.key}  ${b.saved} saved (${b.pct}%, ${b.commands} cmd)`);
  return [`${title}:`, lines.join("\n") || "  - none"].join("\n");
}

function renderGraph(daily: TimeBucket[]): string {
  const values = daily.map((d) => d.saved);
  return ["Saved tokens — last 30 days:", `  ${sparkline(values)}`].join("\n");
}

function renderHistory(rows: RollupRecent[]): string {
  const lines = rows.map((r) => `  ${r.timestamp}  ${r.handler}  ${r.savings_pct}%  ${r.command}`);
  return ["Recent commands:", lines.join("\n") || "  - none"].join("\n");
}

function renderFailures(rows: RollupFailure[]): string {
  const lines = rows.map(
    (r) => `  ${r.timestamp}  ${r.handler}  ${r.quality_status}  exit=${r.exit_code}`,
  );
  return ["Failures (fallback handler or tool failure):", lines.join("\n") || "  - none"].join(
    "\n",
  );
}

function renderQuota(rollup: MergedRollup, override?: string): string {
  const q = quotaObject(rollup, override);
  const assumption = override
    ? `model ${override} @ $${q.price_per_mtok}/Mtok`
    : `per-row pricing, default $${DEFAULT_INPUT_PRICE_PER_MTOK}/Mtok where model unknown`;
  return [
    "Estimated savings (heuristic — NOT a measured token count):",
    `  ~$${q.value_usd.toFixed(2)} (${assumption})`,
  ].join("\n");
}

function bucketsFor(
  rollup: MergedRollup,
  bucketing: Bucketing,
  now: Date,
): TimeBucket[] | undefined {
  switch (bucketing) {
    case "daily":
      return dailyBucketsFromRollup(rollup, 30, now);
    case "weekly":
      return weekBucketsFromRollup(rollup);
    case "monthly":
      return monthBucketsFromRollup(rollup);
    case "all":
      return allDaysFromRollup(rollup);
    default:
      return undefined;
  }
}

function recentRows(rows: RollupRecent[], n: number): RollupRecent[] {
  return rows.slice(0, n);
}

function sparkline(values: number[]): string {
  const max = Math.max(...values, 0);
  if (max === 0) return SPARK_BLOCKS[0].repeat(values.length);
  return values
    .map((v) => SPARK_BLOCKS[Math.round((v / max) * (SPARK_BLOCKS.length - 1))])
    .join("");
}

function shortFingerprint(fingerprint: string): string {
  return fingerprint.replace(/^repo:/, "").slice(0, 8);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
