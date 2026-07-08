/**
 * Memory `SourceAdapter` (CONTEXA-IMPL §4/§5.6; slice-4 S10 #1/#5).
 *
 * Memory is a REAL dirty source now: the committed `.contexa/memory/` log + the
 * personal overlay files are the carrier. `dirtyCheck` is mtime-first with a
 * manifest short-circuit — an unchanged tree costs ~one `stat` per watched file
 * and reads nothing (A11: < 20 ms); only files whose own mtime advanced are
 * checksummed. `ingest` runs the cold-path catch-up (D25 first-call-per-process
 * gate, never per-query, never a watcher):
 *   1. import Claude host auto-memory → the personal OVERLAY as needs-review (E3),
 *      write-through (item 2 — the refresh-path import always carries a writer);
 *   2. migration cold-path trigger (item 3): sweep any store-only M1 rows into the
 *      files + reset-rebuild the index (F4/F5), so the store re-derives from files;
 *   3. reindex the index from the files — additive for pure appends (a `git pull`
 *      of new committed lines), reset for a non-append shape (a rewrite/redaction
 *      that must shed rows).
 * Then it persists the manifest (post-write mtimes), the host watermark, and the
 * last reindex report (E8 doctor ops).
 *
 * No LLM / no network — deterministic file reads + local read-only git plumbing
 * (the reindex drift recompute). Deterministic ULIDs keep imports idempotent.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Budget, DirtyReport, IngestResult, SourceAdapter } from "../ingest/adapter.ts";
import type { Store } from "../store/store.ts";
import { blake2bHex } from "../store/hash.ts";
import { readMemoryOptOut } from "../push/config.ts";
import { importClaudeCodeMemory, resolveClaudeMemoryDir } from "./claudeImporter.ts";
import { MemoryFiles } from "./fileStore.ts";
import { isMigrationDue, migrateStoreMemoryToFiles } from "./exportMigration.ts";
import { reindexMemoryFromFiles, type ReindexReport } from "./reindex.ts";

const MEMORY_SOURCE = "memory";
const MANIFEST_META = "memory_file_manifest";

/** The committed + overlay log files whose mtimes gate the dirty short-circuit
 *  (relative to `.contexa`). Sidecars always arrive with a log line, so watching the
 *  four logs is sufficient; a new sidecar never appears without a `+` log line. */
const WATCHED_RELS: readonly string[] = [
  "memory/log.md", // mainline memory entries
  "memory/decisions.md", // mainline lifecycle log
  "memory.local.md", // overlay memory entries
  "decisions.local.md", // overlay lifecycle log
];

interface FileState {
  mtime: number; // floored mtimeMs
  size: number; // bytes
  sha: string; // blake2b of the whole file
}

interface MemoryManifest {
  files: Record<string, FileState>;
  host: number; // host memory dir watermark (max mtime ms)
  synced: boolean; // the one-time cold-path catch-up has run
  reindex?: { skipped: number; shadowedOverlay: number }; // last report (E8)
}

export interface MemoryAdapterOptions {
  /** Directory that contains `.claude` (default: os homedir()). Tests inject. */
  claudeHome?: string;
  /** Candidate project roots to slug into a Claude project dir (default: store roots). */
  projectRoots?: string[];
  /**
   * `.contexa` directory the write-through targets (default: `<projectRoot>/.contexa`).
   * Injected by living-repo / perf fixtures so the memory writer lands in a
   * sandbox and never creates `.contexa/` in the real repo (the hard constraint).
   */
  contexaRoot?: string;
}

/** Latest mtime across the host memory dir itself and its topic files (ms, floored). */
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

/** Read `path` as bytes, or `undefined` when absent. */
function readBytes(path: string): Buffer | undefined {
  try {
    return readFileSync(path);
  } catch {
    return undefined;
  }
}

export class MemorySourceAdapter implements SourceAdapter {
  readonly id = "memory" as const;
  /** Cheapest source: a few stats + a store meta read, no subprocess. */
  readonly cost = 1;
  readonly #claudeHome: string | undefined;
  readonly #projectRoots: string[] | undefined;
  readonly #contexaRoot: string | undefined;

  constructor(opts: MemoryAdapterOptions = {}) {
    this.#claudeHome = opts.claudeHome;
    this.#projectRoots = opts.projectRoots;
    this.#contexaRoot = opts.contexaRoot;
  }

