import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/tree.rs — proxy to native `tree`, stripping the trailing
// `N directories, M files` summary line while preserving the tree hierarchy
// (├──/└──/│). Trailing empty lines are removed. The bulk of RTK's savings comes
// from rewriting the `tree` invocation with `-I <noise>` so heavy directories
// (node_modules, .git, dist, …) are excluded before the tree is even rendered;
// tg reproduces both the command rewrite (buildTreeArgs) and filter_tree_output.

// RTK: system/constants.rs::NOISE_DIRS — directories excluded via `-I` unless the
// user passes `-a`/`--all` or supplies their own `-I`/`--ignore=` pattern.
const NOISE_DIRS = [
  "node_modules",
  ".git",
  "target",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".cache",
  ".turbo",
  ".vercel",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".venv",
  "venv",
  "env",
  "coverage",
  ".nyc_output",
  ".DS_Store",
  "Thumbs.db",
  ".idea",
  ".vscode",
  ".vs",
  "*.egg-info",
  ".eggs",
];

// RTK: tree.rs::run — inject `-I <noise joined by |>` unless `-a`/`--all` is set or
// the user already supplied an ignore pattern. The user's own args follow, so
// explicit flags and paths are preserved (default path stays the user's `.`).
export function buildTreeArgs(userArgs: string[]): string[] {
  const showAll = userArgs.some((a) => a === "-a" || a === "--all");
  const hasIgnore = userArgs.some((a) => a === "-I" || a.startsWith("--ignore="));
  const out: string[] = [];
  if (!showAll && !hasIgnore) {
    out.push("-I", NOISE_DIRS.join("|"));
  }
  out.push(...userArgs);
  return out;
}

// RTK: tree.rs::filter_tree_output.
function filterTreeOutput(raw: string): string {
  const lines = raw.split("\n");
  // Rust's `str::lines()` ignores a single trailing newline; mirror that so a
  // raw ending in "\n" does not introduce a spurious empty final element.
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    return "\n";
  }

  const filtered: string[] = [];
  for (const line of lines) {
    // Skip the final summary line (e.g. "5 directories, 23 files").
    if (line.includes("director") && line.includes("file")) {
      continue;
    }
    // Skip leading empty lines.
    if (line.trim() === "" && filtered.length === 0) {
      continue;
    }
    filtered.push(line);
  }

  // Remove trailing empty lines.
  while (filtered.length > 0 && filtered[filtered.length - 1]!.trim() === "") {
    filtered.pop();
  }

  return `${filtered.join("\n")}\n`;
}

function formatTree(raw: RawResult): string {
  return filterTreeOutput(raw.stdout);
}

export const treeHandler: CommandHandler = {
  name: "tree",
  programs: ["tree"],
  matches(command) {
    return command.program === "tree";
  },
  execute(command) {
    // RTK: tree.rs::run — rewrite the invocation to exclude noise directories so
    // the rendered tree (and thus the token cost) drops sharply on real projects.
    const rewritten: ParsedCommand = {
      ...command,
      args: buildTreeArgs(command.args),
      original: ["tree", ...buildTreeArgs(command.args)],
      displayCommand: `tree ${buildTreeArgs(command.args).join(" ")}`.trim(),
    };
    return executeCommand(rewritten);
  },
  async filter(raw, command, options: TgOptions) {
    return makeFilteredResult(this.name, raw, formatTree(raw), options);
  },
};
