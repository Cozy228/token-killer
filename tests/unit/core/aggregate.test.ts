import { describe, expect, test } from "vitest";

import {
  byDay,
  byMonth,
  byWeek,
  failures,
  fallbackCount,
  lastNDays,
  qualityStatusCounts,
  summarize,
} from "../../../src/core/aggregate.js";
import type { HistoryRecord } from "../../../src/core/history.js";

function record(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    timestamp: "2026-06-01T12:00:00.000Z",
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
    ...overrides,
  };
}

describe("summarize", () => {
  test("sums measured totals and marks the estimate kind as measured", () => {
    const summary = summarize([
      record({ raw_tokens: 100, output_tokens: 25, saved_tokens: 75, duration_ms: 10 }),
      record({ raw_tokens: 300, output_tokens: 100, saved_tokens: 200, duration_ms: 30 }),
    ]);

    expect(summary.estimate_kind).toBe("measured");
    expect(summary.commands).toBe(2);
    expect(summary.raw_tokens).toBe(400);
    expect(summary.output_tokens).toBe(125);
    expect(summary.saved_tokens).toBe(275);
    expect(summary.savings_pct).toBe(68.8); // 275/400
    expect(summary.avg_savings_per_command).toBe(138); // round(275/2)
    expect(summary.total_duration_ms).toBe(40);
  });

  test("empty input yields zeros, not NaN", () => {
    const summary = summarize([]);
    expect(summary.commands).toBe(0);
    expect(summary.savings_pct).toBe(0);
    expect(summary.avg_savings_per_command).toBe(0);
    expect(summary.by_handler).toEqual([]);
  });

  test("by_handler groups, computes pct, and sorts by saved desc", () => {
    const summary = summarize([
      record({ handler: "grep", raw_tokens: 100, saved_tokens: 50 }),
      record({ handler: "grep", raw_tokens: 100, saved_tokens: 50 }),
      record({ handler: "tree", raw_tokens: 1000, saved_tokens: 900 }),
    ]);

    expect(summary.by_handler[0]).toEqual({
      handler: "tree",
      raw: 1000,
      saved: 900,
      pct: 90,
      count: 1,
    });
    expect(summary.by_handler[1]).toEqual({
      handler: "grep",
      raw: 200,
      saved: 100,
      pct: 50,
      count: 2,
    });
  });
});

describe("qualityStatusCounts", () => {
  test("counts the real status values and defaults missing to passed", () => {
    const counts = qualityStatusCounts([
      record({ quality_status: "passed" }),
      record({ quality_status: "inflated" }),
      record({ quality_status: "empty_output" }),
      record({ quality_status: "failure" }),
      record({ quality_status: undefined }),
    ]);

    expect(counts).toEqual({ passed: 2, inflated: 1, empty_output: 1, failure: 1 });
  });
});

describe("failures and fallbackCount", () => {
  const rows = [
    record({ handler: "git-status", quality_status: "passed" }),
    record({ handler: "fallback", quality_status: "passed" }),
    record({ handler: "git-status", quality_status: "failure" }),
    record({ handler: "git-status", quality_status: "inflated" }),
    record({ handler: "git-status", quality_status: "empty_output" }),
  ];

  test("failures = fallback handler OR failure status, not inflated/empty_output", () => {
    expect(failures(rows)).toHaveLength(2);
  });

  test("fallbackCount counts only the fallback handler", () => {
    expect(fallbackCount(rows)).toBe(1);
  });
});

describe("time buckets", () => {
  const rows = [
    record({ timestamp: "2026-06-01T01:00:00.000Z", raw_tokens: 100, saved_tokens: 60 }),
    record({ timestamp: "2026-06-01T23:00:00.000Z", raw_tokens: 100, saved_tokens: 40 }),
    record({ timestamp: "2026-06-02T10:00:00.000Z", raw_tokens: 200, saved_tokens: 100 }),
  ];

  test("byDay groups by UTC day, sorted ascending", () => {
    const days = byDay(rows);
    expect(days.map((d) => d.key)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(days[0]).toEqual({ key: "2026-06-01", commands: 2, raw: 200, saved: 100, pct: 50 });
  });

  test("byMonth groups by UTC month", () => {
    expect(byMonth(rows).map((m) => m.key)).toEqual(["2026-06"]);
  });

  test("byWeek uses ISO week-year keys", () => {
    // 2026-06-01 is a Monday in ISO week 23.
    expect(byWeek(rows).map((w) => w.key)).toEqual(["2026-W23"]);
  });

  test("ISO week handles the year-boundary case", () => {
    // 2027-01-01 is a Friday — still ISO week 53 of week-year 2026.
    const yearEnd = byWeek([record({ timestamp: "2027-01-01T00:00:00.000Z" })]);
    expect(yearEnd[0].key).toBe("2026-W53");
  });
});

describe("lastNDays", () => {
  const now = new Date("2026-06-03T00:00:00.000Z");

  test("returns N daily buckets oldest-first, filling empty days with zero blocks", () => {
    const buckets = lastNDays(
      [record({ timestamp: "2026-06-02T10:00:00.000Z", raw_tokens: 200, saved_tokens: 100 })],
      3,
      now,
    );

    expect(buckets.map((b) => b.key)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(buckets[0]).toEqual({ key: "2026-06-01", commands: 0, raw: 0, saved: 0, pct: 0 });
    expect(buckets[1].saved).toBe(100);
    expect(buckets[2].commands).toBe(0);
  });
});
