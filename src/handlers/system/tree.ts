import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { parseLevel, stripLevelFlags } from "../common/level.js";

// RTK: system/tree.rs — proxy to native `tree`, stripping the trailing
// `N directories, M files` summary line while preserving the tree hierarchy
// (├──/└──/│). Trailing empty lines are removed. The bulk of RTK's savings comes
// from rewriting the `tree` invocation with `-I <noise>` so heavy directories
// (node_modules, .git, dist, …) are excluded before the tree is even rendered;
// tk reproduces both the command rewrite (buildTreeArgs) and filter_tree_output.

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

// tk divergence (see docs/align-rtk-divergences.md G3): inject tree's native
// `--filelimit N` so genuinely oversized directories render as a single line with
// a count marker (`[N entries exceeds filelimit, not opening dir]`) while the full
// directory skeleton and DEPTH are preserved. RTK has no fan-out cap. Provisional
// default, pending real-monorepo calibration.
const TREE_FILELIMIT = 25;

// RTK: tree.rs::run — inject `-I <noise joined by |>` unless `-a`/`--all` is set or
// the user already supplied an ignore pattern. On top of that, inject the shared
// `--level` dial's fan-out cap. The user's own args follow, so explicit flags and
// paths are preserved (default path stays the user's `.`).
//
// --level mapping (tree has no line-dedup analogue, so minimal == none here):
//   none / minimal  -I only — full tree, structure-lossless
//   balanced (def)  -I + --filelimit N — collapse oversized dirs, DEPTH preserved
//   aggressive      -I + --filelimit N + -d — directories only (maximal skeleton)
export function buildTreeArgs(userArgs: string[]): string[] {
  const level = parseLevel(userArgs, { fallback: "balanced" });
  const cleaned = stripLevelFlags(userArgs);
  const showAll = cleaned.some((a) => a === "-a" || a === "--all");
  const hasIgnore = cleaned.some((a) => a === "-I" || a.startsWith("--ignore="));
  const hasFilelimit = cleaned.some((a) => a === "--filelimit" || a.startsWith("--filelimit="));

  const out: string[] = [];
  if (!showAll && !hasIgnore) {
    out.push("-I", NOISE_DIRS.join("|"));
  }
  // Cap fan-out on balanced/aggressive only; never override a user --filelimit,
  // and -a (show everything) opts out of the cap too.
  if ((level === "balanced" || level === "aggressive") && !hasFilelimit && !showAll) {
    out.push("--filelimit", String(TREE_FILELIMIT));
  }
  if (level === "aggressive") {
    out.push("-d");
  }
  out.push(...cleaned);
  return out;
}

// Cross-platform fail-open: `--filelimit` is unsupported on busybox / very old BSD
// tree. Detect the unknown-option failure so the proxy can re-run with the user's
// original args rather than erroring out (retention-first).
function treeOptionUnsupported(result: RawResult): boolean {
  if (result.exitCode === 0) return false;
  const stderr = result.stderr.toLowerCase();
  return (
    stderr.includes("--filelimit") ||
    stderr.includes("unknown option") ||
    stderr.includes("invalid option") ||
    stderr.includes("illegal option")
  );
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
  traits: { cacheable: true, ttlClass: "fast" },
  programs: ["tree"],
  matches(command) {
    return command.program === "tree";
  },
  async execute(command) {
    // RTK: tree.rs::run — rewrite the invocation to exclude noise directories so
    // the rendered tree (and thus the token cost) drops sharply on real projects;
    // tk additionally injects the --level fan-out cap (buildTreeArgs).
    const args = buildTreeArgs(command.args);
    const rewritten: ParsedCommand = {
      ...command,
      args,
      original: ["tree", ...args],
      displayCommand: `tree ${args.join(" ")}`.trim(),
    };
    const result = await executeCommand(rewritten);

    // Fail-open: a tree that does not understand --filelimit must not error out
    // the proxy — re-run with the user's ORIGINAL args (level flags stripped, as
    // tree never understands --level either).
    if (treeOptionUnsupported(result)) {
      const original = stripLevelFlags(command.args);
      return executeCommand({
        ...command,
        args: original,
        original: ["tree", ...original],
        displayCommand: `tree ${original.join(" ")}`.trim(),
      });
    }
    return result;
  },
  async filter(raw, command, options: TkOptions) {
    return makeFilteredResult(this, raw, formatTree(raw), options);
  },
};
