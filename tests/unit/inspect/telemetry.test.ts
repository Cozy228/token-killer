import { describe, expect, test } from "vitest";

import { buildInspectAggregates } from "../../../src/inspect/telemetry.js";
import type { AdviceFinding } from "../../../src/inspect/advice.js";
import type { Opportunity, ScanResult } from "../../../src/inspect/scan.js";

function opp(key: string, category: Opportunity["category"], count: number): Opportunity {
  return {
    key,
    kind: "shell",
    category,
    count,
    share: 0,
    total_output_chars: 0,
    total_output_tokens: 0,
    avg_output_chars: 0,
    max_output_chars: 0,
    total_input_chars: 0,
    total_input_tokens: 0,
    max_input_chars: 0,
    success_count: count,
    failure_count: 0,
    compressible: true,
    governed_deny: 0,
    governed_suggest: 0,
    large_output_count: 0,
  };
}

const scan: ScanResult = {
  inputType: "vscode",
  session_inventory: 9,
  transcript_coverage: 3,
  tool_event_count: 7,
  unknown_time_records: 1,
  coverage_errors: 0,
  opportunities: [opp("git status", "execute_adjacent", 5), opp("read_file", "read", 2)],
};

const findings: AdviceFinding[] = [
  {
    type: "delivery",
    title: "t",
    detail: "d",
    occurrences: 5,
    confidence: 0.9,
    recommendation: "r",
  },
  {
    type: "shell-noise",
    title: "t",
    detail: "d",
    occurrences: 5,
    confidence: 0.8,
    recommendation: "r",
  },
];

describe("buildInspectAggregates — allow-listed aggregates only", () => {
  const t = buildInspectAggregates(scan, findings);

  test("carries category counts, coverage, recommendation type counts", () => {
    expect(t.tool_category_counts).toEqual({ execute_adjacent: 5, read: 2 });
    expect(t.source_coverage).toEqual({
      session_inventory: 9,
      transcript_coverage: 3,
      tool_events: 7,
    });
    expect(t.recommendation_type_counts).toEqual({ delivery: 1, "shell-noise": 1 });
  });

  test("contains NO raw evidence (no command keys / tool labels)", () => {
    const json = JSON.stringify(t);
    // Aggregate category counts are allowed; sanitized command/tool LABELS are not.
    expect(json).not.toContain("git status");
    expect(json).not.toContain("read_file");
  });
});
