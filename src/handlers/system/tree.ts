import { executeCommand } from "../../executor.js";
import type { CommandHandler, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/tree.rs — proxy to native `tree`, stripping the trailing
// `N directories, M files` summary line while preserving the tree hierarchy
// (├──/└──/│). Trailing empty lines are removed. tg consumes the already-rendered
// tree output, so we only reproduce filter_tree_output (the noise -I exclusion is
// done by the real `tree` invocation before tg sees the bytes).

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
  matches(command) {
    return command.program === "tree";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, command, options: TgOptions) {
    return makeFilteredResult(this.name, raw, formatTree(raw), options);
  },
};
