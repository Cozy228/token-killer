import type { OmissionDeclaration } from "../../types.js";
import { defineHandler } from "../define.js";
import { compactUnifiedDiff } from "./compactDiff.js";

// RTK: git/diff_cmd.rs + pipe_cmd.rs::git_diff_wrapper — `rtk git diff` filters
// the diff with `compact_diff(input, 200)` and emits only the condensed changes
// (per-file header + hunks + `+N -M`), no diffstat. ctx mirrors this: the filter
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

export const gitDiffHandler = defineHandler({
  name: "git-diff",
  traits: { structural: true, ladder: true, cacheable: true, ttlClass: "fast" },
  programs: ["git"],

  match(command) {
    return command.program === "git" && command.args[0] === "diff";
  },

  format(raw, _command, _options) {
    const { output, omission } = formatDiff(raw.stdout || raw.stderr);
    return { output, omission };
  },
});
