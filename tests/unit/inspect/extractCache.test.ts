import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  makeDiskExtractCache,
  pruneCache,
  statKey,
  type ExtractCache,
} from "../../../src/inspect/extractCache.js";
import { scan, type FileEventExtract, type FileScanExtract } from "../../../src/inspect/scan.js";
import { analyzeHabits, type FileHabitExtract } from "../../../src/inspect/habits.js";
import type { SourceDiscovery } from "../../../src/inspect/sources.js";

let dir: string;
let cacheRoot: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tk-extract-cache-"));
  cacheRoot = join(dir, "cache");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeTranscript(name: string, records: unknown[]): string {
  const file = join(dir, name);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return file;
}

function discovery(transcriptFiles: string[], sessionFiles: string[] = []): SourceDiscovery {
  return { inputType: "vscode", transcriptFiles, sessionFiles, found: true };
}

const SAMPLE = [
  {
    toolName: "bash",
    toolArgs: JSON.stringify({ command: "git status" }),
    toolResult: "x".repeat(120),
  },
  {
    toolName: "bash",
    toolArgs: JSON.stringify({ command: "git status" }),
    toolResult: "x".repeat(300),
  },
  { tool_name: "read_file", tool_input: { filePath: "src/a.ts" }, tool_response: "y".repeat(50) },
  "not json at all",
];

describe("scan disk cache", () => {
  test("a cached run yields an identical ScanResult to the cold run", () => {
    const file = writeTranscript("t.jsonl", SAMPLE);
    const cold = scan(discovery([file]));

    const scanCache = makeDiskExtractCache<FileScanExtract>(cacheRoot, "scan");
    const warmMiss = scan(discovery([file]), { scanCache }); // populates the cache
    const warmHit = scan(discovery([file]), { scanCache }); // served from disk

    expect(warmMiss).toEqual(cold);
    expect(warmHit).toEqual(cold);
    // An entry file actually landed on disk.
    expect(readdirSync(join(cacheRoot, "scan")).length).toBe(1);
  });

  test("a changed file (new mtime/size) invalidates its entry", () => {
    const file = writeTranscript("t.jsonl", SAMPLE);
    const scanCache = makeDiskExtractCache<FileScanExtract>(cacheRoot, "scan");
    const first = scan(discovery([file]), { scanCache });
    expect(first.tool_event_count).toBe(3);

    // Append another git status event — size changes, so the key no longer matches.
    writeFileSync(
      file,
      [
        ...SAMPLE,
        {
          toolName: "bash",
          toolArgs: JSON.stringify({ command: "git status" }),
          toolResult: "z".repeat(10),
        },
      ]
        .map((r) => JSON.stringify(r))
        .join("\n") + "\n",
    );
    const second = scan(discovery([file]), { scanCache });
    expect(second.tool_event_count).toBe(4);
    expect(second).toEqual(scan(discovery([file]))); // matches a fresh cold scan
  });

  test("a corrupt cache entry falls back to a live parse", () => {
    const file = writeTranscript("t.jsonl", SAMPLE);
    const scanCache = makeDiskExtractCache<FileScanExtract>(cacheRoot, "scan");
    scan(discovery([file]), { scanCache }); // populate

    // Corrupt every entry on disk.
    for (const name of readdirSync(join(cacheRoot, "scan"))) {
      writeFileSync(join(cacheRoot, "scan", name), "{ this is not json");
    }
    const recovered = scan(discovery([file]), { scanCache });
    expect(recovered).toEqual(scan(discovery([file])));
  });

  test("TK_NO_SCAN_CACHE disables the disk cache (no entries written)", () => {
    const file = writeTranscript("t.jsonl", SAMPLE);
    const scanCache = makeDiskExtractCache<FileScanExtract>(cacheRoot, "scan", {
      TK_NO_SCAN_CACHE: "1",
    } as NodeJS.ProcessEnv);
    const r = scan(discovery([file]), { scanCache });
    expect(r).toEqual(scan(discovery([file])));
    expect(() => readdirSync(join(cacheRoot, "scan"))).toThrow(/ENOENT/); // dir never created
  });

  test("a --since filtered scan bypasses the cache (live path)", () => {
    const recent = {
      toolName: "bash",
      toolArgs: JSON.stringify({ command: "git log" }),
      toolResult: "a".repeat(80),
      timestamp: "2026-06-17T00:00:00Z",
    };
    const old = {
      toolName: "bash",
      toolArgs: JSON.stringify({ command: "git log" }),
      toolResult: "a".repeat(80),
      timestamp: "2000-01-01T00:00:00Z",
    };
    const file = writeTranscript("t.jsonl", [recent, old]);
    const scanCache = makeDiskExtractCache<FileScanExtract>(cacheRoot, "scan");
    const r = scan(discovery([file]), { scanCache, sinceMs: Date.parse("2026-01-01T00:00:00Z") });
    expect(r.tool_event_count).toBe(1); // only the recent event
    // The filtered path never touches the disk cache.
    expect(() => readdirSync(join(cacheRoot, "scan"))).toThrow(/ENOENT/);
  });
});

