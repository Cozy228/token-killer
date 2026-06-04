import { expect } from "vitest";

import type { FilteredResult } from "../../src/types.js";

const STRUCTURAL_HEADER =
  /^(Git Log|Git Diff|Current:|Branches:|\.|\.\.\. \+\d+ more changed lines|Large diff hidden\.|Large patch hidden\.)$/;

export function stripStructuralHeaders(output: string): string {
  return output
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (STRUCTURAL_HEADER.test(trimmed)) return false;
      if (/^- \d+ (matches|commits|branches|dependencies|errors|packages) not shown/.test(trimmed)) {
        return false;
      }
      if (/^showing (up to )?\d+/.test(trimmed)) return false;
      if (/^\(\d+ matches?, showing \d+\)$/.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

export function expectMeaningfulBody(output: string, minimum = 10): void {
  expect(stripStructuralHeaders(output).length).toBeGreaterThan(minimum);
}

export function expectCompactPassthrough(result: FilteredResult, slack = 10): void {
  expect(result.outputChars).toBeLessThanOrEqual(result.rawChars + slack);
}

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
