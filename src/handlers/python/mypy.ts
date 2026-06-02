import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type MypyIssue = {
  file: string;
  line: string;
  message: string;
  code: string;
};

function parseIssue(line: string): MypyIssue | undefined {
  const match = line.match(/^(.+?):(\d+):\s+error:\s+(.+?)(?:\s+\[([^\]]+)\])?$/);
  if (!match) return undefined;
  return {
    file: match[1] ?? "",
    line: match[2] ?? "",
    message: match[3] ?? "",
    code: match[4] ?? "unknown",
  };
}

function formatMypy(text: string): string {
  const issues = text
    .split(/\r?\n/)
    .map(parseIssue)
    .filter((issue): issue is MypyIssue => Boolean(issue));
  const byCode = new Map<string, MypyIssue[]>();
  for (const issue of issues) {
    const list = byCode.get(issue.code) ?? [];
    list.push(issue);
    byCode.set(issue.code, list);
  }
  const out = [`Mypy: ${issues.length} errors in ${new Set(issues.map((issue) => issue.file)).size} files`];
  for (const [code, codeIssues] of [...byCode.entries()].sort()) {
    out.push("", `${code}: ${codeIssues.length}`);
    for (const issue of codeIssues.slice(0, 5)) {
      out.push(`- ${issue.file}:${issue.line} ${issue.message}`);
    }
    if (codeIssues.length > 5) out.push(`- ... ${codeIssues.length - 5} more`);
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
