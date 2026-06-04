import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type TscIssue = {
  file: string;
  line: string;
  column: string;
  code: string;
  message: string;
  notes: string[];
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
    notes: [],
  };
}

function formatTsc(text: string): string {
  const issues: TscIssue[] = [];
  for (const line of text.split(/\r?\n/)) {
    const issue = parseIssue(line);
    if (issue) {
      issues.push(issue);
      continue;
    }
    if (/^\s{2,}\S/.test(line) && issues.length > 0) issues[issues.length - 1]!.notes.push(line.trim());
  }
  const byCode = new Map<string, TscIssue[]>();
  for (const issue of issues) {
    const list = byCode.get(issue.code) ?? [];
    list.push(issue);
    byCode.set(issue.code, list);
  }
  if (issues.length === 0) {
    const trimmed = text.trim();
    return trimmed ? `${trimmed}\n` : "";
  }
  const out = [`TypeScript: ${issues.length} errors in ${new Set(issues.map((issue) => issue.file)).size} files`];
  out.push("By code:", ...[...byCode.entries()].sort().map(([code, list]) => `- ${code}: ${list.length}`));
  for (const [code, codeIssues] of [...byCode.entries()].sort()) {
    const sortedIssues = [...codeIssues].sort((a, b) => a.file.localeCompare(b.file));
    out.push("", code);
    for (const issue of sortedIssues) {
      out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.message}`);
      for (const note of issue.notes) out.push(`  ${note}`);
    }
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
