// Slice 3b — telemetry payload v1 (ADR 0004 §5). Rebuilt from the shared
// aggregate.ts helpers + quality signals. Aggregation is ALWAYS user-level (the
// caller passes listProjectHistories rows), matching the per-install device_hash.
//
// ALLOW-LIST ENFORCED IN CODE: this builder PHYSICALLY constructs only the fields
// below. It never copies a HistoryRecord wholesale; `top_commands` carries redacted
// stems only (no args/paths). Paths, repo fingerprints, raw_output_path, and
// timestamps-as-evidence can never leak. A test
// asserts this even when rows carry sensitive strings (ADR 0004 §0.6).

import { byDay, fallbackCount, summarize } from "../core/aggregate.js";
import type { HistoryRecord } from "../core/history.js";
import { tokensToCredits, tokensToUsd } from "../core/pricing.js";
import {
  last24hFromRollup,
  rollupToGainSummary,
  savedTokens30dFromRollup,
  topCommandStemsFromRollup,
  type MergedRollup,
} from "../core/rollup.js";
import { topCommandStems } from "./topCommands.js";

const DAY_MS = 86_400_000;
const LOW_SAVINGS_PCT = 20;

// Optional inspect-derived aggregates (ADR 0004 §5): present only on an
// `tk inspect`-triggered build (they require a fresh scan), absent on `tk gain`.
export type InspectAggregates = {
  tool_category_counts: Record<string, number>;
  recommendation_type_counts: Record<string, number>;
  source_coverage: { session_inventory: number; transcript_coverage: number; tool_events: number };
};

export type TelemetryPayload = {
  schema: "1";
  device_hash: string;
  version: string;
  os: string;
  arch: string;
  // usage
  commands_24h: number;
  commands_total: number;
  tokens_saved_24h: number;
  tokens_saved_total: number;
  savings_pct: number;
  top_handlers: string[]; // names only, ≤5
  top_commands: string[]; // redacted stems (program + subcommand), no args/paths, ≤5
  // quality (tk's differentiator over RTK)
  quality_status_counts: Record<string, number>;
  fallback_count: number;
  parse_failure_24h: number;
  low_savings_handlers: string[];
  // retention
  first_seen_days: number;
  active_days_30d: number;
  source_adapter_mix: Record<string, number>;
  // pricing (shared module; default $3/Mtok = Sonnet 4.6). AI Credits is the
  // headline value unit (1 credit = $0.01); USD retained alongside.
  estimated_savings_usd_30d: number;
  estimated_savings_ai_credits_30d: number;
  // optional inspect aggregates
  inspect?: InspectAggregates;
  // per-POST message id for endpoint-side dedup (NOT a stable correlator)
  runId: string;
};

export type BuildTelemetryParams = {
  records: HistoryRecord[]; // user-level history (listProjectHistories)
  version: string;
  deviceHash: string;
  firstSeenAt: string;
  now: Date;
  runId: string;
  inspect?: InspectAggregates;
};

function within(record: HistoryRecord, sinceMs: number): boolean {
  return new Date(record.timestamp).getTime() >= sinceMs;
}

