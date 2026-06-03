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
  visiblePaths: string[];
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
    summary.visiblePaths.push(parts[0]!);
    return;
  }

  const parent = `${parts.slice(0, -1).join("/")}/`;
  summary.dirs.set(parent, (summary.dirs.get(parent) ?? 0) + 1);
  summary.visiblePaths.push(parts.join("/"));
}

function summarizeListing(text: string): string {
  const summary: TreeSummary = {
    rootFiles: new Set(),
    dirs: new Map(),
    skipped: new Set(),
    visiblePaths: [],
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("total ")) continue;
    const longListingMatch = line.match(/\s([^\s]+)$/);
    addPath(summary, longListingMatch?.[1] ?? line);
  }

  if (summary.visiblePaths.length === 0 && summary.skipped.size === 0) return "\n";

  const uniquePaths = [...new Set(summary.visiblePaths)].sort();

  if (summary.skipped.size === 0 && text.length <= 200) {
    return `${text.trimEnd()}\n`;
  }

  const dirNames = new Set<string>();
  for (const file of uniquePaths) {
    const parts = file.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      dirNames.add(`${parts.slice(0, index).join("/")}/`);
    }
  }

  const lines = [`${uniquePaths.length}F ${dirNames.size}D:`];
  if (uniquePaths.length <= 80) {
    const byParent = new Map<string, string[]>();
    for (const file of uniquePaths) {
      const parts = file.split("/");
      const parent = parts.length === 1 ? "./" : `${parts.slice(0, -1).join("/")}/`;
      const files = byParent.get(parent) ?? [];
      files.push(parts.at(-1) ?? file);
      byParent.set(parent, files);
    }
    for (const [parent, files] of [...byParent.entries()].sort()) {
      lines.push(`${parent} ${files.sort().join(" ")}`.trimEnd());
    }
  } else {
    for (const [dir, count] of [...summary.dirs.entries()].sort()) {
      lines.push(`${dir} (${count} files)`);
    }
    for (const file of [...summary.rootFiles].sort().slice(0, 40)) {
      lines.push(file);
    }
  }
  if (uniquePaths.length > 80) {
    lines.push(`... ${uniquePaths.length - 80} more files`);
  }

  if (summary.skipped.size > 0) {
    lines.push("", "Skipped:");
    for (const skipped of [...summary.skipped].sort()) {
      lines.push(`- ${skipped}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function treeLineDepth(line: string): number {
  const marker = line.search(/[├└]/);
  return marker < 0 ? 0 : marker;
}

function treeNodeName(line: string): string {
  return line.replace(/^[\s│├└─]+/, "").trim().replace(/\/$/, "");
}

function filterTreeOutput(text: string): string {
  if (!text.trim()) return "\n";

  const skipped = new Set<string>();
  const lines: string[] = [];
  let skipDepth: number | undefined;

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\d+ directories?, \d+ files?\s*$/.test(line)) continue;
    if (!line.trim()) continue;

    const depth = treeLineDepth(line);
    if (skipDepth !== undefined && depth > skipDepth) continue;
    skipDepth = undefined;

    const nodeName = treeNodeName(line);
    if (SKIP_DIRS.has(nodeName)) {
      skipped.add(`${nodeName}/`);
      skipDepth = depth;
      continue;
    }

    lines.push(line);
  }

  if (skipped.size > 0) {
    lines.push("", "Skipped:");
    for (const name of [...skipped].sort()) lines.push(`- ${name}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
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

  async filter(raw, command, options) {
    const text = `${raw.stdout}\n${raw.stderr}`;
    const output = command.program === "tree" ? filterTreeOutput(text) : summarizeListing(text);
    return makeFilteredResult(this.name, raw, output, options);
  },
};
