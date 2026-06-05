import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { type CompressionLevel, parseLevel } from "../common/level.js";

// RTK: system/read.rs — read a file (here, the bytes a `cat <file>` produced),
// apply a language-aware filter level, then a line window (max_lines/tail_lines),
// optionally adding line numbers. Defaults (level=none, no window, no numbers)
// return the content unchanged, matching read.rs::run with no flags. tk routes
// `cat` here; RTK's own command is `read`, so we accept its flags too.

// RTK: core/filter.rs::FilterLevel — none (NoFilter), minimal (strip comments),
// aggressive (keep only signatures/imports/decls). The language-aware comment
// stripping lives in minimalFilter/aggressiveFilter below. read uses the shared
// CompressionLevel vocabulary but honors only this subset (no "balanced"); see
// src/handlers/common/level.ts.
const READ_LEVELS = ["none", "minimal", "aggressive"] as const satisfies readonly CompressionLevel[];
type ReadLevel = (typeof READ_LEVELS)[number];

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
function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readOptions(args: string[]): ReadOptions {
  const files: string[] = [];
  // Shared --level parser (read honors `-l` as level; rg/tree do not). The loop
  // below only needs to SKIP the level flag + value so it is not read as a file.
  const level = parseLevel(args, {
    fallback: "none",
    allowed: READ_LEVELS,
    shortFlag: true,
  }) as ReadLevel;
  let maxLines: number | undefined;
  let tailLines: number | undefined;
  let lineNumbers = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--level" || arg === "-l") {
      index += 1;
      continue;
    }
    if (arg?.startsWith("--level=")) {
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

// RTK: core/filter.rs::Language — only Python (docstrings) and Data (no comment
// stripping) need distinct branches; JS/TS/Go/C/C++/Java all share the C-style
// comment patterns, so they collapse into one "c-like" group here.
type Language = "rust" | "python" | "c-like" | "ruby" | "shell" | "data" | "unknown";

type CommentPatterns = {
  line?: string;
  blockStart?: string;
  blockEnd?: string;
  docLine?: string;
  docBlockStart?: string;
};

// RTK: core/filter.rs::Language::from_extension.
function languageFromExtension(ext: string): Language {
  switch (ext.toLowerCase()) {
    case "rs":
      return "rust";
    case "py":
    case "pyw":
      return "python";
    case "js":
    case "mjs":
    case "cjs":
    case "ts":
    case "tsx":
    case "go":
    case "c":
    case "h":
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hh":
    case "java":
      return "c-like";
    case "rb":
      return "ruby";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "json":
    case "jsonc":
    case "json5":
    case "yaml":
    case "yml":
    case "toml":
    case "xml":
    case "csv":
    case "tsv":
    case "graphql":
    case "gql":
    case "sql":
    case "md":
    case "markdown":
    case "txt":
    case "env":
    case "lock":
      return "data";
    default:
      return "unknown";
  }
}

// RTK: core/filter.rs::Language::comment_patterns.
function commentPatterns(lang: Language): CommentPatterns {
  switch (lang) {
    case "rust":
      return { line: "//", blockStart: "/*", blockEnd: "*/", docLine: "///", docBlockStart: "/**" };
    case "python":
      return { line: "#", blockStart: '"""', blockEnd: '"""', docBlockStart: '"""' };
    case "c-like":
      return { line: "//", blockStart: "/*", blockEnd: "*/", docBlockStart: "/**" };
    case "ruby":
      return { line: "#", blockStart: "=begin", blockEnd: "=end" };
    case "shell":
      return { line: "#" };
    case "data":
      return {};
    case "unknown":
      return { line: "//", blockStart: "/*", blockEnd: "*/" };
  }
}

// RTK: read.rs detects language from the file's extension (stdin → Unknown). tk's
// `cat` may receive several operands; mirror RTK's single-file model by keying off
// the first real file operand's extension (the common single-file case).
function detectLanguage(files: string[]): Language {
  const file = files.find((f) => f !== "-");
  if (file === undefined) return "unknown";
  const base = file.split(/[/\\]/).pop() ?? file;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "unknown"; // no extension, or a leading-dot dotfile
  return languageFromExtension(base.slice(dot + 1));
}

// Mirror Rust `str::lines()`: split on `\n`, strip a trailing `\r`, and drop the
// final empty segment a trailing newline would otherwise yield.
function rustLines(content: string): string[] {
  const parts = content.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

// RTK: core/filter.rs::MinimalFilter — strip block comments and single-line
// comments (keeping doc comments and Python docstrings), normalize 3+ blank lines
// to 2, then trim.
function minimalFilter(content: string, lang: Language): string {
  const p = commentPatterns(lang);
  const out: string[] = [];
  let inBlockComment = false;
  let inDocstring = false;

  for (const line of rustLines(content)) {
    const trimmed = line.trim();

    if (p.blockStart !== undefined && p.blockEnd !== undefined) {
      const docOpener = p.docBlockStart ?? "###";
      if (!inDocstring && trimmed.includes(p.blockStart) && !trimmed.startsWith(docOpener)) {
        inBlockComment = true;
      }
      if (inBlockComment) {
        if (trimmed.includes(p.blockEnd)) inBlockComment = false;
        continue;
      }
    }

    // RTK keeps Python docstrings in minimal mode.
    if (lang === "python" && trimmed.startsWith('"""')) {
      inDocstring = !inDocstring;
      out.push(line);
      continue;
    }
    if (inDocstring) {
      out.push(line);
      continue;
    }

    if (p.line !== undefined && trimmed.startsWith(p.line)) {
      // Keep doc comments (e.g. Rust `///`); drop ordinary line comments.
      if (p.docLine !== undefined && trimmed.startsWith(p.docLine)) {
        out.push(line);
      }
      continue;
    }

    out.push(trimmed === "" ? "" : line);
  }

  const joined = out.length > 0 ? `${out.join("\n")}\n` : "";
  return joined.replace(/\n{3,}/g, "\n\n").trim();
}

// RTK: core/filter.rs::AggressiveFilter — over a minimal pass, keep imports,
// declaration signatures, top-level const/static/let, and only the opening/closing
// braces of implementation bodies (replacing the body with a "// ... implementation"
// marker). Data formats are never code-filtered (minimal only).
function aggressiveFilter(content: string, lang: Language): string {
  if (lang === "data") return minimalFilter(content, lang);

  const minimal = minimalFilter(content, lang);
  const out: string[] = [];
  let braceDepth = 0;
  let inImplBody = false;

  for (const line of rustLines(minimal)) {
    const trimmed = line.trim();

    if (IMPORT_PATTERN.test(trimmed)) {
      out.push(line);
      continue;
    }
    if (FUNC_SIGNATURE.test(trimmed)) {
      out.push(line);
      inImplBody = true;
      braceDepth = 0;
      continue;
    }

    const open = (trimmed.match(/\{/g) ?? []).length;
    const close = (trimmed.match(/\}/g) ?? []).length;

    if (inImplBody) {
      braceDepth += open;
      braceDepth -= close;
      if (braceDepth <= 1 && (trimmed === "{" || trimmed === "}" || trimmed.endsWith("{"))) {
        out.push(line);
      }
      if (braceDepth <= 0) {
        inImplBody = false;
        if (trimmed !== "" && trimmed !== "}") {
          out.push("    // ... implementation");
        }
      }
      continue;
    }

    if (
      trimmed.startsWith("const ") ||
      trimmed.startsWith("static ") ||
      trimmed.startsWith("let ") ||
      trimmed.startsWith("pub const ") ||
      trimmed.startsWith("pub static ")
    ) {
      out.push(line);
    }
  }

  return out.join("\n").trim();
}

// RTK: read.rs::run — apply the filter level, then fall back to raw content if the
// filter emptied a non-empty file (the safety guard), before the line window runs.
function applyLevelFilter(content: string, level: ReadLevel, lang: Language): string {
  if (level === "none") return content;
  const filtered = level === "aggressive" ? aggressiveFilter(content, lang) : minimalFilter(content, lang);
  if (filtered.trim() === "" && content.trim() !== "") return content;
  return filtered;
}

// RTK: read.rs reads the file bytes directly; tk shells to the system `cat`, so
// execute() must pass ONLY the file operands (and stdin `-`) — never RTK's read
// flags (--level/--max-lines/--tail-lines/--line-numbers), which `cat` would
// reject. The filter still windows from the user's ORIGINAL args (see formatRead),
// so the RTK semantics are applied to `cat`'s raw bytes.
export function buildCatArgs(args: string[]): string[] {
  return readOptions(args).files;
}

function formatRead(raw: RawResult, command: ParsedCommand): string {
  const content = raw.stdout;
  const options = readOptions(command.args);

  // RTK: read.rs::run order — language-aware filter level first (strips comments /
  // boilerplate), THEN the line window, THEN optional line numbers.
  const lang = detectLanguage(options.files);
  const filtered = applyLevelFilter(content, options.level, lang);
  const windowed = applyLineWindow(filtered, options);
  return options.lineNumbers ? formatWithLineNumbers(windowed) : windowed;
}

export const readHandler: CommandHandler = {
  name: "read",
  programs: ["cat"],
  // tk maps `cat` onto RTK read semantics (system/read.rs); `read`/`type`/`less`
  // stay on the existing read-like handler, which owns stdin/multi-file execution.
  matches(command) {
    return command.program === "cat";
  },
  execute(command) {
    // RTK: read.rs reads the file directly. tk shells to `cat`, passing only the
    // file operands so RTK's read flags never reach the system binary; the filter
    // re-derives the window from the user's original args.
    const args = buildCatArgs(command.args);
    const rewritten: ParsedCommand = {
      ...command,
      args,
      original: ["cat", ...args],
      displayCommand: `cat ${args.join(" ")}`,
    };
    return executeCommand(rewritten);
  },
  async filter(raw, command, options: TkOptions) {
    return makeFilteredResult(this.name, raw, formatRead(raw, command), options);
  },
};
