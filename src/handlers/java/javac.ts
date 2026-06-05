import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type JavacIssue = {
  file: string;
  line: string;
  message: string;
  details: string[];
};

function formatJavac(text: string): string {
  const lines = text.split(/\r?\n/);
  const issues: JavacIssue[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(/^(.+?\.java):(\d+):\s+error:\s+(.+)$/);
    if (!match) continue;
    const details: string[] = [];
    for (let offset = 1; offset <= 5; offset += 1) {
      const detail = lines[index + offset];
      if (!detail || /^.+?\.java:\d+:\s+error:/.test(detail)) break;
      if (/symbol:|location:|submitOrder|incompatible types/.test(detail)) {
        details.push(detail.trim());
      }
    }
    issues.push({
      file: match[1] ?? "",
      line: match[2] ?? "",
      message: match[3] ?? "",
      details,
    });
  }
  const sorted = issues.sort((a, b) => a.file.localeCompare(b.file));
  const out = [`Javac: ${issues.length} errors`];
  for (const issue of sorted) {
    out.push(`${issue.file}:${issue.line}: ${issue.message}`);
    for (const detail of issue.details) out.push(`  ${detail}`);
  }
  return `${out.join("\n")}\n`;
}

export const javacHandler: CommandHandler = {
  name: "javac",
  programs: ["javac"],

  matches(command) {
    return command.program === "javac";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatJavac(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
