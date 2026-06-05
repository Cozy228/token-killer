// `tg gain` — RTK-parity savings analytics (ADR 0004 §4). Cold path, read-only,
// fail-open: a missing or corrupt store yields an empty section, never a crash.
// Consumes the pure aggregate.ts helpers and the shared pricing.ts module. Leaves
// core/report.ts (`tg --report`) untouched.

import {
  byDay,
  byMonth,
  byWeek,
  failures,
  lastNDays,
  summarize,
  type GainSummary,
  type TimeBucket,
} from "./aggregate.js";
import {
  listProjectHistories,
  readHistory,
  readProjectMeta,
  type HistoryRecord,
} from "./history.js";
import {
  DEFAULT_INPUT_PRICE_PER_MTOK,
  estimateSavingsUsd,
  priceForModel,
} from "./pricing.js";

type Bucketing = "none" | "daily" | "weekly" | "monthly" | "all";
type Format = "text" | "json" | "csv";

type GainArgs = {
  user: boolean;
  bucketing: Bucketing;
  graph: boolean;
  history?: number; // present ⇒ show recent N rows (default 10)
  failures: boolean;
  quota: boolean;
  quotaModel?: string; // -t <model> override
  format: Format;
  error?: string;
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
      // optional numeric operand; defaults to 10 when absent or non-numeric.
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

export async function runGain(
  argv: string[],
  cwd: string = process.cwd(),
  now: Date = new Date(),
): Promise<number> {
  const args = parseGainArgs(argv);
  if (args.error) {
    process.stderr.write(`tg gain: ${args.error}\n`);
    return 1;
  }

  // Fail-open: an unreadable store surfaces as an empty record set, never a throw.
  let records: HistoryRecord[];
  try {
    records = args.user ? await listProjectHistories() : await readHistory(cwd);
  } catch {
    records = [];
  }

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(buildGainJson(records, args, now), null, 2)}\n`);
    return 0;
  }
  if (args.format === "csv") {
    process.stdout.write(renderCsv(records, args));
    return 0;
  }

  process.stdout.write(await renderText(records, args, now));
  return 0;
}

// ── JSON (ledger ① measured object; the only non-① sibling is the heuristic USD) ──

function buildGainJson(records: HistoryRecord[], args: GainArgs, now: Date): Record<string, unknown> {
  const summary = summarize(records);
  const json: Record<string, unknown> = { ...summary };

  const buckets = bucketsFor(records, args.bucketing, now);
  if (buckets) json.buckets = buckets;
  if (args.graph) json.daily_30d = lastNDays(records, 30, now);
  if (args.history !== undefined) {
    // command text is local-display-only — never in machine output (privacy).
    json.history = recentRows(records, args.history).map((r) => ({
      timestamp: r.timestamp,
      handler: r.handler,
      savings_pct: r.savings_pct,
    }));
  }
  if (args.failures) {
    json.failures = failures(records).map((r) => ({
      timestamp: r.timestamp,
      handler: r.handler,
      quality_status: r.quality_status ?? "passed",
      exit_code: r.exit_code,
    }));
  }
  if (args.quota) json.estimated_savings_usd = quotaObject(records, args.quotaModel);
  return json;
}

// Sibling heuristic estimate — NEVER folded into the measured object, never summed
// with saved_tokens (ADR 0004 §4).
function quotaObject(records: HistoryRecord[], override?: string) {
  return {
    estimate_kind: "heuristic" as const,
    value_usd: round2(estimateSavingsUsd(records, override)),
    model: override ?? "per_row",
    price_per_mtok: override ? priceForModel(override) : DEFAULT_INPUT_PRICE_PER_MTOK,
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function renderCsv(records: HistoryRecord[], args: GainArgs): string {
  const buckets = bucketsFor(records, args.bucketing, new Date(0));
  if (buckets) {
    return [
      "key,commands,raw_tokens,saved_tokens,savings_pct",
      ...buckets.map((b) => `${b.key},${b.commands},${b.raw},${b.saved},${b.pct}`),
      "",
    ].join("\n");
  }
  const s = summarize(records);
  return [
    "commands,raw_tokens,output_tokens,saved_tokens,savings_pct",
    `${s.commands},${s.raw_tokens},${s.output_tokens},${s.saved_tokens},${s.savings_pct}`,
    "",
  ].join("\n");
}

// ── Text ─────────────────────────────────────────────────────────────────────

async function renderText(records: HistoryRecord[], args: GainArgs, now: Date): Promise<string> {
  const summary = summarize(records);
  const sections: string[] = [renderSummary(summary, args.user ? "all projects" : "this project")];

  if (args.user) sections.push(await renderPerProject(records));

  const buckets = bucketsFor(records, args.bucketing, now);
  if (buckets) sections.push(renderBuckets(args.bucketing, buckets));

  if (args.graph) sections.push(renderGraph(lastNDays(records, 30, now)));

  if (args.history !== undefined) sections.push(renderHistory(recentRows(records, args.history)));

  if (args.failures) sections.push(renderFailures(failures(records)));

  if (args.quota) sections.push(renderQuota(records, args.quotaModel));

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

async function renderPerProject(records: HistoryRecord[]): Promise<string> {
  const groups = new Map<string, HistoryRecord[]>();
  for (const record of records) {
    const key = record.project_fingerprint ?? "unknown";
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  const rows = await Promise.all(
    [...groups.entries()].map(async ([fingerprint, group]) => {
      const s = summarize(group);
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

function renderHistory(rows: HistoryRecord[]): string {
  const lines = rows.map(
    (r) => `  ${r.timestamp}  ${r.handler}  ${r.savings_pct}%  ${r.command}`,
  );
  return ["Recent commands:", lines.join("\n") || "  - none"].join("\n");
}

function renderFailures(rows: HistoryRecord[]): string {
  const lines = rows.map(
    (r) => `  ${r.timestamp}  ${r.handler}  ${r.quality_status ?? "passed"}  exit=${r.exit_code}`,
  );
  return ["Failures (fallback handler or tool failure):", lines.join("\n") || "  - none"].join("\n");
}

function renderQuota(records: HistoryRecord[], override?: string): string {
  const q = quotaObject(records, override);
  const assumption = override
    ? `model ${override} @ $${q.price_per_mtok}/Mtok`
    : `per-row pricing, default $${DEFAULT_INPUT_PRICE_PER_MTOK}/Mtok where model unknown`;
  return [
    "Estimated savings (heuristic — NOT a measured token count):",
    `  ~$${q.value_usd.toFixed(2)} (${assumption})`,
  ].join("\n");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function bucketsFor(records: HistoryRecord[], bucketing: Bucketing, now: Date): TimeBucket[] | undefined {
  switch (bucketing) {
    case "daily":
      return lastNDays(records, 30, now);
    case "weekly":
      return byWeek(records);
    case "monthly":
      return byMonth(records);
    case "all":
      return byDay(records);
    default:
      return undefined;
  }
}

function recentRows(records: HistoryRecord[], n: number): HistoryRecord[] {
  return [...records]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, n);
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
