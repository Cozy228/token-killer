// RTK: system/grep_cmd.rs — group grep/rg matches by file, cap per-file and
// globally, and report suppressed matches with an uncapped overflow count.
//
// Architecture note: RTK invokes rg itself with `-0`/`-Z`, so its parse_match_line
// disambiguates file from content via a NUL separator. ctx filters the *already
// produced* output of the user's real grep/rg command, which is colon-separated
// (`file:line:content`). ctx therefore parses the colon form; the NUL-only edge
// cases (Windows drive letters, filenames containing `:digits:`) are specific to
// RTK's NUL contract and are not reproducible on ctx's colon input.

// RTK: main.rs Grep defaults — max_len 80, max 200; config::limits grep_max_per_file 25.
export const GREP_MAX_LINE_LEN = 80;
export const GREP_MAX_RESULTS = 200;
export const GREP_MAX_PER_FILE = 25;

export type GrepMatch = { file: string; line: number; content: string };

// RTK: grep_cmd.rs::has_format_flag — these flags produce already-small output
// (counts, file lists, only-matching, NUL), so RTK passes them through verbatim.
// ctx extension: `--json` (rg) emits structured records that the colon parser
// would half-read, so it joins the passthrough guard — a JSON-shaped rg output is
// never half-parsed.
//
// M6-grep fix: `-q/--quiet/--silent` (quiet mode) suppresses output entirely and
// uses exit code to signal presence (0=found, 1=not-found). Fabricating "0 matches
// for <pattern>" when exit=0 is wrong (exit 0 means FOUND). These flags are added
// to the passthrough set so the raw stdout (empty) is returned unchanged.
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
  "--json",
  "-q",
  "--quiet",
  "--silent",
]);

export function hasFormatFlag(args: string[]): boolean {
  return args.some((arg) => FORMAT_FLAGS.has(arg));
}

// Context flags (-A/-B/-C and long forms) mean the user asked for the surrounding
// lines verbatim. Grouping would drop the dash-separated context lines (they fail
// the colon parser) AND inflate the overflow count, destroying exactly what was
// requested — so an invocation carrying one passes through unchanged.
const CONTEXT_FLAGS = new Set([
  "-A",
  "-B",
  "-C",
  "--after-context",
  "--before-context",
  "--context",
]);

export function hasContextFlag(args: string[]): boolean {
  return args.some((arg) => {
    if (CONTEXT_FLAGS.has(arg)) return true;
    // -A2 / -B3 / -C1 attached-value forms (standalone short flags).
    if (/^-[ABC]\d+$/.test(arg)) return true;
    // --after-context=N / --before-context=N / --context=N.
    if (/^--(after-context|before-context|context)=/.test(arg)) return true;
    // H7-grep fix: cluster-aware detection — grouped short flags like -rnA2 or
    // -rnA 2 (split form) include -A/-B/-C embedded anywhere in the cluster.
    // A flag cluster starts with a single dash and no second dash.
    if (/^-[^-]/.test(arg) && /[ABC]/.test(arg)) return true;
    return false;
  });
}

// RTK: grep_cmd.rs::parse_match_line — adapted to ctx's colon-separated input.
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
    const charPos = lower.slice(0, pos).length;
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
  // Layer 1: collapse identical-content lines within a file into one entry that
  // lists every line number (lossless). On by default; `none`/passthrough never
  // reaches here. `minimal` keeps it on with caps disabled.
  dedupe?: boolean;
  // Aggressive tier: render each file as a count + one sample line (most lossy,
  // but the count is preserved — recovery contract item 1).
  aggregate?: boolean;
  // Recovery contract item 3: appended when any detail was suppressed.
  recoveryHint?: string;
};

// Layer 1 — lossless identical-line dedup. Lines whose TRIMMED content is
// identical collapse into one entry carrying all their line numbers; only the
// repeated content bytes are removed (cleanLine already trims for display, so no
// shown information is lost). Deliberate divergence from RTK, which never dedups.
type GrepEntry = { lines: number[]; content: string };

function dedupeMatches(matches: GrepMatch[]): GrepEntry[] {
  const byContent = new Map<string, GrepEntry>();
  const order: GrepEntry[] = [];
  for (const match of matches) {
    const key = match.content.trim();
    let entry = byContent.get(key);
    if (entry === undefined) {
      entry = { lines: [], content: match.content };
      byContent.set(key, entry);
      order.push(entry);
    }
    entry.lines.push(match.line);
  }
  for (const entry of order) entry.lines.sort((a, b) => a - b);
  return order;
}

