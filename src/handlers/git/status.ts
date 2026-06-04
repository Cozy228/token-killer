import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type Section = "staged" | "modified" | "untracked" | "conflicts" | undefined;

function shortLine(indexStatus: string, worktreeStatus: string, file: string): string {
  return `${indexStatus}${worktreeStatus} ${file}`;
}

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
  const statuses: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const shortStatus = parseShortStatusLine(line);
    if (shortStatus?.branch) {
      branch = shortStatus.branch;
      continue;
    }
    if (shortStatus?.section === "staged") {
      statuses.push(line.slice(0, 3) + shortStatus.file);
      continue;
    }
    if (shortStatus?.section === "modified") {
      statuses.push(line.slice(0, 3) + shortStatus.file);
      continue;
    }
    if (shortStatus?.section === "untracked") {
      statuses.push(`?? ${shortStatus.file}`);
      continue;
    }
    if (shortStatus?.section === "conflicts") {
      statuses.push(line.slice(0, 3) + shortStatus.file);
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
    if (
      !section ||
      !trimmed ||
      trimmed.startsWith("(") ||
      trimmed.startsWith("use ") ||
      trimmed.startsWith("no changes added") ||
      trimmed.startsWith("nothing added to commit") ||
      trimmed.startsWith("nothing to commit")
    ) {
      continue;
    }

    const match = trimmed.match(/^(new file|modified|deleted|renamed|both modified):\s+(.+)$/);
    const status = match?.[1];
    const file = match?.[2] ?? trimmed;
    if (section === "staged") {
      statuses.push(shortLine(status === "deleted" ? "D" : status === "modified" ? "M" : "A", " ", file));
    }
    if (section === "modified") {
      statuses.push(shortLine(" ", status === "deleted" ? "D" : "M", file));
    }
    if (section === "untracked") statuses.push(`?? ${file}`);
    if (section === "conflicts") statuses.push(shortLine("U", "U", file));
  }

  const lines = [`* ${branch}`, ...statuses];

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
