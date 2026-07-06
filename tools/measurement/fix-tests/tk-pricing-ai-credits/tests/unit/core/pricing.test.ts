import { describe, expect, test } from "vitest";

import {
  DEFAULT_INPUT_PRICE_PER_MTOK,
  estimateSavingsUsd,
  priceForModel,
  tokensToCredits,
  tokensToUsd,
  usdToCredits,
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
    expect(priceForModel("opus")).toBe(5);
    expect(priceForModel("HAIKU")).toBe(1);
    expect(priceForModel("claude-sonnet-4-6")).toBe(3);
    expect(priceForModel("gpt-5.5")).toBe(5);
  });
});

describe("tokensToUsd", () => {
  test("default price", () => {
    expect(tokensToUsd(1_000_000)).toBe(3);
  });
});

describe("AI Credits (1 credit = $0.01)", () => {
  test("usdToCredits multiplies by 100", () => {
    expect(usdToCredits(3)).toBe(300);
    expect(usdToCredits(0.42)).toBeCloseTo(42, 6);
  });

  test("tokensToCredits = tokensToUsd × 100", () => {
    // 1M tokens at the default $3/Mtok = $3 = 300 credits
    expect(tokensToCredits(1_000_000)).toBe(300);
    expect(tokensToCredits(1_000_000, 5)).toBe(500); // GPT-5.5 rate
  });
});

describe("estimateSavingsUsd", () => {
  test("prices per row by each row's model, defaulting where absent", () => {
    const records = [row(1_000_000), row(1_000_000, "opus")]; // $3 + $5
    expect(estimateSavingsUsd(records)).toBe(8);
  });

  test("-t override forces one model's rate for all rows", () => {
    const records = [row(1_000_000), row(1_000_000, "opus")];
    expect(estimateSavingsUsd(records, "haiku")).toBeCloseTo(2, 6); // 2 × $1
  });
});
