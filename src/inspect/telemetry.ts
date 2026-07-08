// Inspect-derived telemetry aggregates (ADR 0004 §5). These are the OPTIONAL extras
// on a telemetry payload — present only on an `ctx inspect`-triggered build, since
// they need a fresh scan. They contain ONLY anonymized aggregate counts: tool
// categories, recommendation types, and source coverage — never raw evidence,
// paths, sessions, repo names, or command examples.

import type { InspectAggregates } from "../telemetry/build.js";
import type { AdviceFinding } from "./advice.js";
import { summarizeOptimizer, type OptimizeAction } from "./optimizeActions.js";
import type { ScanResult } from "./scan.js";

export function buildInspectAggregates(
  scan: ScanResult,
  findings: AdviceFinding[],
  optimizeActions: OptimizeAction[] = [],
): InspectAggregates {
  const tool_category_counts: Record<string, number> = {};
  // Input/output SIZES per category (chars), accumulated alongside the call COUNTS. Same
  // privacy shape: categories, never raw tool names; numbers only.
  const io_chars_by_category: Record<string, { input: number; output: number }> = {};
  for (const o of scan.opportunities) {
    tool_category_counts[o.category] = (tool_category_counts[o.category] ?? 0) + o.count;
    const io = (io_chars_by_category[o.category] ??= { input: 0, output: 0 });
    io.input += o.total_input_chars;
    io.output += o.total_output_chars;
  }

  const recommendation_type_counts: Record<string, number> = {};
  for (const f of findings) {
    recommendation_type_counts[f.type] = (recommendation_type_counts[f.type] ?? 0) + 1;
  }

  // Optimizer deltas (ledger ②) folded to before/after token totals per exposure class.
  // `summarizeOptimizer` is a pure state-diff (earliest before vs latest after per surface),
  // so this never accumulates. Token counts only, keyed by exposure category — never a
  // surface name, path, or body hash.
  const optimize_tokens_by_exposure: Record<string, { before: number; after: number }> = {};
  for (const s of summarizeOptimizer(optimizeActions).surfaces) {
    const e = (optimize_tokens_by_exposure[s.exposure_class] ??= { before: 0, after: 0 });
    e.before += s.before_tokens;
    e.after += s.after_tokens;
  }

  return {
    tool_category_counts,
    recommendation_type_counts,
    source_coverage: {
      session_inventory: scan.session_inventory,
      transcript_coverage: scan.transcript_coverage,
      tool_events: scan.tool_event_count,
    },
    io_chars_by_category,
    optimize_tokens_by_exposure,
  };
}
