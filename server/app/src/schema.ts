// Server-side mirror of the client's TelemetryPayload v1 (see
// ../../../src/telemetry/build.ts in the CLI repo). The client enforces an
// allow-list when BUILDING the payload; we re-validate on INGEST and `.strip()`
// any unknown keys so the database only ever stores known, typed fields.
//
// Keep this in lockstep with the CLI's TelemetryPayload type. The `schema`
// literal ("2") is the version gate — bump both sides together.
import { z } from "zod";

const CountMap = z.record(z.string(), z.number());

export const InspectAggregatesSchema = z.object({
  tool_category_counts: CountMap,
  recommendation_type_counts: CountMap,
  source_coverage: z.object({
    session_inventory: z.number(),
    transcript_coverage: z.number(),
    tool_events: z.number(),
  }),
});

// Zod objects strip unknown keys by default — so anything outside this
// allow-list (paths, command text, …) is dropped before it can reach the DB.
export const TelemetryPayloadSchema = z.object({
  schema: z.literal("1"),
  device_hash: z.string().min(1).max(128),
  version: z.string().max(64),
  os: z.string().max(32),
  arch: z.string().max(32),
  // usage
  commands_24h: z.number().int().nonnegative(),
  commands_total: z.number().int().nonnegative(),
  tokens_saved_24h: z.number().int(),
  tokens_saved_total: z.number().int(),
  savings_pct: z.number(),
  top_handlers: z.array(z.string().max(64)).max(20),
  // quality
  quality_status_counts: CountMap,
  fallback_count: z.number().int().nonnegative(),
  parse_failure_24h: z.number().int().nonnegative(),
  low_savings_handlers: z.array(z.string().max(64)).max(20),
  // retention
  first_seen_days: z.number().int().nonnegative(),
  active_days_30d: z.number().int().nonnegative(),
  source_adapter_mix: CountMap,
  // pricing
  estimated_savings_usd_30d: z.number(),
  // optional inspect aggregates
  inspect: InspectAggregatesSchema.optional(),
  // per-POST dedup id (not a stable correlator)
  runId: z.string().min(1).max(128),
});

export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;
