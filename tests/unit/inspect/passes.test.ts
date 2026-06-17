// Issue #39 — single-pass scan + habits.
//
// Proves (1) the merged pass JSON.parses each file's lines ONCE, not twice; (2) its
// scan + habits results are byte-identical to the prior two-pass scan()+analyzeHabits();
// (3) the optional concurrent variant uses NO worker threads and stays byte-identical.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scan, type FileScanExtract } from "../../../src/inspect/scan.js";
import { analyzeHabits, type FileHabitExtract } from "../../../src/inspect/habits.js";
import { inspectSinglePass, inspectSinglePassAsync } from "../../../src/inspect/passes.js";
import type { CacheKey, ExtractCache } from "../../../src/inspect/extractCache.js";
import type { SourceDiscovery } from "../../../src/inspect/sources.js";

// A trivial in-memory ExtractCache keyed by (path, mtime, size) — exercises the cache
// branch of the single pass without touching disk.
function makeMemoryCache<T>(): ExtractCache<T> {
  const store = new Map<string, { key: CacheKey; payload: T }>();
  return {
    get(file: string, key: CacheKey): T | undefined {
      const e = store.get(file);
      return e && e.key.mtimeMs === key.mtimeMs && e.key.size === key.size ? e.payload : undefined;
    },
    set(file: string, key: CacheKey, payload: T): void {
      store.set(file, { key, payload });
    },
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tk-inspect-passes-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeTranscript(name: string, records: object[]): string {
  const file = join(dir, name);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return file;
}

function discovery(transcriptFiles: string[], sessionFiles: string[] = []): SourceDiscovery {
  return { inputType: "vscode", transcriptFiles, sessionFiles, found: true };
}

// A corpus exercising both analyzers: typed events (habits: session.start / user.message
// / assistant.message.toolRequests) AND flat tool records + a malformed line + a session
// file. This is the shape the two passes must agree on.
function richCorpus(): { transcripts: string[]; sessions: string[]; lineCount: number } {
  const t1 = writeTranscript("typed.jsonl", [
    { type: "session.start", data: { sessionId: "S1" }, timestamp: "2026-06-07T11:40:08.130Z" },
    { type: "user.message", data: { content: "x".repeat(2500) } },
    {
      type: "assistant.message",
      timestamp: "2026-06-07T11:40:11.839Z",
      data: { toolRequests: [{ name: "run_in_terminal", arguments: '{"command":"git status"}' }] },
    },
    { type: "user.message", data: { content: "short" } },
  ]);
  const t2 = writeTranscript("flat.jsonl", [
    { toolName: "bash", toolArgs: JSON.stringify({ command: "npm test" }), toolResult: "z".repeat(40) },
    { toolName: "bash", toolArgs: JSON.stringify({ command: "npm test" }), exitCode: 1, toolResult: "boom" },
    { tool_name: "read_file", tool_input: { filePath: "src/a.ts" }, tool_response: "y".repeat(50) },
  ]);
  // A malformed line (transcript coverage error) and a non-tool line (ignored).
  const t3 = join(dir, "messy.jsonl");
  writeFileSync(t3, '{"toolName":"bash","toolArgs":"{\\"command\\":\\"ls\\"}","toolResult":"a"}\n}{ not json\n{"note":"ignored"}\n');
  const s1 = writeTranscript("session.json", [{ kind: 0, v: { requests: [] } }]);
  return { transcripts: [t1, t2, t3], sessions: [s1], lineCount: 0 };
}

describe("single-pass scan + habits — byte-identical to two-pass", () => {
  test("scan result equals scan(); habits result equals analyzeHabits()", () => {
    const c = richCorpus();
    const disc = discovery(c.transcripts, c.sessions);

    const twoPassScan = scan(disc);
    const twoPassHabits = analyzeHabits(disc);

    const single = inspectSinglePass(disc);

    // Byte-identical: deep structural equality on the public result shapes.
    expect(single.scan).toEqual(twoPassScan);
    expect(single.habits).toEqual(twoPassHabits);
    // Sanity: the corpus actually produced events + habits (not a vacuous pass).
    expect(single.scan.tool_event_count).toBeGreaterThan(0);
    expect(single.habits.sessions).toBeGreaterThan(0);
    expect(single.habits.long_prompt_count).toBe(1); // the 2500-char prompt
  });

  test("identical for an empty discovery and an unreadable file", () => {
    const empty = discovery([], []);
    expect(inspectSinglePass(empty).scan).toEqual(scan(empty));
    expect(inspectSinglePass(empty).habits).toEqual(analyzeHabits(empty));

    const missing = discovery([join(dir, "nope.jsonl")]);
    const single = inspectSinglePass(missing);
    expect(single.scan).toEqual(scan(missing));
    expect(single.scan.coverage_errors).toBe(1);
  });
});

describe("single-pass parses each file ONCE (issue #39)", () => {
  test("JSON.parse is called once per data line, not twice", () => {
    const c = richCorpus();
    const disc = discovery(c.transcripts, c.sessions);

    const spy = vi.spyOn(JSON, "parse");

    inspectSinglePass(disc);
    const singlePassParses = spy.mock.calls.length;
    spy.mockClear();

    scan(disc);
    const scanAloneParses = spy.mock.calls.length;
    spy.mockClear();

    analyzeHabits(disc);
    const habitsAloneParses = spy.mock.calls.length;
    spy.mockClear();

    // The old pipeline ran BOTH passes, parsing every file's lines twice.
    scan(disc);
    analyzeHabits(disc);
    const twoPassParses = spy.mock.calls.length;
    spy.mockRestore();

    // Each pass parses every non-blank LINE; scan additionally parses inner argument
    // strings (extractVscodeRecords). habits parses ONLY lines. In the single pass those
    // line-parses are SHARED — fed to both analyzers from one JSON.parse — so the merged
    // total equals scan-alone (lines + inner), with habits adding zero extra parses.
    expect(twoPassParses).toBe(scanAloneParses + habitsAloneParses); // confirms the 2x base
    expect(singlePassParses).toBe(scanAloneParses); // habits' line-parses cost nothing extra
    // And it is strictly cheaper than the two-pass total (the win).
    expect(singlePassParses).toBeLessThan(twoPassParses);
    expect(singlePassParses).toBeGreaterThan(0);
  });
});

describe("single-pass honors both cross-run extract caches", () => {
  test("second run with warm scan+habits caches re-parses nothing", () => {
    const c = richCorpus();
    const disc = discovery(c.transcripts, c.sessions);
    const scanCache = makeMemoryCache<FileScanExtract>();
    const habitsCache = makeMemoryCache<FileHabitExtract>();

    const cold = inspectSinglePass(disc, { scanCache, habitsCache });

    const spy = vi.spyOn(JSON, "parse");
    const warm = inspectSinglePass(disc, { scanCache, habitsCache });
    spy.mockRestore();

    // Warm run is byte-identical AND parsed no transcript lines (served from cache).
    expect(warm.scan).toEqual(cold.scan);
    expect(warm.habits).toEqual(cold.habits);
    expect(spy.mock.calls.length).toBe(0);
  });
});

describe("concurrent variant — async only, no worker threads", () => {
  test("byte-identical to the serial single pass", async () => {
    const c = richCorpus();
    const disc = discovery(c.transcripts, c.sessions);
    const serial = inspectSinglePass(disc);
    const concurrent = await inspectSinglePassAsync(disc, 2);
    expect(concurrent.scan).toEqual(serial.scan);
    expect(concurrent.habits).toEqual(serial.habits);
  });

  test("lanes < 2 transparently uses the serial path", async () => {
    const c = richCorpus();
    const disc = discovery(c.transcripts, c.sessions);
    expect((await inspectSinglePassAsync(disc, 1)).scan).toEqual(inspectSinglePass(disc).scan);
  });

  test("the passes module imports no worker_threads", async () => {
    // Static proof: the source never references node:worker_threads / Worker. Async
    // concurrency carries none of the worker-thread ESM-URL / second-entry risk.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../src/inspect/passes.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/worker_threads/);
    expect(src).not.toMatch(/new\s+Worker/);
  });
});
