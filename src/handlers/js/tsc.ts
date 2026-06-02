import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type TscIssue = {
  file: string;
  line: string;
  column: string;
  code: string;
  message: string;
};

function matchesTsc(command: ParsedCommand): boolean {
  return command.program.includes("tsc") || command.original.includes("tsc");
}

function parseIssue(line: string): TscIssue | undefined {
  const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  if (!match) return undefined;
  return {
    file: match[1] ?? "",
    line: match[2] ?? "",
    column: match[3] ?? "",
    code: match[4] ?? "",
    message: match[5] ?? "",
  };
}

function formatTsc(text: string): string {
  const issues = text
    .split(/\r?\n/)
    .map(parseIssue)
    .filter((issue): issue is TscIssue => Boolean(issue));
  const byCode = new Map<string, TscIssue[]>();
  for (const issue of issues) {
    const list = byCode.get(issue.code) ?? [];
    list.push(issue);
    byCode.set(issue.code, list);
  }
  const out = [`TypeScript: ${issues.length} errors in ${new Set(issues.map((issue) => issue.file)).size} files`];
  out.push("By code:", ...[...byCode.entries()].sort().map(([code, list]) => `- ${code}: ${list.length}`));
  for (const [code, codeIssues] of [...byCode.entries()].sort()) {
    const sortedIssues = [...codeIssues].sort((a, b) => {
      const aNoise = /noise|node_modules|dist|build/.test(a.file) ? 1 : 0;
      const bNoise = /noise|node_modules|dist|build/.test(b.file) ? 1 : 0;
      return aNoise - bNoise || a.file.localeCompare(b.file);
    });
    out.push("", code);
    for (const issue of sortedIssues.slice(0, 5)) {
      out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.message}`);
    }
    if (codeIssues.length > 5) out.push(`- ... ${codeIssues.length - 5} more`);
  }
  return `${out.join("\n")}\n`;
}

export const tscHandler: CommandHandler = {
  name: "tsc",

  matches: matchesTsc,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatTsc(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