// Issue #38 — the windowed/session scan reuses a per-event cross-run cache instead of
// re-parsing raw JSON every run. These cover: warm-cache consultation for --since, a
// materially faster second run, best-effort fallback on corruption, and --session.
describe("scan event cache (--since / --session)", () => {
  // Timestamped sample spanning two eras so a --since cutoff drops the old half.
  function tsEvent(command: string, ts: string, session?: string) {
    const rec: Record<string, unknown> = {
      toolName: "bash",
      toolArgs: JSON.stringify({ command }),
      toolResult: "x".repeat(120),
      timestamp: ts,
    };
    if (session) rec.sessionId = session;
    return rec;
  }
  const WINDOWED = [
    tsEvent("git status", "2026-06-17T00:00:00Z", "S1"),
    tsEvent("git status", "2026-06-17T01:00:00Z", "S1"),
    tsEvent("git diff", "2000-01-01T00:00:00Z", "S2"), // too old for the --since window
    { toolName: "bash", toolArgs: JSON.stringify({ command: "git log" }), toolResult: "x" }, // no ts
  ];
  const cutoff = Date.parse("2026-01-01T00:00:00Z");

  // Wrap a real cache to count consultations + a NEW write (a cold extract). A warm run
  // should record hits and ZERO new sets.
  function counting<T>(inner: ExtractCache<T>) {
    const stats = { gets: 0, hits: 0, sets: 0 };
    const wrapped: ExtractCache<T> = {
      get(file, key) {
        stats.gets += 1;
        const v = inner.get(file, key);
        if (v !== undefined) stats.hits += 1;
        return v;
      },
      set(file, key, payload) {
        stats.sets += 1;
        inner.set(file, key, payload);
      },
    };
    return { wrapped, stats };
  }

  test("--since consults the on-disk event cache and skips re-parse on a warm cache", () => {
    const file = writeTranscript("t.jsonl", WINDOWED);
    const disk = makeDiskExtractCache<FileEventExtract>(cacheRoot, "scan-events");

    // Cold: a cache miss → extract + write back exactly one entry.
    const cold = counting(disk);
    const r1 = scan(discovery([file]), { eventCache: cold.wrapped, sinceMs: cutoff });
    expect(r1.tool_event_count).toBe(2); // two recent git status; old + unknown-time dropped
    expect(r1.unknown_time_records).toBe(1);
    expect(cold.stats.hits).toBe(0);
    expect(cold.stats.sets).toBe(1);
    expect(readdirSync(join(cacheRoot, "scan-events")).length).toBe(1);

    // Warm: served from disk, no new extract written.
    const warm = counting(disk);
    const r2 = scan(discovery([file]), { eventCache: warm.wrapped, sinceMs: cutoff });
    expect(r2).toEqual(r1);
    expect(warm.stats.hits).toBe(1);
    expect(warm.stats.sets).toBe(0); // nothing re-parsed/re-written

    // And it matches a fresh live scan (cache is transparent).
    expect(r2).toEqual(scan(discovery([file]), { sinceMs: cutoff }));
  });

  test("a second identical --since run is materially faster than the cold run", () => {
    // A large file so the raw-parse cost dominates the cheap post-load filter.
    const many: unknown[] = [];
    for (let i = 0; i < 6000; i += 1) {
      many.push(tsEvent(`git status`, "2026-06-17T00:00:00Z"));
    }
    const file = writeTranscript("big.jsonl", many);
    const disk = makeDiskExtractCache<FileEventExtract>(cacheRoot, "scan-events");

    const t0 = performance.now();
    const cold = scan(discovery([file]), { eventCache: disk, sinceMs: cutoff });
    const coldMs = performance.now() - t0;

    const t1 = performance.now();
    const warm = scan(discovery([file]), { eventCache: disk, sinceMs: cutoff });
    const warmMs = performance.now() - t1;

    expect(warm).toEqual(cold);
    expect(cold.tool_event_count).toBe(6000);
    // Warm reuses the cached event stream; the raw JSON.parse pass is skipped. Assert a
    // clear margin (warm under half the cold time) to stay robust to CI jitter.
    expect(warmMs).toBeLessThan(coldMs * 0.5);
  });

  test("a corrupt event-cache entry falls back to a live parse (best-effort)", () => {
    const file = writeTranscript("t.jsonl", WINDOWED);
    const disk = makeDiskExtractCache<FileEventExtract>(cacheRoot, "scan-events");
    scan(discovery([file]), { eventCache: disk, sinceMs: cutoff }); // populate

    for (const name of readdirSync(join(cacheRoot, "scan-events"))) {
      writeFileSync(join(cacheRoot, "scan-events", name), "{ not json");
    }
    const recovered = scan(discovery([file]), { eventCache: disk, sinceMs: cutoff });
    expect(recovered).toEqual(scan(discovery([file]), { sinceMs: cutoff }));
  });

  test("a changed file (new mtime/size) invalidates its event-cache entry", () => {
    const file = writeTranscript("t.jsonl", WINDOWED);
    const disk = makeDiskExtractCache<FileEventExtract>(cacheRoot, "scan-events");
    expect(scan(discovery([file]), { eventCache: disk, sinceMs: cutoff }).tool_event_count).toBe(2);

    writeFileSync(
      file,
      [...WINDOWED, tsEvent("git status", "2026-06-18T00:00:00Z")]
        .map((r) => JSON.stringify(r))
        .join("\n") + "\n",
    );
    const second = scan(discovery([file]), { eventCache: disk, sinceMs: cutoff });
    expect(second.tool_event_count).toBe(3);
    expect(second).toEqual(scan(discovery([file]), { sinceMs: cutoff }));
  });

  test("--session also benefits from the event cache", () => {
    const file = writeTranscript("t.jsonl", WINDOWED);
    const disk = makeDiskExtractCache<FileEventExtract>(cacheRoot, "scan-events");

    const cold = counting(disk);
    const r1 = scan(discovery([file]), { eventCache: cold.wrapped, session: "S1" });
    expect(r1.tool_event_count).toBe(2); // both S1 git status events
    expect(r1.opportunities[0].key).toBe("git status");
    expect(cold.stats.sets).toBe(1);

    const warm = counting(disk);
    const r2 = scan(discovery([file]), { eventCache: warm.wrapped, session: "S1" });
    expect(r2).toEqual(r1);
    expect(warm.stats.hits).toBe(1);
    expect(warm.stats.sets).toBe(0);
    expect(r2).toEqual(scan(discovery([file]), { session: "S1" }));
  });

  test("TK_NO_SCAN_CACHE disables the event cache (no entries written)", () => {
    const file = writeTranscript("t.jsonl", WINDOWED);
    const disk = makeDiskExtractCache<FileEventExtract>(cacheRoot, "scan-events", {
      TK_NO_SCAN_CACHE: "1",
    } as NodeJS.ProcessEnv);
    const r = scan(discovery([file]), { eventCache: disk, sinceMs: cutoff });
    expect(r).toEqual(scan(discovery([file]), { sinceMs: cutoff }));
    expect(() => readdirSync(join(cacheRoot, "scan-events"))).toThrow(/ENOENT/);
  });
});

