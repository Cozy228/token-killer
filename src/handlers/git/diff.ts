import { executeCommand } from "../../executor.js";
import type { CommandHandler, OmissionDeclaration } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { compactUnifiedDiff } from "./compactDiff.js";

// RTK: git/diff_cmd.rs + pipe_cmd.rs::git_diff_wrapper — `rtk git diff` filters
// the diff with `compact_diff(input, 200)` and emits only the condensed changes
// (per-file header + hunks + `+N -M`), no diffstat. tk mirrors this: the filter
// processes ONLY the provided diff text, never shelling out to `git diff --stat`
// (which would read live working-tree state and corrupt fixture/stdin filtering).
function formatDiff(text: string): { output: string; omission?: OmissionDeclaration } {
  const trimmed = text.trim();
  if (!trimmed) return { output: "" };
  // A `git diff --stat`/`--numstat` invocation already produces a compact summary
  // (no `diff --git` headers); pass it through unchanged.
  if (/^diff --git /m.test(text)) {
    const { text: compact, omission } = compactUnifiedDiff(text);
    return { output: `${compact.trimEnd()}\n`, omission };
  }
  return { output: `${trimmed}\n` };
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
    const { output, omission } = formatDiff(raw.stdout || raw.stderr);
    return makeFilteredResult(this.name, raw, output, options, undefined, omission);
  },
};
