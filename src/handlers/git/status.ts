import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: git/git.rs::uses_compact_status_path — empty args or any combination of
// branch/short flags routes through the forced `--porcelain -b` compact path.
// Anything else (-uno, --porcelain alone, pathspecs) is treated as explicit and
// passes through with minimal filtering.
export function usesCompactStatusPath(args: string[]): boolean {
  if (args.length === 0) return true;

  let sawBranch = false;
  for (const arg of args) {
    switch (arg) {
      case "-b":
      case "--branch":
        sawBranch = true;
        break;
      case "-sb":
      case "-bs":
        return true;
      case "-s":
      case "--short":
        break;
      default:
        return false;
    }
  }
  return sawBranch;
}

// RTK: git/git.rs::build_status_command — compact path forces `status --porcelain -b`;
// otherwise the user's args pass through verbatim.
export function buildStatusArgs(args: string[]): string[] {
  if (usesCompactStatusPath(args)) {
    return ["status", "--porcelain", "-b"];
  }
  return ["status", ...args];
}

// RTK: git/git.rs::format_status_inner — render `--porcelain -b` output. The
// branch line (`## main...origin/main`) becomes `* main...origin/main`; every
// other porcelain line is preserved verbatim (no recategorising, no overflow
// markers). A lone branch line means a clean tree.
export function formatStatusOutput(porcelain: string, detached?: string): string {
  const lines = porcelain.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return "Clean working tree";
  }

  const output: string[] = [];
  const first = lines[0]!;
  if (first.startsWith("##")) {
    let branch = first;
    while (branch.startsWith("## ")) branch = branch.slice(3);
    output.push(`* ${detached ?? branch}`);
  } else {
    output.push(first);
  }

  for (const line of lines.slice(1)) {
    output.push(line);
  }

  if (lines.length === 1 && lines[0]!.startsWith("##")) {
    output.push("clean — nothing to commit");
  }

  return output.join("\n");
}

// RTK: git/git.rs::GitStatusState — compact in-progress summaries.
const STATE_SUMMARIES: Array<{ test: (line: string) => boolean; summary: string }> = [
  {
    test: (l) => l.includes("All conflicts fixed but you are still merging"),
    summary: "merge in progress. no conflicts",
  },
  {
    test: (l) => l.includes("You have unmerged paths"),
    summary: "merge in progress. unresolved conflicts",
  },
  {
    test: (l) => l.includes("You are currently cherry-picking"),
    summary: "cherry-pick in progress",
  },
  { test: (l) => l.includes("You are currently reverting"), summary: "revert in progress" },
  { test: (l) => l.includes("You are currently bisecting"), summary: "bisect in progress" },
  {
    test: (l) => l.includes("You are in the middle of an am session"),
    summary: "am session in progress",
  },
  { test: (l) => l.includes("You are in a sparse checkout"), summary: "sparse checkout enabled" },
];

// RTK: git/git.rs::REBASE_INDICATORS
const REBASE_INDICATORS = [
  "rebase in progress",
  "You are currently rebasing",
  "You are currently editing",
  "You are currently splitting",
  "Last command done",
  "Next command to do",
  "No commands remaining",
];

function detectStatusState(line: string): string | undefined {
  for (const { test, summary } of STATE_SUMMARIES) {
    if (test(line)) return summary;
  }
  if (REBASE_INDICATORS.some((indicator) => line.includes(indicator))) {
    return "rebase in progress";
  }
  return undefined;
}

// RTK: git/git.rs::extract_state_header — `--porcelain -b` drops git's rebase /
// merge / cherry-pick / bisect / am / sparse state block. Recover a compact
// summary from the plain-status capture, stopping at the file-change headers.
export function extractStateHeader(raw: string): string | undefined {
  const stoppers = [
    "Changes to be committed:",
    "Changes not staged for commit:",
    "Untracked files:",
    "Unmerged paths:",
    "no changes added to commit",
    "nothing to commit",
    "nothing added to commit",
  ];

  for (const line of raw.split(/\r?\n/)) {
    const stripped = line.trim();
    if (stoppers.some((s) => stripped.startsWith(s))) break;
    const state = detectStatusState(stripped);
    if (state) return state;
  }
  return undefined;
}

