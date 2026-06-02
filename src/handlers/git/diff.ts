import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type FileSummary = {
  file: string;
  added: number;
  removed: number;
  hunks: string[];
};

function formatDiff(text: string): string {
  const files: FileSummary[] = [];
  let current: FileSummary | undefined;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/ b\/(.+)$/);
      current = { file: match?.[1] ?? line.replace("diff --git ", ""), added: 0, removed: 0, hunks: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      if (current.hunks.length < 8) current.hunks.push(line);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) current.added += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.removed += 1;
  }

  const totalAdded = files.reduce((sum, file) => sum + file.added, 0);
  const totalRemoved = files.reduce((sum, file) => sum + file.removed, 0);
  const lines = ["Git Diff Summary", `Files changed: ${files.length}, +${totalAdded} -${totalRemoved}`, ""];

  for (const file of files) {
    lines.push(`${file.file} (+${file.added} -${file.removed})`);
    for (const hunk of file.hunks) {
      lines.push(`- hunk: ${hunk}`);
    }
    lines.push("");
  }

  if (text.length > lines.join("\n").length) {
    lines.push("Large diff hidden.");
    lines.push("Use tg --raw git diff if full patch is required.");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export const gitDiffHandler: CommandHandler = {
  name: "git-diff",

  matches(command) {
    return command.program === "git" && command.args[0] === "diff";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatDiff(raw.stdout || raw.stderr), options);
  },
};
