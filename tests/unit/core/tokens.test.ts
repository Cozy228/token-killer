import { describe, expect, it } from "vitest";

import { estimateTokens as fromMetrics } from "../../../src/context/metrics.js";
import { estimateTokens as fromSavings } from "../../../src/core/savings.js";
import { estimateTokens } from "../../../src/core/tokens.js";

// Slice 0 (ADR 0004 Decision 8 / metrics-ledger Gap A): one estimator, imported
// everywhere. These assertions fail if a second `chars / 4` copy reappears.
describe("core/tokens estimateTokens", () => {
  it("buckets ASCII at chars/4 and counts CJK as ~1 token each (L2)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    // 4 CJK ideographs ≈ 4 tokens — the old flat chars/4 under-counted this as 1.
    expect(estimateTokens("中文测试")).toBe(4);
  });

  it("is the single source of truth re-exported by savings and metrics", () => {
    expect(fromSavings).toBe(estimateTokens);
    expect(fromMetrics).toBe(estimateTokens);
  });
});
