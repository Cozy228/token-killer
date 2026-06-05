import type { FilteredResult, RawResult, TkOptions } from "../types.js";
import { calculateSavings } from "../core/savings.js";
import { maybeSaveRawOutput } from "../core/rawStore.js";
import { limitOutput } from "../core/outputLimit.js";
import { removeAnsi } from "../core/ansi.js";

export function rawText(raw: RawResult): string {
  return `${raw.stdout}${raw.stderr}`;
}

// Handlers whose output is a deliberate structural reformat (RTK-style grouping/
// annotation) rather than a size reduction. On clean inputs these can be slightly
// larger than the raw dump, so the inflation/truncation fallback must not second-
// guess them — RTK always emits the structured form. The empty_output guard still
// applies. git-diff annotates hunks; tsc/mypy regroup diagnostics by file; pip regroups
// an inventory under a header + separator.
// curl appends a "... (N bytes total)" marker + recovery hint to a truncated
// body, which near the 500-byte boundary can edge just past the raw size — RTK
// always emits this form (curl_cmd.rs), so it must not be bounced back to raw.
// git-push appends an "ok <ref>" / "ok (up-to-date)" summary line that RTK always
// emits (git.rs::run_push_filter); on a tiny up-to-date push that one line edges
// past raw, so the inflation gate must not bounce it back and drop the summary.
// read (RTK system/read.rs) is a structural reformat: `--max-lines` appends a
// single `[N more lines]` marker (smart_truncate) and `-n` prefixes every line
// with a right-aligned number + " │ ". Both are RTK's intended output yet can be
// larger than the raw bytes on small inputs, and the marker matches the
// content-omission guard — but RTK always emits this shape, so it must not be
// bounced back to raw. The tail_lines path is a genuine shrink and is unaffected.
// json (RTK system/json_cmd.rs::compact_json) renders an indented `key: value`
// view (quotes/braces stripped). On COMPACT (non-pretty) nested JSON — exactly
// what arrives from APIs/tools — the indented form can equal or exceed the raw
// bytes, so the inflation gate would bounce it back to raw and silently drop the
// compact contract. RTK always emits the compact view, so json is structural.
// env (RTK system/env_cmd.rs) groups vars under headers and MASKS secrets. On a
// small env dump the grouped form can exceed raw — reverting to raw would expose
// the unmasked secret values (a security contract break), so env is structural.
// log (RTK system/log_cmd.rs) always emits the "Log Summary" digest; on a tiny
// log the digest can exceed raw and would otherwise revert, dropping the contract.
// summary / test / deps (RTK system/summary.rs, rust/runner.rs::run_test,
// system/deps.rs) are always-emit structural digests: a "[FAIL] Command:" + counts
// summary, a "[FAIL] FAILURES:" + SUMMARY extraction, and a per-ecosystem dependency
// roll-up. On small inputs the reformat can exceed raw, but RTK always emits it, so
// it must not be bounced back to the raw replay.
// git-status (RTK git/git.rs::format_status_inner) prefixes the branch as
// `* <branch>` and, on a clean tree, appends `clean — nothing to commit`; on a
// one-line porcelain capture that reformat can exceed raw, but RTK always emits
// it, so it must not be bounced back to the opaque porcelain string.
// gh / glab (RTK gh_cmd.rs / glab_cmd.rs) reformat gh/glab JSON into a compact
// human summary that RTK always emits. On an EMPTY list the "No Pull Requests" /
// "No Issues" / "No Merge Requests" summary is larger than the raw `[]`, and the
// "  … +N more" cap marker matches the content-omission guard — but RTK always
// emits these, so they must not be bounced back to the raw JSON (which would leak
// an opaque `[]` / array on empty state).
const STRUCTURAL_HANDLERS = new Set([
  "gh",
  "glab",
  "git-status",
  "git-diff",
  "diff",
  "tsc",
  "mypy",
  "pip",
  "curl",
  "pytest",
  "git-push",
  "read",
  "json",
  "env",
  "log",
  "summary",
  "test",
  "deps",
]);

export function outputOmitsContent(output: string): boolean {
  return output.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return (
      /^\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)$/.test(trimmed) ||
      /^\[\d+ more lines\]$/.test(trimmed) ||
      /^more (lines|chars) \(use tk.*\)$/.test(trimmed) ||
      /^repetitive lines collapsed$/.test(trimmed) ||
      /^.*lines truncated\)$/.test(trimmed) ||
      /^\.\.\. \(more changes truncated\)$/.test(trimmed) ||
      /^- \.\.\. \d+ more$/.test(trimmed) ||
      /^Hidden:$/.test(trimmed) ||
      /^- \d+ (matches|files|packages|errors|commits|branches|dependencies) not shown$/.test(trimmed) ||
      /^Direct sample:$/.test(trimmed)
    );
  });
}

export async function makeFilteredResult(
  handler: string,
  raw: RawResult,
  output: string,
  options: TkOptions,
  filterError?: string,
): Promise<FilteredResult> {
  const unlimitedRaw = removeAnsi(rawText(raw));
  const unlimitedOutput = removeAnsi(output);
  const cleanRaw = limitOutput(unlimitedRaw, options);
  const cleanOutput = limitOutput(unlimitedOutput, options);
  const rawHasContent = cleanRaw.trim().length > 0;
  const outputHasContent = cleanOutput.trim().length > 0;
  const inflationBudget =
    cleanRaw.length <= 200 ? 0 : Math.max(80, Math.floor(cleanRaw.length * 0.05));
  const isStructural = STRUCTURAL_HANDLERS.has(handler);
  const outputInflatesRaw =
    !isStructural &&
    rawHasContent &&
    outputHasContent &&
    cleanOutput.length > cleanRaw.length + inflationBudget;
  const outputTruncatesContent =
    !isStructural && rawHasContent && outputHasContent && outputOmitsContent(cleanOutput);
  const qualityStatus = !outputHasContent && rawHasContent
    ? "empty_output"
    : outputInflatesRaw || outputTruncatesContent
    ? "inflated"
    : "passed";
  const limited = qualityStatus === "passed" ? cleanOutput : cleanRaw;
  const rawOutputPath = await maybeSaveRawOutput(raw, options);
  const savings = calculateSavings(rawText(raw), limited);

  return {
    handler,
    output: limited,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath,
    exitCode: raw.exitCode,
    filterError,
    qualityStatus,
  };
}
