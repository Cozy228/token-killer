// Issue #39 — single-pass inspect scan + habits.
//
// A cold `tk inspect` used to walk every transcript / session file TWICE: once in
// scan() and once in analyzeHabits(). The in-run FileCache dedups the READ, but each
// file was still JSON.parsed twice (once per analyzer). On AV-heavy boxes the parse
// (and the second open, when the file is over the FileCache budget) is the dominant
// cold cost.
//
// This module merges the two extractors into ONE line-walk: each transcript line is
// JSON.parsed once and fed to BOTH a ScanAccumulator and a HabitAccumulator. The scan
// and habits results are byte-identical to running scan()+analyzeHabits() separately —
// the same per-file extracts, folds, and summaries, just driven from a shared parse.
//
// Both cross-run extract caches still apply per file: a file whose scan AND habits
// extracts are both cache hits is never parsed; a file that misses either cache is
// parsed once (combined) and both fresh extracts are written back.
//
// `inspectSinglePass` (sync) is the default CLI path. `inspectSinglePassAsync` is an
// optional, gated variant that overlaps the AV-taxed file READS with Promise.all
// batches. It is async ONLY — no worker threads (deferred for Windows ESM-URL /
// second-entry risk); the parse work itself stays on the main thread.

import { readFile } from "node:fs/promises";

import { type CacheKey, type ExtractCache, makeNoopCache, statKey } from "./extractCache.js";
import { type FileCache, readSourceText } from "./fileCache.js";
import {
  type FileHabitExtract,
  type HabitSessionMap,
  type HabitStats,
  foldHabitExtract,
  makeHabitAccumulator,
  summarizeHabits,
} from "./habits.js";
import {
  type Accumulator,
  type FileScanExtract,
  type ScanResult,
  PROGRESS_LINE_STRIDE,
  finishScan,
  makeScanAccumulator,
  mergeAcc,
} from "./scan.js";
import type { SourceDiscovery } from "./sources.js";

export type SinglePassResult = { scan: ScanResult; habits: HabitStats };

export type SinglePassOptions = {
  // Per-file progress hook (1-based completed count, combined total, detail string).
  onProgress?: (completed: number, total: number, detail?: string) => void;
  // Shared in-run read-through cache (one disk read per file across both analyzers).
  fileCache?: FileCache;
  // Cross-run per-file extract caches (keyed by path+mtime+size).
  scanCache?: ExtractCache<FileScanExtract>;
  habitsCache?: ExtractCache<FileHabitExtract>;
};

// One file's combined contribution. `read` is false when the file could not be read.
type FileExtract = { read: boolean; scan?: FileScanExtract; habits?: FileHabitExtract };

// Parse one file's text ONCE, feeding both the scan and habits accumulators. `onLine`
// fires every PROGRESS_LINE_STRIDE lines (with the running scan event tally) so a large
// file still advances the progress counter. This is the heart of the single-pass fix:
// one JSON.parse per line, both analyzers fed from it.
export function extractFileBoth(
  text: string,
  file: string,
  onLine?: (events: number) => void,
): { scan: FileScanExtract; habits: FileHabitExtract } {
  const scanAcc = makeScanAccumulator();
  const habitAcc = makeHabitAccumulator(file);
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNo += 1;
    if (lineNo % PROGRESS_LINE_STRIDE === 0) onLine?.(scanAcc.events());
    if (line.trim().length === 0) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      scanAcc.parseFailed();
      continue;
    }
    scanAcc.step(json);
    habitAcc.step(json);
  }
  return { scan: scanAcc.finish(), habits: habitAcc.finish() };
}

// Resolve a file's combined extract from `text` (already-read), consulting each cross-run
// cache independently. Only the analyzer(s) whose cache missed force a parse; a parse
// fills BOTH fresh extracts and writes back each missing side. Pure given `text`, so the
// sync and async paths share it.
function resolveExtract(
  file: string,
  text: string | undefined,
  opts: SinglePassOptions,
  cachedScan: FileScanExtract | undefined,
  cachedHabit: FileHabitExtract | undefined,
  key: CacheKey | undefined,
  onLine: ((events: number) => void) | undefined,
): FileExtract {
  if (cachedScan && cachedHabit) return { read: true, scan: cachedScan, habits: cachedHabit };
  if (text === undefined) return { read: false };
  const both = extractFileBoth(text, file, onLine);
  if (key) {
    (opts.scanCache ?? makeNoopCache<FileScanExtract>()).set(file, key, both.scan);
    (opts.habitsCache ?? makeNoopCache<FileHabitExtract>()).set(file, key, both.habits);
  }
  return { read: true, scan: both.scan, habits: both.habits };
}

// Probe both cross-run caches for a file. Returns the key (for write-back) plus whichever
// extracts hit. A combined parse is only needed when at least one side missed.
function probeCaches(
  file: string,
  opts: SinglePassOptions,
): { key: CacheKey | undefined; scan?: FileScanExtract; habit?: FileHabitExtract } {
  const key: CacheKey | undefined =
    opts.scanCache || opts.habitsCache ? statKey(file) : undefined;
  if (!key) return { key: undefined };
  return {
    key,
    scan: opts.scanCache?.get(file, key),
    habit: opts.habitsCache?.get(file, key),
  };
}

