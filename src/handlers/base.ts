import type { FilteredResult, RawResult, TgOptions } from "../types.js";
import { calculateSavings } from "../core/savings.js";
import { maybeSaveRawOutput } from "../core/rawStore.js";
import { limitOutput } from "../core/outputLimit.js";
import { removeAnsi } from "../core/ansi.js";

export function rawText(raw: RawResult): string {
  return `${raw.stdout}${raw.stderr}`;
}

export async function makeFilteredResult(
  handler: string,
  raw: RawResult,
  output: string,
  options: TgOptions,
  filterError?: string,
): Promise<FilteredResult> {
  const limited = limitOutput(removeAnsi(output), options);
  const rawOutputPath = await maybeSaveRawOutput(raw, options);
  const savings = calculateSavings(rawText(raw), limited);

  return {
    handler,
    output: limited,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath,
    exitCode: raw.exitCode,
    filterError,
  };
}
