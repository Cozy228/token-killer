import { expect } from "vitest";

import type { FilteredResult } from "../../src/types.js";

export function expectLargeSavings(result: FilteredResult, minimum = 80): void {
  expect(result.rawChars).toBeGreaterThanOrEqual(2000);
  expect(result.savingsPct).toBeGreaterThanOrEqual(minimum);
}

export function expectCriticalContent(output: string, required: string[]): void {
  for (const value of required) {
    expect(output).toContain(value);
  }
}

export function expectNoTokenSavingsByDefault(output: string): void {
  expect(output).not.toContain("## Token Savings");
}

export function expectTokenSavingsInStats(output: string): void {
  expect(output).toContain("## Token Savings");
}
