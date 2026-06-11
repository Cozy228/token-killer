import { describe, expect, it } from "vitest";

import { estimateTokens as fromMetrics } from "../../../src/context/metrics.js";
import { estimateTokens as fromSavings } from "../../../src/core/savings.js";
import { estimateTokens } from "../../../src/core/tokens.js";

// Slice 0 (ADR 0004 Decision 8 / metrics-ledger Gap A): one estimator, imported
// everywhere. These assertions fail if a second `chars / 4` copy reappears.
describe("core/tokens estimateTokens", () => {
  it("segments by content class and counts CJK as ~1 token each (L2)", () => {
    expect(estimateTokens("")).toBe(0);
    // Letters bucket at ~3.8 chars/token (denser than the old flat chars/4 for the
    // code/log output tk actually compresses).
    expect(estimateTokens("abcd")).toBe(2); // 4 / 3.8 → ceil
    // 4 CJK ideographs ≈ 4 tokens — the old flat chars/4 under-counted this as 1.
    expect(estimateTokens("中文测试")).toBe(4);
    // Symbol-heavy text is denser than letters and far denser than the old /4.
    expect(estimateTokens("(){}[];")).toBeGreaterThan(2);
  });

  it("is the single source of truth re-exported by savings and metrics", () => {
    expect(fromSavings).toBe(estimateTokens);
    expect(fromMetrics).toBe(estimateTokens);
  });
});
