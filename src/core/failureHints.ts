// Inline failure-fix hints (scheme 2).
//
// Under usage-based billing the expensive unit is the round-trip: a failed
// command the agent doesn't immediately understand costs another model turn (and
// a full context resend) to diagnose. When a command ctx wraps fails with a
// DETERMINISTIC, pattern-matched error, we append one short fix hint so the agent
// can act without a diagnostic round-trip.
//
// Hard rules (a wrong hint is worse than none — it sends the agent down a wrong
// path = MORE round-trips):
//   - Fire ONLY on exitCode !== 0.
//   - Match only stable, unambiguous error strings / exit codes. Never guess.
//   - The hint is ctx-added guidance, printed by the CLI presentation layer AFTER
//     the filtered output (see cli.ts runCompress). It is NOT part of the
//     compressed output and is never counted toward savings or the quality gate,
//     so it can never trip the inflation/omission fallback.

import type { ParsedCommand, RawResult } from "../types.js";

type HintRule = {
  id: string;
  test: (text: string, raw: RawResult, command: ParsedCommand) => boolean;
  hint: string;
};

// Ordered most-specific first. `text` is the lowercased stdout+stderr.
const RULES: HintRule[] = [
  {
    id: "git_push_non_fast_forward",
    test: (t) =>
      /\b(rejected|failed to push)\b/.test(t) &&
      /(non-fast-forward|fetch first|tip of your current branch is behind)/.test(t),
    hint: "remote has commits your branch lacks — run `ctx git pull --rebase` then push again.",
  },
  {
    id: "git_unmerged_paths",
    test: (t) =>
      /(you have unmerged paths|fix conflicts and then|unmerged files|needs merge)/.test(t),
    hint: "resolve the conflicted files, `git add` them, then continue the merge/rebase.",
  },
  {
    id: "not_a_git_repo",
    test: (t) => /not a git repository/.test(t),
    hint: "not inside a git repository — cd to the repo root (or run `git init`).",
  },
  {
    id: "missing_npm_script",
    test: (t) => /missing script:|command ".*" not found|no script named/.test(t),
    hint: 'no such package.json script — check the "scripts" block (or run the tool directly).',
  },
  {
    id: "command_not_found",
    test: (t, raw) => raw.exitCode === 127 || /command not found/.test(t),
    hint: "command not found — the program is not installed or not on PATH.",
  },
  {
    id: "permission_denied",
    test: (t) => /permission denied|\beacces\b/.test(t),
    hint: "permission denied — check the file's mode/ownership; do not use sudo in an agent shell.",
  },
];

// Returns a single short fix-hint line (no prefix, no trailing newline), or
// undefined when nothing deterministic matches.
export function failureHint(raw: RawResult, command: ParsedCommand): string | undefined {
  if (raw.exitCode === 0) return undefined;
  const text = `${raw.stdout}\n${raw.stderr}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.test(text, raw, command)) return rule.hint;
  }
  return undefined;
}
