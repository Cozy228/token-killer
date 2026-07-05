/**
 * Memory `SourceAdapter` (CTX-IMPL §4/§5.6). Unlike `remember()` (which writes
 * straight to the store), HOST auto-memory is an external carrier: its dir can
 * change under us between syncs, so `dirtyCheck` is mtime-aware over the resolved
 * Claude host memory dir (dir mtime / max topic-file mtime vs a stored
 * watermark). When the dir is absent the check is an always-clean fast path.
 * `ingest()` re-imports on the cold/serve refresh path when the dir changed and
 * advances the watermark; deterministic ULIDs make the upsert idempotent.
 */
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Budget, DirtyReport, IngestResult, SourceAdapter } from "../ingest/adapter.ts";
import type { Store } from "../store/store.ts";
import { importClaudeCodeMemory, resolveClaudeMemoryDir } from "./claudeImporter.ts";

const MEMORY_SOURCE = "memory";

export interface MemoryAdapterOptions {
  /** Directory that contains `.claude` (default: os homedir()). Tests inject. */
  claudeHome?: string;
  /** Candidate project roots to slug into a Claude project dir (default: store roots). */
  projectRoots?: string[];
}

/** Latest mtime across the memory dir itself and its topic files (ms, floored).
 *  Cheapest deterministic watermark — a `readdir` + per-entry `stat`, no read. */
function latestMtimeMs(dir: string): number {
  let latest = 0;
  try {
    latest = Math.floor(statSync(dir).mtimeMs);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const m = Math.floor(statSync(join(dir, name)).mtimeMs);
      if (m > latest) latest = m;
    }
  } catch {
    return 0; // dir vanished mid-check → treat as clean (fast path)
  }
  return latest;
}

export class MemorySourceAdapter implements SourceAdapter {
  readonly id = "memory" as const;
  /** Cheapest source: a dir stat + readdir, no subprocess. */
  readonly cost = 1;
  readonly #claudeHome: string | undefined;
  readonly #projectRoots: string[] | undefined;

  constructor(opts: MemoryAdapterOptions = {}) {
    this.#claudeHome = opts.claudeHome;
    this.#projectRoots = opts.projectRoots;
  }

  #resolveDir(store: Store): string | undefined {
    return resolveClaudeMemoryDir(
      this.#claudeHome ?? homedir(),
      this.#projectRoots ?? [store.projectRoot, store.mainRoot],
    );
  }

  async dirtyCheck(store: Store): Promise<DirtyReport> {
    const dir = this.#resolveDir(store);
    if (!dir) return { source: "memory", dirty: false, magnitude: 0 }; // no host dir → clean
    const watermark = latestMtimeMs(dir);
    const seen = Number(store.getCursor(MEMORY_SOURCE)?.position ?? 0);
    const dirty = watermark > seen;
    return { source: "memory", dirty, magnitude: dirty ? 1 : 0, detail: { watermark } };
  }

  /** Import host memory when the dir changed; advance the watermark cursor. */
  async ingest(store: Store, dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
    const report = importClaudeCodeMemory(store, {
      claudeHome: this.#claudeHome,
      projectRoots: this.#projectRoots,
      now: budget.now,
    });
    const watermark =
      (dirty.detail as { watermark?: number } | undefined)?.watermark ??
      (report.memoryDir ? latestMtimeMs(report.memoryDir) : 0);
    store.setCursor(
      MEMORY_SOURCE,
      String(watermark),
      watermark,
      report.gen ?? store.publishedGen(MEMORY_SOURCE),
    );
    return {
      source: "memory",
      complete: true,
      entities: report.entities,
      claims: report.candidates,
    };
  }
}
