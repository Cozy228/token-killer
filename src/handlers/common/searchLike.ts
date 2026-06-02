import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

const SEARCH_PROGRAMS = new Set(["rg", "grep"]);
const DEFAULT_MAX_TOTAL = 80;
const DEFAULT_MAX_PER_FILE = 5;

type Match = {
  file: string;
  line?: number;
  content: string;
};

function hasGrepFormatFlag(args: string[]): boolean {
  return args.some((arg) => {
    if (!arg.startsWith("-") || arg === "--") return false;
    return /[clLo]/.test(arg.replace(/^-+/, ""));
  });
}

function parseMatch(line: string): Match | undefined {
  const nulIndex = line.indexOf("\0");
  if (nulIndex >= 0) {
    const file = line.slice(0, nulIndex);
    const rest = line.slice(nulIndex + 1);
    const match = rest.match(/^(\d+):(.*)$/);
    if (!match) return undefined;
    return { file, line: Number(match[1]), content: match[2] ?? "" };
  }

  const withLine = line.match(/^(.+?):(\d+):(.*)$/);
  if (withLine) {
    return { file: withLine[1] ?? "", line: Number(withLine[2]), content: withLine[3] ?? "" };
  }

  const withoutLine = line.match(/^(.+?):(.*)$/);
  if (!withoutLine) return undefined;
  return { file: withoutLine[1] ?? "", content: withoutLine[2] ?? "" };
}

function searchPattern(args: string[]): string {
  return args.find((arg) => !arg.startsWith("-")) ?? "";
}

function groupSearchOutput(rawOutput: string, pattern: string): string {
  const parsed = rawOutput
    .split(/\r?\n/)
    .map(parseMatch)
    .filter((match): match is Match => Boolean(match));

  if (rawOutput.trim() && parsed.length === 0) {
    return `${rawOutput.trimEnd()}\n`;
  }

  const byFile = new Map<string, Match[]>();
  const seen = new Set<string>();

  for (const match of parsed) {
    const key = `${match.file}:${match.line ?? ""}:${match.content.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = byFile.get(match.file) ?? [];
    matches.push(match);
    byFile.set(match.file, matches);
  }

  const total = parsed.length;
  let shown = 0;
  const lines = [
    `Search: ${pattern}`,
    `Matches: ${total} across ${byFile.size} files, showing up to ${DEFAULT_MAX_TOTAL}`,
    "",
  ];

  for (const [file, matches] of [...byFile.entries()].sort()) {
    if (shown >= DEFAULT_MAX_TOTAL) break;
    const fileShown = Math.min(DEFAULT_MAX_PER_FILE, matches.length, DEFAULT_MAX_TOTAL - shown);
    lines.push(`${file} (${matches.length} matches, showing ${fileShown})`);
    for (const match of matches.slice(0, fileShown)) {
      lines.push(match.line === undefined ? match.content.trim() : `${match.line}| ${match.content.trim()}`);
      shown += 1;
    }
    lines.push("");
  }

  if (total > shown) {
    lines.push("Hidden:", `- ${total - shown} matches not shown`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
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
    const output = raw.stdout.trim() && command.program === "grep" && hasGrepFormatFlag(command.args)
      ? `${raw.stdout.trimEnd()}\n`
      : raw.stdout.trim()
      ? groupSearchOutput(raw.stdout, searchPattern(command.args))
      : `${raw.stderr || `0 matches for ${searchPattern(command.args)}`}\n`;
    return makeFilteredResult(this.name, raw, output, options);
  },
};
