/**
 * Parse-worker manager (CONTEXA-IMPL §5.2; ports codegraph's main-thread worker
 * lifecycle + D23 numerics). Owns exactly ONE recyclable worker (never a
 * cpus()-sized pool — N isolates multiply the per-isolate WASM heap pressure
 * that is already near the recycle threshold, and multiply the Windows AV spawn
 * tax). D23 numerics adopted verbatim from
 * docs/codemap/impl/D-language-coverage.md §D4/D5/D6:
 *
 *   - WORKER_RECYCLE_INTERVAL = 250 files   → rebuild the isolate (reclaim heap)
 *   - PARSER_RESET_INTERVAL   = 5000 parses → inside the worker (runtime.ts)
 *   - PARSE_TIMEOUT           = 10_000 ms + 10_000 ms per 100 KB of content
 *   - OOM (out-of-bounds / out-of-memory)  → worker exit(1); parent respawns
 *   - timeout                 → reject FIRST, then fire-and-forget terminate()
 *     (terminate() on a wedged WASM can hang; rejecting first guarantees the
 *     caller — and, on Windows, the whole index — is never wedged)
 *
 * If a worker cannot be spawned (restricted runtime, or the built `.js` worker
 * is absent because M2 runs from source), the manager degrades to an in-process
 * `CodeParserCore` so ingest still completes — the thread isolation, not the
 * result, is what's lost.
 */
import { Worker } from "node:worker_threads";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageId } from "./languages.ts";
import type { CodeParserCore } from "./runtime.ts";
import type { ExtractResult } from "./symbol.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

export const WORKER_RECYCLE_INTERVAL = 250;
export const PARSE_TIMEOUT_BASE_MS = 10_000;
export const PARSE_TIMEOUT_STEP_BYTES = 100_000;
export const PARSE_TIMEOUT_STEP_MS = 10_000;

export interface CodeParserOptions {
  /** Base parse timeout override (test seam; default PARSE_TIMEOUT_BASE_MS). */
  parseTimeoutMs?: number;
  /** Recycle interval override (test seam; default WORKER_RECYCLE_INTERVAL). */
  recycleInterval?: number;
  /** Force the in-process engine (no worker) — used by unit tests. */
  inProcess?: boolean;
}

