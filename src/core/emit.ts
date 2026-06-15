import { limitOutput } from "./outputLimit.js";
import { formatStats } from "./stats.js";
import { failureHint } from "./failureHints.js";
import type { FilteredResult, ParsedCommand, RawResult, TkOptions } from "../types.js";

// The emit-then-commit seam, extracted from runCompress so the stdout-before-commit
// ORDERING can be regression-tested directly (issue #5) WITHOUT importing cli.ts (its
// top-level `await main()` self-executes on import). The load-bearing invariant:
// every stdout write below MUST happen before `commit()` — the deferred accounting
// (dedup store / ledger writes + the history row) runs only AFTER the compressed bytes
// are on stdout, keeping fs writes off the user-visible latency path. Moving
// `await commit()` ahead of the writes is the exact regression this issue exists to
// prevent; the call-order test in dedupPipeline.test.ts fails if it does. `commit`
// stays awaited (the caller keeps the call inside its absorb-try) so a commit failure
// never reaches the cli fail-open catch that would re-spawn the already-executed
// command (C6).
export async function emitThenCommit(
  filtered: FilteredResult,
  raw: RawResult,
  command: ParsedCommand,
  options: TkOptions,
  commit: () => Promise<void>,
): Promise<number> {
  // Apply the opt-in --max-lines/--max-chars caps to the FINAL output (H18). A no-op
  // unless the user passed a finite limit; never touches the quality gate above.
  const display = limitOutput(filtered.output, options);
  process.stdout.write(display);
  if (display.length > 0 && !display.endsWith("\n")) {
    process.stdout.write("\n");
  }

  // Inline failure-fix hint (scheme 2): presentation-layer only — appended after
  // the compressed output, never part of it, so it can't trip the quality gate.
  if (raw.exitCode !== 0) {
    const hint = failureHint(raw, command);
    if (hint) process.stdout.write(`tk hint: ${hint}\n`);
  }

  if (options.stats) {
    process.stdout.write(`\n${formatStats(filtered)}\n`);
  }

  // The compressed output is already on stdout; only NOW do the deferred accounting.
  await commit();
  return raw.exitCode;
}
