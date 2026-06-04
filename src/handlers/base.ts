import type { FilteredResult, RawResult, TgOptions } from "../types.js";
import { calculateSavings } from "../core/savings.js";
import { maybeSaveRawOutput } from "../core/rawStore.js";
import { limitOutput } from "../core/outputLimit.js";
import { removeAnsi } from "../core/ansi.js";

export function rawText(raw: RawResult): string {
  return `${raw.stdout}${raw.stderr}`;
}

export function outputOmitsContent(output: string): boolean {
  return output.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return (
      /^\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)$/.test(trimmed) ||
      /^\[\d+ more lines\]$/.test(trimmed) ||
      /^more (lines|chars) \(use tg.*\)$/.test(trimmed) ||
      /^repetitive lines collapsed$/.test(trimmed) ||
      /^.*lines truncated\)$/.test(trimmed) ||
      /^\.\.\. \(more changes truncated\)$/.test(trimmed) ||
      /^- \.\.\. \d+ more$/.test(trimmed) ||
      /^Hidden:$/.test(trimmed) ||
      /^- \d+ (matches|files|packages|errors|commits|branches|dependencies) not shown$/.test(trimmed) ||
      /^Direct sample:$/.test(trimmed)
    );
  });
}

export async function makeFilteredResult(
  handler: string,
  raw: RawResult,
  output: string,
  options: TgOptions,
  filterError?: string,
): Promise<FilteredResult> {
  const unlimitedRaw = removeAnsi(rawText(raw));
  const unlimitedOutput = removeAnsi(output);
  const cleanRaw = limitOutput(unlimitedRaw, options);
  const cleanOutput = limitOutput(unlimitedOutput, options);
  const rawHasContent = cleanRaw.trim().length > 0;
  const outputHasContent = cleanOutput.trim().length > 0;
  const inflationBudget =
    cleanRaw.length <= 200 ? 0 : Math.max(80, Math.floor(cleanRaw.length * 0.05));
  const outputInflatesRaw =
    handler !== "git-diff" &&
    rawHasContent &&
    outputHasContent &&
    cleanOutput.length > cleanRaw.length + inflationBudget;
  const outputTruncatesContent =
    handler !== "git-diff" && rawHasContent && outputHasContent && outputOmitsContent(cleanOutput);
  const qualityStatus = !outputHasContent && rawHasContent
    ? "empty_output"
    : outputInflatesRaw || outputTruncatesContent
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
