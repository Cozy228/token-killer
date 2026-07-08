/**
 * Refresh orchestration (CONTEXA-IMPL §4, P24/D25 semantics, no daemon).
 *
 * - Serve path calls `refresh(budgetMs)` before selection.
 * - First call per engine (per process) is gated on catch-up but TIME-BOXED
 *   (3s, codegraph's constant): not done in time → serve anyway with
 *   RECONCILING; the remainder finishes in the background of the process's
 *   lifetime (a huge repo must never present as a first-call hang).
 * - All dirtyChecks run concurrently; dirty sources ingest inside the
 *   remaining budget, cheapest-first; budget exhausted → remaining sources
 *   serve the previous published_gen, reported RECONCILING.
 * - Single-writer lease (§4.5): the engine ingests only while holding it;
 *   lease held elsewhere → another process is reconciling, serve published.
 *
 * Staleness is structured, never prose (§4.3): the engine reports per-source
 * pending/frozen; the "entities-in-this-answer pending" tier is derived at
 * serve/envelope level (1g) from `sources`.
 */
import type { Store } from "../store/store.ts";
import type { DirtyReport, SourceAdapter, SourceId, SourceRegistry } from "./adapter.ts";

export const CATCHUP_GATE_MS = 3000; // codegraph's constant (§4.1)

export type SourceState =
  | "clean" // not dirty, nothing to do
  | "complete" // ingested fully within budget
  | "partial" // ingest returned incomplete (budget) — continues in background
  | "deferred" // budget exhausted before this source started — continues in background
  | "skipped" // lease held by another writer
  | "error"; // dirtyCheck/ingest threw; previous published gen still serves

export interface SourceRefresh {
  source: SourceId;
  dirty: boolean;
  magnitude: number;
  state: SourceState;
  publishedGen: number;
  error?: string;
}

export interface RefreshReport {
  /** 'reconciling' = at least one source pending/frozen; serve discloses. */
  status: "fresh" | "reconciling";
  sources: SourceRefresh[];
  /** Sources still catching up (partial/deferred/skipped) — envelope input. */
  pendingSources: SourceId[];
  /** Sources whose ingest errored — previous generation frozen until fixed. */
  frozenSources: SourceId[];
}

export interface RefreshEngineOptions {
  now?: () => number;
  catchupGateMs?: number;
  leaseTtlMs?: number;
  /** Lease holder identity (default: pid + random suffix). */
  holder?: string;
}

interface QueueItem {
  adapter: SourceAdapter;
  report: DirtyReport;
}

export class RefreshEngine {
  readonly #store: Store;
  readonly #registry: SourceRegistry;
  readonly #now: () => number;
  readonly #catchupGateMs: number;
  readonly #leaseTtlMs: number | undefined;
  readonly #holder: string;
  #firstCallDone = false;
  #background: Promise<void> = Promise.resolve();

