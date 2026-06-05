import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/pipe_cmd.rs — `rtk pipe [filter]` reads stdin and runs a named or
// auto-detected filter over arbitrary piped command output. In tg the command is
// invoked as `pipe <cmd> <args...>` and the filtered content is raw.stdout/stderr.
//
// This port faithfully reproduces the logic that lives inside pipe_cmd.rs itself:
//   - resolve_filter() name dispatch for the wrappers defined locally (grep/rg,
//     find/fd) plus the identity passthrough for unknown names.
//   - auto_detect_filter() content sniffing.
//   - grep_wrapper() / find_wrapper() grouping + caps.
// Named filters that delegate to OTHER RTK modules (cargo-test, pytest, go-test,
// go-build, tsc, vitest, git-log, git-diff, git-status, log, mypy, ruff-check,
// ruff-format, prettier) are documented as gaps — porting them would mean
// re-porting whole separate commands, out of scope for migrating `pipe`.

// RTK: truncate.rs::CAP_WARNINGS = 10, CAP_LIST = 20.
const CAP_WARNINGS = 10;
const CAP_LIST = 20;

// RTK: pipe_cmd.rs top-level consts.
const MAX_PIPE_MATCHES = CAP_WARNINGS; // 10
const MAX_PIPE_FILES = CAP_WARNINGS; // 10
const MAX_PIPE_DIRS = CAP_LIST; // 20

type PipeFilter = (input: string) => string;

// RTK: pipe_cmd.rs::identity_filter.
function identityFilter(input: string): string {
  return input;
}

