import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type MypyIssue = {
  file: string;
  line: string;
  message: string;
  code: string;
  notes: string[];
};

function parseIssue(line: string): MypyIssue | undefined {
  const match = line.match(/^(.+?):(\d+):\s+error:\s+(.+?)(?:\s+\[([^\]]+)\])?$/);
  if (!match) return undefined;
  return {
    file: match[1] ?? "",
    line: match[2] ?? "",
    message: match[3] ?? "",
    code: match[4] ?? "unknown",
    notes: [],
  };
}

function formatMypy(text: string): string {
  const issues: MypyIssue[] = [];
  for (const line of text.split(/\r?\n/)) {
    const issue = parseIssue(line);
    if (issue) {
      issues.push(issue);
      continue;
    }
    const note = line.match(/^(?:.+?:\d+(?::\d+)?:\s+)?note:\s+(.+)$/);
    if (note && issues.length > 0) issues[issues.length - 1]!.notes.push(note[1] ?? "");
    const fileless = line.match(/^error:\s+(.+?)(?:\s+\[([^\]]+)\])?$/);
    if (fileless) issues.push({ file: "(global)", line: "0", message: fileless[1] ?? "", code: fileless[2] ?? "unknown", notes: [] });
  }
  const byCode = new Map<string, MypyIssue[]>();
  for (const issue of issues) {
    const list = byCode.get(issue.code) ?? [];
    list.push(issue);
    byCode.set(issue.code, list);
  }
  const out = [`Mypy: ${issues.length} errors in ${new Set(issues.map((issue) => issue.file)).size} files`];
  for (const [code, codeIssues] of [...byCode.entries()].sort()) {
    out.push("", `${code}: ${codeIssues.length}`);
    const sortedIssues = [...codeIssues].sort((a, b) => {
      const aNoise = /noise/.test(a.file) ? 1 : 0;
      const bNoise = /noise/.test(b.file) ? 1 : 0;
      return aNoise - bNoise || a.file.localeCompare(b.file);
    });
    const shownIssues = sortedIssues.length > 100 ? sortedIssues.slice(0, 20) : sortedIssues;
    for (const issue of shownIssues) {
      out.push(`- ${issue.file}:${issue.line} ${issue.message}`);
      for (const note of issue.notes) out.push(`  note: ${note}`);
    }
    if (sortedIssues.length > shownIssues.length) out.push(`- ... ${sortedIssues.length - shownIssues.length} more`);
  }
  return `${out.join("\n")}\n`;
}

export const mypyHandler: CommandHandler = {
  name: "mypy",

  matches(command) {
    return command.program === "mypy";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatMypy(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
