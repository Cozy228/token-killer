import { removeAnsi } from "../../core/ansi.js";
import type { ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";

type EslintIssue = {
  file: string;
  line: string;
  column: string;
  severity: string;
  message: string;
  rule: string;
};

// Known package-runner programs that may wrap eslint as their first non-flag argument.
const RUNNERS = new Set(["npm", "pnpm", "yarn", "npx", "node"]);

// M17: `command.program.includes("eslint")` catches path-relative binaries like
// `./node_modules/.bin/eslint`. The `original` check catches package-runner
// wrappers (`pnpm exec eslint .`, `npx eslint .`) — but only when the runner is a
// known tool (first element), not when "eslint" appears as a plain argument to some
// other program (e.g. `echo eslint` has program="echo", not a runner).
function matchesEslint(command: ParsedCommand): boolean {
  if (command.program.includes("eslint")) return true;
  // Only check original[1..] when the program is a known runner.
  if (RUNNERS.has(command.program)) {
    return command.original.slice(1).some((arg) => arg === "eslint");
  }
  return false;
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
  // C2-eslint: strip ANSI before parsing so ANSI-coloured output doesn't produce
  // zero-parse false positives that we'd then incorrectly summarise as "0 problems".
  const clean = removeAnsi(text);
  const issues = parseIssues(clean);
  const byRule = new Map<string, EslintIssue[]>();
  for (const issue of issues) {
    const list = byRule.get(issue.rule) ?? [];
    list.push(issue);
    byRule.set(issue.rule, list);
  }
  const out = [
    `ESLint: ${issues.length} problems in ${new Set(issues.map((issue) => issue.file)).size} files`,
  ];
  for (const [rule, ruleIssues] of [...byRule.entries()].sort()) {
    const sortedIssues = [...ruleIssues].sort((a, b) => a.file.localeCompare(b.file));
    out.push("", `${rule}: ${ruleIssues.length}`);
    for (const issue of sortedIssues) {
      out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.severity} ${issue.message}`);
    }
  }
  return `${out.join("\n")}\n`;
}

export const eslintHandler = defineHandler({
  name: "eslint",
  traits: { cacheable: true, ttlClass: "medium" },
  programs: ["eslint"],

  match: matchesEslint,

  format: (raw, _command, options) => {
    // C2-eslint: nonzero exit → the run crashed (config error, exit 2) or there
    // are real issues. If we parsed zero issues from a non-empty output the
    // formatter is confused (e.g. -f junit, ANSI after removeAnsi fail, etc.).
    // In all those cases return raw so no error detail is swallowed.
    const text = `${raw.stdout}\n${raw.stderr}`;
    if (raw.exitCode !== 0) {
      const clean = removeAnsi(text);
      const issues = parseIssues(clean);
      if (issues.length === 0) {
        // Non-zero exit, zero parsed issues → unrecognised output format; pass raw.
        return text;
      }
      // Non-zero exit but we DID parse issues — format them normally (common case:
      // exit 1 means "lint errors found").
      return formatEslint(text);
    }
    const clean = removeAnsi(text);
    const issues = parseIssues(clean);
    // Zero issues on exit 0 with non-empty output: unrecognised format (-f html/junit).
    if (issues.length === 0 && clean.trim() !== "") {
      return text;
    }
    return formatEslint(text);
  },
});
