import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: rtk/src/core/truncate.rs::CAP_WARNINGS — cap the remote-only section at 10.
const MAX_REMOTE_BRANCHES = 10;

// RTK: git.rs::filter_branch_output — keep the current branch and locals, fold remote
// branches down to their bare name, drop ones that duplicate a local/current, and list
// the remaining remote-only branches under a capped "remote-only (N):" section.
function formatBranch(text: string): string {
  let current = "";
  const local: string[] = [];
  const remote: string[] = [];
  const seenRemote = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("* ")) {
      current = line.slice(2);
    } else if (line.startsWith("remotes/")) {
      const rest = line.slice("remotes/".length);
      const slash = rest.indexOf("/");
      if (slash === -1) continue;
      const branch = rest.slice(slash + 1);
      if (branch.startsWith("HEAD ")) continue;
      if (!seenRemote.has(branch)) {
        seenRemote.add(branch);
        remote.push(branch);
      }
    } else {
      local.push(line);
    }
  }

  if (current === "" && local.length === 0 && remote.length === 0) return "\n";

  const out = [`* ${current}`];
  for (const branch of local) out.push(`  ${branch}`);

  const remoteOnly = remote.filter((branch) => branch !== current && !local.includes(branch));
  if (remoteOnly.length > 0) {
    out.push(`  remote-only (${remoteOnly.length}):`);
    for (const branch of remoteOnly.slice(0, MAX_REMOTE_BRANCHES)) out.push(`    ${branch}`);
    if (remoteOnly.length > MAX_REMOTE_BRANCHES) {
      out.push(`    ... +${remoteOnly.length - MAX_REMOTE_BRANCHES} more`);
    }
  }

  return `${out.join("\n")}\n`;
}

// RTK: git.rs::run_branch — flags after `branch` select one of three modes.
// `--show-current` prints the raw branch name; an action flag (delete/rename/
// copy/upstream) or a bare positional without a list flag is a write op; anything
// else is a list. Only list mode is rewritten + filtered.
type BranchMode = "show-current" | "write" | "list";

// RTK: git.rs::run_branch — action flags that mutate refs (delete/rename/copy/
// upstream tracking), producing a write op rather than a listing.
function hasActionFlag(rest: string[]): boolean {
  return rest.some(
    (a) =>
      a === "-d" ||
      a === "-D" ||
      a === "-m" ||
      a === "-M" ||
      a === "-c" ||
      a === "-C" ||
      a === "--set-upstream-to" ||
      a.startsWith("--set-upstream-to=") ||
      a === "-u" ||
      a === "--unset-upstream" ||
      a === "--edit-description",
  );
}

// RTK: git.rs::run_branch — flags that request a specific listing shape.
function hasListFlag(rest: string[]): boolean {
  return rest.some(
    (a) =>
      a === "-a" ||
      a === "--all" ||
      a === "-r" ||
      a === "--remotes" ||
      a === "--list" ||
      a === "--merged" ||
      a === "--no-merged" ||
      a === "--contains" ||
      a === "--no-contains" ||
      a === "--format" ||
      a.startsWith("--format=") ||
      a === "--sort" ||
      a.startsWith("--sort=") ||
      a === "--points-at" ||
      a.startsWith("--points-at="),
  );
}

// RTK: git.rs::run_branch dispatch order — show-current wins, then write ops,
// then list. `rest` is the args after the `branch` subcommand.
export function branchMode(rest: string[]): BranchMode {
  if (rest.includes("--show-current")) return "show-current";
  const hasPositional = rest.some((a) => !a.startsWith("-"));
  if (hasActionFlag(rest) || (hasPositional && !hasListFlag(rest))) return "write";
  return "list";
}

// RTK: git.rs::run_branch — only the list mode rewrites the command, adding `-a`
// (unless a list flag already scopes the listing) and `--no-color` before the
// user's args. show-current / write ops run the user's command verbatim. The
// migration harness bypasses execute(), so this helper (and its unit test) guards
// the real-CLI command shape. `args` is the full `["branch", ...rest]`.
export function buildBranchArgs(args: string[]): string[] {
  const rest = args.slice(1);
  if (branchMode(rest) !== "list") {
    return args;
  }
  const out = ["branch"];
  if (!hasListFlag(rest)) out.push("-a");
  out.push("--no-color");
  out.push(...rest);
  return out;
}

export const gitBranchHandler: CommandHandler = {
  name: "git-branch",
  traits: { cacheable: true, ttlClass: "fast" },
  programs: ["git"],

  matches(command) {
    return command.program === "git" && command.args[0] === "branch";
  },

  execute(command) {
    // RTK: git.rs rewrites list mode to `branch [-a] --no-color <args>`; other
    // modes pass through. Never mutate the original so the filter sees user args.
    const args = buildBranchArgs(command.args);
    return executeCommand({
      ...command,
      args,
      original: ["git", ...args],
      displayCommand: `git ${args.join(" ")}`,
    });
  },

  async filter(raw, command, options) {
    const rest = command.args.slice(1);
    const mode = branchMode(rest);

    // RTK: git.rs — on failure the raw stderr/stdout is surfaced verbatim so
    // diagnostics survive (truncating a branch error would be misleading).
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this, raw, rawText(raw), options);
    }

    // RTK: git.rs — show-current prints the bare branch name; a write op prints
    // "ok"; only the list mode is folded into the compact branch view.
    if (mode === "show-current") {
      return makeFilteredResult(this, raw, `${raw.stdout.trim()}\n`, options);
    }
    if (mode === "write") {
      return makeFilteredResult(this, raw, "ok\n", options);
    }
    return makeFilteredResult(this, raw, formatBranch(raw.stdout || raw.stderr), options);
  },
};
