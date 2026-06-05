import { describe, expect, test } from "vitest";

import { buildTelemetry } from "../../../src/telemetry/build.js";
import type { HistoryRecord } from "../../../src/core/history.js";

const NOW = new Date("2026-06-10T00:00:00.000Z");

function record(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    timestamp: "2026-06-09T12:00:00.000Z",
    command: "git status",
    handler: "git-status",
    raw_chars: 400,
    output_chars: 100,
    raw_tokens: 100,
    output_tokens: 25,
    saved_tokens: 75,
    savings_pct: 75,
    exit_code: 0,
    duration_ms: 10,
    quality_status: "passed",
    source_adapter: "shell",
    project_fingerprint: "repo:deadbeefcafe",
    ...overrides,
  };
}

function build(records: HistoryRecord[], now = NOW) {
  return buildTelemetry({
    records,
    version: "9.9.9",
    deviceHash: "a".repeat(64),
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    now,
    runId: "run-1",
  });
}

// The allow-list set the payload is PERMITTED to contain (ADR 0004 §5, §8).
const ALLOWED_KEYS = new Set([
  "schema",
  "device_hash",
  "version",
  "os",
  "arch",
  "commands_24h",
  "commands_total",
  "tokens_saved_24h",
  "tokens_saved_total",
  "savings_pct",
  "top_handlers",
  "quality_status_counts",
  "fallback_count",
  "parse_failure_24h",
  "low_savings_handlers",
  "first_seen_days",
  "active_days_30d",
  "source_adapter_mix",
  "estimated_savings_usd_30d",
  "inspect",
  "runId",
]);

describe("buildTelemetry — schema v2 shape", () => {
  test("emits the v2 usage / quality / retention aggregates", () => {
    const t = build([
      record({ saved_tokens: 75, raw_tokens: 100 }),
      record({ handler: "grep", saved_tokens: 25, raw_tokens: 100 }),
    ]);
    expect(t.schema).toBe("2");
    expect(t.commands_total).toBe(2);
    expect(t.tokens_saved_total).toBe(100);
    expect(t.commands_24h).toBe(2);
    expect(t.top_handlers).toEqual(["git-status", "grep"]);
    expect(t.first_seen_days).toBe(9);
    expect(t.active_days_30d).toBe(1);
    expect(t.source_adapter_mix).toEqual({ shell: 2 });
    expect(t.estimated_savings_usd_30d).toBeCloseTo((100 / 1e6) * 3, 6);
  });

  test("quality signals: counts, fallback_count, parse_failure_24h", () => {
    const t = build([
      record({ quality_status: "passed" }),
      record({ handler: "fallback", quality_status: "passed" }),
      record({ quality_status: "failure" }),
      record({ quality_status: "inflated" }),
    ]);
    expect(t.quality_status_counts).toEqual({ passed: 2, failure: 1, inflated: 1 });
    expect(t.fallback_count).toBe(1);
    expect(t.parse_failure_24h).toBe(1);
  });

  test("only inspect-triggered builds carry the optional inspect aggregates", () => {
    expect(build([record()]).inspect).toBeUndefined();
    const withInspect = buildTelemetry({
      records: [record()],
      version: "9.9.9",
      deviceHash: "a".repeat(64),
      firstSeenAt: "2026-06-01T00:00:00.000Z",
      now: NOW,
      runId: "run-1",
      inspect: {
        tool_category_counts: { read: 3 },
        recommendation_type_counts: { delivery: 1 },
        source_coverage: { session_inventory: 1, transcript_coverage: 1, tool_events: 1 },
      },
    });
    expect(withInspect.inspect?.tool_category_counts).toEqual({ read: 3 });
  });
});

describe("buildTelemetry — allow-list is physically enforced (§8)", () => {
  // Rows carry sensitive strings the payload must NEVER surface.
  const sensitive = [
    record({
      command: "deploy --secret=SUPERSECRETTOKEN /private/keys/id_rsa",
      raw_output_path: "/Users/alice/secret-project/raw/output.log",
      project_fingerprint: "repo:beadfacefeed",
    }),
  ];

  test("no top-level key is outside the allow-list", () => {
    const t = build(sensitive);
    for (const key of Object.keys(t)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
  });

  test("the serialized payload cannot contain command text, paths, or repo fingerprints", () => {
    const json = JSON.stringify(build(sensitive));
    expect(json).not.toContain("SUPERSECRETTOKEN");
    expect(json).not.toContain("id_rsa");
    expect(json).not.toContain("/private/keys");
    expect(json).not.toContain("/Users/alice");
    expect(json).not.toContain("secret-project");
    expect(json).not.toContain("beadfacefeed");
  });
});
