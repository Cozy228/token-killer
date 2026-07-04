/**
 * Memory `SourceAdapter` (CTX-IMPL §4/§5.6). Memory `dirtyCheck` is ALWAYS
 * clean (§4.2): `remember()` writes straight to the store and host import is a
 * deliberate COLD-PATH action — neither is a serve-time reconcile. So the
 * serve-path refresh engine never re-ingests memory; `ingest()` is exposed only
 * for an explicit cold-path (`ctx sync`/install) host import.
 */
import type { Budget, DirtyReport, IngestResult, SourceAdapter } from "../ingest/adapter.ts";
import type { Store } from "../store/store.ts";
import { importClaudeCodeMemory } from "./claudeImporter.ts";

export class MemorySourceAdapter implements SourceAdapter {
  readonly id = "memory" as const;
  /** Cheapest source: no scan, no subprocess. */
  readonly cost = 1;

  async dirtyCheck(_store: Store): Promise<DirtyReport> {
    return { source: "memory", dirty: false, magnitude: 0 };
  }

  /** Cold-path host import (not reached by serve-time refresh — dirtyCheck clean). */
  async ingest(store: Store, _dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
    const report = importClaudeCodeMemory(store, { now: budget.now });
    return {
      source: "memory",
      complete: true,
      entities: report.entities,
      claims: report.candidates,
    };
  }
}