// RTK: pipe_cmd.rs::grep_wrapper — group `file:line:content` matches by file with
// a "N matches in MF:" header, capping shown matches per file at MAX_PIPE_MATCHES.
function grepWrapper(input: string): string {
  const byFile = new Map<string, Array<[string, string]>>();
  let total = 0;

  for (const line of input.split("\n")) {
    // RTK: line.splitn(3, ':') — split into at most 3 parts on ':'.
    const first = line.indexOf(":");
    if (first === -1) continue;
    const second = line.indexOf(":", first + 1);
    if (second === -1) continue;
    const file = line.slice(0, first);
    const lineNum = line.slice(first + 1, second);
    const content = line.slice(second + 1);
    // RTK: parts[1].parse::<usize>() — the middle field must be a number.
    if (!/^\d+$/.test(lineNum)) continue;
    total += 1;
    const entry = byFile.get(file);
    if (entry) entry.push([lineNum, content]);
    else byFile.set(file, [[lineNum, content]]);
  }

  // RTK: returns input unchanged when nothing parsed as a match.
  if (total === 0) return input;

  let out = `${total} matches in ${byFile.size}F:\n\n`;
  // RTK: files.sort_by_key(|(f, _)| *f) — sort file keys ascending.
  const files = [...byFile.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  for (const [file, matches] of files) {
    out += `[file] ${file} (${matches.length}):\n`;
    for (const [lineNum, content] of matches.slice(0, MAX_PIPE_MATCHES)) {
      // RTK: format!("  {:>4}: {}", line_num, content.trim()) — right-align to 4.
      out += `  ${lineNum.padStart(4)}: ${content.trim()}\n`;
    }
    if (matches.length > MAX_PIPE_MATCHES) {
      out += `  +${matches.length - MAX_PIPE_MATCHES}\n`;
    }
    out += "\n";
  }

  return out;
}

// RTK: pipe_cmd.rs::find_wrapper — group file paths by their parent directory with
// a "N files in M dirs:" header, capping dirs at MAX_PIPE_DIRS and files per dir at
// MAX_PIPE_FILES.
function findWrapper(input: string): string {
  const paths = input.split("\n").filter((l) => l.trim() !== "");

  // RTK: returns input unchanged when there are no non-empty paths.
  if (paths.length === 0) return input;

  const byDir = new Map<string, string[]>();
  for (const pathValue of paths) {
    const pos = pathValue.lastIndexOf("/");
    const dir = pos === -1 ? "." : pathValue.slice(0, pos);
    const name = pos === -1 ? pathValue : pathValue.slice(pos + 1);
    const entry = byDir.get(dir);
    if (entry) entry.push(name);
    else byDir.set(dir, [name]);
  }

  let out = `${paths.length} files in ${byDir.size} dirs:\n\n`;
  // RTK: dirs.sort_by_key(|(d, _)| *d) — sort dir keys ascending.
  const dirs = [...byDir.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  for (const [dir, files] of dirs.slice(0, MAX_PIPE_DIRS)) {
    out += `${dir}/  (${files.length})\n`;
    for (const f of files.slice(0, MAX_PIPE_FILES)) {
      out += `  ${f}\n`;
    }
    if (files.length > MAX_PIPE_FILES) {
      out += `  +${files.length - MAX_PIPE_FILES}\n`;
    }
  }

  if (dirs.length > MAX_PIPE_DIRS) {
    out += `\n+${dirs.length - MAX_PIPE_DIRS} more dirs\n`;
  }

  return out;
}

// RTK: pipe_cmd.rs::resolve_filter — map a filter name to a filter fn. Only the
// names whose filter bodies are LOCAL to pipe_cmd.rs are ported faithfully here;
// the cross-module names are intentionally treated as "unknown" (see file header).
function resolveLocalFilter(name: string): PipeFilter | undefined {
  switch (name) {
    case "grep":
    case "rg":
      return grepWrapper;
    case "find":
    case "fd":
      return findWrapper;
    default:
      return undefined;
  }
}

// RTK: pipe_cmd.rs::auto_detect_filter — sniff the first 1KiB of input to pick a
// filter. Only the locally-defined detectors (grep, find) and the identity
// fallback are ported faithfully; cross-module detectors (cargo/pytest/go/mypy/
// vitest) fall through to identity here.
function autoDetectFilter(input: string): PipeFilter {
  // RTK: floor_char_boundary on byte 1024. JS strings are UTF-16; for the ASCII
  // inputs RTK targets, slicing by code unit reproduces the prefix behavior.
  const first1k = input.slice(0, 1024);

  // grep/rg: any of the first 5 non-empty lines matches `file:number:content`.
  const grepLike = first1k
    .split("\n")
    .slice(0, 5)
    .filter((l) => l.trim() !== "")
    .some((l) => {
      const firstColon = l.indexOf(":");
      if (firstColon === -1) return false;
      const secondColon = l.indexOf(":", firstColon + 1);
      if (secondColon === -1) return false;
      return /^\d+$/.test(l.slice(firstColon + 1, secondColon));
    });
  if (grepLike) return grepWrapper;

  // find/fd: all non-empty lines look like file paths, minimum 3 lines.
  const nonEmpty = first1k.split("\n").filter((l) => l.trim() !== "");
  const pathLike = nonEmpty.filter((l) => {
    const t = l.trim();
    return t !== "" && !t.includes(":") && (t.startsWith(".") || t.startsWith("/") || t.includes("/"));
  });
  if (nonEmpty.length >= 3 && pathLike.length === nonEmpty.length) {
    return findWrapper;
  }

  return identityFilter;
}

// RTK: in tg, raw.stdout/stderr is the piped content. The first arg (if present)
// is treated as the explicit filter name (RTK's `rtk pipe <filter>`); when absent
// or not a locally-ported name, fall back to auto-detection.
function pipeContent(raw: RawResult): string {
  return raw.stdout.length > 0 ? raw.stdout : raw.stderr;
}

function selectFilter(args: string[], input: string): PipeFilter {
  const name = args[0];
  if (name !== undefined) {
    const named = resolveLocalFilter(name);
    if (named) return named;
  }
  return autoDetectFilter(input);
}

function formatPipe(raw: RawResult, command: ParsedCommand): string {
  const input = pipeContent(raw);
  const filter = selectFilter(command.args, input);
  return filter(input);
}

export const pipeHandler: CommandHandler = {
  name: "pipe",
  matches(command) {
    return command.program === "pipe";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, command, options: TgOptions) {
    return makeFilteredResult(this.name, raw, formatPipe(raw, command), options);
  },
};
