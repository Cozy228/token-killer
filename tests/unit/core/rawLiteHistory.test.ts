import { describe, expect, test } from "vitest";

import { summarize } from "../../../src/core/aggregate.js";
import { coerceHistorySizes, type HistoryRecord } from "../../../src/core/history.js";

// A light `--raw` row (recordRawLitePassthrough) is written WITHOUT the byte/token
// fields. Simulate one by casting a row that genuinely lacks them, the same shape
// JSON.parse yields off disk.
function rawLiteRow(): HistoryRecord {
  return {
    timestamp: "2026-06-01T12:00:00.000Z",
    command: "node -e 0",
    handler: "raw",
    source_adapter: "shell",
    exit_code: 0,
    duration_ms: 12,
    quality_status: "passed",
  } as unknown as HistoryRecord;
}

describe("raw-lite history sizes", () => {
  test("coerceHistorySizes fills every absent byte/token field with 0", () => {
    const coerced = coerceHistorySizes(rawLiteRow());
    expect(coerced.raw_chars).toBe(0);
    expect(coerced.output_chars).toBe(0);
    expect(coerced.raw_tokens).toBe(0);
    expect(coerced.output_tokens).toBe(0);
    expect(coerced.saved_tokens).toBe(0);
    expect(coerced.savings_pct).toBe(0);
    // Fields we genuinely know are preserved untouched.
    expect(coerced.exit_code).toBe(0);
    expect(coerced.duration_ms).toBe(12);
  });

  test("coerceHistorySizes leaves a real size unchanged", () => {
    const row = { ...rawLiteRow(), raw_tokens: 500, saved_tokens: 100 } as HistoryRecord;
    const coerced = coerceHistorySizes(row);
    expect(coerced.raw_tokens).toBe(500);
    expect(coerced.saved_tokens).toBe(100);
    expect(coerced.output_tokens).toBe(0); // still-absent field defaulted
  });

  test("summarize never NaN-poisons totals when a row omits sizes", () => {
    const rows = [
      coerceHistorySizes(rawLiteRow()),
      coerceHistorySizes({ ...rawLiteRow(), raw_tokens: 100, saved_tokens: 75 } as HistoryRecord),
    ];
    const summary = summarize(rows);
    expect(Number.isNaN(summary.raw_tokens)).toBe(false);
    expect(Number.isNaN(summary.saved_tokens)).toBe(false);
    expect(summary.raw_tokens).toBe(100);
    expect(summary.saved_tokens).toBe(75);
    expect(summary.commands).toBe(2);
  });
});
