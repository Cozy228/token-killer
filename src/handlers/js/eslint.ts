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
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed);
      const files = Array.isArray(payload) ? payload : [payload];
      return files.flatMap((file: any) =>
        (file.messages ?? []).map((message: any) => ({
          file: String(file.filePath ?? "").replace(/^.*?\/repo\//, ""),
          line: String(message.line ?? 0),
          column: String(message.column ?? 0),
          severity: message.severity === 2 ? "error" : "warning",
          message: String(message.message ?? ""),
          rule: String(message.ruleId ?? "unknown"),
        })),
      );
    } catch {
      // Fall through to text parser.
    }
  }

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
    const sortedIssues = [...ruleIssues].sort((a, b) => a.file.localeCompare(b.file));
    out.push("", `${rule}: ${ruleIssues.length}`);
    for (const issue of sortedIssues) {
      out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.severity} ${issue.message}`);
    }
  }
  return `${out.join("\n")}\n`;
}

export const eslintHandler: CommandHandler = {
  name: "eslint",
  programs: ["eslint"],

  matches: matchesEslint,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatEslint(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
