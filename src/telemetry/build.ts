// Slice 3b — telemetry payload v2 (ADR 0004 §5). Rebuilt from the shared
// aggregate.ts helpers + quality signals. Aggregation is ALWAYS user-level (the
// caller passes listProjectHistories rows), matching the per-install device_hash.
//
// ALLOW-LIST ENFORCED IN CODE: this builder PHYSICALLY constructs only the fields
// below. It never copies a HistoryRecord wholesale, so command text, paths, repo
// fingerprints, raw_output_path, and timestamps-as-evidence can never leak. A test
// asserts this even when rows carry sensitive strings (ADR 0004 §0.6).

import { byDay, fallbackCount, summarize } from "../core/aggregate.js";
import type { HistoryRecord } from "../core/history.js";
import { tokensToUsd } from "../core/pricing.js";

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
  schema: "2";
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
  // quality (tk's differentiator over RTK)
  quality_status_counts: Record<string, number>;
  fallback_count: number;
  parse_failure_24h: number;
  low_savings_handlers: string[];
  // retention
  first_seen_days: number;
  active_days_30d: number;
  source_adapter_mix: Record<string, number>;
  // pricing (shared module; default $3/Mtok)
  estimated_savings_usd_30d: number;
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
    schema: "2",
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
    runId: params.runId,
  };
  if (params.inspect) payload.inspect = params.inspect;
  return payload;
}
