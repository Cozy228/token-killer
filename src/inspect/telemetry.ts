// Inspect-derived telemetry aggregates (ADR 0004 §5). These are the OPTIONAL extras
// on a telemetry payload — present only on an `tg inspect`-triggered build, since
// they need a fresh scan. They contain ONLY anonymized aggregate counts: tool
// categories, recommendation types, and source coverage — never raw evidence,
// paths, sessions, repo names, or command examples.

import type { InspectAggregates } from "../telemetry/build.js";
import type { AdviceFinding } from "./advice.js";
import type { ScanResult } from "./scan.js";

export function buildInspectAggregates(scan: ScanResult, findings: AdviceFinding[]): InspectAggregates {
  const tool_category_counts: Record<string, number> = {};
  for (const o of scan.opportunities) {
    tool_category_counts[o.category] = (tool_category_counts[o.category] ?? 0) + o.count;
  }

  const recommendation_type_counts: Record<string, number> = {};
  for (const f of findings) {
    recommendation_type_counts[f.type] = (recommendation_type_counts[f.type] ?? 0) + 1;
  }

  return {
    tool_category_counts,
    recommendation_type_counts,
    source_coverage: {
      session_inventory: scan.session_inventory,
      transcript_coverage: scan.transcript_coverage,
      tool_events: scan.tool_event_count,
    },
  };
}
