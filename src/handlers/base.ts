import type { FilteredResult, OmissionDeclaration, RawResult, TkOptions } from "../types.js";
import { calculateSavings } from "../core/savings.js";
import { maybeSaveRawOutput } from "../core/rawStore.js";
import { limitOutput } from "../core/outputLimit.js";
import { removeAnsi } from "../core/ansi.js";

export function rawText(raw: RawResult): string {
  return `${raw.stdout}${raw.stderr}`;
}

// Handlers whose output is a deliberate structural reformat (RTK-style grouping/
// annotation) rather than a size reduction. On clean inputs these can be slightly
// larger than the raw dump, so the SIZE-inflation check must not second-guess them
// — RTK always emits the structured form. The empty_output guard still applies.
// git-diff annotates hunks; tsc/mypy regroup diagnostics by file; pip regroups
// an inventory under a header + separator.
//
// ADR 0001 finding #2: this set suppresses ONLY `outputInflatesRaw` (size). It used
// to also disable the content-omission check, which made evidence loss in the worst
// droppers (json/git-diff/pip/env/…) unconditional. Those two concerns are now
// separate: omission protection (declared-or-sniffed, below) runs for *every*
// handler; only the size-inflation tolerance is gated by membership here.
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
const INFLATION_EXEMPT_HANDLERS = new Set([
  "gh",
  "glab",
  "git-status",
  "git-diff",
  // git-show shares git-diff's compaction (compactUnifiedDiff): on a large commit
  // it deliberately drops diff context and appends a "... (more changes truncated)"
  // recovery marker — exactly the content-omission shape the inflation gate bounces
  // back to raw. Without this exemption `git show <commit>` degraded to ~5-18%
  // savings vs ~96% for the identical `git diff` payload. It is a structural
  // reformat like git-diff, so it must not be second-guessed.
  "git-show",
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

// Handlers whose RAW output contains secret values the handler MASKS (env masks
// API keys / tokens / passwords). For these, reverting to raw is a security break,
// so they are exempt from BOTH revert-to-raw paths: the undeclared-omission sniff
// is suppressed, and a declared `replacement` without a persisted snapshot ships
// its masked summary rather than failing open to unmasked raw. (Recovery is still
// guaranteed whenever persistence is on — the default — via the raw snapshot,
// which lives only in the local data dir.) Every NON-masking handler is subject to
// the sniff and fails open to raw above budget when it cannot declare omission.
const MASKING_HANDLERS = new Set(["env"]);

// Handlers that participate in the ADR 0001 over-budget ladder: they either ship
// the full output or DECLARE a digest/replacement — they NEVER emit an undeclared
// `+N more`. The prose-sniff is retired for them (ADR 0001: the sniff is only a
// net for foreign passthrough / not-yet-converted handlers). Without this, the
// sniff fires on their own legitimate passthrough content — a diff body line like
// `+10 more fixes`, a vitest snapshot `... +5 more`, or a source line surfaced by
// `read` — trimming to a whole-line marker match and needlessly reverting a
// correct compression to raw. (`list-like` is intentionally absent: its ls/tree
// path is not yet ladder-converted, so it still needs the net.)
const LADDER_HANDLERS = new Set([
  "ruff",
  "pytest",
  "js-test",
  "playwright",
  "test",
  "dotnet",
  "env",
  "json",
  "read",
  "psql",
  "diff",
  "git-diff",
  "git-show",
]);

// Detects content-omission markers in a handler's output. ADR 0001 retires this
// prose-sniffing for `tk`'s own handlers (they now *declare* omission, see
// makeFilteredResult); it is kept as the defense against UNDECLARED omission — a
// foreign passthrough or a not-yet-converted handler that still ships a `+N more`
// — where revert-to-raw is the safe net. The earlier regex anchored a fixed noun
// list (`+N more files|matches|…`), so the real markers (`... +N more failures`,
// `… +N more`, bare `+N more dirs`, `[N more lines]`) all slipped through. The
// patterns below match the marker *shape*, not a noun list.
// Matched against the marker SHAPE (each tested against the TRIMMED line), not a
// noun list and not free prose. The patterns are anchored so they catch every real
// cap form (`... +5 more`, `… +3 more failures`, bare `+2 more dirs`, `[+7 more]`,
// `[12 more lines]`, `[+9 lines omitted]`) WITHOUT firing on legitimate content:
//   - prose that merely contains "omitted"/"not shown"/"truncated" (a diff line
//     `+const x = "not shown"`) — no prose-verb patterns at all; and
//   - a diff BODY line whose `+` is the diff marker, e.g. `+5 more retries`, which
//     is NOT an overflow marker — so the `+N more` form must be ellipsis/bracket-led
//     or occupy the whole line (anchored ^…$), never an inline substring.
// (See qualityGate.test.ts for the false-positive guards.)
const OMISSION_MARKERS = [
  /^(?:\.{3}|…|\[)\s*\+?\s*\d+\s+more\b/, // ... +N more / … +N more / [+N more]
  /^\+\d+\s+more(?:\s+\w+)?$/, // bare `+N more` / `+N more dirs` occupying the line
  /\[\d+\s+more\s+lines\]/, // [N more lines]
  /\[\+?\d+\s+\w+\s+omitted\]/, // [+N lines omitted]
  /\(more changes truncated\)/, // legacy compactDiff hard-stop marker
  /\brepetitive lines collapsed\b/,
];

export function outputOmitsContent(output: string): boolean {
  return output.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return OMISSION_MARKERS.some((re) => re.test(trimmed));
  });
}

export async function makeFilteredResult(
  handler: string,
  raw: RawResult,
  output: string,
  options: TkOptions,
  filterError?: string,
  // ADR 0001 decision 5: a handler that reduced an over-budget listing declares it
  // here instead of leaving a `+N more` marker for the sniff to (maybe) catch.
  omission?: OmissionDeclaration,
): Promise<FilteredResult> {
  const unlimitedRaw = removeAnsi(rawText(raw));
  const unlimitedOutput = removeAnsi(output);
  const cleanRaw = limitOutput(unlimitedRaw, options);
  const cleanOutput = limitOutput(unlimitedOutput, options);
  const rawHasContent = cleanRaw.trim().length > 0;
  const outputHasContent = cleanOutput.trim().length > 0;
  const inflationBudget =
    cleanRaw.length <= 200 ? 0 : Math.max(80, Math.floor(cleanRaw.length * 0.05));
  const inflationExempt = INFLATION_EXEMPT_HANDLERS.has(handler);
  const outputInflatesRaw =
    !inflationExempt &&
    rawHasContent &&
    outputHasContent &&
    cleanOutput.length > cleanRaw.length + inflationBudget;
  // A declared omission is trusted (decision 5): the handler already told us it
  // reduced losslessly/by-replacement and the recovery contract is honoured below,
  // so we do NOT sniff it (a digest could legitimately contain "truncated" prose,
  // and reverting `env` to raw would re-expose secrets). The sniff is the safety
  // net only for UNDECLARED omission — a foreign passthrough or not-yet-converted
  // handler — and is suppressed for the (shrinking) unsafe-to-revert bypass set.
  const masking = MASKING_HANDLERS.has(handler);
  const undeclaredOmission =
    !omission &&
    !masking &&
    !LADDER_HANDLERS.has(handler) &&
    rawHasContent &&
    outputHasContent &&
    outputOmitsContent(cleanOutput);
  const initialStatus = !outputHasContent && rawHasContent
    ? "empty_output"
    : outputInflatesRaw || undeclaredOmission
    ? "inflated"
    : "passed";

  // Decision 4: a declared omission force-persists raw this turn regardless of
  // exit code / size, so the snapshot the digest points at always exists. An
  // explicit --no-save-raw still wins (the user opted out of any persistence).
  const declared = !!omission && initialStatus === "passed";
  const saveOptions: TkOptions =
    declared && options.saveRaw !== false ? { ...options, saveRaw: true } : options;
  const rawOutputPath = await maybeSaveRawOutput(raw, saveOptions);

  // A step-2 `replacement` genuinely drops evidence, so it is honest ONLY if the
  // snapshot it points at exists. If persistence was disabled (--no-save-raw) there
  // is no recovery channel, and shipping the aggregate would be exactly the
  // recovery-less fake-complete PRINCIPLES.md forbids — so fail open to raw instead.
  // A step-1 `digest` is lossless (every location kept), so it is always safe to
  // ship; its snapshot pointer is a convenience, not a correctness requirement.
  // A masking handler never reverts to raw (that would re-expose secrets), so its
  // replacement ships even without a snapshot — the masked summary leaks nothing.
  const replacementNeedsRecovery =
    declared && omission!.kind === "replacement" && !rawOutputPath && !masking;

  // A MASKING handler never reverts to raw (secrets) — but a recovery-less lossy
  // `replacement` (a bare count) is just as forbidden as a fake-complete. When the
  // snapshot is unavailable (persistence disabled OR the write FAILED — both signal
  // as a missing rawOutputPath), ship the handler's lossless, leak-free FULL
  // rendering instead (omission.safeFull, e.g. env's masked full). Only when that
  // fallback is absent do we keep the lossy count, flagged degraded. This closes
  // the hole where a snapshot WRITE FAILURE (not a user opt-out) silently dropped
  // masked evidence with no recovery.
  const maskingReplacementNoSnapshot =
    declared && masking && omission!.kind === "replacement" && !rawOutputPath;
  const maskingSafeFull = maskingReplacementNoSnapshot ? omission!.safeFull : undefined;
  const maskingDegraded = maskingReplacementNoSnapshot && maskingSafeFull === undefined;

  const qualityStatus =
    replacementNeedsRecovery || maskingDegraded ? "inflated" : initialStatus;

  let limited = qualityStatus === "passed" ? cleanOutput : cleanRaw;
  let omissionField: FilteredResult["omission"];
  if (maskingSafeFull !== undefined) {
    // Lossless masked full — nothing is omitted, so no omission field and no
    // recovery pointer; never expose the unmasked raw.
    limited = removeAnsi(maskingSafeFull);
  } else if (maskingDegraded) {
    // No snapshot AND no safe-full fallback: keep the count (never raw secrets) but
    // signal recovery-less via qualityStatus="inflated".
    limited = cleanOutput;
    omissionField = { kind: omission!.kind, rawPointer: undefined };
  } else if (declared && !replacementNeedsRecovery) {
    // Decision 6: the inline recovery pointer names the persisted snapshot FILE
    // path — never a `tk --raw` re-run (which can drift / re-fire a mutation).
    if (rawOutputPath) {
      limited = `${limited.replace(/\n+$/, "")}\n[full output: ${rawOutputPath}]\n`;
    }
    omissionField = { kind: omission!.kind, rawPointer: rawOutputPath };
  }

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
    omission: omissionField,
  };
}
