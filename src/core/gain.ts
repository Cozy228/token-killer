// `tk gain` — RTK-parity savings analytics (ADR 0004 §4). Cold path, read-only,
// fail-open: a missing or corrupt store yields an empty section, never a crash.
// Reads the incremental rollup cache (history.jsonl remains the source of truth).

import { randomUUID } from "node:crypto";

import type { GainSummary, TimeBucket } from "./aggregate.js";
import { projectFingerprint } from "./dataDir.js";
import { gcRawStore } from "./gc.js";
import { readProjectMeta } from "./history.js";
import {
  CROSS_REFERENCE_MODEL,
  DEFAULT_INPUT_PRICE_PER_MTOK,
  estimateSavingsUsdFromRollup,
  priceForModel,
  usdToCredits,
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
import {
  type DedupEvent,
  type DedupSummary,
  listAllDedupEvents,
  readDedupEvents,
  recentDedupEvents,
  summarizeDedup,
} from "./dedupLedger.js";
import { runColdPathTelemetry, type DispatchParams } from "../telemetry/dispatch.js";

type Bucketing = "none" | "daily" | "weekly" | "monthly" | "all";
// Default output is the HTML report (opened in the browser, four ledger views).
// --text/--json/--csv switch to the terminal forms.
type Output = "html" | "text" | "json" | "csv";

type GainArgs = {
  user: boolean;
  bucketing: Bucketing;
  graph: boolean;
  history?: number;
  failures: boolean;
  quota: boolean;
  quotaModel?: string;
  output: Output;
  error?: string;
};

type GainContext = {
  rollup: MergedRollup;
  perProject: ProjectRollup[];
  userRollup: MergedRollup;
  // ADR 0009: session dedup is a SEPARATE dimension — never folded into the rollup
  // totals above, so it can never be summed with filter savings.
  dedup: DedupSummary;
  recentDedup: DedupEvent[];
};

const EMPTY_DEDUP: DedupSummary = { hits: 0, saved_tokens: 0, by_command: [] };

const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";

// rtk-parity terminal formatting (plan 013). Token totals read as compact K/M/B
// (11.6M, 786.7K); discrete counts stay comma-grouped (2,927) so the eye never
// confuses a token total with a run count.
function compact(value: number): string {
  const v = Math.round(value);
  if (!Number.isFinite(v)) return "0";
  const abs = Math.abs(v);
  if (abs < 1000) return String(v);
  for (const [base, suffix] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    if (abs >= base) {
      // One decimal, but drop a trailing .0 so 2,000,000 reads "2M" not "2.0M".
      return `${(v / base).toFixed(1).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return String(v);
}

function grp(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

// A fixed-width column table, rtk-style: left-aligned first column, the rest
// right-aligned, with a `─` rule under the header.
function fixedTable(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : (c ?? "").padStart(widths[i]))).join("  ");
  const rule = "─".repeat(widths.reduce((a, w) => a + w, 0) + (widths.length - 1) * 2);
  return [fmt(header), rule, ...rows.map(fmt)].join("\n");
}

const RULE_DOUBLE = "═".repeat(48);

export function parseGainArgs(argv: string[]): GainArgs {
  const args: GainArgs = {
    user: false,
    bucketing: "none",
    graph: false,
    failures: false,
    quota: false,
    output: "html",
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
    } else if (token === "--text") args.output = "text";
    else if (token === "--json") args.output = "json";
    else if (token === "--csv") args.output = "csv";
    else {
      args.error = `unknown flag '${token}'`;
    }
  }
  return args;
}

async function loadGainContext(cwd: string, user: boolean): Promise<GainContext> {
  try {
    const allProjects = await listProjectRollups();
    const userRollup = mergeRollups(allProjects);
    const events = user ? await listAllDedupEvents() : await readDedupEvents(cwd);
    const dedup = summarizeDedup(events);
    // Keep all events; renderText slices to args.history (don't pre-cap at 100, or
    // `--history N` would honor N>100 for filter rows but silently truncate dedup rows).
    const recentDedup = events;
    if (user) {
      return { rollup: userRollup, perProject: allProjects, userRollup, dedup, recentDedup };
    }
    const rollup = await ensureProjectRollup(cwd);
    return { rollup, perProject: [rollup], userRollup, dedup, recentDedup };
  } catch {
    const empty = emptyRollup(projectFingerprint(cwd));
    return {
      rollup: empty,
      perProject: [],
      userRollup: empty,
      dedup: EMPTY_DEDUP,
      recentDedup: [],
    };
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

  if (args.output === "json") {
    process.stdout.write(
      `${JSON.stringify(buildGainJson(ctx.rollup, args, now, ctx.dedup), null, 2)}\n`,
    );
  } else if (args.output === "csv") {
    process.stdout.write(renderCsv(ctx.rollup, args, now));
  } else if (args.output === "text") {
    process.stdout.write(await renderText(ctx, args, now));
  } else {
    // Default: the four-view HTML report (measured / optimizer / governance /
    // quality), opened in the browser — same data the old `gain report` rendered.
    const { emitGainHtml } = await import("./ledger.js");
    await emitGainHtml({ scope: args.user ? "user" : "project", cwd }, now);
  }

  try {
    dispatchTelemetry({ rollup: ctx.userRollup, now, runId: randomUUID() });
  } catch {
    // telemetry must never break gain
  }

  // H4: GC the raw snapshot dir on this cold path so it cannot grow without bound.
  // Best-effort and fail-open — never blocks or breaks gain.
  await gcRawStore(cwd, now.getTime());
  return 0;
}

function buildGainJson(
  rollup: MergedRollup,
  args: GainArgs,
  now: Date,
  dedup: DedupSummary = EMPTY_DEDUP,
): Record<string, unknown> {
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
  // Estimated value (heuristic): carries AI Credits + USD + a GPT-5.5 cross-ref,
  // strictly apart from the measured token totals above — never summed in.
  if (args.quota) json.estimated_savings = quotaObject(rollup, args.quotaModel);
  // ADR 0009: a SEPARATE key, only when there are hits — never summed into the
  // filter totals above (mirrors VS Code PR #315905's `cacheHit`). Absent when zero
  // so existing JSON consumers are unaffected until the feature is actually used.
  if (dedup.hits > 0) json.session_dedup = dedup;
  return json;
}

function quotaObject(rollup: MergedRollup, override?: string) {
  const usd = estimateSavingsUsdFromRollup(rollup.saved_tokens_by_model, override);
  // Cross-reference figure: re-price every saved token at the well-known model's
  // rate so the OpenAI/Copilot world gets a number it recognizes alongside the
  // Claude default. Always a single-rate override (not per-row).
  const crossUsd = estimateSavingsUsdFromRollup(
    rollup.saved_tokens_by_model,
    CROSS_REFERENCE_MODEL,
  );
  return {
    // The money figure is ESTIMATED (heuristic), kept strictly apart from the
    // measured `saved_tokens` shown in the summary — never conflated.
    estimate_kind: "heuristic" as const,
    // AI Credits is the headline value unit (1 credit = $0.01); USD is retained.
    // Round USD to micro-dollars and derive credits from the rounded USD so the
    // exact 100× relationship holds and sub-cent savings don't round to $0.00
    // (same reason as telemetry's micro-dollar rounding).
    ...valueFields(usd),
    model: override ?? "per_row",
    price_per_mtok: override ? priceForModel(override) : DEFAULT_INPUT_PRICE_PER_MTOK,
    cross_reference: {
      model: CROSS_REFERENCE_MODEL,
      ...valueFields(crossUsd),
      price_per_mtok: priceForModel(CROSS_REFERENCE_MODEL),
    },
  };
}

function valueFields(usd: number): { value_ai_credits: number; value_usd: number } {
  const usdR = Math.round(usd * 1e6) / 1e6;
  return { value_ai_credits: Math.round(usdToCredits(usdR) * 1e4) / 1e4, value_usd: usdR };
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

  // ADR 0009: shown as its own block, never folded into the summary above.
  if (ctx.dedup.hits > 0) sections.push(renderDedup(ctx.dedup));

  if (args.user) sections.push(await renderPerProject(ctx.perProject));

  const buckets = bucketsFor(ctx.rollup, args.bucketing, now);
  if (buckets) sections.push(renderBuckets(args.bucketing, buckets));

  if (args.graph) sections.push(renderGraph(dailyBucketsFromRollup(ctx.rollup, 30, now)));

  if (args.history !== undefined) {
    sections.push(renderHistory(recentRows(ctx.rollup.recent, args.history)));
    if (ctx.recentDedup.length > 0) {
      sections.push(renderDedupHistory(recentDedupEvents(ctx.recentDedup, args.history)));
    }
  }

  if (args.failures) sections.push(renderFailures(ctx.rollup.failures));

  if (args.quota) sections.push(renderQuota(ctx.rollup, args.quotaModel));

  return `${sections.join("\n\n")}\n`;
}

// The stored quality_status values are accurate for the gate's internal logic but
// read as alarming in a user-facing summary: `inflated` does NOT mean tk shipped
// bloated output — it means the gate caught a compression that would have grown or
// dropped content and REVERTED to raw (the safe, correct output went out). Relabel
// for display only; the JSON/telemetry surfaces keep the raw status names.
const QUALITY_DISPLAY_LABELS: Record<string, string> = {
  inflated: "reverted-to-raw",
  empty_output: "reverted-to-raw (empty)",
};

function renderSummary(s: GainSummary, scope: string): string {
  // Headline block — rtk-parity labels (Input/Output tokens, Tokens saved) so the
  // terminal report reads as a scannable summary, not a flat key/value dump.
  const head = [
    `📊 Token Killer — Token Savings · ${scope}`,
    RULE_DOUBLE,
    "",
    `Total commands:   ${grp(s.commands)}`,
    `Input tokens:     ${compact(s.raw_tokens)}`,
    `Output tokens:    ${compact(s.output_tokens)}`,
    `Tokens saved:     ${compact(s.saved_tokens)} (${s.savings_pct}%)`,
    `Avg saved/cmd:    ${compact(s.avg_savings_per_command)}`,
  ].join("\n");

  // By Command — an aligned table (Count / Saved / Avg%). The per-handler `e.g.`
  // samples (d33546c) ride as a dim continuation line under each row so they don't
  // disturb the numeric column alignment.
  const topHandlers = s.by_handler.slice(0, 5);
  const table = fixedTable(
    ["Command", "Count", "Saved", "Avg%"],
    topHandlers.map((h) => [h.handler, grp(h.count), compact(h.saved), `${h.pct}%`]),
  );
  const tableLines = table.split("\n");
  // Re-thread the sample lines after each data row (header + rule are the first 2).
  const withSamples: string[] = tableLines.slice(0, 2);
  topHandlers.forEach((h, i) => {
    withSamples.push(tableLines[i + 2]);
    if (h.samples && h.samples.length) {
      withSamples.push(`    e.g. ${h.samples.slice(0, 2).join(", ")}`);
    }
  });
  const byCommand = topHandlers.length
    ? ["By Command:", withSamples.join("\n")].join("\n")
    : "By Command:\n  - none";

  const quality = Object.entries(s.quality_status_counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `  - ${QUALITY_DISPLAY_LABELS[status] ?? status}: ${count}`)
    .join("\n");

  return [head, "", byCommand, "", "Quality:", quality || "  - none"].join("\n");
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
  if (!buckets.length) return [`${title}:`, "  - none"].join("\n");
  const table = fixedTable(
    ["Period", "Saved", "Avg%", "Commands"],
    buckets.map((b) => [b.key, compact(b.saved), `${b.pct}%`, grp(b.commands)]),
  );
  return [`${title}:`, table].join("\n");
}

function renderGraph(daily: TimeBucket[]): string {
  const values = daily.map((d) => d.saved);
  return ["Saved tokens — last 30 days:", `  ${sparkline(values)}`].join("\n");
}

function renderHistory(rows: RollupRecent[]): string {
  const lines = rows.map((r) => `  ${r.timestamp}  ${r.handler}  ${r.savings_pct}%  ${r.command}`);
  return ["Recent commands:", lines.join("\n") || "  - none"].join("\n");
}

// ADR 0009: the dedup dimension, rendered apart from filter savings and explicitly
// labeled "never summed" so the two are never read as one number.
function renderDedup(d: DedupSummary): string {
  const top = d.by_command
    .slice(0, 5)
    .map((c) => `  - ${c.command}: ${c.hits}× (${c.saved} saved)`)
    .join("\n");
  return [
    "Session dedup — byte-identical repeats suppressed (separate from filter savings, never summed):",
    `  Hits: ${d.hits}`,
    `  Saved: ${d.saved_tokens} tokens`,
    "Top deduped commands:",
    top || "  - none",
  ].join("\n");
}

function renderDedupHistory(rows: DedupEvent[]): string {
  const lines = rows.map(
    (r) => `  ${r.ts}  dedup  ${r.handler}  ${r.saved_tokens} saved  ${r.norm_cmd}`,
  );
  return ["Recent dedup hits (suppressed repeats):", lines.join("\n") || "  - none"].join("\n");
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
    : `per-row pricing, default $${DEFAULT_INPUT_PRICE_PER_MTOK}/Mtok (Sonnet 4.6) where model unknown`;
  const x = q.cross_reference;
  return [
    "Estimated value (heuristic — derived from saved tokens, NOT a measured count):",
    `  ~${q.value_ai_credits.toFixed(0)} AI Credits  (~$${q.value_usd.toFixed(2)}, ${assumption})`,
    `  cross-ref ${x.model}: ~${x.value_ai_credits.toFixed(0)} AI Credits (~$${x.value_usd.toFixed(2)} @ $${x.price_per_mtok}/Mtok)`,
    "  1 AI Credit = $0.01 (GitHub/VS Code usage-based billing)",
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