// Shared aggregator over a discovery: folds each file's combined extract into the scan +
// habits totals with the group-specific coverage rules (identical to scanCached /
// analyzeHabits). `loadGroup` yields the per-file extracts IN ORDER for a group; the sync
// and async drivers differ only in how they produce that stream.
function aggregate(
  discovery: SourceDiscovery,
  opts: SinglePassOptions,
  loadGroup: (
    files: string[],
    group: "transcripts" | "sessions",
    tick: (group: string, partial?: number) => void,
    state: { toolEventCount: number },
  ) => Generator<FileExtract>,
): SinglePassResult {
  const accs = new Map<string, Accumulator>();
  const state = { toolEventCount: 0 };
  let coverageErrors = 0;
  let transcriptCoverage = 0;
  let sessionInventory = 0;
  const sessions: HabitSessionMap = new Map();

  const totalFiles = discovery.transcriptFiles.length + discovery.sessionFiles.length;
  let processed = 0;
  const tick = (group: string, partial = 0): void =>
    opts.onProgress?.(
      processed,
      totalFiles,
      `${group} · ${(state.toolEventCount + partial).toLocaleString()} events`,
    );

  const groups: Array<{ files: string[]; group: "transcripts" | "sessions" }> = [
    { files: discovery.transcriptFiles, group: "transcripts" },
    { files: discovery.sessionFiles, group: "sessions" },
  ];

  for (const { files, group } of groups) {
    for (const ex of loadGroup(files, group, tick, state)) {
      if (!ex.read || !ex.scan || !ex.habits) {
        coverageErrors += 1;
      } else {
        for (const a of ex.scan.accs) {
          mergeAcc(accs, a);
          state.toolEventCount += a.count;
        }
        foldHabitExtract(sessions, ex.habits);
        if (group === "transcripts") {
          if (ex.scan.hadEvent) transcriptCoverage += 1;
          coverageErrors += ex.scan.parseErrors;
        } else {
          sessionInventory += 1;
        }
      }
      processed += 1;
      tick(group);
    }
  }

  const scanResult = finishScan(discovery, accs, {
    sessionInventory,
    transcriptCoverage,
    toolEventCount: state.toolEventCount,
    unknownTime: 0,
    coverageErrors,
  });
  return { scan: scanResult, habits: summarizeHabits(sessions) };
}

// Default CLI path: ONE synchronous combined pass. Byte-identical scan + habits results
// to scan()+analyzeHabits(), but each file is read and parsed once instead of twice.
export function inspectSinglePass(
  discovery: SourceDiscovery,
  opts: SinglePassOptions = {},
): SinglePassResult {
  return aggregate(discovery, opts, function* (files, group, tick) {
    for (const file of files) {
      const probe = probeCaches(file, opts);
      const text =
        probe.scan && probe.habit
          ? undefined
          : readSourceText(file, opts.fileCache);
      yield resolveExtract(file, text, opts, probe.scan, probe.habit, probe.key, (p) =>
        tick(group, p),
      );
    }
  });
}

// Read text for `file` asynchronously, honoring the in-run FileCache exactly as the sync
// readSourceText does (serve a prior hit; retain within the byte budget; remember a
// failure). Shared by the async batch path so it uses the same cache as the serial path.
async function readSourceTextAsync(file: string, cache?: FileCache): Promise<string | undefined> {
  if (cache?.text.has(file)) {
    const hit = cache.text.get(file);
    return hit === null ? undefined : hit;
  }
  let text: string | undefined;
  try {
    text = await readFile(file, "utf8");
  } catch {
    text = undefined;
  }
  if (cache) {
    if (text === undefined) cache.text.set(file, null);
    else if (text.length <= cache.remainingBytes) {
      cache.text.set(file, text);
      cache.remainingBytes -= text.length;
    }
  }
  return text;
}

// Optional, gated concurrent variant: reads + parses `lanes` files per Promise.all batch,
// overlapping the AV-taxed file reads, then folds IN ORDER so the result and progress
// sequence are deterministic and byte-identical to inspectSinglePass. ASYNC ONLY — no
// worker threads (deferred for Windows ESM-URL / second-entry risk). `lanes` < 2 falls
// back to the serial sync path. Not wired into the sync CLI; opt-in for callers that can
// await (and exercised by tests proving no worker-thread usage).
export async function inspectSinglePassAsync(
  discovery: SourceDiscovery,
  lanes: number,
  opts: SinglePassOptions = {},
): Promise<SinglePassResult> {
  if (!Number.isFinite(lanes) || lanes < 2) return inspectSinglePass(discovery, opts);

  // Pre-resolve every file's extract concurrently, keeping discovery order, BEFORE the
  // (sync) fold so the aggregate is identical to the serial path.
  async function loadAll(files: string[], group: "transcripts" | "sessions"): Promise<FileExtract[]> {
    const out: FileExtract[] = [];
    for (let i = 0; i < files.length; i += lanes) {
      const batch = files.slice(i, i + lanes);
      const part = await Promise.all(
        batch.map(async (file) => {
          const probe = probeCaches(file, opts);
          const text =
            probe.scan && probe.habit ? undefined : await readSourceTextAsync(file, opts.fileCache);
          return resolveExtract(file, text, opts, probe.scan, probe.habit, probe.key, undefined);
        }),
      );
      out.push(...part);
    }
    return out;
  }

  const transcripts = await loadAll(discovery.transcriptFiles, "transcripts");
  const sessions = await loadAll(discovery.sessionFiles, "sessions");
  const byGroup: Record<string, FileExtract[]> = { transcripts, sessions };

  return aggregate(discovery, opts, function* (_files, group) {
    yield* byGroup[group]!;
  });
}
