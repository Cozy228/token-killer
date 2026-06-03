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
  const cleanRaw = limitOutput(removeAnsi(rawText(raw)), options);
  const cleanOutput = limitOutput(removeAnsi(output), options);
  const rawHasContent = cleanRaw.trim().length > 0;
  const outputHasContent = cleanOutput.trim().length > 0;
  const outputInflatesRaw = rawHasContent && outputHasContent && cleanOutput.length > cleanRaw.length;
  const qualityStatus = !outputHasContent && rawHasContent
    ? "empty_output"
    : outputInflatesRaw
    ? "inflated"
    : "passed";
  const limited = qualityStatus === "passed" ? cleanOutput : cleanRaw;
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
    qualityStatus,
  };
}
