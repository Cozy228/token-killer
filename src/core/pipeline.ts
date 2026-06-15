import { recordHistory } from "./history.js";
import { filterWithGenericFallback } from "./fallback.js";
import { applySessionDedup, type DedupDecision } from "./sessionDedup.js";
import type {
  CommandHandler,
  FilteredResult,
  ParsedCommand,
  RawResult,
  TkOptions,
} from "../types.js";

export type PipelineResult = {
  raw: RawResult;
  filtered: FilteredResult;
  // Deferred accounting: dedup persistence + the history row. The caller MUST emit
  // stdout first, then `await commit()` — moving these fs writes off the user-visible
  // latency path. `commit` is fail-open internally and never throws into the caller.
  // Any future accounting on the compress path (new ledgers, telemetry counters) MUST
  // be added inside this `commit`, never before the stdout write.
  commit: () => Promise<void>;
};

export async function runPipeline(
  handler: CommandHandler,
  command: ParsedCommand,
  options: TkOptions,
): Promise<PipelineResult> {
  const raw = await handler.execute(command, options);
  const filtered = await filterWithFallback(handler, raw, command, options);

  // ADR 0009 session dedup: default-off; a no-op unless enabled AND eligible. The
  // DECISION (which bytes to emit) is made here, synchronously-before-output; on a HIT
  // it returns a marker-substituted result emitted in place of the byte-identical
  // repeat. Its saving is counted under the separate `dedup` dimension only (no
  // ledger-① history row), so it is never summed with filter savings. The store /
  // snapshot / ledger WRITES are deferred to `decision.persist`, run from `commit`
  // after the caller has emitted stdout. Fail-open: any error in the decision phase
  // falls through to the normal full-output path (with a history-only commit).
  let decision: DedupDecision;
  try {
    decision = await applySessionDedup({ handler, command, options, raw, filtered });
  } catch {
    decision = { filtered: null, persist: async () => {} };
  }

  // HIT: emit the marker, run ONLY the deferred dedup persistence — NO history row
  // (ADR 0009's never-sum rule depends on the HIT path skipping recordHistory).
  if (decision.filtered) {
    return { raw, filtered: decision.filtered, commit: decision.persist };
  }

  // No dedup: emit the full output; the commit runs the (no-op or MISS-upsert)
  // persistence, THEN appends the ledger-① history row. Accounting is best-effort and
  // must NEVER throw into the caller — an unguarded throw (unwritable
  // TOKEN_KILLER_HOME — disk full, perms) would reach cli.ts's fail-open catch, which
  // re-ran the ALREADY-EXECUTED command via passthrough, double-executing side effects
  // like `eslint --fix`/`git push` (C6). recordHistory is wrapped here; persist is
  // fail-open inside itself.
  return {
    raw,
    filtered,
    commit: async () => {
      await decision.persist();
      try {
        await recordHistory(raw, filtered, options);
      } catch {
        // The command already ran and `filtered` already holds its output; drop the row.
      }
    },
  };
}

export async function filterWithFallback(
  handler: CommandHandler,
  raw: RawResult,
  command: ParsedCommand,
  options: TkOptions,
): Promise<FilteredResult> {
  try {
    return await handler.filter(raw, command, options);
  } catch (error) {
    return filterWithGenericFallback(raw, command, options, error);
  }
}
