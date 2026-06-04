import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { compactUnifiedDiff } from "./compactDiff.js";

function wantsStatOnly(command: ParsedCommand): boolean {
  return command.args.some((arg) => arg === "--stat" || arg === "--numstat" || arg === "--shortstat");
}

function formatDiff(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/^diff --git /m.test(text)) {
    return `${compactUnifiedDiff(text).trimEnd()}\n`;
  }
  return `${trimmed}\n`;
}

async function formatGitDiff(rawText: string, command: ParsedCommand): Promise<string> {
  if (wantsStatOnly(command)) {
    return formatDiff(rawText);
  }

  const statCommand: ParsedCommand = {
    ...command,
    args: ["diff", "--stat", ...command.args.slice(1)],
    original: ["git", "diff", "--stat", ...command.args.slice(1)],
    displayCommand: `git diff --stat ${command.args.slice(1).join(" ")}`.trim(),
  };
  const stat = await executeCommand(statCommand);
  const statText = `${stat.stdout}${stat.stderr}`.trim();
  const compacted = formatDiff(rawText).trimEnd();

  if (!statText) return compacted ? `${compacted}\n` : "";
  if (!compacted) return `${statText}\n`;
  return `${statText}\n\n--- Changes ---\n${compacted}\n`;
}

export const gitDiffHandler: CommandHandler = {
  name: "git-diff",

  matches(command) {
    return command.program === "git" && command.args[0] === "diff";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    return makeFilteredResult(this.name, raw, await formatGitDiff(raw.stdout || raw.stderr, command), options);
  },
};
