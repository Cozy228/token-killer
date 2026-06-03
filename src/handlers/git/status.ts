import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type Section = "staged" | "modified" | "untracked" | "conflicts" | undefined;

function parseShortStatusLine(line: string) {
  if (line.startsWith("## ")) {
    const branch = line.slice(3).split("...")[0]?.trim();
    return branch ? { branch } : undefined;
  }

  if (!/^[ MADRCU?!][ MADRCU?!] /.test(line)) return undefined;
  const indexStatus = line[0] ?? " ";
  const worktreeStatus = line[1] ?? " ";
  const file = line.slice(3).trim();
  if (!file) return undefined;

  if (indexStatus === "?" && worktreeStatus === "?") return { section: "untracked" as const, file };
  if (indexStatus === "U" || worktreeStatus === "U" || (indexStatus === "A" && worktreeStatus === "A")) {
    return { section: "conflicts" as const, file };
  }
  if (indexStatus !== " ") return { section: "staged" as const, file };
  if (worktreeStatus !== " ") return { section: "modified" as const, file };

  return undefined;
}

function formatStatus(text: string): string {
  let branch = "unknown";
  let section: Section;
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const shortStatus = parseShortStatusLine(line);
    if (shortStatus?.branch) {
      branch = shortStatus.branch;
      continue;
    }
    if (shortStatus?.section === "staged") {
      staged.push(shortStatus.file);
      continue;
    }
    if (shortStatus?.section === "modified") {
      modified.push(shortStatus.file);
      continue;
    }
    if (shortStatus?.section === "untracked") {
      untracked.push(shortStatus.file);
      continue;
    }
    if (shortStatus?.section === "conflicts") {
      conflicts.push(shortStatus.file);
      continue;
    }

    if (trimmed.startsWith("On branch ")) {
      branch = trimmed.replace("On branch ", "");
      continue;
    }
    if (trimmed === "Changes to be committed:") {
      section = "staged";
      continue;
    }
    if (trimmed === "Changes not staged for commit:") {
      section = "modified";
      continue;
    }
    if (trimmed === "Untracked files:") {
      section = "untracked";
      continue;
    }
    if (trimmed.includes("unmerged paths")) {
      section = "conflicts";
      continue;
    }
    if (!section || !trimmed || trimmed.startsWith("(") || trimmed.startsWith("use ")) continue;

    const file = trimmed.replace(/^(new file|modified|deleted|renamed|both modified):\s+/, "");
    if (section === "staged") staged.push(file);
    if (section === "modified") modified.push(file);
    if (section === "untracked") untracked.push(file);
    if (section === "conflicts") conflicts.push(file);
  }

  const lines = [
    `Branch: ${branch}`,
    `Status: ${modified.length} modified, ${staged.length} staged, ${untracked.length} untracked, ${conflicts.length} conflicts`,
  ];

  if (staged.length > 0) lines.push("", "Staged:", ...staged.map((file) => `- ${file}`));
  if (modified.length > 0) lines.push("", "Modified:", ...modified.map((file) => `- ${file}`));
  if (untracked.length > 0) lines.push("", "Untracked:", ...untracked.map((file) => `- ${file}`));
  if (conflicts.length > 0) lines.push("", "Conflicts:", ...conflicts.map((file) => `- ${file}`));

  return `${lines.join("\n")}\n`;
}

export const gitStatusHandler: CommandHandler = {
  name: "git-status",

  matches(command) {
    return command.program === "git" && command.args[0] === "status";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatStatus(raw.stdout || raw.stderr), options);
  },
};
