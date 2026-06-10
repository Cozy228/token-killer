import type {
  FilteredResult,
  HandlerTraits,
  OmissionDeclaration,
  RawResult,
  TkOptions,
} from "../types.js";
import { calculateSavings } from "../core/savings.js";
import { maybeSaveRawOutput } from "../core/rawStore.js";
import { resolveStoredPath } from "../core/dataDir.js";
import { removeAnsi } from "../core/ansi.js";

export function rawText(raw: RawResult): string {
  return `${raw.stdout}${raw.stderr}`;
}

// The three gate facts below used to be name-indexed Sets in this file; they now
// live on each handler as `traits` (see HandlerTraits in types.ts) and the gate
// reads them through the CommandHandler interface — the static analogue of how
// OmissionDeclaration carries the runtime reduction fact across the same seam. The
// rationale for each trait is preserved here because it explains the gate logic,
// not any single handler.
//
// traits.structural — the output is a deliberate structural reformat (RTK-style
// grouping/annotation) rather than a size reduction. On clean inputs it can be
// slightly larger than the raw dump, so the SIZE-inflation check must not second-
// guess it — RTK always emits the structured form. The empty_output guard still
// applies, and (ADR 0001 finding #2) this trait suppresses ONLY `outputInflatesRaw`
// (size); omission protection runs for *every* handler regardless. Bearers and why:
//   git-diff annotates hunks; git-show shares git-diff's compaction (drops context +
//     appends "... (more changes truncated)") — without structural, `git show <commit>`
//     degraded to ~5-18% savings vs ~96% for the identical `git diff` payload.
//   tsc/mypy regroup diagnostics by file; pip regroups an inventory under a header.
//   curl appends a "... (N bytes total)" marker + recovery hint that can edge past
//     raw near the 500-byte boundary (curl_cmd.rs).
//   git-push appends an "ok <ref>" / "ok (up-to-date)" line that on a tiny up-to-date
//     push edges past raw (git.rs::run_push_filter).
//   read appends a `[N more lines]` marker and/or " │ "-prefixed line numbers
//     (system/read.rs) that can exceed raw on small inputs.
//   json renders an indented `key: value` view that on compact nested JSON can
//     equal/exceed raw (system/json_cmd.rs::compact_json).
//   env groups vars under headers and masks secrets — reverting to raw would expose
//     unmasked values (also masksSecrets, below).
//   log always emits the "Log Summary" digest (system/log_cmd.rs).
//   summary/test/deps are always-emit digests (system/summary.rs, rust/runner.rs,
//     system/deps.rs) that can exceed raw on small inputs.
//   git-status prefixes `* <branch>` and appends `clean — nothing to commit`
//     (git.rs::format_status_inner), exceeding a one-line porcelain capture.
//   gh/glab reformat JSON into a compact human summary; on an EMPTY list the
//     "No Pull Requests" / "No Issues" summary is larger than the raw `[]`.
//
// traits.masksSecrets — the RAW output contains secret values the handler MASKS
// (env masks API keys / tokens / passwords). Reverting to raw is a security break,
// so it is exempt from BOTH revert-to-raw paths: the undeclared-omission sniff is
// suppressed, and a declared `replacement` without a persisted snapshot ships its
// masked summary rather than failing open to unmasked raw. (Recovery is still
// guaranteed whenever persistence is on — the default — via the raw snapshot in the
// local data dir.) Every non-masking handler is subject to the sniff and fails open
// to raw above budget when it cannot declare omission.
//
// traits.ladder — the handler participates in the ADR 0001 over-budget ladder: it
// either ships the full output or DECLARES a digest/replacement, NEVER an undeclared
// `+N more`. The prose-sniff is retired for it (ADR 0001: the sniff is only the net
// for foreign / not-yet-converted passthrough). Without this, the sniff would fire
// on its own legitimate content — a diff body line `+10 more fixes`, a vitest
// snapshot `... +5 more`, or a source line surfaced by `read` — and needlessly
// revert a correct compression to raw. (`list-like` intentionally lacks it: its
// ls/tree path is not yet ladder-converted, so it still needs the net.)

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
  // The calling handler — read for its `name` (recorded on the result) and its
  // declared gate `traits`. Callers pass `this` from inside `filter()`.
  handler: { name: string; traits?: HandlerTraits },
  raw: RawResult,
  output: string,
  options: TkOptions,
  filterError?: string,
  // ADR 0001 decision 5: a handler that reduced an over-budget listing declares it
  // here instead of leaving a `+N more` marker for the sniff to (maybe) catch.
  omission?: OmissionDeclaration,
): Promise<FilteredResult> {
  // The quality gate compares uncapped output: --max-lines/--max-chars are an opt-in
  // DISPLAY cap applied later at the cli layer (core/outputLimit.ts), never here, so a
  // user cap can never interfere with the inflation/omission checks (H18).
  const cleanRaw = removeAnsi(rawText(raw));
  const cleanOutput = removeAnsi(output);
  const rawHasContent = cleanRaw.trim().length > 0;
  const outputHasContent = cleanOutput.trim().length > 0;
  const inflationBudget =
    cleanRaw.length <= 200 ? 0 : Math.max(80, Math.floor(cleanRaw.length * 0.05));
  const inflationExempt = handler.traits?.structural === true;
  // A Tier-3 passthrough whose only difference from raw is surrounding whitespace
  // is NOT inflation — shipping it wastes nothing, so it must not be reverted. A
  // handler that rebuilds output as `${stdout}\n${stderr}` appends a newline when
  // stderr is empty; on a tiny output (`vitest --version`, `eslint --version`) the
  // raw ≤ 200 → zero-tolerance budget then trips on that 1-char growth and the row
  // is needlessly flagged inflated, inflating the quality metric with false
  // positives. Edge whitespace never carries dropped content, so exempt it.
  const isEdgeWhitespaceGrowth = cleanOutput.trim() === cleanRaw.trim();
  const outputInflatesRaw =
    !inflationExempt &&
    !isEdgeWhitespaceGrowth &&
    rawHasContent &&
    outputHasContent &&
    cleanOutput.length > cleanRaw.length + inflationBudget;
  // A declared omission is trusted (decision 5): the handler already told us it
  // reduced losslessly/by-replacement and the recovery contract is honoured below,
  // so we do NOT sniff it (a digest could legitimately contain "truncated" prose,
  // and reverting `env` to raw would re-expose secrets). The sniff is the safety
  // net only for UNDECLARED omission — a foreign passthrough or not-yet-converted
  // handler — and is suppressed for the (shrinking) unsafe-to-revert bypass set.
  const masking = handler.traits?.masksSecrets === true;
  const undeclaredOmission =
    !omission &&
    !masking &&
    handler.traits?.ladder !== true &&
    rawHasContent &&
    outputHasContent &&
    outputOmitsContent(cleanOutput);
  const initialStatus =
    !outputHasContent && rawHasContent
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
  // H21: a MASKING handler's RAW holds unmasked secrets. Persisting it would write
  // plaintext keys to disk AND the recovery pointer would hand them straight back to
  // the agent. Snapshot the MASKED full instead (omission.safeFull, else the masked
  // on-screen output) so the recovery channel leaks nothing. Non-masking handlers
  // snapshot raw unchanged. (rawStore additionally writes mode 0600.)
  const snapshotSource: RawResult = masking
    ? { ...raw, stdout: removeAnsi(omission?.safeFull ?? output), stderr: "" }
    : raw;
  const rawOutputPath = await maybeSaveRawOutput(snapshotSource, saveOptions);

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

  const qualityStatus = replacementNeedsRecovery || maskingDegraded ? "inflated" : initialStatus;

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
      // Show an ABSOLUTE path: the agent's cwd is the project, not ~/.token-killer, so
      // the home-relative stored form would `cat`-fail (H20). The result FIELD keeps
      // the relative form for home-relocatability; only the printed pointer resolves.
      limited = `${limited.replace(/\n+$/, "")}\n[full output: ${resolveStoredPath(rawOutputPath)}]\n`;
    }
    omissionField = { kind: omission!.kind, rawPointer: rawOutputPath };
  }

  const savings = calculateSavings(rawText(raw), limited);

  return {
    handler: handler.name,
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
