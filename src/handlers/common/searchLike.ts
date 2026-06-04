import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

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
    const output = raw.stdout.trim()
      ? `${raw.stdout.trimEnd()}\n`
      : `${raw.stderr || `0 matches for ${searchPattern(command.args)}`}\n`;
    return makeFilteredResult(this.name, raw, output, options);
  },
};