  constructor(store: Store, registry: SourceRegistry, opts: RefreshEngineOptions = {}) {
    this.#store = store;
    this.#registry = registry;
    this.#now = opts.now ?? Date.now;
    this.#catchupGateMs = opts.catchupGateMs ?? CATCHUP_GATE_MS;
    this.#leaseTtlMs = opts.leaseTtlMs;
    this.#holder = opts.holder ?? `ctx:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Background continuation (tests + graceful shutdown await this). */
  get background(): Promise<void> {
    return this.#background;
  }

  async refresh(budgetMs: number): Promise<RefreshReport> {
    // First call per process: catch-up gate, time-boxed (§4.1).
    const effectiveBudget = this.#firstCallDone ? budgetMs : this.#catchupGateMs;
    this.#firstCallDone = true;
    const deadline = this.#now() + effectiveBudget;

    const adapters = this.#registry.list();
    // 1. All dirtyChecks run concurrently (§4.2).
    const checked = await Promise.all(
      adapters.map(
        async (
          adapter,
        ): Promise<{ adapter: SourceAdapter; report?: DirtyReport; error?: string }> => {
          try {
            return { adapter, report: await adapter.dirtyCheck(this.#store) };
          } catch (err) {
            return { adapter, error: err instanceof Error ? err.message : String(err) };
          }
        },
      ),
    );

    const results = new Map<SourceId, SourceRefresh>();
    for (const { adapter, report, error } of checked) {
      results.set(adapter.id, {
        source: adapter.id,
        dirty: report?.dirty ?? false,
        magnitude: report?.magnitude ?? 0,
        state: error !== undefined ? "error" : report?.dirty ? "deferred" : "clean",
        publishedGen: 0, // filled after ingest below
        ...(error !== undefined ? { error } : {}),
      });
    }

    // 2. Cheapest-first ordering (§4.3): cost, then magnitude, then id.
    const queue: QueueItem[] = checked
      .filter((c): c is { adapter: SourceAdapter; report: DirtyReport } => c.report?.dirty === true)
      .sort(
        (x, y) =>
          x.adapter.cost - y.adapter.cost ||
          x.report.magnitude - y.report.magnitude ||
          x.adapter.id.localeCompare(y.adapter.id),
      );

    if (queue.length > 0) {
      // 3. Single-writer lease (§4.5).
      const lease = this.#store.acquireLease(this.#holder, this.#leaseTtlMs);
      if (!lease.acquired) {
        for (const { adapter } of queue) results.get(adapter.id)!.state = "skipped";
      } else {
        const backlog: QueueItem[] = [];
        try {
          for (const item of queue) {
            const entry = results.get(item.adapter.id)!;
            if (this.#now() >= deadline) {
              entry.state = "deferred";
              backlog.push(item);
              continue;
            }
            await this.#ingestOne(item, deadline, entry, backlog);
          }
        } finally {
          this.#store.releaseLease(this.#holder);
        }
        // 4. Budget-exhausted remainder: background of the process's lifetime.
        if (backlog.length > 0) this.#scheduleBackground(backlog);
      }
    }

    const sources = adapters.map((a) => {
      const entry = results.get(a.id)!;
      entry.publishedGen = this.#store.publishedGen(a.id);
      return entry;
    });
    const pendingSources = sources
      .filter((s) => s.state === "partial" || s.state === "deferred" || s.state === "skipped")
      .map((s) => s.source);
    const frozenSources = sources.filter((s) => s.state === "error").map((s) => s.source);
    return {
      status: pendingSources.length + frozenSources.length > 0 ? "reconciling" : "fresh",
      sources,
      pendingSources,
      frozenSources,
    };
  }

  async #ingestOne(
    item: QueueItem,
    deadline: number,
    entry: SourceRefresh,
    backlog: QueueItem[],
  ): Promise<void> {
    try {
      const result = await item.adapter.ingest(this.#store, item.report, {
        deadline,
        now: this.#now,
      });
      entry.state = result.complete ? "complete" : "partial";
      if (!result.complete) backlog.push(item);
    } catch (err) {
      entry.state = "error";
      entry.error = err instanceof Error ? err.message : String(err);
    }
  }

  #scheduleBackground(backlog: QueueItem[]): void {
    this.#background = this.#background.then(async () => {
      const lease = this.#store.acquireLease(this.#holder, this.#leaseTtlMs);
      if (!lease.acquired) return; // another writer took over; it will catch up
      try {
        for (const { adapter, report } of backlog) {
          try {
            // Effectively unbounded budget: background of the process lifetime.
            await adapter.ingest(this.#store, report, {
              deadline: Number.MAX_SAFE_INTEGER,
              now: this.#now,
            });
          } catch {
            // Errors freeze the source at its previous generation; the next
            // refresh() surfaces it via dirtyCheck again.
          }
        }
      } finally {
        this.#store.releaseLease(this.#holder);
      }
    });
  }
}
