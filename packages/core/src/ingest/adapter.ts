/**
 * SourceAdapter framework (CONTEXA-IMPL §4) — the second half of the foundation
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
  /**
   * Optional 2c disclosures (code source). SUCCESS-shaped envelope fields — a
   * refusal is `complete: true, refused: true`, never an error (§4 / G-3).
   */
  cosmetic?: number; // changed files classified COSMETIC (hash updated, no re-extract)
  reingested?: number; // files actually re-parsed (structural + boundary + shadow expansion)
  boundaryExpanded?: number; // unchanged-side files pulled in by 1-hop boundary
  shadowExpanded?: number; // pre-existing files re-resolved because a shadow was added
  driftFlagged?: number; // anchored memories flagged needs-review by drift
  callEdges?: number; // caller→callee `calls` edges resolved this pass (2d)
  /**
   * DR-27 disclosure half (O-16): count of DISTINCT doc→symbol mentions that
   * could not be resolved to a published symbol — a NAMED blind spot, surfaced
   * instead of silently dropped. Durable persistence / re-resolution is V1-gated.
   */
  blindSpots?: number;
  refused?: boolean; // shrink guard refused to publish (generation held at previous gen)
  refusal?: { reason: string; prevSymbols: number; projectedSymbols: number };
  /**
   * 2e SCIP pass disclosure (code source). SUCCESS-shaped: `applied:false`
   * (absent / malformed `index.scip`) means the ingest completed on tree-sitter
   * alone with nothing half-applied — a fail-open, never an error (D16 / G-3).
   */
  scip?: import("./code/scip/consume.ts").ScipPassResult;
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
