import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type EslintIssue = {
  file: string;
  line: string;
  column: string;
  severity: string;
  message: string;
  rule: string;
};

function matchesEslint(command: ParsedCommand): boolean {
  return command.program.includes("eslint") || command.original.includes("eslint");
}

function parseIssues(text: string): EslintIssue[] {
  const issues: EslintIssue[] = [];
  let currentFile = "";
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (/^\/|^[A-Za-z]:\\|^src\//.test(trimmed) && !trimmed.includes("  ")) {
      currentFile = trimmed.replace(/^.*?\/repo\//, "");
      continue;
    }
    const match = trimmed.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([@\w/-]+)$/);
    if (match && currentFile) {
      issues.push({
        file: currentFile,
        line: match[1] ?? "",
        column: match[2] ?? "",
        severity: match[3] ?? "",
        message: match[4] ?? "",
        rule: match[5] ?? "",
      });
    }
  }
  return issues;
}

function formatEslint(text: string): string {
  const issues = parseIssues(text);
  const byRule = new Map<string, EslintIssue[]>();
  for (const issue of issues) {
    const list = byRule.get(issue.rule) ?? [];
    list.push(issue);
    byRule.set(issue.rule, list);
  }
  const out = [`ESLint: ${issues.length} problems in ${new Set(issues.map((issue) => issue.file)).size} files`];
  for (const [rule, ruleIssues] of [...byRule.entries()].sort()) {
    const sortedIssues = [...ruleIssues].sort((a, b) => {
      const aNoise = /noise|node_modules|dist|build/.test(a.file) ? 1 : 0;
      const bNoise = /noise|node_modules|dist|build/.test(b.file) ? 1 : 0;
      return aNoise - bNoise || a.file.localeCompare(b.file);
    });
    out.push("", `${rule}: ${ruleIssues.length}`);
    for (const issue of sortedIssues.slice(0, 5)) {
      out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.severity} ${issue.message}`);
    }
    if (ruleIssues.length > 5) out.push(`- ... ${ruleIssues.length - 5} more`);
  }
  return `${out.join("\n")}\n`;
}

export const eslintHandler: CommandHandler = {
  name: "eslint",

  matches: matchesEslint,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatEslint(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