// RTK: git/git.rs::extract_detached_head — porcelain collapses detached HEAD to
// `## HEAD (no branch)`; recover the explicit `HEAD detached at <ref>` line.
export function extractDetachedHead(raw: string): string | undefined {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("HEAD detached "));
}

// RTK: git/git.rs::filter_status_with_args — minimal filtering for explicit args:
// drop git hints + empty lines, collapse a clean tree to its one-line summary.
export function filterStatusWithArgs(output: string): string {
  const result: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (
      trimmed.startsWith('(use "git') ||
      trimmed.startsWith("(create/copy files") ||
      trimmed.includes('(use "git add') ||
      trimmed.includes('(use "git restore')
    ) {
      continue;
    }
    if (trimmed.includes("nothing to commit") && trimmed.includes("working tree clean")) {
      result.push(trimmed);
      break;
    }
    result.push(line);
  }

  return result.length === 0 ? "ok" : result.join("\n");
}

function statusArgs(command: ParsedCommand): string[] {
  // command.args === ["status", ...rest]; RTK reasons about the trailing args.
  return command.args.slice(1);
}

export const gitStatusHandler: CommandHandler = {
  name: "git-status",
  traits: { structural: true, cacheable: true, ttlClass: "fast" },
  programs: ["git"],

  matches(command) {
    return command.program === "git" && command.args[0] === "status";
  },

  async execute(command) {
    const args = statusArgs(command);

    if (!usesCompactStatusPath(args)) {
      return executeCommand(command);
    }

    // RTK runs `git status --porcelain -b` for the compact formatted output and a
    // plain `git status` (C locale, so the English state phrases parse) for the
    // in-progress state / detached-HEAD recovery.
    const porcelain = await executeCommand({
      ...command,
      args: ["status", "--porcelain", "-b"],
      displayCommand: "git status --porcelain -b",
    });
    const human = await executeCommand({ ...command, args: ["status", ...args] }, { LC_ALL: "C" });
    return { ...porcelain, auxStdout: human.stdout };
  },

  async filter(raw: RawResult, command, options: TkOptions) {
    const args = statusArgs(command);

    if (!usesCompactStatusPath(args)) {
      // RTK: git.rs::run_status explicit-args path — on failure it prints git's
      // stderr and surfaces the raw (empty) stdout WITHOUT minimal filtering.
      // filter_status_with_args("") would collapse to "ok", masking the error,
      // so on a non-zero exit return the raw streams verbatim.
      if (raw.exitCode !== 0) {
        return makeFilteredResult(this, raw, rawText(raw), options);
      }
      return makeFilteredResult(this, raw, `${filterStatusWithArgs(raw.stdout)}\n`, options);
    }

    if (raw.exitCode !== 0 && /not a git repository/.test(raw.stderr)) {
      return makeFilteredResult(this, raw, "Not a git repository\n", options);
    }

    const human = raw.auxStdout ?? "";
    const detached = extractDetachedHead(human);
    let formatted = formatStatusOutput(raw.stdout, detached);
    const state = extractStateHeader(human);
    if (state) {
      formatted = `${state}\n${formatted}`;
    }

    // RTK: git.rs::run_status tracks savings against the plain `git status`
    // capture (raw_output), not the compact `--porcelain -b` stdout. When the
    // plain capture is available (real execution), use it as the savings/raw
    // baseline so reported savings reflect human→compact, matching RTK. In the
    // formatter-only test path auxStdout is absent, so fall back to `raw`.
    const baseline: RawResult = human
      ? { ...raw, stdout: human, stderr: "", auxStdout: undefined }
      : raw;

    return makeFilteredResult(this, baseline, `${formatted}\n`, options);
  },
};
