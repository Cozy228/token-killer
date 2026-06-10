import { describe, expect, test } from "vitest";

import { calculateSavings, estimateTokens } from "../../src/core/savings.js";

describe("savings", () => {
  test("estimates ASCII at ceil(chars/4) and CJK at ~1 token each (L2)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("中文测试")).toBe(4);
  });

  test("calculates 75 percent savings", () => {
    const result = calculateSavings("a".repeat(4000), "b".repeat(1000));

    expect(result.rawTokens).toBe(1000);
    expect(result.outputTokens).toBe(250);
    expect(result.savedTokens).toBe(750);
    expect(result.savingsPct).toBe(75);
  });

  test("calculates 80 percent savings", () => {
    const result = calculateSavings("a".repeat(10000), "b".repeat(2000));

    expect(result.rawTokens).toBe(2500);
    expect(result.outputTokens).toBe(500);
    expect(result.savedTokens).toBe(2000);
    expect(result.savingsPct).toBe(80);
  });

  test("does not report negative savings when output is longer", () => {
    const result = calculateSavings("a".repeat(1000), "b".repeat(2000));

    expect(result.savedTokens).toBe(0);
    expect(result.savingsPct).toBe(0);
  });
});
