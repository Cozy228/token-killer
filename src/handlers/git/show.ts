import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type FileSummary = {
  file: string;
  added: number;
  removed: number;
  hunks: string[];
};

function formatShow(text: string): string {
  const lines = text.split(/\r?\n/);
  const commit = lines.find((line) => line.startsWith("commit "))?.replace("commit ", "").trim();
  const author = lines.find((line) => line.startsWith("Author:"))?.replace("Author:", "").trim();
  const date = lines.find((line) => line.startsWith("Date:"))?.replace("Date:", "").trim();
  const subject = lines.find((line) => line.startsWith("    ") && line.trim())?.trim();

  const files: FileSummary[] = [];
  let current: FileSummary | undefined;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/ b\/(.+)$/);
      current = { file: match?.[1] ?? line.replace("diff --git ", ""), added: 0, removed: 0, hunks: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      if (current.hunks.length < 6) current.hunks.push(line);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) current.added += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.removed += 1;
  }

  const out = ["Git Show"];
  if (commit) out.push(`Commit: ${commit}`);
  if (author) out.push(`Author: ${author}`);
  if (date) out.push(`Date: ${date}`);
  if (subject) out.push(`Subject: ${subject}`);
  out.push("", `Files changed: ${files.length}`);
  for (const file of files) {
    out.push(`${file.file} (+${file.added} -${file.removed})`);
    for (const hunk of file.hunks) {
      out.push(`- hunk: ${hunk}`);
    }
  }
  if (text.length > out.join("\n").length) {
    out.push("", "Large patch hidden.");
    out.push("Use tg --raw git show if full patch is required.");
  }
  return `${out.join("\n")}\n`;
}

export const gitShowHandler: CommandHandler = {
  name: "git-show",

  matches(command) {
    return command.program === "git" && command.args[0] === "show";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatShow(raw.stdout || raw.stderr), options);
  },
};
