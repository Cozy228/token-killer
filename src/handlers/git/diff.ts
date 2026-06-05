import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { compactUnifiedDiff } from "./compactDiff.js";

// RTK: git/diff_cmd.rs + pipe_cmd.rs::git_diff_wrapper — `rtk git diff` filters
// the diff with `compact_diff(input, 200)` and emits only the condensed changes
// (per-file header + hunks + `+N -M`), no diffstat. tg mirrors this: the filter
// processes ONLY the provided diff text, never shelling out to `git diff --stat`
// (which would read live working-tree state and corrupt fixture/stdin filtering).
function formatDiff(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  // A `git diff --stat`/`--numstat` invocation already produces a compact summary
  // (no `diff --git` headers); pass it through unchanged.
  if (/^diff --git /m.test(text)) {
    return `${compactUnifiedDiff(text).trimEnd()}\n`;
  }
  return `${trimmed}\n`;
}

export const gitDiffHandler: CommandHandler = {
  name: "git-diff",
  programs: ["git"],

  matches(command) {
    return command.program === "git" && command.args[0] === "diff";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    return makeFilteredResult(this.name, raw, formatDiff(raw.stdout || raw.stderr), options);
  },
};
