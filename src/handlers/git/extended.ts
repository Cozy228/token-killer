import { homedir } from "node:os";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

const EXTENDED_GIT_HANDLERS = new Map([
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

// RTK: git/git.rs::filter_stash_list — strip the "WIP on <branch>:" / "On <branch>:"
// prefix by keeping whatever follows the second ": " in each entry.
function filterStashList(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const colon = line.indexOf(": ");
      if (colon === -1) return line;
      const index = line.slice(0, colon);
      const rest = line.slice(colon + 2);
      const second = rest.indexOf(": ");
      const message = second === -1 ? rest.trim() : rest.slice(second + 2).trim();
      return `${index}: ${message}`;
    })
    .join("\n");
}

// RTK: git/git.rs::filter_worktree_list — compact the leading path with ~ for $HOME
// and normalize whitespace to single spaces (path hash [branch]).
function filterWorktreeList(text: string): string {
  const home = homedir();
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        let path = parts[0]!;
        if (home && path.startsWith(home)) {
          path = `~${path.slice(home.length)}`;
        }
        const hash = parts[1];
        const branch = parts.slice(2).join(" ");
        return `${path} ${hash} ${branch}`;
      }
      return line;
    })
    .join("\n");
}

// RTK: git/git.rs::run_add — `git add` with no args targets `.`; user args pass
// through verbatim. RTK never parses git add's (silent) stdout for the count.
export function buildAddArgs(args: string[]): string[] {
  return args.length > 0 ? ["add", ...args] : ["add", "."];
}

// RTK: git/git.rs::run_add — after a successful add, RTK runs
// `git diff --cached --stat --shortstat` and reports the last (shortstat) line as
// `ok <shortstat>`. A no-op add (empty shortstat) stays SILENT, mirroring git, so
// an agent can tell "staged N files" from "staged nothing".
export function formatAddSummary(shortstatStdout: string): string {
  if (shortstatStdout.trim() === "") return "";
  const lines = shortstatStdout.split(/\r?\n/);
  // Emulate Rust str::lines(): drop a single trailing empty entry from a final \n.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const last = (lines.length > 0 ? lines[lines.length - 1]! : "").trim();
  return last === "" ? "ok" : `ok ${last}`;
}

function formatGitExtended(name: string, raw: RawResult, command: ParsedCommand): string {
  const text = combined(raw);
  const subcommand = command.args[0] ?? "";
  if (raw.exitCode !== 0 && !/nothing to commit|Everything up-to-date|Already up to date|No local changes/.test(text)) {
    return failure(command, raw);
  }

  if (name === "git-commit") {
    if (/nothing to commit/.test(text)) return "ok (nothing to commit)\n";
    // RTK: git/git.rs run_commit — collapse to "ok <hash>" (7 chars), dropping the
    // "[branch hash] subject" envelope AND the subject (RTK emits the hash only).
    const match = text.match(/\[[^\]]*?([0-9a-f]{7,40})\]/);
    return match ? `ok ${match[1]!.slice(0, 7)}\n` : `${text}\n`;
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
    // RTK: git/git.rs::run_fetch — count refs via stderr lines containing "->" or
    // "[new", collapse to "ok fetched (N new refs)" (the ref lines are dropped).
    const newRefs = text.split(/\r?\n/).filter((line) => line.includes("->") || line.includes("[new")).length;
    return newRefs > 0 ? `ok fetched (${newRefs} new refs)\n` : "ok fetched\n";
  }

  if (name === "git-stash") {
    const action = command.args[1] ?? "";
    if (action === "list") {
      if (!text) return "No stashes\n";
      return `${filterStashList(text)}\n`;
    }
    if (action === "show") return `${text}\n`;
    if (/No local changes/.test(text)) return `${text}\n`;
    if (!action || action === "push" || action === "save") return `ok stashed${text ? ` ${text.replace(/^Saved working directory and index state\s+/, "")}` : ""}\n`;
    return `ok stash ${action}\n`;
  }

  if (name === "git-worktree") {
    const action = command.args[1] ?? "";
    if (["add", "remove", "prune", "lock", "unlock", "move"].includes(action)) {
      return "ok\n";
    }
    // Default + explicit `list`: compact the worktree listing.
    return `${filterWorktreeList(text)}\n`;
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
    async filter(raw, command, options: TkOptions) {
      return makeFilteredResult(this.name, raw, formatGitExtended(this.name, raw, command), options);
    },
  };
}

// git-add needs a dedicated handler because, like RTK, it constructs more than
// one child command: the add itself, then `git diff --cached --stat --shortstat`
// to report the staged-file count.
const gitAddHandler: CommandHandler = {
  name: "git-add",
  matches(command) {
    return command.program === "git" && command.args[0] === "add";
  },
  async execute(command) {
    const args = command.args.slice(1);
    const result = await executeCommand({
      ...command,
      args: buildAddArgs(args),
    });
    if (result.exitCode !== 0) return result;
    const stat = await executeCommand({
      ...command,
      args: ["diff", "--cached", "--stat", "--shortstat"],
    });
    return { ...result, auxStdout: stat.stdout };
  },
  async filter(raw, command, options: TkOptions) {
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this.name, raw, failure(command, raw), options);
    }
    const summary = formatAddSummary(raw.auxStdout ?? "");
    return makeFilteredResult(this.name, raw, summary ? `${summary}\n` : "", options);
  },
};

export const gitExtendedHandlers: CommandHandler[] = [
  gitAddHandler,
  ...[...EXTENDED_GIT_HANDLERS.entries()].map(([subcommand, name]) =>
    makeGitExtendedHandler(name, subcommand),
  ),
];
