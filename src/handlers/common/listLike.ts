import { readdir } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, OmissionDeclaration, ParsedCommand, RawResult } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { overBudgetLadder } from "./budget.js";

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

// RTK: system/find_cmd.rs default max_results (parse_find_args → 50). tk filters
// the real find's output rather than re-walking the filesystem, so it caps the
// grouped listing at the same budget and reports the remainder as "+N more".

// RTK: find_cmd.rs uses the -name/-iname glob as the effective_pattern shown in
// the "0 for '<pattern>'" empty message (defaults to "*").
function findPattern(command: ParsedCommand): string {
  const args = command.args;
  for (let i = 0; i < args.length; i += 1) {
    if ((args[i] === "-name" || args[i] === "-iname") && args[i + 1]) {
      return args[i + 1]!;
    }
  }
  return "*";
}

function stripFindRoot(pathValue: string, root: string): string {
  const cleaned = cleanPath(pathValue);
  if (!root) return cleaned;
  if (cleaned === root) return "";
  return cleaned.startsWith(`${root}/`) ? cleaned.slice(root.length + 1) : cleaned;
}

function summarizeFindOutput(
  text: string,
  command: ParsedCommand,
): { output: string; omission?: OmissionDeclaration } {
  const root = findRoot(command);
  const files = [...new Set(
    text
      .split(/\r?\n/)
      .map((line) => stripFindRoot(line, root))
      .filter((line) => line && !line.split(/[\\/]+/).some((part) => SKIP_DIRS.has(part))),
  )].sort();

  // RTK: find_cmd.rs — empty result collapses to "0 for '<pattern>'".
  if (files.length === 0) return { output: `0 for '${findPattern(command)}'\n` };

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
  const totalFiles = files.length;
  const header = `${totalFiles}F ${dirs.length}D:`;

  // ADR 0001 (intentional divergence from RTK's FIND_MAX_RESULTS=50 + `+N more`):
  // each path is location evidence and is never capped. Below budget every file
  // is listed; step 1 keeps every directory (drops the per-dir filenames, a
  // lossless reduction of locations to their parent dirs + count); step 2 is a
  // repo-wide total.
  const renderFull = (): string => {
    const lines = [header, ""];
    for (const dir of dirs) lines.push(`${dir}/ ${(byDir.get(dir) ?? []).sort().join(" ")}`);
    return `${lines.join("\n")}\n`;
  };
  const renderDigest = (): string => {
    const lines = [header, ""];
    for (const dir of dirs) lines.push(`${dir}/ (${(byDir.get(dir) ?? []).length} files)`);
    return `${lines.join("\n")}\n`;
  };

  const ladder = overBudgetLadder({
    full: renderFull(),
    digest: renderDigest,
    replacement: () => `${totalFiles} files in ${dirs.length} directories (over budget)\n`,
  });
  return { output: ladder.text, omission: ladder.omission };
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
  // ls/tree have dedicated handlers (lsHandler, treeHandler) that own those
  // wrappers; `dir` is a shell builtin. `find` is the real PATH tool here.
  programs: ["find"],

  matches(command) {
    return LIST_PROGRAMS.has(command.program);
  },

  async execute(command) {
    return (await executeDirInternally(command)) ?? executeCommand(command);
  },

  async filter(raw, command, options) {
    const text = `${raw.stdout}\n${raw.stderr}`;
    if (command.program === "find") {
      const { output, omission } = summarizeFindOutput(text, command);
      return makeFilteredResult(this.name, raw, output, options, undefined, omission);
    }
    const output = summarizeListing(command.program === "tree" ? flattenTreeOutput(text) : text);
    return makeFilteredResult(this.name, raw, output, options);
  },
};
