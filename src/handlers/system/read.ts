import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/read.rs — read a file (here, the bytes a `cat <file>` produced),
// apply a language-aware filter level, then a line window (max_lines/tail_lines),
// optionally adding line numbers. Defaults (level=none, no window, no numbers)
// return the content unchanged, matching read.rs::run with no flags. tg routes
// `cat` here; RTK's own command is `read`, so we accept its flags too.

// RTK: core/filter.rs::Language — only the extensions that influence smart_truncate
// matter here; everything else is Unknown (no special handling).
type ReadLevel = "none" | "minimal" | "aggressive";

type ReadOptions = {
  level: ReadLevel;
  files: string[];
  maxLines?: number;
  tailLines?: number;
  lineNumbers: boolean;
};

// RTK: core/filter.rs::IMPORT_PATTERN — import-like lines are structurally kept.
const IMPORT_PATTERN = /^(use |import |from |require\(|#include)/;
// RTK: core/filter.rs::FUNC_SIGNATURE — declaration lines are structurally kept.
const FUNC_SIGNATURE =
  /^(pub\s+)?(async\s+)?(fn|def|function|func|class|struct|enum|trait|interface|type)\s+\w+/;

// RTK: read.rs flag parsing (clap) — -l/--level, -m/--max-lines, --tail-lines,
// -n/--line-numbers. Positional non-flag args are files.
function parseReadLevel(value: string | undefined): ReadLevel | undefined {
  if (value === "none" || value === "minimal" || value === "aggressive") {
    return value;
  }
  return undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readOptions(command: ParsedCommand): ReadOptions {
  const files: string[] = [];
  let level: ReadLevel = "none";
  let maxLines: number | undefined;
  let tailLines: number | undefined;
  let lineNumbers = false;

  const args = command.args;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--level" || arg === "-l") {
      level = parseReadLevel(args[index + 1]) ?? level;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--level=")) {
      level = parseReadLevel(arg.slice("--level=".length)) ?? level;
      continue;
    }
    if (arg === "--max-lines" || arg === "-m") {
      maxLines = parsePositiveInt(args[index + 1]) ?? maxLines;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--max-lines=")) {
      maxLines = parsePositiveInt(arg.slice("--max-lines=".length)) ?? maxLines;
      continue;
    }
    if (arg === "--tail-lines") {
      tailLines = parsePositiveInt(args[index + 1]) ?? tailLines;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--tail-lines=")) {
      tailLines = parsePositiveInt(arg.slice("--tail-lines=".length)) ?? tailLines;
      continue;
    }
    if (arg === "--line-numbers" || arg === "-n") {
      lineNumbers = true;
      continue;
    }
    if (arg === "-") {
      files.push(arg);
      continue;
    }
    if (arg && !arg.startsWith("-")) {
      files.push(arg);
    }
  }

  return { level, files, maxLines, tailLines, lineNumbers };
}

// RTK: core/filter.rs::smart_truncate — keep the first max_lines/2 lines plus any
// structurally important lines (imports, declarations, braces) up to max_lines-1,
// then append a single `[N more lines]` marker. No inline omission markers.
function smartTruncate(content: string, maxLines: number): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) {
    return content;
  }

  const result: string[] = [];
  let keptLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const isImportant =
      FUNC_SIGNATURE.test(trimmed) ||
      IMPORT_PATTERN.test(trimmed) ||
      trimmed.startsWith("pub ") ||
      trimmed.startsWith("export ") ||
      trimmed === "}" ||
      trimmed === "{";

    if (isImportant || keptLines < Math.floor(maxLines / 2)) {
      result.push(line);
      keptLines += 1;
    }

    if (keptLines >= maxLines - 1) {
      break;
    }
  }

  result.push(`[${lines.length - keptLines} more lines]`);
  return result.join("\n");
}

// RTK: read.rs::apply_line_window — tail_lines wins over max_lines; max_lines uses
// smart_truncate; otherwise content is returned unchanged.
function applyLineWindow(content: string, options: ReadOptions): string {
  if (options.tailLines !== undefined) {
    if (options.tailLines === 0) {
      return "";
    }
    const lines = content.split("\n");
    // Mirror Rust `lines()`: a trailing newline does not yield a final empty line.
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    const start = Math.max(0, lines.length - options.tailLines);
    let result = lines.slice(start).join("\n");
    if (content.endsWith("\n")) {
      result += "\n";
    }
    return result;
  }

  if (options.maxLines !== undefined) {
    return smartTruncate(content, options.maxLines);
  }

  return content;
}

// RTK: read.rs::format_with_line_numbers — right-aligned line numbers + " │ ".
function formatWithLineNumbers(content: string): string {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const width = String(lines.length).length;
  let out = "";
  for (let i = 0; i < lines.length; i += 1) {
    out += `${String(i + 1).padStart(width, " ")} │ ${lines[i]}\n`;
  }
  return out;
}

function formatRead(raw: RawResult, command: ParsedCommand): string {
  const content = raw.stdout;
  const options = readOptions(command);

  // RTK: read.rs filter levels. Level "none" (NoFilter) returns content as-is;
  // tg keeps full content for minimal/aggressive too (the line window below is
  // the compaction lever the migration suite exercises), preserving the source.
  const windowed = applyLineWindow(content, options);
  return options.lineNumbers ? formatWithLineNumbers(windowed) : windowed;
}

export const readHandler: CommandHandler = {
  name: "read",
  // tg maps `cat` onto RTK read semantics (system/read.rs); `read`/`type`/`less`
  // stay on the existing read-like handler, which owns stdin/multi-file execution.
  matches(command) {
    return command.program === "cat";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, command, options: TgOptions) {
    return makeFilteredResult(this.name, raw, formatRead(raw, command), options);
  },
};