interface Pending {
  resolve: (r: ExtractResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CodeParser {
  readonly #parseTimeoutMs: number;
  readonly #recycleInterval: number;
  readonly #inProcess: boolean;
  #worker: Worker | null = null;
  #core: CodeParserCore | null = null;
  #terminating = false;
  #workerParseCount = 0;
  #nextId = 1;
  #spawnCount = 0;
  #recycleCount = 0;
  readonly #pending = new Map<number, Pending>();

  constructor(opts: CodeParserOptions = {}) {
    this.#parseTimeoutMs = opts.parseTimeoutMs ?? PARSE_TIMEOUT_BASE_MS;
    this.#recycleInterval = opts.recycleInterval ?? WORKER_RECYCLE_INTERVAL;
    this.#inProcess = opts.inProcess ?? false;
  }

  /** Number of worker spawns so far (a respawn increments it — B1-worker). */
  get spawnCount(): number {
    return this.#spawnCount;
  }
  /** Number of scheduled worker recycles (D23 recycle test). */
  get recycleCount(): number {
    return this.#recycleCount;
  }

  async parse(relPath: string, content: string, langId: LanguageId): Promise<ExtractResult> {
    if (this.#inProcess) return (await this.#ensureCore()).parse(relPath, content, langId);

    // Recycle the isolate every N files to reclaim the fragmenting WASM heap.
    if (this.#worker && this.#workerParseCount >= this.#recycleInterval) this.#recycleWorker();

    const worker = this.#ensureWorker();
    if (!worker) return (await this.#ensureCore()).parse(relPath, content, langId);

    this.#workerParseCount++;
    const id = this.#nextId++;
    const timeoutMs =
      this.#parseTimeoutMs +
      Math.floor(content.length / PARSE_TIMEOUT_STEP_BYTES) * PARSE_TIMEOUT_STEP_MS;

    return new Promise<ExtractResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        // Reject FIRST — terminate() can hang on a wedged WASM (D23).
        reject(new Error(`code parse timed out after ${timeoutMs}ms: ${relPath}`));
        this.#killWorker();
        this.#rejectAll("worker replaced after parse timeout");
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      const message: ToWorker = { type: "parse", id, relPath, content, langId };
      worker.postMessage(message);
    });
  }

  /** Preload grammars for the languages in the changed set (sequential, lazy). */
  async preload(langIds: LanguageId[]): Promise<void> {
    if (this.#inProcess) {
      const core = await this.#ensureCore();
      for (const id of langIds) await core.ensureLanguage(id);
      return;
    }
    const worker = this.#ensureWorker();
    if (!worker) return;
    await new Promise<void>((resolve) => {
      const onMessage = (m: FromWorker): void => {
        if (m.type === "loaded") {
          worker.off("message", onMessage);
          resolve();
        }
      };
      worker.on("message", onMessage);
      const message: ToWorker = { type: "load", langIds };
      worker.postMessage(message);
    });
  }

  async close(): Promise<void> {
    this.#rejectAll("code parser closed");
    this.#core?.dispose();
    this.#core = null;
    if (this.#worker) {
      this.#terminating = true;
      const w = this.#worker;
      this.#worker = null;
      await w.terminate();
    }
  }

  // ---- worker lifecycle ----

  #ensureWorker(): Worker | null {
    if (this.#worker) return this.#worker;
    try {
      const here = fileURLToPath(import.meta.url);
      const isTs = here.endsWith(".ts");
      const workerPath = join(dirname(here), isTs ? "parseWorker.ts" : "parseWorker.js");
      const execArgv = isTs
        ? ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"]
        : [];
      const worker = new Worker(workerPath, { execArgv });
      worker.on("message", (m: FromWorker) => this.#onMessage(m));
      worker.on("error", (e: Error) => this.#onWorkerDown(`worker error: ${e.message}`));
      worker.on("exit", (code) => {
        if (this.#terminating) {
          this.#terminating = false;
          return;
        }
        if (code !== 0) this.#onWorkerDown(`worker exited with code ${code}`);
      });
      this.#worker = worker;
      this.#workerParseCount = 0;
      this.#spawnCount++;
      return worker;
    } catch {
      this.#worker = null;
      return null;
    }
  }

  #onMessage(m: FromWorker): void {
    if (m.type === "parse-result") {
      const p = this.#pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        this.#pending.delete(m.id);
        p.resolve(m.result);
      }
    } else if (m.type === "parse-error") {
      const p = this.#pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        this.#pending.delete(m.id);
        p.reject(new Error(m.message));
      }
    }
  }

  /** Unexpected worker death (OOM exit, crash) → reject in-flight, drop the
   *  reference so the next parse respawns a clean isolate. */
  #onWorkerDown(reason: string): void {
    this.#worker = null;
    this.#workerParseCount = 0;
    this.#rejectAll(reason);
  }

  /** Intentional recycle: terminate the old isolate, next parse spawns fresh. */
  #recycleWorker(): void {
    this.#killWorker();
    this.#recycleCount++;
  }

  #killWorker(): void {
    if (!this.#worker) return;
    this.#terminating = true;
    const w = this.#worker;
    this.#worker = null;
    this.#workerParseCount = 0;
    void w.terminate();
  }

  #rejectAll(reason: string): void {
    for (const [, p] of this.#pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.#pending.clear();
  }

  async #ensureCore(): Promise<CodeParserCore> {
    if (!this.#core) {
      const { CodeParserCore: Core } = await import("./runtime.ts");
      this.#core = new Core();
    }
    return this.#core;
  }
}
