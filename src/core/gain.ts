// `ctx gain` — RTK-parity savings analytics (ADR 0004 §4). Cold path, read-only,
// fail-open: a missing or corrupt store yields an empty section, never a crash.
// Reads the incremental rollup cache (history.jsonl remains the source of truth).

import type { GainSummary, TimeBucket } from "./aggregate.js";
import { readConfig } from "./config.js";
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
import type { DispatchParams } from "../telemetry/dispatch.js";

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
  userRollup?: MergedRollup;
  // ADR 0009: session dedup is a SEPARATE dimension — never folded into the rollup
  // totals above, so it can never be summed with filter savings.
  dedup: DedupSummary;
  recentDedup: DedupEvent[];
};

const EMPTY_DEDUP: DedupSummary = { hits: 0, saved_tokens: 0, by_command: [] };

const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";
type TelemetryDispatch = (params: DispatchParams) => void;

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

const RULE_DOUBLE = "═".repeat(60);

// rtk-parity 24-cell efficiency bar: "█████████████████░░░░░░░" for 69.3%.
function meter(pct: number): string {
  const cells = 24;
  const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)));
  return "█".repeat(filled) + "░".repeat(cells - filled);
}

// rtk-parity 10-cell relative Impact bar: each By-Command row's saved tokens as a
// fraction of the table's top saver. Absolute-magnitude, NOT savings_pct.
function impactBar(saved: number, max: number): string {
  const cells = 10;
  const filled = max <= 0 ? 0 : Math.max(0, Math.min(cells, Math.round((saved / max) * cells)));
  return "█".repeat(filled) + "░".repeat(cells - filled);
}

