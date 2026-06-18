import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

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

// Issue #40: locate the per-worktree git directory by walking up from `cwd`,
// purely with stat/readFile (no `git` fork) so the compression hot path stays
// cheap. A `.git` DIRECTORY is the main worktree's git dir. A `.git` FILE marks a
// linked worktree (`gitdir: <common>/worktrees/<name>`) — the in-progress state
// files (MERGE_HEAD, rebase-merge/, …) and the detached HEAD live in THAT per-
// worktree dir, not the common dir, so we follow the pointer. `GIT_DIR` (when an
// env override is in effect) wins outright. Returns undefined when no repo is
// found; the caller then skips probing entirely (a non-repo status already exits
// nonzero on the porcelain spawn). Capped at 64 levels like core/dataDir.ts.
export function resolveGitDir(cwd: string): string | undefined {
  const override = process.env.GIT_DIR;
  if (override) return isAbsolute(override) ? override : resolve(cwd, override);

  let dir = cwd;
  for (let depth = 0; depth < 64; depth += 1) {
    const dotgit = join(dir, ".git");
    let stat: ReturnType<typeof statSync> | undefined;
    try {
      stat = statSync(dotgit);
    } catch {
      stat = undefined;
    }
    if (stat) {
      if (stat.isDirectory()) return dotgit;
      // `.git` file → linked worktree pointer. Resolve it relative to the dir
      // holding the file. An unparseable file means we can't probe; bail.
      try {
        const match = /gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotgit, "utf8"));
        if (match) {
          const target = match[1]!;
          return isAbsolute(target) ? target : resolve(dir, target);
        }
      } catch {
        // fall through to undefined
      }
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// Issue #40: in-progress operations git would print in the human status block
// (rebase / merge / cherry-pick / revert / bisect / am) leave a marker file or
// directory in the git dir. `--porcelain -b` drops that block, so RTK recovered
// it from a SECOND full `git status` capture. These probes are a handful of
// existsSync calls instead — they tell us *whether* an operation is in progress
// without a spawn, so the second capture only runs when one actually is. The
// marker→summary map mirrors detectStatusState; a present marker but no exact
// summary still flags "an op is in progress" so the caller knows to capture.
const STATE_MARKERS: Array<{ paths: string[]; summary?: string }> = [
  // rebase-merge covers interactive + merge-backend rebases AND the `am` session
  // path? No: `git am` uses rebase-apply. Both map to a rebase/am summary the
  // second capture refines, so leave summary undefined and let extractStateHeader
  // produce the precise phrase ("rebase in progress" vs "am session in progress").
  { paths: ["rebase-merge", "rebase-apply"] },
  { paths: ["MERGE_HEAD"], summary: "merge in progress" },
  { paths: ["CHERRY_PICK_HEAD"], summary: "cherry-pick in progress" },
  { paths: ["REVERT_HEAD"], summary: "revert in progress" },
  { paths: ["BISECT_LOG"], summary: "bisect in progress" },
];

// True when any in-progress-operation marker is present under `gitDir`. Cheap:
// a few existsSync calls, no spawn.
export function hasInProgressState(gitDir: string): boolean {
  return STATE_MARKERS.some(({ paths }) => paths.some((p) => existsSync(join(gitDir, p))));
}

// Issue #40: recover the detached-HEAD ref WITHOUT the second `git status`.
// `--porcelain -b` collapses detached HEAD to `## HEAD (no branch)`; the human
// capture printed `HEAD detached at <short-oid>`. When detached, the git dir's
// `HEAD` file holds the raw object id (a plain 40/64-hex line, not `ref: ...`),
// so we read it and abbreviate to git's default 7-char form, reconstructing the
// same `HEAD detached at <short>` line extractDetachedHead would have returned.
// Returns undefined if HEAD is a symref (on a branch) or unreadable, leaving the
// porcelain `* HEAD (no branch)` fallback in place.
export function detachedHeadFromGitDir(gitDir: string): string | undefined {
  let head: string;
  try {
    head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  } catch {
    return undefined;
  }
  if (head.startsWith("ref:")) return undefined; // on a branch, not detached
  if (!/^[0-9a-f]{7,64}$/.test(head)) return undefined;
  return `HEAD detached at ${head.slice(0, 7)}`;
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

    // Issue #40: RTK ran the child TWICE on every compact status — once as
    // `git status --porcelain -b` (the formatted output) and once as a plain
    // `git status` (C locale) captured ONLY to recover the in-progress-operation
    // header and the detached-HEAD ref. That doubled latency on the common
    // clean/dirty tree where neither recovery is needed (~600ms/call on AV-heavy
    // boxes). We now spawn once on that hot path: the porcelain capture, plus a
    // few existsSync/readFile probes under the git dir that recover detached HEAD
    // for free and tell us *whether* an operation is in progress. The second
    // human `git status` only runs when a `.git/` state marker is actually
    // present — i.e. only mid rebase/merge/cherry-pick/revert/bisect/am.
    const porcelain = await executeCommand({
      ...command,
      args: ["status", "--porcelain", "-b"],
      displayCommand: "git status --porcelain -b",
    });

    if (porcelain.exitCode !== 0) {
      // Not a repo / index.lock / dubious ownership — the filter surfaces the
      // error verbatim; no point probing or capturing further.
      return porcelain;
    }

    const gitDir = resolveGitDir(process.cwd());

    // Only fall back to the second full capture when the git dir shows an
    // operation in progress; that's the sole thing the porcelain output + probes
    // can't summarise on their own.
    if (gitDir && hasInProgressState(gitDir)) {
      const human = await executeCommand(
        { ...command, args: ["status", ...args] },
        { LC_ALL: "C" },
      );
      return { ...porcelain, auxStdout: human.stdout };
    }

    // Fast path — one spawn. Recover the detached-HEAD ref from the git dir's
    // HEAD file (filesystem, no spawn) when porcelain collapsed it to
    // `## HEAD (no branch)`, and synthesise a minimal auxStdout carrying just
    // that line so the existing filter logic (extractDetachedHead) stays unchanged.
    const isDetached = porcelain.stdout
      .split(/\r?\n/)
      .some((l) => l.trim() === "## HEAD (no branch)");
    const detached = gitDir && isDetached ? detachedHeadFromGitDir(gitDir) : undefined;
    return detached ? { ...porcelain, auxStdout: detached } : porcelain;
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

    if (raw.exitCode !== 0) {
      // C2-status: any nonzero exit (not just "not a git repository") must return
      // raw stdout+stderr — falling through to formatStatusOutput("") would emit
      // "Clean working tree" and discard the real error (index.lock, dubious
      // ownership, etc.).
      if (/not a git repository/.test(raw.stderr)) {
        return makeFilteredResult(this, raw, "Not a git repository\n", options);
      }
      return makeFilteredResult(this, raw, `${raw.stdout}${raw.stderr}`, options);
    }

    const aux = raw.auxStdout ?? "";
    const detached = extractDetachedHead(aux);
    let formatted = formatStatusOutput(raw.stdout, detached);
    const state = extractStateHeader(aux);
    if (state) {
      formatted = `${state}\n${formatted}`;
    }

    // Issue #40 savings baseline — deliberate RTK-parity trade-off.
    //
    // RTK tracked savings against the plain `git status` capture (raw_output),
    // not the compact `--porcelain -b` stdout, so its reported numbers reflected
    // human→compact. We now AVOID that second spawn on the common path, so a full
    // human capture only exists when an operation is in progress (the in-progress
    // fallback ran). In that case `auxStdout` is the full human status and we use
    // it as the baseline, preserving the exact RTK savings number. On the fast
    // path `auxStdout` is either absent or holds ONLY the synthesised
    // `HEAD detached at …` recovery line — never a full capture — so we fall back
    // to the porcelain stdout as the baseline. The reported savings on the common
    // path are therefore porcelain→formatted (smaller, since porcelain is already
    // terse) rather than human→formatted; this is an intentional accuracy↔latency
    // trade documented in the PR, not a regression in what's compressed.
    // The fast-path detached recovery line is a SINGLE `HEAD detached at …`
    // line; a real human capture is always multi-line (the status block), so a
    // one-line `HEAD detached` aux can only be our synthesised marker.
    const auxTrimmed = aux.trim();
    const isSynthesizedDetachedLine =
      auxTrimmed !== "" && !auxTrimmed.includes("\n") && auxTrimmed.startsWith("HEAD detached ");
    const fullHuman = aux !== "" && !isSynthesizedDetachedLine ? aux : "";
    const baseline: RawResult = fullHuman
      ? { ...raw, stdout: fullHuman, stderr: "", auxStdout: undefined }
      : raw;

    return makeFilteredResult(this, baseline, `${formatted}\n`, options);
  },
};