// RTK: grep_cmd.rs::run default path (lines 104-150). Returns the grouped,
// compressed listing, or null when no line parses as a match — the caller then
// passes the raw output through unchanged (Contexa cannot group what it cannot parse,
// e.g. `grep` invoked without `-n`, or rg `--json`).
export function groupGrepOutput(
  stdout: string,
  pattern: string,
  options: GrepGroupOptions = {},
): string | null {
  const maxLen = options.maxLen ?? GREP_MAX_LINE_LEN;
  const maxResults = options.maxResults ?? GREP_MAX_RESULTS;
  const perFile = options.perFile ?? GREP_MAX_PER_FILE;
  const dedupe = options.dedupe ?? true;
  const aggregate = options.aggregate ?? false;

  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);

  // H7-grep fix: count only successfully-parsed match lines (not unparseable
  // lines like "Binary file X matches"). Using lines.length inflated the count
  // when non-match lines were present.
  const byFile = new Map<string, GrepMatch[]>();
  const passthroughLines: string[] = []; // lines that are not parseable matches
  for (const line of lines) {
    const parsed = parseMatchLine(line);
    if (!parsed) {
      // H7-grep fix: "Binary file X matches" is informative — pass through
      // rather than silently dropping it.
      passthroughLines.push(line);
      continue;
    }
    const bucket = byFile.get(parsed.file) ?? [];
    bucket.push(parsed);
    byFile.set(parsed.file, bucket);
  }

  // RTK counts every emitted line as a match for the overflow total; it never
  // caps this count before subtracting `shown` (test_grep_overflow_uses_uncapped_total).
  // H7-grep fix: totalMatches now counts only the PARSED match lines, not the
  // total raw line count — otherwise passthrough/binary lines inflate it.
  const totalMatches = lines.length - passthroughLines.length;

  if (byFile.size === 0) {
    // No parsed matches at all — fall through to passthrough so the caller
    // returns the raw output unchanged (e.g. grep without -n, or rg --json).
    // H7-grep fix: "Binary file X matches" lines are now in passthroughLines,
    // but if those are the ONLY lines, it means the output has no file:line:content
    // matches at all and we still can't group anything — return null to trigger
    // the filter's passthrough path.
    return null;
  }

  const out: string[] = [`${totalMatches} matches in ${byFile.size} files:`, ""];

  // matchesShown counts raw matches represented in the output (a deduped entry
  // listing 3 line numbers represents 3 shown matches); entriesShown is the
  // emitted-line budget for the global cap. suppressed drives the recovery hint.
  let matchesShown = 0;
  let entriesShown = 0;
  let suppressed = false;
  const files = [...byFile.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [file, matches] of files) {
    if (entriesShown >= maxResults) {
      suppressed = true;
      break;
    }
    const fileDisplay = compactPath(file);

    if (aggregate) {
      // Layer 3 — per-file count + one sample. The count preserves how much was
      // dropped; matchesShown advances by the full count so it is not re-counted
      // as overflow, and `suppressed` flags that detail was dropped.
      const first = matches[0]!;
      out.push(`${fileDisplay}: ${matches.length} matches`);
      out.push(`  ${fileDisplay}:${first.line}:${cleanLine(first.content, maxLen, pattern)}`);
      matchesShown += matches.length;
      // Each aggregate file emits TWO lines (count + sample), so it must consume
      // two units of the emitted-line budget — otherwise aggressive could print
      // more lines than balanced on a many-file search (cap would bind at 2x).
      entriesShown += 2;
      suppressed = true;
      continue;
    }

    const entries = dedupe
      ? dedupeMatches(matches)
      : matches.map((m) => ({ lines: [m.line], content: m.content }));

    let perFileShown = 0;
    for (const entry of entries) {
      if (entriesShown >= maxResults || perFileShown >= perFile) {
        suppressed = true;
        break;
      }
      const cleaned = cleanLine(entry.content, maxLen, pattern);
      out.push(`${fileDisplay}:${entry.lines.join(",")}:${cleaned}`);
      // M7-grep fix: when cleanLine truncated the content (content is lossy),
      // set suppressed so the recovery hint is appended. A line ending with
      // "..." was shortened — the full content was not shown.
      if (cleaned.endsWith("...") && [...entry.content.trim()].length > maxLen) {
        suppressed = true;
      }
      matchesShown += entry.lines.length;
      entriesShown += 1;
      perFileShown += 1;
    }
  }

  // RTK: overflow uses the uncapped total — the true suppressed count.
  if (totalMatches > matchesShown) {
    out.push(`[+${totalMatches - matchesShown} more]`);
    suppressed = true;
  }

  if (suppressed && options.recoveryHint !== undefined) {
    out.push(options.recoveryHint);
  }

  // H7-grep fix: "Binary file X matches" lines and other non-parseable lines
  // (that were alongside parseable matches) are appended verbatim so the caller
  // sees them. This covers the case where a recursive grep hits both text files
  // (with file:line:content output) AND binary files (with "Binary file X matches").
  if (passthroughLines.length > 0) {
    out.push(...passthroughLines);
  }

  return `${out.join("\n")}\n`;
}
