import { routeCommand } from "../router.js";
import type { FilteredResult, ParsedCommand, RawResult, TkOptions } from "../types.js";

export async function filterWithGenericFallback(
  raw: RawResult,
  command: ParsedCommand,
  options: TkOptions,
  error: unknown,
): Promise<FilteredResult> {
  const generic = routeCommand({
    program: "__generic__",
    args: [],
    original: ["__generic__"],
    displayCommand: "__generic__",
  });
  const filtered = await generic.filter(raw, command, options);
  return {
    ...filtered,
    handler: "fallback",
    filterError: error instanceof Error ? error.message : String(error),
  };
}
