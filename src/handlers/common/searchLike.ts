import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { groupGrepOutput, hasFormatFlag } from "./grepFilter.js";

const SEARCH_PROGRAMS = new Set(["rg", "grep"]);

function searchPattern(args: string[]): string {
  return args.find((arg) => !arg.startsWith("-")) ?? "";
}

export const searchLikeHandler: CommandHandler = {
  name: "search-like",

  matches(command) {
    return SEARCH_PROGRAMS.has(command.program);
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    const pattern = searchPattern(command.args);

    if (!raw.stdout.trim()) {
      const output = `${raw.stderr || `0 matches for ${pattern}`}\n`;
      return makeFilteredResult(this.name, raw, output, options);
    }

    // RTK: grep_cmd.rs — explicit format flags (-c/-l/-L/-o/-Z) already produce
    // small output, so they pass through verbatim. Everything else is grouped by
    // file and compressed; if no line parses as a match (e.g. grep without -n,
    // rg --json), fall back to passthrough rather than drop content.
    let output: string;
    if (hasFormatFlag(command.args)) {
      output = `${raw.stdout.trimEnd()}\n`;
    } else {
      output = groupGrepOutput(raw.stdout, pattern) ?? `${raw.stdout.trimEnd()}\n`;
    }

    return makeFilteredResult(this.name, raw, output, options);
  },
};
