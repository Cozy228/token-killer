// Slice 5 — telemetry export (inspect-v1-design.md "Telemetry Export", DESIGN
// §8.3). Disabled by default; only built when `--telemetry-export` is passed.
// Contains ONLY anonymized aggregate metrics — never raw evidence, paths,
// sessions, repo names, command examples, or a stable installation id.

import { VERSION } from "../version.js";
import type { AdviceFinding } from "./advice.js";
import type { ScanResult } from "./scan.js";

export type TelemetryPayload = {
  schemaVersion: "1";
  version: string;
  platform: string;
  durationBucket: string;
  runId: string; // per-run random id; does NOT correlate runs
  toolCategoryCounts: Record<string, number>;
  sourceCoverage: { sessionInventory: number; transcriptCoverage: number; toolEvents: number };
  recommendationTypeCounts: Record<string, number>;
};

function durationBucket(ms: number): string {
  if (ms < 500) return "<500ms";
  if (ms < 2000) return "<2s";
  if (ms < 10_000) return "<10s";
  return ">=10s";
}

// Build the allow-listed payload. `runId` and `durationMs` are injected so the
// caller controls randomness/timing (and tests stay deterministic).
export function buildTelemetry(
  scan: ScanResult,
  findings: AdviceFinding[],
  durationMs: number,
  runId: string,
): TelemetryPayload {
  const toolCategoryCounts: Record<string, number> = {};
  for (const o of scan.opportunities) {
    toolCategoryCounts[o.category] = (toolCategoryCounts[o.category] ?? 0) + o.count;
  }

  const recommendationTypeCounts: Record<string, number> = {};
  for (const f of findings) {
    recommendationTypeCounts[f.type] = (recommendationTypeCounts[f.type] ?? 0) + 1;
  }

  return {
    schemaVersion: "1",
    version: VERSION,
    platform: process.platform,
    durationBucket: durationBucket(durationMs),
    runId,
    toolCategoryCounts,
    sourceCoverage: {
      sessionInventory: scan.session_inventory,
      transcriptCoverage: scan.transcript_coverage,
      toolEvents: scan.tool_event_count,
    },
    recommendationTypeCounts,
  };
}
