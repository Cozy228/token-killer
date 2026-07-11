# DR-18 / O-23 — summarize build-verdict refit (implementation notes)

Scope: `src/handlers/system/summary.ts` (+ its test + vitest include allowlist). No
other behavior touched. Binding spec: `CONTEXA-IMPL.md` Appendix A, row DR-18.

## Decisions

- **Verdict authority = exit code, keyword scan = supplementary.** `summarizeBuild`
  now takes the real `success` boolean (already available in `summarizeOutput`,
  derived from `raw.exitCode === 0`). Two branches:
  - exit says FAILURE → never assert success; surface the neutral supplementary
    counts (`compiled`, `[error] N`, `[warn] N`) + captured error lines only.
  - exit says SUCCESS → the keyword scan can only misfire toward FALSE errors, so it
    never downgrades the verdict; show warnings, then affirm `"[ok] Build successful"`.
    We deliberately do NOT print a keyword-derived `[error]` count on a successful
    build — that would contradict the authoritative exit code (LAW §3).
- **Preserved the prior "warnings suppress the terse verdict" threshold** on the
  success path (`warnings > 0` → print `[warn] N`, no `"Build successful"` line) to
  keep behavior change minimal — the only success-path change is that keyword
  `errors` no longer block/contradict an exit-0 build.
- **(b) receipt via the existing recovery mechanism, not a new subsystem.** A summary
  that fits budget but ASSERTS `"[ok] Build successful"` now declares a `replacement`
  omission in `summaryHandler.filter()`. That reuses `base.ts`'s recovery contract:
  the gate force-persists raw this turn and appends the existing
  `[full output: <path>]` receipt pointer. Detection uses a shared sentinel constant
  `BUILD_SUCCESS_VERDICT` (the exact verdict string) — never a re-derived keyword scan.
  A summary IS a complete-replacement digest of its raw, so `replacement` is the
  honest omission kind.

## `success` source — clean

Traced `raw.exitCode` for the summary caller: `summaryHandler.execute` →
`executeCommand` → child `close` event → `resolveExitCode(code, signal)`
(`src/executor.ts:15`). It returns the real process exit code, and maps a killing
signal to `128 + signo` (SIGKILL/OOM → 137). So `raw.exitCode === 0` is a genuine
process-success signal, including the OOM-kill case the audit called out. No keyword
guessing in the source of `success`. No deeper finding.

## Deviations

- **Touched `vitest.config.ts`** (added the new test file to the explicit `include`
  allowlist). Strictly required: the config is an allowlist, so a new test file is
  otherwise not collected. One-line addition, no other config change.
- **(b) with `--no-save-raw`:** an asserting summary can no longer produce a receipt,
  so the gate's existing recovery contract fails open to raw (ships the full output,
  `qualityStatus="inflated"`) instead of shipping the unanchored verdict. This is the
  spec's "carries a receipt OR stops asserting" — the summary stops asserting. It is a
  behavior change for the `--no-save-raw` + asserting-build case only (previously it
  shipped the bare digest). Judged correct and in-scope; covered by a test.

## Adjacent-found (untouched)

- **Test summaries assert facts too.** `summarizeTests` prints `"[ok] N passed"` /
  `"[FAIL] N failed"` from the same keyword scan, with no exit-code threading and no
  receipt. DR-18 names only `summarizeBuild`, so I did not touch it. The receipt
  reuse pattern here would generalize cleanly if a future slice wants it.
- `summarizeLogs` counts errors/warnings by substring as well, but it makes no
  success/failure VERDICT (pure counts), so it is not a false-reassurance hazard.

## Open questions

- None blocking. Whether to extend (a)+(b) to `summarizeTests` is a product call for a
  follow-up slice (DR-19 claim-shaping neighborhood), not part of DR-18.

## Both halves landed

- (a) heuristic success verdict removed / wired to the exit code — **landed**.
- (b) asserting build summaries carry a raw receipt/anchor via the existing pointer —
  **landed** (with the `--no-save-raw` "stops asserting" fallback).
