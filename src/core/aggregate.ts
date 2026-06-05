// Shared aggregation over measured history rows (ADR 0004 §3). PURE functions, no
// I/O — `tk gain` output and the telemetry payload both derive from here so the two
// can never diverge. This is ledger ① only: it sums measured command savings, never
// invents estimates. I/O (reading the rows) lives in history.ts; these helpers take
// the already-loaded HistoryRecord[].

import type { HistoryRecord } from "./history.js";

export type GainSummary = {
  // metrics-ledger §5: these numbers are MEASURED, not heuristic.
  estimate_kind: "measured";
  commands: number;
  raw_tokens: number;
  output_tokens: number;
  saved_tokens: number;
  savings_pct: number;
  avg_savings_per_command: number;
  total_duration_ms: number;
  // sorted by saved desc; the caller may slice to top-N for display.
  by_handler: Array<{ handler: string; raw: number; saved: number; pct: number; count: number }>;
  quality_status_counts: Record<string, number>;
};

export type TimeBucket = {
  key: string; // day = UTC YYYY-MM-DD, week = ISO year-Www, month = YYYY-MM
  commands: number;
  raw: number;
  saved: number;
  pct: number;
};

// The real fallback handler name set in src/core/fallback.ts. NOT `raw`/`generic`,
// which are ordinary handlers and do not denote an error fallback.
export const FALLBACK_HANDLER = "fallback";

function pct(saved: number, raw: number): number {
  return raw === 0 ? 0 : Number(((saved / raw) * 100).toFixed(1));
}

export function summarize(records: HistoryRecord[]): GainSummary {
  let raw = 0;
  let output = 0;
  let saved = 0;
  let duration = 0;
  const handlers = new Map<string, { raw: number; saved: number; count: number }>();

  for (const record of records) {
    raw += record.raw_tokens;
    output += record.output_tokens;
    saved += record.saved_tokens;
    duration += record.duration_ms;
    const current = handlers.get(record.handler) ?? { raw: 0, saved: 0, count: 0 };
    current.raw += record.raw_tokens;
    current.saved += record.saved_tokens;
    current.count += 1;
    handlers.set(record.handler, current);
  }

  const by_handler = [...handlers.entries()]
    .map(([handler, stats]) => ({
      handler,
      raw: stats.raw,
      saved: stats.saved,
      pct: pct(stats.saved, stats.raw),
      count: stats.count,
    }))
    .sort((a, b) => b.saved - a.saved);

  return {
    estimate_kind: "measured",
    commands: records.length,
    raw_tokens: raw,
    output_tokens: output,
    saved_tokens: saved,
    savings_pct: pct(saved, raw),
    avg_savings_per_command: records.length === 0 ? 0 : Math.round(saved / records.length),
    total_duration_ms: duration,
    by_handler,
    quality_status_counts: qualityStatusCounts(records),
  };
}

// Count rows by the actual quality_status values the code emits: `passed` |
// `inflated` | `empty_output` | `failure` (src/types.ts + handlers/base.ts +
// recordHookFailure). Rows written before the quality gate existed carry no status;
// they were un-gated passthrough successes, so they count as `passed` (keeps the
// counts summing to commands without inventing a category).
export function qualityStatusCounts(records: HistoryRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const status = record.quality_status ?? "passed";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

// Genuinely-wrong rows (ADR 0004 §3): the filter threw and fell back to raw
// (handler === "fallback"), OR a tool failure was recorded (quality_status ===
// "failure"). `inflated`/`empty_output` are NOT failures — they are the gate safely
// keeping raw, the moat working with no info lost.
export function failures(records: HistoryRecord[]): HistoryRecord[] {
  return records.filter(
    (record) => record.handler === FALLBACK_HANDLER || record.quality_status === "failure",
  );
}

// Rows whose handler is the error-fallback (filter exception). Distinct from
// parse/tool failures — kept separate per ADR 0004 §5.
export function fallbackCount(records: HistoryRecord[]): number {
  return records.filter((record) => record.handler === FALLBACK_HANDLER).length;
}

function bucketBy(records: HistoryRecord[], keyOf: (date: Date) => string): TimeBucket[] {
  const buckets = new Map<string, { commands: number; raw: number; saved: number }>();
  for (const record of records) {
    const key = keyOf(new Date(record.timestamp));
    const current = buckets.get(key) ?? { commands: 0, raw: 0, saved: 0 };
    current.commands += 1;
    current.raw += record.raw_tokens;
    current.saved += record.saved_tokens;
    buckets.set(key, current);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, stats]) => ({
      key,
      commands: stats.commands,
      raw: stats.raw,
      saved: stats.saved,
      pct: pct(stats.saved, stats.raw),
    }));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7); // UTC YYYY-MM
}

// ISO 8601 week: weeks start Monday, week 1 is the week with the year's first
// Thursday. Key format `YYYY-Www` (the ISO week-year, which may differ from the
// calendar year near year boundaries).
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // shift to the week's Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function byDay(records: HistoryRecord[]): TimeBucket[] {
  return bucketBy(records, dayKey);
}

export function byWeek(records: HistoryRecord[]): TimeBucket[] {
  return bucketBy(records, isoWeekKey);
}

export function byMonth(records: HistoryRecord[]): TimeBucket[] {
  return bucketBy(records, monthKey);
}

// Daily buckets for the last N calendar days (UTC), oldest first, with empty days
// filled as zero buckets. Used by `tk gain --graph`, which renders empty days as the
// lowest block. `now` is injected for deterministic tests.
export function lastNDays(
  records: HistoryRecord[],
  n = 30,
  now: Date = new Date(),
): TimeBucket[] {
  const present = new Map(byDay(records).map((bucket) => [bucket.key, bucket]));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const result: TimeBucket[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const day = new Date(today.getTime() - i * 24 * 3600 * 1000);
    const key = dayKey(day);
    result.push(present.get(key) ?? { key, commands: 0, raw: 0, saved: 0, pct: 0 });
  }
  return result;
}
