/**
 * SourceAdapter framework (CTX-IMPL §4) — the second half of the foundation
 * contract: 1c (memory), 1d (git), 1e (docs) implement this interface and
 * register with the registry; the refresh engine orchestrates them.
 */
import type { Store } from "../store/store.ts";

export type SourceId = "git" | "code" | "docs" | "memory" | "github" | "jira" | "confluence";

export interface DirtyReport {
  source: SourceId;
  dirty: boolean;
  /**
   * How far behind, in source-native units (git: commits behind — a COUNT, not
   * a boolean, §4.2; files: changed-file count). 0 when clean.
   */
  magnitude: number;
  detail?: unknown;
}

/** Cooperative time budget: adapters check `deadline` (epoch-ms) and return partial. */
export interface Budget {
  deadline: number;
  now(): number;
}

export interface IngestResult {
  source: SourceId;
  /** false = budget ran out mid-ingest; cursor holds the resume point (§4). */
  complete: boolean;
  entities: number;
  claims: number;
}

export interface SourceAdapter {
  id: SourceId;
  /**
   * Relative ingest cost hint for cheapest-first ordering (§4.3). Lower runs
   * first; ties broken by dirty magnitude (less behind = cheaper), then id.
   */
  cost: number;
  dirtyCheck(store: Store): Promise<DirtyReport>; // target <20ms each (§4.2)
  ingest(store: Store, dirty: DirtyReport, budget: Budget): Promise<IngestResult>; // resumable
}

export class SourceRegistry {
  readonly #adapters = new Map<SourceId, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`source adapter already registered: ${adapter.id}`);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  get(id: SourceId): SourceAdapter | undefined {
    return this.#adapters.get(id);
  }

  list(): SourceAdapter[] {
    return [...this.#adapters.values()];
  }
}
