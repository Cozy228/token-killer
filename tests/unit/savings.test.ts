import { describe, expect, test } from "vitest";

import { calculateSavings, estimateTokens } from "../../src/core/savings.js";

describe("savings", () => {
  test("segments by content: letters ~3.8 cpt, CJK ~1 token each (L2)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(2); // 4 / 3.8 → ceil
    expect(estimateTokens("中文测试")).toBe(4); // 4 CJK codepoints
  });

  test("code/symbols tokenize denser than prose (the tool-output correction)", () => {
    // Symbol-heavy text costs more tokens per char than the old flat /4 implied:
    // 12 symbols / 2.2 ≈ 6 tokens, vs 12 / 4 = 3 under the old heuristic.
    const symbols = "{}[]();:=>,.";
    expect(estimateTokens(symbols)).toBeGreaterThan(Math.ceil(symbols.length / 4));
  });

  test("whitespace runs collapse — indentation is cheap", () => {
    // A long run of spaces costs ~chars/6, far less than one-per-char or the old
    // flat chars/4 (24 spaces → ~4 tokens, not 6).
    expect(estimateTokens(" ".repeat(24))).toBeLessThan(24 / 4);
  });

  test("ratio survives the口径 change (~75% savings)", () => {
    const result = calculateSavings("a".repeat(4000), "b".repeat(1000));
    expect(result.savedTokens).toBe(result.rawTokens - result.outputTokens);
    expect(result.savingsPct).toBeGreaterThan(73);
    expect(result.savingsPct).toBeLessThan(77);
  });

  test("does not report negative savings when output is longer", () => {
    const result = calculateSavings("a".repeat(1000), "b".repeat(2000));

    expect(result.savedTokens).toBe(0);
    expect(result.savingsPct).toBe(0);
  });
});
