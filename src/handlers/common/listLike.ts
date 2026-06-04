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
  if (parts.some((part) => SKIP_DIRS.has(part))) {
    return;
  }

  if (parts.length === 1) {
    summary.visiblePaths.push(parts[0]!);
    return;
  }
  summary.visiblePaths.push(parts.join("/"));
}

function treeLineDepth(line: string): number {
  const marker = line.search(/[├└]/);
  return marker < 0 ? 0 : Math.floor(marker / 4);
}

function treeNodeName(line: string): string {
  return line.replace(/^[\s│├└─]+/, "").trim().replace(/\/$/, "");
}

function flattenTreeOutput(text: string): string {
  const paths: string[] = [];
  const stack: Array<{ depth: number; name: string }> = [];
  let skipDepth: number | undefined;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\d+ directories?, \d+ files?\s*$/.test(line.trim())) continue;

    const depth = treeLineDepth(line);
    if (skipDepth !== undefined && depth > skipDepth) continue;
    skipDepth = undefined;

    const name = treeNodeName(line);
    if (!name) continue;

    if (SKIP_DIRS.has(name)) {
      skipDepth = depth;
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
      stack.pop();
    }

    const parent = stack.map((entry) => entry.name).join("/");
    const fullPath = parent ? `${parent}/${name}` : name;
    stack.push({ depth, name });

    if (name.includes(".")) {
      paths.push(fullPath);
    } else {
      paths.push(`${fullPath}/`);
    }
  }

  return paths.join("\n");
}

function summarizeListing(text: string): string {
  const summary: TreeSummary = {
    visiblePaths: [],
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("total ")) continue;
    const longListingMatch = line.match(/\s([^\s]+)$/);
    addPath(summary, longListingMatch?.[1] ?? line);
  }

  if (summary.visiblePaths.length === 0) return "\n";

  const uniquePaths = [...new Set(summary.visiblePaths)].sort();
  return `${uniquePaths.join("\n")}\n`;
}

function findRoot(command: ParsedCommand): string {
  const first = command.args.find((arg) => !arg.startsWith("-"));
  return first && first !== "." ? cleanPath(first) : "";
}

function stripFindRoot(pathValue: string, root: string): string {
  const cleaned = cleanPath(pathValue);
  if (!root) return cleaned;
  if (cleaned === root) return "";
  return cleaned.startsWith(`${root}/`) ? cleaned.slice(root.length + 1) : cleaned;
}

function summarizeFindOutput(text: string, command: ParsedCommand): string {
  const root = findRoot(command);
  const files = [...new Set(
    text
      .split(/\r?\n/)
      .map((line) => stripFindRoot(line, root))
      .filter((line) => line && !line.split(/[\\/]+/).some((part) => SKIP_DIRS.has(part))),
  )].sort();

  if (files.length === 0) return "\n";

  const byDir = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split(/[\\/]+/).filter(Boolean);
    const filename = parts.pop();
    if (!filename) continue;
    const dir = parts.length === 0 ? "." : parts.join("/");
    const entries = byDir.get(dir) ?? [];
    entries.push(filename);
    byDir.set(dir, entries);
  }

  const dirs = [...byDir.keys()].sort();
  const lines = [`${files.length}F ${dirs.length}D:`, ""];
  for (const dir of dirs) {
    const entries = byDir.get(dir) ?? [];
    lines.push(`${dir}/ ${entries.sort().join(" ")}`);
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

  async filter(raw, command, options) {
    const text = `${raw.stdout}\n${raw.stderr}`;
    const output = command.program === "find"
      ? summarizeFindOutput(text, command)
      : summarizeListing(command.program === "tree" ? flattenTreeOutput(text) : text);
    return makeFilteredResult(this.name, raw, output, options);
  },
};
