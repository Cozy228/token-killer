import { estimateTokens } from "./tokens.js";

export { estimateTokens };

export type Savings = {
  rawChars: number;
  outputChars: number;
  rawTokens: number;
  outputTokens: number;
  savedTokens: number;
  savingsPct: number;
};

export function calculateSavings(raw: string, output: string): Savings {
  const rawChars = raw.length;
  const outputChars = output.length;
  const rawTokens = estimateTokens(raw);
  const outputTokens = estimateTokens(output);
  const savedTokens = Math.max(0, rawTokens - outputTokens);
  const savingsPct = rawTokens === 0 ? 0 : (savedTokens / rawTokens) * 100;

  return {
    rawChars,
    outputChars,
    rawTokens,
    outputTokens,
    savedTokens,
    savingsPct: Number(savingsPct.toFixed(1)),
  };
}
