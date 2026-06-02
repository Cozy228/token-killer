import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type Section = "staged" | "modified" | "untracked" | "conflicts" | undefined;

function formatStatus(text: string): string {
  let branch = "unknown";
  let section: Section;
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
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
