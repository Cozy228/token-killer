import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

const EXTENDED_GIT_HANDLERS = new Map([
  ["add", "git-add"],
  ["commit", "git-commit"],
  ["push", "git-push"],
  ["pull", "git-pull"],
  ["fetch", "git-fetch"],
  ["stash", "git-stash"],
  ["worktree", "git-worktree"],
]);

function combined(raw: RawResult): string {
  return `${raw.stdout}${raw.stderr}`.trimEnd();
}

function failure(command: ParsedCommand, raw: RawResult): string {
  const text = combined(raw);
  return `FAILED: ${command.displayCommand}\n${text}\n`;
}

function shortstat(text: string): string | undefined {
  const match = text.match(/(\d+) files? changed(?:,\s*(\d+) insertions?\(\+\))?(?:,\s*(\d+) deletions?\(-\))?/);
  if (!match) return undefined;
  const files = match[1] ?? "0";
  const added = match[2] ?? "0";
  const removed = match[3] ?? "0";
  return `${files} files +${added} -${removed}`;
}

function firstPushedRef(text: string): string | undefined {
  return text.match(/\s+[0-9a-f]+\.\.[0-9a-f]+\s+(\S+)\s+->\s+(\S+)/)?.[2];
}

function formatGitExtended(name: string, raw: RawResult, command: ParsedCommand): string {
  const text = combined(raw);
  const subcommand = command.args[0] ?? "";
  if (raw.exitCode !== 0 && !/nothing to commit|Everything up-to-date|Already up to date|No local changes/.test(text)) {
    return failure(command, raw);
  }

  if (name === "git-add") return text ? `ok ${text.trim()}\n` : "";

  if (name === "git-commit") {
    if (/nothing to commit/.test(text)) return "ok (nothing to commit)\n";
    const match = text.match(/\[[^\s]+ ([0-9a-f]{7,})\]\s+(.+)/);
    return match ? `ok ${match[1]} ${match[2]}\n` : `${text}\n`;
  }

  if (name === "git-push") {
    if (/Everything up-to-date/.test(text)) return "Everything up-to-date\nok (up-to-date)\n";
    if (/\[rejected\]|failed to push/.test(text)) return `${text}\n`;
    const keep = text.split(/\r?\n/).filter((line) => /^To |^remote: |->/.test(line.trim()) || /\s->\s/.test(line));
    const ref = firstPushedRef(text);
    return `${[...keep, ref ? `ok ${ref}` : "ok pushed"].join("\n")}\n`;
  }

  if (name === "git-pull") {
    if (/Already up to date/.test(text)) return "ok (up-to-date)\n";
    const stat = shortstat(text);
    return stat ? `ok ${stat}\n` : `${text}\n`;
  }

  if (name === "git-fetch") {
    const refLines = text.split(/\r?\n/).filter((line) => /\[new .+?\]|\.\./.test(line));
    return refLines.length > 0 ? `ok fetched (${refLines.length} new refs)\n${refLines.join("\n")}\n` : "ok fetched\n";
  }

  if (name === "git-stash") {
    const action = command.args[1] ?? "";
    if (action === "list") {
      if (!text) return "No stashes\n";
      return `${text.replace(/stash@\{(\d+)\}: (?:WIP on \S+|On \S+): /g, "stash@{$1}: ")}\n`;
    }
    if (action === "show") return `${text}\n`;
    if (/No local changes/.test(text)) return `${text}\n`;
    if (!action || action === "push" || action === "save") return `ok stashed${text ? ` ${text.replace(/^Saved working directory and index state\s+/, "")}` : ""}\n`;
    return `ok stash ${action}\n`;
  }

  if (name === "git-worktree") {
    if (command.args[1] === "list") return `${text}\n`;
    return "ok\n";
  }

  return `${text}\n`;
}

function makeGitExtendedHandler(name: string, subcommand: string): CommandHandler {
  return {
    name,
    matches(command) {
      return command.program === "git" && command.args[0] === subcommand;
    },
    execute(command) {
      return executeCommand(command);
    },
    async filter(raw, command, options: TgOptions) {
      return makeFilteredResult(this.name, raw, formatGitExtended(this.name, raw, command), options);
    },
  };
}

export const gitExtendedHandlers: CommandHandler[] = [...EXTENDED_GIT_HANDLERS.entries()].map(([subcommand, name]) =>
  makeGitExtendedHandler(name, subcommand),
);
