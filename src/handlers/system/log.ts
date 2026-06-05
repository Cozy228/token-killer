import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/log_cmd.rs — deduplicate repeated log lines into a "Log Summary"
// with error/warn/info counts, then list unique errors/warnings (sorted by
// frequency) with "[×N]" repeat markers. Normalization strips timestamps and
// collapses volatile ids/paths so structurally identical lines collapse.

// RTK: log_cmd.rs lazy_static regexes. Rust's `regex` crate `\b` and `\d` map to
// the same semantics here for the ASCII inputs RTK targets.
//   TIMESTAMP_RE strips a leading "YYYY-MM-DD[T ]HH:MM:SS[.,]?<frac><ws>" prefix.
//   UUID_RE → <UUID>, HEX_RE (0x...) → <HEX>, NUM_RE (4+ digit runs) → <NUM>,
//   PATH_RE (/-rooted path) → <PATH>.
const TIMESTAMP_RE = /^\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d*\s*/;
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const HEX_RE = /0x[0-9a-fA-F]+/g;
const NUM_RE = /\b\d{4,}\b/g;
const PATH_RE = /\/[\w./\-]+/g;

// RTK: truncate.rs::CAP_WARNINGS = 10; reduced(CAP_WARNINGS, 5) = 5.
const MAX_LOG_ERRORS = 10;
const MAX_LOG_WARNS = 5;

// RTK: log_cmd.rs::normalize_log_line.
function normalizeLogLine(line: string): string {
  let normalized = line.replace(TIMESTAMP_RE, "");
  normalized = normalized.replace(UUID_RE, "<UUID>");
  normalized = normalized.replace(HEX_RE, "<HEX>");
  normalized = normalized.replace(NUM_RE, "<NUM>");
  normalized = normalized.replace(PATH_RE, "<PATH>");
  return normalized.trim();
}

// RTK: log_cmd.rs truncates the original message at 100 chars (97 + "...").
// RTK counts Unicode scalar values (chars), not bytes, so we mirror via [...str].
function truncateOriginal(original: string): string {
  const chars = [...original];
  if (chars.length > 100) {
    return `${chars.slice(0, 97).join("")}...`;
  }
  return original;
}

type Bucket = {
  // Insertion-ordered map of normalized line -> repeat count.
  counts: Map<string, number>;
  // First original line seen for each normalized key (RTK pushes on first sight).
  unique: string[];
};

function emptyBucket(): Bucket {
  return { counts: new Map(), unique: [] };
}

// RTK: log_cmd.rs::analyze_logs — render one severity section ([ERRORS]/[WARNINGS]).
function renderSection(
  header: string,
  bucket: Bucket,
  maxItems: number,
  moreNoun: string,
  out: string[],
): void {
  if (bucket.unique.length === 0) {
    return;
  }
  out.push(header);

  // Sort by count descending. RTK uses a stable-ish HashMap iteration then a
  // comparator on count only; we keep insertion order for ties via a stable sort.
  const entries = [...bucket.counts.entries()];
  entries.sort((a, b) => b[1] - a[1]);

  for (const [normalized, count] of entries.slice(0, maxItems)) {
    const original =
      bucket.unique.find((line) => normalizeLogLine(line) === normalized) ?? normalized;
    const truncated = truncateOriginal(original);
    if (count > 1) {
      out.push(`   [×${count}] ${truncated}`);
    } else {
      out.push(`   ${truncated}`);
    }
  }

  if (entries.length > maxItems) {
    out.push(`   ... +${entries.length - maxItems} more ${moreNoun}`);
  }
}

// RTK: log_cmd.rs::analyze_logs.
function analyzeLogs(content: string): string {
  const errors = emptyBucket();
  const warnings = emptyBucket();
  const info = emptyBucket();

  // RTK iterates `content.lines()`, which drops a trailing newline but otherwise
  // yields each line without its terminator.
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  for (const line of lines) {
    const lower = line.toLowerCase();
    const normalized = normalizeLogLine(line);

    let bucket: Bucket;
    if (
      lower.includes("error") ||
      lower.includes("fatal") ||
      lower.includes("panic") ||
      lower.includes("critical") ||
      lower.includes("alert") ||
      lower.includes("emerg") ||
      lower.includes("severe")
    ) {
      bucket = errors;
    } else if (lower.includes("warn") || lower.includes("notice")) {
      bucket = warnings;
    } else if (lower.includes("info")) {
      bucket = info;
    } else {
      continue;
    }

    const current = bucket.counts.get(normalized) ?? 0;
    if (current === 0) {
      bucket.unique.push(line);
    }
    bucket.counts.set(normalized, current + 1);
  }

  const totalErrors = [...errors.counts.values()].reduce((a, b) => a + b, 0);
  const totalWarnings = [...warnings.counts.values()].reduce((a, b) => a + b, 0);
  const totalInfo = [...info.counts.values()].reduce((a, b) => a + b, 0);

  const out: string[] = [];
  out.push("Log Summary");
  out.push(`   [error] ${totalErrors} errors (${errors.counts.size} unique)`);
  out.push(`   [warn] ${totalWarnings} warnings (${warnings.counts.size} unique)`);
  out.push(`   [info] ${totalInfo} info messages`);
  out.push("");

  // RTK emits the [ERRORS] section (and its trailing blank line) only when there
  // are unique errors; same for [WARNINGS] (no trailing blank line).
  if (errors.unique.length > 0) {
    renderSection("[ERRORS]", errors, MAX_LOG_ERRORS, "unique errors", out);
    out.push("");
  }
  renderSection("[WARNINGS]", warnings, MAX_LOG_WARNS, "unique warnings", out);

  return out.join("\n");
}

function formatLog(raw: RawResult): string {
  // RTK reads the file/stdin content and prints `analyze_logs(content)` followed
  // by a trailing newline from `println!`.
  return `${analyzeLogs(raw.stdout)}\n`;
}

export const logHandler: CommandHandler = {
  name: "log",
  matches(command) {
    return command.program === "log";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, command, options: TgOptions) {
    return makeFilteredResult(this.name, raw, formatLog(raw), options);
  },
};
