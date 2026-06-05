import { describe, expect, test } from "vitest";

import {
  DEFAULT_INPUT_PRICE_PER_MTOK,
  estimateSavingsUsd,
  priceForModel,
  tokensToUsd,
} from "../../../src/core/pricing.js";
import type { HistoryRecord } from "../../../src/core/history.js";

function row(saved: number, model?: string): HistoryRecord {
  return {
    timestamp: "2026-06-01T12:00:00.000Z",
    command: "x",
    handler: "h",
    raw_chars: 0,
    output_chars: 0,
    raw_tokens: saved,
    output_tokens: 0,
    saved_tokens: saved,
    savings_pct: 100,
    exit_code: 0,
    duration_ms: 0,
    model,
  };
}

describe("priceForModel", () => {
  test("absent or unknown model falls back to the default constant", () => {
    expect(priceForModel(undefined)).toBe(DEFAULT_INPUT_PRICE_PER_MTOK);
    expect(priceForModel("totally-made-up")).toBe(DEFAULT_INPUT_PRICE_PER_MTOK);
  });

  test("known aliases and ids resolve, case-insensitively", () => {
    expect(priceForModel("opus")).toBe(15);
    expect(priceForModel("HAIKU")).toBe(0.8);
    expect(priceForModel("claude-sonnet-4-6")).toBe(3);
  });
});

describe("tokensToUsd", () => {
  test("default price", () => {
    expect(tokensToUsd(1_000_000)).toBe(3);
  });
});

describe("estimateSavingsUsd", () => {
  test("prices per row by each row's model, defaulting where absent", () => {
    const records = [row(1_000_000), row(1_000_000, "opus")]; // $3 + $15
    expect(estimateSavingsUsd(records)).toBe(18);
  });

  test("-t override forces one model's rate for all rows", () => {
    const records = [row(1_000_000), row(1_000_000, "opus")];
    expect(estimateSavingsUsd(records, "haiku")).toBeCloseTo(1.6, 6); // 2 × $0.8
  });
});