describe("habits disk cache", () => {
  const TYPED = [
    { type: "session.start", data: { sessionId: "s1" } },
    { type: "user.message", data: { content: "x".repeat(2500) } },
    { type: "assistant.message", data: { toolRequests: [{}, {}, {}] } },
  ];

  test("a cached habits run matches the cold run", () => {
    const file = writeTranscript("h.jsonl", TYPED);
    const cold = analyzeHabits(discovery([file]));
    const cache = makeDiskExtractCache<FileHabitExtract>(cacheRoot, "habits");
    const miss = analyzeHabits(discovery([file]), undefined, undefined, cache);
    const hit = analyzeHabits(discovery([file]), undefined, undefined, cache);
    expect(miss).toEqual(cold);
    expect(hit).toEqual(cold);
  });
});

describe("pruneCache", () => {
  test("removes entries whose cache file is older than the max age", () => {
    const file = writeTranscript("t.jsonl", SAMPLE);
    const scanCache = makeDiskExtractCache<FileScanExtract>(cacheRoot, "scan");
    scan(discovery([file]), { scanCache });
    const entryDir = join(cacheRoot, "scan");
    const [entry] = readdirSync(entryDir);
    // Backdate the cache file ~40 days.
    const old = Date.now() / 1000 - 40 * 24 * 60 * 60;
    utimesSync(join(entryDir, entry!), old, old);
    pruneCache(cacheRoot, Date.now());
    expect(readdirSync(entryDir).length).toBe(0);
  });
});

describe("statKey", () => {
  test("returns undefined for a missing file", () => {
    expect(statKey(join(dir, "nope.jsonl"))).toBeUndefined();
  });
});
