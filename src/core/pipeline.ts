import { recordHistory } from "./history.js";
import { filterWithGenericFallback } from "./fallback.js";
import type { CommandHandler, FilteredResult, ParsedCommand, RawResult, TkOptions } from "../types.js";

export type PipelineResult = {
  raw: RawResult;
  filtered: FilteredResult;
};

export async function runPipeline(
  handler: CommandHandler,
  command: ParsedCommand,
  options: TkOptions,
): Promise<PipelineResult> {
  const raw = await handler.execute(command, options);
  const filtered = await filterWithFallback(handler, raw, command, options);
  await recordHistory(raw, filtered, options);
  return { raw, filtered };
}

export async function filterWithFallback(
  handler: CommandHandler,
  raw: RawResult,
  command: ParsedCommand,
  options: TkOptions,
): Promise<FilteredResult> {
  try {
    return await handler.filter(raw, command, options);
  } catch (error) {
    return filterWithGenericFallback(raw, command, options, error);
  }
}
