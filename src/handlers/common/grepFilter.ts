// RTK: system/grep_cmd.rs — group grep/rg matches by file, cap per-file and
// globally, and report suppressed matches with an uncapped overflow count.
//
// Architecture note: RTK invokes rg itself with `-0`/`-Z`, so its parse_match_line
// disambiguates file from content via a NUL separator. tg filters the *already
// produced* output of the user's real grep/rg command, which is colon-separated
// (`file:line:content`). tg therefore parses the colon form; the NUL-only edge
// cases (Windows drive letters, filenames containing `:digits:`) are specific to
// RTK's NUL contract and are not reproducible on tg's colon input.

// RTK: main.rs Grep defaults — max_len 80, max 200; config::limits grep_max_per_file 25.
export const GREP_MAX_LINE_LEN = 80;
export const GREP_MAX_RESULTS = 200;
export const GREP_MAX_PER_FILE = 25;

export type GrepMatch = { file: string; line: number; content: string };

// RTK: grep_cmd.rs::has_format_flag — these flags produce already-small output
// (counts, file lists, only-matching, NUL), so RTK passes them through verbatim.
const FORMAT_FLAGS = new Set([
  "-c",
  "--count",
  "-l",
  "--files-with-matches",
  "-L",
  "--files-without-match",
  "-o",
  "--only-matching",
  "-Z",
  "--null",
]);

export function hasFormatFlag(args: string[]): boolean {
  return args.some((arg) => FORMAT_FLAGS.has(arg));
}

// RTK: grep_cmd.rs::parse_match_line — adapted to tg's colon-separated input.
// `file:line:content`; the line number anchors the split so content colons
// (e.g. `ClassRegistry::init`) stay in content. Returns null for non-match lines
// (e.g. `-A`/`-B` context lines, or output produced without `-n` line numbers).
const MATCH_LINE_RE = /^(.+?):(\d+):(.*)$/;

export function parseMatchLine(line: string): GrepMatch | null {
  const match = MATCH_LINE_RE.exec(line);
  if (!match) return null;
  const lineNum = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(lineNum)) return null;
  return { file: match[1]!, line: lineNum, content: match[3]! };
}

// RTK: grep_cmd.rs::compact_path — collapse deep paths to first/.../parent/name.
export function compactPath(path: string): string {
  if (path.length <= 50) return path;
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `${parts[0]}/.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

// RTK: grep_cmd.rs::clean_line — trim, then if longer than max_len keep a window
// centred on the pattern (`...slice...`), else head-truncate. Char-based so it
// never splits a multibyte character. context_re path is omitted (context_only
// is off by default in RTK).
export function cleanLine(line: string, maxLen: number, pattern: string): string {
  const trimmed = line.trim();
  const chars = [...trimmed];
  if (chars.length <= maxLen) return trimmed;

  const lower = trimmed.toLowerCase();
  const patternLower = pattern.toLowerCase();
  const pos = patternLower === "" ? -1 : lower.indexOf(patternLower);

  if (pos >= 0) {
    const charPos = [...lower.slice(0, pos)].length;
    const charLen = chars.length;
    let start = Math.max(0, charPos - Math.floor(maxLen / 3));
    const end = Math.min(start + maxLen, charLen);
    if (end === charLen) start = Math.max(0, end - maxLen);
    const slice = chars.slice(start, end).join("");
    if (start > 0 && end < charLen) return `...${slice}...`;
    if (start > 0) return `...${slice}`;
    return `${slice}...`;
  }

  return `${chars.slice(0, maxLen - 3).join("")}...`;
}

export type GrepGroupOptions = {
  maxLen?: number;
  maxResults?: number;
  perFile?: number;
};

// RTK: grep_cmd.rs::run default path (lines 104-150). Returns the grouped,
// compressed listing, or null when no line parses as a match — the caller then
// passes the raw output through unchanged (tg cannot group what it cannot parse,
// e.g. `grep` invoked without `-n`, or rg `--json`).
export function groupGrepOutput(
  stdout: string,
  pattern: string,
  options: GrepGroupOptions = {},
): string | null {
  const maxLen = options.maxLen ?? GREP_MAX_LINE_LEN;
  const maxResults = options.maxResults ?? GREP_MAX_RESULTS;
  const perFile = options.perFile ?? GREP_MAX_PER_FILE;

  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  // RTK counts every emitted line as a match for the overflow total; it never
  // caps this count before subtracting `shown` (test_grep_overflow_uses_uncapped_total).
  const totalMatches = lines.length;

  const byFile = new Map<string, GrepMatch[]>();
  for (const line of lines) {
    const parsed = parseMatchLine(line);
    if (!parsed) continue;
    const bucket = byFile.get(parsed.file) ?? [];
    bucket.push(parsed);
    byFile.set(parsed.file, bucket);
  }

  if (byFile.size === 0) return null;

  const out: string[] = [`${totalMatches} matches in ${byFile.size} files:`, ""];

  let shown = 0;
  const files = [...byFile.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [file, matches] of files) {
    if (shown >= maxResults) break;
    const fileDisplay = compactPath(file);
    for (const { line, content } of matches.slice(0, perFile)) {
      if (shown >= maxResults) break;
      out.push(`${fileDisplay}:${line}:${cleanLine(content, maxLen, pattern)}`);
      shown += 1;
    }
  }

  // RTK: overflow uses the uncapped total — the true suppressed count.
  if (totalMatches > shown) out.push(`[+${totalMatches - shown} more]`);

  return `${out.join("\n")}\n`;
}
