import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type Commit = {
  hash: string;
  author?: string;
  date?: string;
  subject?: string;
};

function shortHash(hash: string): string {
  return hash.slice(0, 12);
}

function formatLog(text: string): string {
  const rawLines = text.split(/\r?\n/).filter(Boolean);
  if (rawLines.length === 0) return "Git Log\nCommits: 0\n";
  if (rawLines.length > 0 && rawLines.length <= 5 && rawLines.every((line) => /^[0-9a-f]{7,}\s+/.test(line))) {
    return `${rawLines.join("\n")}\n`;
  }

  const commits: Commit[] = [];
  let current: Commit | undefined;
  let expectingSubject = false;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("commit ")) {
      current = { hash: line.replace("commit ", "").trim() };
      commits.push(current);
      expectingSubject = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("Author:")) {
      current.author = line.replace("Author:", "").trim();
      continue;
    }
    if (line.startsWith("Date:")) {
      current.date = line.replace("Date:", "").trim();
      expectingSubject = true;
      continue;
    }
    if (expectingSubject && line.startsWith("    ") && line.trim()) {
      current.subject = line.trim();
      expectingSubject = false;
    }
  }

  if (commits.length === 0) {
    return text.endsWith("\n") ? text : `${text}\n`;
  }

  if (commits.length <= 1) return text.endsWith("\n") ? text : `${text}\n`;

  const lines = [`Git Log: ${commits.length} commits`, ""];
  for (const commit of commits) {
    const meta = [commit.author, commit.date].filter(Boolean).join(" | ");
    lines.push(`${shortHash(commit.hash)} ${commit.subject ?? "(no subject)"}`);
    if (meta) lines.push(`  ${meta}`);
  }
  return `${lines.join("\n")}\n`;
}

export const gitLogHandler: CommandHandler = {
  name: "git-log",

  matches(command) {
    return command.program === "git" && command.args[0] === "log";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatLog(raw.stdout || raw.stderr), options);
  },
};
