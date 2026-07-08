import { describe, expect, test } from "vitest";

import { buildInspectAggregates } from "../../../src/inspect/telemetry.js";
import type { AdviceFinding } from "../../../src/inspect/advice.js";
import type { OptimizeAction } from "../../../src/inspect/optimizeActions.js";
import type { Opportunity, ScanResult } from "../../../src/inspect/scan.js";

function opp(
  key: string,
  category: Opportunity["category"],
  count: number,
  inChars = 0,
  outChars = 0,
): Opportunity {
  return {
    key,
    kind: "shell",
    category,
    count,
    share: 0,
    total_output_chars: outChars,
    total_output_tokens: 0,
    avg_output_chars: 0,
    max_output_chars: 0,
    total_input_chars: inChars,
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
  opportunities: [
    opp("git status", "execute_adjacent", 5, 120, 4000),
    opp("read_file", "read", 2, 40, 800),
  ],
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

const optimizeActions: OptimizeAction[] = [
  {
    surface: "copilot_instructions",
    before_hash: "a",
    after_hash: "b",
    before_tokens: 1000,
    after_tokens: 600,
    exposure_class: "always-on",
    ts: "2026-06-01T00:00:00.000Z",
  },
  {
    surface: "agent_instructions",
    before_hash: "c",
    after_hash: "d",
    before_tokens: 500,
    after_tokens: 300,
    exposure_class: "always-on",
    ts: "2026-06-02T00:00:00.000Z",
  },
  {
    surface: "skill",
    before_hash: "e",
    after_hash: "f",
    before_tokens: 200,
    after_tokens: 150,
    exposure_class: "on-invocation",
    ts: "2026-06-03T00:00:00.000Z",
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
    expect(t.io_chars_by_category).toEqual({
      execute_adjacent: { input: 120, output: 4000 },
      read: { input: 40, output: 800 },
    });
    // No optimize actions passed → empty before/after map (not undefined).
    expect(t.optimize_tokens_by_exposure).toEqual({});
  });

  test("contains NO raw evidence (no command keys / tool labels)", () => {
    const json = JSON.stringify(t);
    // Aggregate category counts are allowed; sanitized command/tool LABELS are not.
    expect(json).not.toContain("git status");
    expect(json).not.toContain("read_file");
  });

  test("optimize_tokens_by_exposure folds optimizer deltas by exposure class", () => {
    const t2 = buildInspectAggregates(scan, findings, optimizeActions);
    expect(t2.optimize_tokens_by_exposure).toEqual({
      "always-on": { before: 1500, after: 900 },
      "on-invocation": { before: 200, after: 150 },
    });
    // Only token counts + exposure categories reach the wire — no surface names or hashes.
    const json = JSON.stringify(t2.optimize_tokens_by_exposure);
    expect(json).not.toContain("copilot_instructions");
    expect(json).not.toContain("before_hash");
  });
});
