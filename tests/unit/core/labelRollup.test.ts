import { describe, expect, test } from "vitest";

import { byCommand, byHost, sourceAdapterMix } from "../../../src/core/aggregate.js";
import type { HistoryRecord } from "../../../src/core/history.js";

function record(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    timestamp: "2026-06-01T12:00:00.000Z",
    command: "git status",
    handler: "git-status",
    source_adapter: "shell",
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

describe("byHost", () => {
  test("rolls up by source_adapter, sorted by saved desc", () => {
    const rows = byHost([
      record({ source_adapter: "shell", raw_tokens: 100, saved_tokens: 70 }),
      record({ source_adapter: "shell", raw_tokens: 100, saved_tokens: 30 }),
      record({ source_adapter: "terminal_tool", raw_tokens: 200, saved_tokens: 150 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["terminal_tool", "shell"]);
    expect(rows[0]).toMatchObject({ key: "terminal_tool", count: 1, saved: 150 });
    expect(rows[1]).toMatchObject({ key: "shell", count: 2, saved: 100, raw: 200 });
  });

  test("absent source_adapter is honestly attributed to shell, never invented", () => {
    const rows = byHost([record({ source_adapter: undefined })]);
    expect(rows).toEqual([{ key: "shell", count: 1, raw: 100, saved: 75, pct: 75 }]);
  });
});

describe("byCommand", () => {
  test("groups identical commands and keeps the empty failure key", () => {
    const rows = byCommand([
      record({ command: "git status" }),
      record({ command: "git status" }),
      record({ command: "", saved_tokens: 0, raw_tokens: 0 }),
    ]);
    const git = rows.find((r) => r.key === "git status");
    expect(git?.count).toBe(2);
    expect(rows.some((r) => r.key === "")).toBe(true);
  });
});

describe("sourceAdapterMix", () => {
  test("counts rows per surface", () => {
    const mix = sourceAdapterMix([
      record({ source_adapter: "shell" }),
      record({ source_adapter: "shell" }),
      record({ source_adapter: "direct_tool" }),
      record({ source_adapter: undefined }),
    ]);
    expect(mix).toEqual({ shell: 3, direct_tool: 1 });
  });
});
