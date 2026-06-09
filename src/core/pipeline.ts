import { recordHistory } from "./history.js";
import { filterWithGenericFallback } from "./fallback.js";
import { applySessionDedup } from "./sessionDedup.js";
import type {
  CommandHandler,
  FilteredResult,
  ParsedCommand,
  RawResult,
  TkOptions,
} from "../types.js";

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

  // ADR 0009 session dedup: default-off; a no-op unless enabled AND eligible. On a
  // HIT it returns a marker-substituted result emitted in place of the byte-
  // identical repeat; the saving is counted under the separate `dedup` dimension
  // only (no ledger-① history row), so it is never summed with filter savings.
  // Fail-open: any error here just proceeds with the normal full-output path.
  let deduped: FilteredResult | null = null;
  try {
    deduped = await applySessionDedup({ handler, command, options, raw, filtered });
  } catch {
    deduped = null;
  }
  if (deduped) return { raw, filtered: deduped };

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
