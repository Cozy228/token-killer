import { readdir } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult } from "../../types.js";
import { makeFilteredResult } from "../base.js";

const LIST_PROGRAMS = new Set(["ls", "dir", "find", "tree"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "target",
  "coverage",
  ".git",
  ".next",
  ".turbo",
  "__pycache__",
  ".venv",
  ".idea",
  ".gradle",
]);

type TreeSummary = {
  rootFiles: Set<string>;
  dirs: Map<string, number>;
  skipped: Set<string>;
};

function cleanPath(line: string): string {
  return line
    .trim()
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
}

function addPath(summary: TreeSummary, rawPath: string): void {
  const cleaned = cleanPath(rawPath);
  if (!cleaned || cleaned === ".") return;

  const parts = cleaned.split(/[\\/]+/).filter(Boolean);
  const skipped = parts.find((part) => SKIP_DIRS.has(part));
  if (skipped) {
    summary.skipped.add(`${skipped}/`);
    return;
  }

  if (parts.length === 1) {
    summary.rootFiles.add(parts[0]!);
    return;
  }

  const top = `${parts[0]}/`;
  summary.dirs.set(top, (summary.dirs.get(top) ?? 0) + 1);
}

function summarizeListing(text: string): string {
  const summary: TreeSummary = {
    rootFiles: new Set(),
    dirs: new Map(),
    skipped: new Set(),
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("total ")) continue;
    const longListingMatch = line.match(/\s([^\s]+)$/);
    addPath(summary, longListingMatch?.[1] ?? line);
  }

  const lines = ["."];
  for (const [dir, count] of [...summary.dirs.entries()].sort()) {
    lines.push(`├─ ${dir} (${count} files)`);
  }
  for (const file of [...summary.rootFiles].sort().slice(0, 40)) {
    lines.push(`├─ ${file}`);
  }
  if (summary.rootFiles.size > 40) {
    lines.push(`├─ ... ${summary.rootFiles.size - 40} more files`);
  }

  if (summary.skipped.size > 0) {
    lines.push("", "Skipped:");
    for (const skipped of [...summary.skipped].sort()) {
      lines.push(`- ${skipped}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function executeDirInternally(command: ParsedCommand): Promise<RawResult | undefined> {
  if (command.program !== "dir") return undefined;
  const started = Date.now();
  const target = command.args.find((arg) => !arg.startsWith("-")) ?? ".";
  try {
    const entries = await readdir(path.resolve(process.cwd(), target));
    return {
      command: command.displayCommand,
      stdout: entries.join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch {
    return undefined;
  }
}

export const listLikeHandler: CommandHandler = {
  name: "list-like",

  matches(command) {
    return LIST_PROGRAMS.has(command.program);
  },

  async execute(command) {
    return (await executeDirInternally(command)) ?? executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, summarizeListing(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
