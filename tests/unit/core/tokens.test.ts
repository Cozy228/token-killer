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
    // code/log output ctx actually compresses).
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

// Reference-equivalence corpus (plan 012). Expected values are the EXACT output of
// the estimator at commit 22579d2, pinned so the index-loop rewrite is provably
// output-preserving. If a value changes, the rewrite is wrong (most likely the
// surrogate-pair `units` accounting) — fix the loop, never these numbers.
describe("core/tokens estimateTokens — reference equivalence (plan 012)", () => {
  it.each([
    ["empty string", "", 0],
    ["all whitespace", "   \t\n  ", 2],
    ["ASCII prose", "the quick brown fox jumps", 7],
    ["ASCII code with symbols", "const x = foo.bar(1, 2);", 8],
    ["pure digits", "1234567890", 4],
    ["CJK", "你好世界", 4],
    // Astral skin-tone emoji exercise the ch.length === 2 (2 UTF-16 units) accounting.
    ["astral / surrogate emoji", "👍🏽 code 😀", 5],
    ["mixed blob", "const 名前 = 'héllo'; // 42 👍\n\tok", 12],
  ])("counts %s as a fixed token total", (_label, input, expected) => {
    expect(estimateTokens(input as string)).toBe(expected as number);
  });
});
