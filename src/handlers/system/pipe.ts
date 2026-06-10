import type { ParsedCommand, RawResult } from "../../types.js";
import { defineHandler } from "../define.js";
import { type LadderResult, overBudgetLadder } from "../common/budget.js";

// RTK: system/pipe_cmd.rs — `rtk pipe [filter]` reads stdin and runs a named or
// auto-detected filter over arbitrary piped command output. In tk the command is
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

type PipeFilter = (input: string) => LadderResult;

// RTK: pipe_cmd.rs::identity_filter.
function identityFilter(input: string): LadderResult {
  return { text: input };
}

// RTK: pipe_cmd.rs::grep_wrapper — group `file:line:content` matches by file with
// a "N matches in MF:" header. ADR 0001 decisions 2/5/7: RTK's per-file
// MAX_PIPE_MATCHES (10) cap + bare "+N" overflow is REMOVED. Within budget every
// match ships; over budget the step-1 lossless digest keeps every file with its
// match count (dropping the individual match lines), then a count replacement. No
// "+N" / "+N more".
function grepWrapper(input: string): LadderResult {
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
  if (total === 0) return { text: input };

  const header = `${total} matches in ${byFile.size}F:`;
  // RTK: files.sort_by_key(|(f, _)| *f) — sort file keys ascending.
  const files = [...byFile.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const buildFull = (): string => {
    let out = `${header}\n\n`;
    for (const [file, matches] of files) {
      out += `[file] ${file} (${matches.length}):\n`;
      for (const [lineNum, content] of matches) {
        // RTK: format!("  {:>4}: {}", line_num, content.trim()) — right-align to 4.
        out += `  ${lineNum.padStart(4)}: ${content.trim()}\n`;
      }
      out += "\n";
    }
    return out;
  };
  const buildDigest = (): string => {
    let out = `${header}\n\n`;
    for (const [file, matches] of files) out += `[file] ${file} (${matches.length})\n`;
    return out;
  };

  return overBudgetLadder({ full: buildFull(), digest: buildDigest, replacement: () => header });
}

// RTK: pipe_cmd.rs::find_wrapper — group file paths by their parent directory with
// a "N files in M dirs:" header. ADR 0001 decisions 2/5/7: RTK's MAX_PIPE_DIRS (20)
// + per-dir MAX_PIPE_FILES (10) caps and their "+N" / "+N more dirs" overflow
// markers are REMOVED. Within budget every dir + file ships; over budget the step-1
// lossless digest keeps every dir with its file count (dropping the filenames),
// then a count replacement. Mirrors listLike's find ladder.
function findWrapper(input: string): LadderResult {
  const paths = input.split("\n").filter((l) => l.trim() !== "");

  // RTK: returns input unchanged when there are no non-empty paths.
  if (paths.length === 0) return { text: input };

  const byDir = new Map<string, string[]>();
  for (const pathValue of paths) {
    const pos = pathValue.lastIndexOf("/");
    const dir = pos === -1 ? "." : pathValue.slice(0, pos);
    const name = pos === -1 ? pathValue : pathValue.slice(pos + 1);
    const entry = byDir.get(dir);
    if (entry) entry.push(name);
    else byDir.set(dir, [name]);
  }

  const header = `${paths.length} files in ${byDir.size} dirs:`;
  // RTK: dirs.sort_by_key(|(d, _)| *d) — sort dir keys ascending.
  const dirs = [...byDir.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const buildFull = (): string => {
    let out = `${header}\n\n`;
    for (const [dir, files] of dirs) {
      out += `${dir}/  (${files.length})\n`;
      for (const f of files) out += `  ${f}\n`;
    }
    return out;
  };
  const buildDigest = (): string => {
    let out = `${header}\n\n`;
    for (const [dir, files] of dirs) out += `${dir}/  (${files.length})\n`;
    return out;
  };

  return overBudgetLadder({ full: buildFull(), digest: buildDigest, replacement: () => header });
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
    return (
      t !== "" && !t.includes(":") && (t.startsWith(".") || t.startsWith("/") || t.includes("/"))
    );
  });
  if (nonEmpty.length >= 3 && pathLike.length === nonEmpty.length) {
    return findWrapper;
  }

  return identityFilter;
}

// RTK: in tk, raw.stdout/stderr is the piped content. The first arg (if present)
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

function formatPipe(raw: RawResult, command: ParsedCommand): LadderResult {
  const input = pipeContent(raw);
  const filter = selectFilter(command.args, input);
  return filter(input);
}

export const pipeHandler = defineHandler({
  name: "pipe",
  match(command) {
    return command.program === "pipe";
  },
  format: (raw, command) => {
    const { text, omission } = formatPipe(raw, command);
    return { output: text, omission };
  },
});
