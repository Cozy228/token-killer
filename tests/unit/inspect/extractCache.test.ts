import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeDiskExtractCache, pruneCache, statKey } from "../../../src/inspect/extractCache.js";
import { scan, type FileScanExtract } from "../../../src/inspect/scan.js";
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