export function buildTelemetry(params: BuildTelemetryParams): TelemetryPayload {
  const { records, now } = params;
  const nowMs = now.getTime();
  const last24h = records.filter((r) => within(r, nowMs - DAY_MS));
  const last30d = records.filter((r) => within(r, nowMs - 30 * DAY_MS));

  const total = summarize(records);
  const day = summarize(last24h);
  const tokensSaved30d = last30d.reduce((sum, r) => sum + r.saved_tokens, 0);

  const sourceAdapterMix: Record<string, number> = {};
  for (const record of records) {
    const key = record.source_adapter ?? "unknown";
    sourceAdapterMix[key] = (sourceAdapterMix[key] ?? 0) + 1;
  }

  const firstSeenDays = Math.max(
    0,
    Math.floor((nowMs - new Date(params.firstSeenAt).getTime()) / DAY_MS),
  );

  // Physically construct ONLY allow-listed fields — never spread a record.
  const payload: TelemetryPayload = {
    schema: "1",
    device_hash: params.deviceHash,
    version: params.version,
    os: process.platform,
    arch: process.arch,
    commands_24h: day.commands,
    commands_total: total.commands,
    tokens_saved_24h: day.saved_tokens,
    tokens_saved_total: total.saved_tokens,
    savings_pct: total.savings_pct,
    top_handlers: total.by_handler.slice(0, 5).map((h) => h.handler),
    top_commands: topCommandStems(records, 5),
    quality_status_counts: total.quality_status_counts,
    fallback_count: fallbackCount(records),
    parse_failure_24h: last24h.filter((r) => r.quality_status === "failure").length,
    low_savings_handlers: total.by_handler
      .filter((h) => h.pct < LOW_SAVINGS_PCT)
      .slice(0, 5)
      .map((h) => h.handler),
    first_seen_days: firstSeenDays,
    active_days_30d: byDay(last30d).length,
    source_adapter_mix: sourceAdapterMix,
    // Round to micro-dollars, not cents: at low volume a genuine sub-cent saving
    // ($0.0003) would round to $0.00 and the metric would read zero (audit #15 —
    // surfaced once the excluded telemetry tests were wired into the gate).
    estimated_savings_usd_30d: Math.round(tokensToUsd(tokensSaved30d) * 1e6) / 1e6,
    estimated_savings_ai_credits_30d: Math.round(tokensToCredits(tokensSaved30d) * 1e4) / 1e4,
    runId: params.runId,
  };
  if (params.inspect) payload.inspect = params.inspect;
  return payload;
}

export type BuildTelemetryRollupParams = {
  rollup: MergedRollup;
  version: string;
  deviceHash: string;
  firstSeenAt: string;
  now: Date;
  runId: string;
  inspect?: InspectAggregates;
};

// Rollup-backed builder — same allow-list as buildTelemetry, no history row reads.
export function buildTelemetryFromRollup(params: BuildTelemetryRollupParams): TelemetryPayload {
  const { rollup, now } = params;
  const nowMs = now.getTime();
  const summary = rollupToGainSummary(rollup);
  const last24h = last24hFromRollup(rollup, now);
  const tokensSaved30d = savedTokens30dFromRollup(rollup, now);
  const cutoff24h = nowMs - DAY_MS;
  const cutoff30d = nowMs - 30 * DAY_MS;

  const parse_failure_24h = rollup.failures.filter(
    (row) => row.quality_status === "failure" && new Date(row.timestamp).getTime() >= cutoff24h,
  ).length;

  let active_days_30d = 0;
  for (const day of Object.keys(rollup.by_day)) {
    if (new Date(`${day}T00:00:00.000Z`).getTime() >= cutoff30d) active_days_30d += 1;
  }

  const firstSeenDays = Math.max(
    0,
    Math.floor((nowMs - new Date(params.firstSeenAt).getTime()) / DAY_MS),
  );

  const payload: TelemetryPayload = {
    schema: "1",
    device_hash: params.deviceHash,
    version: params.version,
    os: process.platform,
    arch: process.arch,
    commands_24h: last24h.commands,
    commands_total: summary.commands,
    tokens_saved_24h: last24h.saved,
    tokens_saved_total: summary.saved_tokens,
    savings_pct: summary.savings_pct,
    top_handlers: summary.by_handler.slice(0, 5).map((h) => h.handler),
    top_commands: topCommandStemsFromRollup(rollup, 5),
    quality_status_counts: summary.quality_status_counts,
    fallback_count: rollup.fallback_count,
    parse_failure_24h,
    low_savings_handlers: summary.by_handler
      .filter((h) => h.pct < LOW_SAVINGS_PCT)
      .slice(0, 5)
      .map((h) => h.handler),
    first_seen_days: firstSeenDays,
    active_days_30d,
    source_adapter_mix: { ...rollup.source_adapter_mix },
    estimated_savings_usd_30d: Math.round(tokensToUsd(tokensSaved30d) * 1e6) / 1e6,
    estimated_savings_ai_credits_30d: Math.round(tokensToCredits(tokensSaved30d) * 1e4) / 1e4,
    runId: params.runId,
  };
  if (params.inspect) payload.inspect = params.inspect;
  return payload;
}
