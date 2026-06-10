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
  return line.trim().replace(/^\.\//, "").replace(/\/$/, "");
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
  return line
    .replace(/^[\s│├└─]+/, "")
    .trim()
    .replace(/\/$/, "");
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
  // H16-find fix: accept stdout and stderr separately so stderr lines are not
  // parsed as filesystem paths.
  stdout: string,
  stderr: string,
  command: ParsedCommand,
): { output: string; omission?: OmissionDeclaration } {
  const root = findRoot(command);

  // H16-find fix: track skipped paths (filtered by SKIP_DIRS) instead of
  // silently discarding them. This prevents false "0 for 'pattern'" when the
  // user explicitly targets a skip-listed directory (e.g. find . -path
  // '*node_modules*'). Skipped paths get a declared "skip" line in the output.
  let skippedCount = 0;
  const rawLines = stdout.split(/\r?\n/).map((line) => stripFindRoot(line, root));
  const files = [
    ...new Set(
      rawLines.filter((line) => {
        if (!line) return false;
        if (line.split(/[\\/]+/).some((part) => SKIP_DIRS.has(part))) {
          skippedCount += 1;
          return false;
        }
        return true;
      }),
    ),
  ].sort();

  // RTK: find_cmd.rs — empty result collapses to "0 for '<pattern>'".
  // H16-find fix: only report "0" when there are ALSO no skipped paths.
  // If paths were silently dropped, show the skip count so the caller isn't misled.
  if (files.length === 0) {
    if (skippedCount > 0) {
      let out = `0 for '${findPattern(command)}' (${skippedCount} skipped in build/generated dirs)\n`;
      if (stderr.trim()) out += `[find stderr] ${stderr.trim()}\n`;
      return { output: out };
    }
    let out = `0 for '${findPattern(command)}'\n`;
    if (stderr.trim()) out += `[find stderr] ${stderr.trim()}\n`;
    return { output: out };
  }

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
  // H16-find fix: include skipped count in header so users see what was omitted.
  const skipSuffix = skippedCount > 0 ? ` (${skippedCount} skipped)` : "";
  const header = `${totalFiles}F ${dirs.length}D:${skipSuffix}`;
  // H16-find fix: any stderr from find (permission errors etc.) is shown after
  // the listing rather than being parsed as a path.
  const stderrSuffix = stderr.trim() ? `[find stderr] ${stderr.trim()}\n` : "";

  // ADR 0001 (intentional divergence from RTK's FIND_MAX_RESULTS=50 + `+N more`):
  // each path is location evidence and is never capped. Below budget every file
  // is listed; step 1 keeps every directory (drops the per-dir filenames, a
  // lossless reduction of locations to their parent dirs + count); step 2 is a
  // repo-wide total.
  const renderFull = (): string => {
    const lines = [header, ""];
    for (const dir of dirs) lines.push(`${dir}/ ${(byDir.get(dir) ?? []).sort().join(" ")}`);
    return `${lines.join("\n")}\n${stderrSuffix}`;
  };
  const renderDigest = (): string => {
    const lines = [header, ""];
    for (const dir of dirs) lines.push(`${dir}/ (${(byDir.get(dir) ?? []).length} files)`);
    return `${lines.join("\n")}\n${stderrSuffix}`;
  };

  const ladder = overBudgetLadder({
    full: renderFull(),
    digest: renderDigest,
    replacement: () =>
      `${totalFiles} files in ${dirs.length} directories (over budget)${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}\n${stderrSuffix}`,
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
  traits: { cacheable: true, ttlClass: "fast" },
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
    if (command.program === "find") {
      // H16-find fix: pass stdout and stderr separately so stderr lines are not
      // mixed into the path stream and parsed as filesystem paths.
      const { output, omission } = summarizeFindOutput(raw.stdout, raw.stderr, command);
      return makeFilteredResult(this, raw, output, options, undefined, omission);
    }
    // For ls/tree/dir: merge stdout+stderr as before (they don't have a path parser).
    const text = `${raw.stdout}\n${raw.stderr}`;
    const output = summarizeListing(command.program === "tree" ? flattenTreeOutput(text) : text);
    return makeFilteredResult(this, raw, output, options);
  },
};
