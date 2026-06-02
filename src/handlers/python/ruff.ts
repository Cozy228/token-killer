import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type RuffIssue = {
  file: string;
  line: string;
  column: string;
  rule: string;
  message: string;
};

function matchesRuff(command: ParsedCommand): boolean {
  return command.program === "ruff" || command.original.includes("ruff") || command.original.join(" ").includes("ruff check");
}

function parseIssue(line: string): RuffIssue | undefined {
  const match = line.match(/^(.+?):(\d+):(\d+):\s+([A-Z]\d+)\s+(.+)$/);
  if (!match) return undefined;
  return {
    file: match[1] ?? "",
    line: match[2] ?? "",
    column: match[3] ?? "",
    rule: match[4] ?? "",
    message: match[5] ?? "",
  };
}

function formatRuff(text: string, command: ParsedCommand): string {
  const issues = text
    .split(/\r?\n/)
    .map(parseIssue)
    .filter((issue): issue is RuffIssue => Boolean(issue));
  if (issues.length === 0 && text.trim()) {
    if (command.args[0] === "format") return `${text.trimEnd()}\n`;
    if (/All checks passed/i.test(text)) return "Ruff: 0 issues in 0 files\n";
    return `${text.trimEnd()}\n`;
  }

  const byRule = new Map<string, RuffIssue[]>();
  for (const issue of issues) {
    const list = byRule.get(issue.rule) ?? [];
    list.push(issue);
    byRule.set(issue.rule, list);
  }
  const fixable = text.split(/\r?\n/).find((line) => line.includes("fixable"));
  const out = [`Ruff: ${issues.length} issues in ${new Set(issues.map((issue) => issue.file)).size} files`];
  if (fixable) out.push(fixable.trim());
  for (const [rule, ruleIssues] of [...byRule.entries()].sort()) {
    const sortedIssues = [...ruleIssues].sort((a, b) => {
      const aNoise = /noise|node_modules|dist|build/.test(a.file) ? 1 : 0;
      const bNoise = /noise|node_modules|dist|build/.test(b.file) ? 1 : 0;
      return aNoise - bNoise || a.file.localeCompare(b.file);
    });
    out.push("", `${rule}: ${ruleIssues.length}`);
    for (const issue of sortedIssues.slice(0, 5)) {
      out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.message}`);
    }
    if (ruleIssues.length > 5) out.push(`- ... ${ruleIssues.length - 5} more; use full output for all violations`);
  }
  return `${out.join("\n")}\n`;
}

export const ruffHandler: CommandHandler = {
  name: "ruff",

  matches: matchesRuff,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    return makeFilteredResult(this.name, raw, formatRuff(`${raw.stdout}\n${raw.stderr}`, command), options);
  },
};