// Trim a By-Command label so a long handler name can't blow out the column.
function truncLabel(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ISO week key (YYYY-Www) → its Monday/Sunday bounds, so the weekly view can read as
// rtk's "05-18 → 05-24" date range instead of the bare ISO ordinal.
function isoWeekBounds(key: string): { start: Date; end: Date } | undefined {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return undefined;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // 0 = Monday
  const week1Mon = new Date(jan4.getTime() - jan4Dow * 86_400_000);
  const start = new Date(week1Mon.getTime() + (week - 1) * 7 * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start, end };
}

function mmdd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Weekly display label: "05-18 → 05-24" (rtk parity). Falls back to the raw key if
// it isn't a well-formed ISO week (defensive — bucket keys are always well-formed).
function weekLabel(key: string): string {
  const b = isoWeekBounds(key);
  return b ? `${mmdd(b.start)} → ${mmdd(b.end)}` : key;
}

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

async function loadGainContext(
  cwd: string,
  user: boolean,
  includeUserRollup: boolean,
): Promise<GainContext> {
  try {
    if (user) {
      const allProjects = await listProjectRollups();
      const userRollup = mergeRollups(allProjects);
      const events = await listAllDedupEvents();
      const dedup = summarizeDedup(events);
      const recentDedup = events;
      return { rollup: userRollup, perProject: allProjects, userRollup, dedup, recentDedup };
    }

    const rollup = await ensureProjectRollup(cwd);
    const events = await readDedupEvents(cwd);
    const dedup = summarizeDedup(events);
    // Keep all events; renderText slices to args.history (don't pre-cap at 100, or
    // `--history N` would honor N>100 for filter rows but silently truncate dedup rows).
    const recentDedup = events;
    const userRollup = includeUserRollup ? mergeRollups(await listProjectRollups()) : undefined;
    return { rollup, perProject: [rollup], userRollup, dedup, recentDedup };
  } catch {
    const empty = emptyRollup(projectFingerprint(cwd));
    return {
      rollup: empty,
      perProject: [],
      userRollup: includeUserRollup ? empty : undefined,
      dedup: EMPTY_DEDUP,
      recentDedup: [],
    };
  }
}

function shouldPrepareTelemetry(dispatchTelemetry?: TelemetryDispatch): boolean {
  if (dispatchTelemetry) return true;
  try {
    return readConfig().telemetry;
  } catch {
    return false;
  }
}

async function dispatchGainTelemetry(
  ctx: GainContext,
  now: Date,
  dispatchTelemetry?: TelemetryDispatch,
): Promise<void> {
  try {
    const dispatch =
      dispatchTelemetry ?? (await import("../telemetry/dispatch.js")).runColdPathTelemetry;
    const { randomUUID } = await import("node:crypto");
    dispatch({ rollup: ctx.userRollup ?? ctx.rollup, now, runId: randomUUID() });
  } catch {
    // telemetry must never break gain
  }
}

export async function runGain(
  argv: string[],
  cwd: string = process.cwd(),
  now: Date = new Date(),
  dispatchTelemetry?: TelemetryDispatch,
): Promise<number> {
  const args = parseGainArgs(argv);
  if (args.error) {
    process.stderr.write(`ctx gain: ${args.error}\n`);
    return 1;
  }

  const prepareTelemetry = shouldPrepareTelemetry(dispatchTelemetry);
  let ctx: GainContext | undefined;

  // A period breakdown (--daily/--weekly/--monthly/--all) is a terminal table, not
  // the HTML showcase. `html` is only ever the default (there is no --html flag), so
  // it reliably means "no terminal format was chosen" — route those to --text and
  // off the slow loadLedgers/browser path. An explicit --json/--csv still wins.
  const output = args.bucketing !== "none" && args.output === "html" ? "text" : args.output;

  if (output === "json") {
    ctx = await loadGainContext(cwd, args.user, prepareTelemetry);
    process.stdout.write(
      `${JSON.stringify(buildGainJson(ctx.rollup, args, now, ctx.dedup), null, 2)}\n`,
    );
  } else if (output === "csv") {
    ctx = await loadGainContext(cwd, args.user, prepareTelemetry);
    process.stdout.write(renderCsv(ctx.rollup, args, now));
  } else if (output === "text") {
    ctx = await loadGainContext(cwd, args.user, prepareTelemetry);
    process.stdout.write(await renderText(ctx, args, now));
  } else {
    // Default: the four-view HTML report (measured / optimizer / governance /
    // quality), opened in the browser — same data the old `gain report` rendered.
    const { emitGainHtml } = await import("./ledger.js");
    await emitGainHtml({ scope: args.user ? "user" : "project", cwd }, now);
  }

  if (prepareTelemetry) {
    ctx ??= await loadGainContext(cwd, args.user, true);
    await dispatchGainTelemetry(ctx, now, dispatchTelemetry);
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

// rtk-parity CSV: a `# <Period> Data` section comment, then a header row, then data.
// Output = Input − Saved (saved = raw − output, so exact). savings_pct at 2 decimals
// like rtk. No time columns. `--all` emits Daily + Weekly + Monthly sections in order.
function csvDaily(buckets: TimeBucket[]): string {
  return [
    "# Daily Data",
    "date,commands,input_tokens,output_tokens,saved_tokens,savings_pct",
    ...buckets.map(
      (b) => `${b.key},${b.commands},${b.raw},${b.raw - b.saved},${b.saved},${b.pct.toFixed(2)}`,
    ),
  ].join("\n");
}

function csvWeekly(buckets: TimeBucket[]): string {
  return [
    "# Weekly Data",
    "week_start,week_end,commands,input_tokens,output_tokens,saved_tokens,savings_pct",
    ...buckets.map((b) => {
      const bounds = isoWeekBounds(b.key);
      const start = bounds ? bounds.start.toISOString().slice(0, 10) : b.key;
      const end = bounds ? bounds.end.toISOString().slice(0, 10) : b.key;
      return `${start},${end},${b.commands},${b.raw},${b.raw - b.saved},${b.saved},${b.pct.toFixed(2)}`;
    }),
  ].join("\n");
}

function csvMonthly(buckets: TimeBucket[]): string {
  return [
    "# Monthly Data",
    "month,commands,input_tokens,output_tokens,saved_tokens,savings_pct",
    ...buckets.map(
      (b) => `${b.key},${b.commands},${b.raw},${b.raw - b.saved},${b.saved},${b.pct.toFixed(2)}`,
    ),
  ].join("\n");
}

function renderCsv(rollup: MergedRollup, args: GainArgs, now: Date): string {
  const sections: string[] = [];
  if (args.bucketing === "all") {
    sections.push(csvDaily(allDaysFromRollup(rollup)));
    sections.push(csvWeekly(weekBucketsFromRollup(rollup)));
    sections.push(csvMonthly(monthBucketsFromRollup(rollup)));
  } else if (args.bucketing === "daily") {
    sections.push(csvDaily(dailyBucketsFromRollup(rollup, 30, now)));
  } else if (args.bucketing === "weekly") {
    sections.push(csvWeekly(weekBucketsFromRollup(rollup)));
  } else if (args.bucketing === "monthly") {
    sections.push(csvMonthly(monthBucketsFromRollup(rollup)));
  } else {
    const s = rollupToGainSummary(rollup);
    return [
      "commands,input_tokens,output_tokens,saved_tokens,savings_pct",
      `${s.commands},${s.raw_tokens},${s.output_tokens},${s.saved_tokens},${s.savings_pct}`,
      "",
    ].join("\n");
  }
  return `${sections.join("\n\n")}\n`;
}

async function renderText(ctx: GainContext, args: GainArgs, now: Date): Promise<string> {
  const sections: string[] = [];

  if (args.bucketing === "all") {
    // rtk `gain --all` parity: three independent tables in D → W → M order, each with
    // its own TOTAL row. Daily uses every active day (not the 30-day --daily window).
    sections.push(renderBuckets("daily", allDaysFromRollup(ctx.rollup)));
    sections.push(renderBuckets("weekly", weekBucketsFromRollup(ctx.rollup)));
    sections.push(renderBuckets("monthly", monthBucketsFromRollup(ctx.rollup)));
    return `${sections.join("\n\n")}\n`;
  }

  const buckets = bucketsFor(ctx.rollup, args.bucketing, now);
  if (buckets) {
    // Focused period view (rtk `gain --weekly` parity): lead with just the breakdown
    // table — its TOTAL row is the summary. The headline/by-command/dedup/per-project
    // blocks belong to the default `ctx gain --text`, not a period drill-down.
    sections.push(renderBuckets(args.bucketing, buckets));
  } else {
    const summary = rollupToGainSummary(ctx.rollup);
    sections.push(renderSummary(summary, args.user ? "Global Scope" : "Project Scope"));
    // ADR 0009: shown as its own block, never folded into the summary above.
    if (ctx.dedup.hits > 0) sections.push(renderDedup(ctx.dedup));
    if (args.user) sections.push(await renderPerProject(ctx.perProject));
  }

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
// read as alarming in a user-facing summary: `inflated` does NOT mean ctx shipped
// bloated output — it means the gate caught a compression that would have grown or
// dropped content and REVERTED to raw (the safe, correct output went out). Relabel
// for display only; the JSON/telemetry surfaces keep the raw status names.
const QUALITY_DISPLAY_LABELS: Record<string, string> = {
  inflated: "reverted-to-raw",
  empty_output: "reverted-to-raw (empty)",
};

// By Command — rtk-parity ranked table (Top 10): rank · Command · Count · Saved ·
// Avg% · Impact. The Impact bar is relative absolute-savings (saved / top saver),
// so it answers "which command family saved the most", distinct from Avg%. No Time
// column and no per-handler `e.g.` samples — both dropped for rtk parity.
function renderByCommand(byHandler: GainSummary["by_handler"]): string {
  const top = byHandler.slice(0, 10);
  if (!top.length) return "By Command\n  - none";

  const maxSaved = Math.max(...top.map((h) => h.saved), 0);
  const cells = top.map((h, i) => ({
    rank: `${i + 1}.`,
    cmd: truncLabel(h.handler, 22),
    count: grp(h.count),
    saved: compact(h.saved),
    pct: `${h.pct}%`,
    impact: impactBar(h.saved, maxSaved),
  }));
  const w = {
    rank: Math.max(1, ...cells.map((c) => c.rank.length)),
    cmd: Math.max("Command".length, ...cells.map((c) => c.cmd.length)),
    count: Math.max("Count".length, ...cells.map((c) => c.count.length)),
    saved: Math.max("Saved".length, ...cells.map((c) => c.saved.length)),
    pct: Math.max("Avg%".length, ...cells.map((c) => c.pct.length)),
  };
  const header = `  ${"#".padStart(w.rank)}  ${"Command".padEnd(w.cmd)}  ${"Count".padStart(w.count)}  ${"Saved".padStart(w.saved)}  ${"Avg%".padStart(w.pct)}  Impact`;
  const lines = cells.map(
    (c) =>
      `  ${c.rank.padStart(w.rank)}  ${c.cmd.padEnd(w.cmd)}  ${c.count.padStart(w.count)}  ${c.saved.padStart(w.saved)}  ${c.pct.padStart(w.pct)}  ${c.impact}`,
  );
  const ruleWidth = Math.max(header.length, ...lines.map((l) => l.length));
  const rule = "─".repeat(ruleWidth);
  return ["By Command", rule, header, rule, ...lines, rule].join("\n");
}

function renderSummary(s: GainSummary, scope: string): string {
  // Headline block — rtk-parity labels (Input/Output tokens, Tokens saved) plus the
  // 24-cell efficiency meter. No exec-time line: ctx's rollup stores no per-command
  // duration and we never fabricate one.
  const head = [
    `📊 Contexa — Token Savings (${scope})`,
    RULE_DOUBLE,
    "",
    `Total commands:   ${grp(s.commands)}`,
    `Input tokens:     ${compact(s.raw_tokens)}`,
    `Output tokens:    ${compact(s.output_tokens)}`,
    `Tokens saved:     ${compact(s.saved_tokens)} (${s.savings_pct}%)`,
    `Avg saved/cmd:    ${compact(s.avg_savings_per_command)}`,
    `Efficiency meter: ${meter(s.savings_pct)} ${s.savings_pct}%`,
  ].join("\n");

  const byCommand = renderByCommand(s.by_handler);

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

// rtk-parity period breakdown: a fixed-width table (Period · Cmds · Input · Output
// · Saved · Save%) bracketed by a ═ title rule and a ─ rule above a TOTAL row.
// Output = Input − Saved (saved_tokens = raw − output, so this is exact). No Time
// column: ctx's rollup stores no per-bucket duration and we never fabricate one.
function renderBuckets(bucketing: Bucketing, buckets: TimeBucket[]): string {
  // rtk-parity title: single-letter prefix + "<Period> Breakdown (N <plural>)".
  const meta = {
    daily: { letter: "D", word: "Daily", plural: "dailys", header: "Date" },
    weekly: { letter: "W", word: "Weekly", plural: "weeklys", header: "Week" },
    monthly: { letter: "M", word: "Monthly", plural: "monthlys", header: "Month" },
  }[bucketing === "all" || bucketing === "none" ? "daily" : bucketing];
  const title = `${meta.letter} ${meta.word} Breakdown (${buckets.length} ${meta.plural})`;
  if (!buckets.length) return [title, "  (no activity in range)"].join("\n");

  // Weekly key is an ISO ordinal (2026-W21); display it as a date range (05-18 → 05-24).
  const periodOf = (key: string) => (bucketing === "weekly" ? weekLabel(key) : key);
  const header = [meta.header, "Cmds", "Input", "Output", "Saved", "Save%"];
  const dataRows = buckets.map((b) => [
    periodOf(b.key),
    grp(b.commands),
    compact(b.raw),
    compact(b.raw - b.saved),
    compact(b.saved),
    `${b.pct}%`,
  ]);
  const t = buckets.reduce(
    (a, b) => ({ commands: a.commands + b.commands, raw: a.raw + b.raw, saved: a.saved + b.saved }),
    { commands: 0, raw: 0, saved: 0 },
  );
  const totalPct = t.raw === 0 ? 0 : Number(((t.saved / t.raw) * 100).toFixed(1));
  const totalRow = [
    "TOTAL",
    grp(t.commands),
    compact(t.raw),
    compact(t.raw - t.saved),
    compact(t.saved),
    `${totalPct}%`,
  ];

  const all = [header, ...dataRows, totalRow];
  const widths = header.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const fmt = (r: string[]) =>
    r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  const ruleWidth = widths.reduce((a, w) => a + w, 0) + (widths.length - 1) * 2;
  const single = "─".repeat(ruleWidth);
  return [
    title,
    "═".repeat(ruleWidth),
    fmt(header),
    single,
    ...dataRows.map(fmt),
    single,
    fmt(totalRow),
  ].join("\n");
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
