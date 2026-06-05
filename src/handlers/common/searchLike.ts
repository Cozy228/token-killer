import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { groupGrepOutput, hasFormatFlag } from "./grepFilter.js";

const SEARCH_PROGRAMS = new Set(["rg", "grep"]);

function searchPattern(args: string[]): string {
  return args.find((arg) => !arg.startsWith("-")) ?? "";
}

// RTK: grep_cmd.rs::run — RTK re-invokes the search with `-nH` so every match is
// emitted as `file:line:content`, which is what the grouping parser needs. A raw
// `grep -r pattern dir` omits line numbers (and, for a single file, the filename),
// so tg cannot group it and falls back to passthrough (0% savings). Forcing `-n`
// and `-H` on `grep` invocations restores the parseable shape, and the per-file /
// global caps then compress a large recursive grep.
//
// rg is intentionally left untouched: when its match set is below the grouping
// caps (the common case), re-running with `-n` only adds line-number prefixes that
// are absent from the raw `rg` baseline, inflating the comparison instead of
// compressing it. rtk likewise gets ~0% on plain `rg`, so passthrough is parity.
export function buildGrepArgs(program: string, userArgs: string[]): string[] {
  if (program !== "grep" || hasFormatFlag(userArgs)) return userArgs;
  // Duplicate -n/-H are harmless to grep, so prepend unconditionally.
  return ["-n", "-H", ...userArgs];
}

export const searchLikeHandler: CommandHandler = {
  name: "search-like",
  programs: ["rg", "grep"],

  matches(command) {
    return SEARCH_PROGRAMS.has(command.program);
  },

  execute(command) {
    const args = buildGrepArgs(command.program, command.args);
    if (args === command.args) return executeCommand(command);
    const rewritten: ParsedCommand = {
      ...command,
      args,
      original: [command.program, ...args],
      displayCommand: `${command.program} ${args.join(" ")}`.trim(),
    };
    return executeCommand(rewritten);
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