  #contexaRootFor(store: Store): string {
    return this.#contexaRoot ?? join(store.projectRoot, ".contexa");
  }

  #resolveHostDir(store: Store): string | undefined {
    return resolveClaudeMemoryDir(
      this.#claudeHome ?? homedir(),
      this.#projectRoots ?? [store.projectRoot, store.mainRoot],
    );
  }

  #readManifest(store: Store): MemoryManifest {
    const raw = store.getMeta(MANIFEST_META);
    if (raw === undefined) return { files: {}, host: 0, synced: false };
    try {
      const m = JSON.parse(raw) as MemoryManifest;
      return {
        files: m.files ?? {},
        host: m.host ?? 0,
        synced: m.synced === true,
        ...(m.reindex ? { reindex: m.reindex } : {}),
      };
    } catch {
      return { files: {}, host: 0, synced: false };
    }
  }

  #writeManifest(store: Store, manifest: MemoryManifest): void {
    store.setMeta(MANIFEST_META, JSON.stringify(manifest));
  }

  /** Snapshot the watched files' `{mtime,size,sha}` (cold-path — reads all four). */
  #snapshotFiles(contexaRoot: string): Record<string, FileState> {
    const out: Record<string, FileState> = {};
    for (const rel of WATCHED_RELS) {
      const path = join(contexaRoot, rel);
      const buf = readBytes(path);
      if (buf === undefined) continue;
      out[rel] = {
        mtime: Math.floor(statSync(path).mtimeMs),
        size: buf.length,
        sha: blake2bHex(buf),
      };
    }
    return out;
  }

  /**
   * Decide the reindex shape from the committed/overlay files vs the last-synced
   * manifest: pure appends → `additive`; any file that shrank or whose retained
   * prefix changed (a rewrite / manual conflict resolution / redaction) → `reset`
   * (the index must SHED rows). A never-synced store rebuilds additive (nothing to
   * shed). Prefix check: the old file was exactly `prev.size` bytes, so its stored
   * sha equals the sha of the new file's first `prev.size` bytes iff unchanged.
   */
  #reindexShape(contexaRoot: string, prev: MemoryManifest): "additive" | "reset" {
    if (!prev.synced) return "additive";
    for (const rel of WATCHED_RELS) {
      const prevState = prev.files[rel];
      if (prevState === undefined) continue; // new file → pure append
      const buf = readBytes(join(contexaRoot, rel));
      if (buf === undefined) return "reset"; // file removed → shed rows
      if (buf.length < prevState.size) return "reset"; // shrank → non-append
      if (blake2bHex(buf.subarray(0, prevState.size)) !== prevState.sha) return "reset"; // prefix changed
    }
    return "additive";
  }

  async dirtyCheck(store: Store): Promise<DirtyReport> {
    const contexaRoot = this.#contexaRootFor(store);
    const manifest = this.#readManifest(store);
    // mtime-first with a manifest short-circuit: an unchanged file (mtime matches)
    // is NEVER read; only a file whose own mtime advanced is checksummed (S10 #1).
    let fileDirty = false;
    for (const rel of WATCHED_RELS) {
      const path = join(contexaRoot, rel);
      let mtime: number;
      let size: number;
      try {
        const st = statSync(path);
        mtime = Math.floor(st.mtimeMs);
        size = st.size;
      } catch {
        if (manifest.files[rel] !== undefined) fileDirty = true; // file removed
        continue;
      }
      const prev = manifest.files[rel];
      // Skip the read only when mtime AND size both match (F3 — closes most of the
      // same-millisecond in-place rewrite window; the stat is already in hand). A
      // touched-but-identical file re-hashes on every dirtyCheck until the next
      // ingest re-stamps the manifest — accepted as bounded (see slice-4 notes).
      if (prev !== undefined && prev.mtime === mtime && prev.size === size) continue;
      const buf = readBytes(path);
      const sha = buf ? blake2bHex(buf) : "";
      if (prev === undefined || prev.sha !== sha) fileDirty = true;
    }
    const hostDir = this.#resolveHostDir(store);
    const hostWatermark = hostDir ? latestMtimeMs(hostDir) : 0;
    const hostDirty = hostWatermark > manifest.host;
    // The one-time cold-path catch-up (migration + first reindex) must run once.
    const dirty = fileDirty || hostDirty || !manifest.synced;
    return {
      source: MEMORY_SOURCE,
      dirty,
      magnitude: dirty ? 1 : 0,
      detail: { hostWatermark },
    };
  }

  async ingest(store: Store, dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
    const contexaRoot = this.#contexaRootFor(store);
    // E4 opt-out (item 4): honor the per-repo knob on the cold-path write surface
    // so migration + import land in the overlay, never the committed zone.
    const files = new MemoryFiles(contexaRoot, readMemoryOptOut(contexaRoot));
    const prevManifest = this.#readManifest(store);
    // Shape decision reads the committed files BEFORE any write-through mutates them.
    const shape = this.#reindexShape(contexaRoot, prevManifest);

    // 1. Host auto-memory → overlay needs-review (E3), write-through (item 2).
    const importReport = importClaudeCodeMemory(store, {
      ...(this.#claudeHome !== undefined ? { claudeHome: this.#claudeHome } : {}),
      ...(this.#projectRoots !== undefined ? { projectRoots: this.#projectRoots } : {}),
      now: budget.now,
      files,
    });

    // 2. Migration cold-path trigger (item 3): sweep store-only rows into the files
    //    + reset-rebuild so the store re-derives exactly like a fresh clone (F4/F5).
    let report: ReindexReport;
    if (isMigrationDue(store, files)) {
      migrateStoreMemoryToFiles(store, files);
      // A follow-up additive reindex is idempotent and yields the doctor report.
      report = reindexMemoryFromFiles(store, files, { mode: "additive" });
    } else {
      // 3. Reindex the index from the files (additive for appends; reset to shed).
      report = reindexMemoryFromFiles(store, files, { mode: shape });
    }

    // 4. Persist the manifest (post-write mtimes), host watermark, and E8 report.
    const hostWatermark =
      (dirty.detail as { hostWatermark?: number } | undefined)?.hostWatermark ??
      (importReport.memoryDir ? latestMtimeMs(importReport.memoryDir) : prevManifest.host);
    this.#writeManifest(store, {
      files: this.#snapshotFiles(contexaRoot),
      host: hostWatermark,
      synced: true,
      reindex: { skipped: report.skipped, shadowedOverlay: report.shadowedOverlay },
    });
    // Keep the legacy cursor advanced too (freshness label / other readers).
    store.setCursor(
      MEMORY_SOURCE,
      String(hostWatermark),
      hostWatermark,
      store.publishedGen(MEMORY_SOURCE),
    );

    return {
      source: MEMORY_SOURCE,
      complete: true,
      entities: report.memories,
      claims: report.decisions,
    };
  }
}
