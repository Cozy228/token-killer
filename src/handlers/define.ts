import { executeCommand } from "../executor.js";
import type {
  CommandHandler,
  HandlerTraits,
  OmissionDeclaration,
  ParsedCommand,
  RawResult,
  TkOptions,
} from "../types.js";
import { makeFilteredResult } from "./base.js";

// What a handler's format() produces. A bare string is the common case (just the
// compressed output). The object form carries the optional ADR-0001 omission
// declaration and/or a filterError — only `json` surfaces the latter today.
export type FormatResult =
  | string
  | { output: string; omission?: OmissionDeclaration; filterError?: string };

export type HandlerFormat = (
  raw: RawResult,
  command: ParsedCommand,
  options: TkOptions,
) => FormatResult | Promise<FormatResult>;

// Factory for the common handler shape: a passthrough execute (run the real
// command unchanged) plus a filter that computes `output` from the raw result and
// hands it to makeFilteredResult. 31 handlers shared this scaffold verbatim — they
// now declare only what differs (name / programs / match / format). Handlers with
// a genuine custom execute (git-status runs two gits, ruff rewrites argv, npx
// re-dispatches, …) keep their explicit object literal.
export function defineHandler(config: {
  name: string;
  traits?: HandlerTraits;
  programs?: string[];
  match: (command: ParsedCommand) => boolean;
  format: HandlerFormat;
}): CommandHandler {
  const { name, traits, programs, match, format } = config;
  return {
    name,
    ...(traits ? { traits } : {}),
    ...(programs ? { programs } : {}),
    matches: match,
    execute(command) {
      return executeCommand(command);
    },
    async filter(raw, command, options) {
      const result = await format(raw, command, options);
      const norm = typeof result === "string" ? { output: result } : result;
      return makeFilteredResult(
        { name, traits },
        raw,
        norm.output,
        options,
        norm.filterError,
        norm.omission,
      );
    },
  };
}
