import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  applyRecord,
  emptyRollup,
  ensureProjectRollup,
  listProjectRollups,
  mergeRollups,
  rebuildRollupFromJsonl,
  rollupFile,
  rollupToGainSummary,
} from "../../../src/core/rollup.js";
import { recordHistory } from "../../../src/core/history.js";
import { historyFile } from "../../../src/core/dataDir.js";
import type { FilteredResult, RawResult, TkOptions } from "../../../src/types.js";

const previousHome = process.env.TOKEN_KILLER_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = previousHome;
});

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(path.join(tmpdir(), "tk-rollup-"));
  process.env.TOKEN_KILLER_HOME = home;
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

function sampleRecord(partial: Partial<ReturnType<typeof baseRecord>> = {}) {
  return { ...baseRecord(), ...partial };
}

function baseRecord() {
  return {
    timestamp: "2026-06-07T10:00:00.000Z",
    command: "git status",
    handler: "git-status",
    raw_chars: 100,
    output_chars: 40,
    raw_tokens: 25,
    output_tokens: 10,
    saved_tokens: 15,
    savings_pct: 60,
    exit_code: 0,
    duration_ms: 12,
    project_fingerprint: "repo:abc123",
    quality_status: "passed",
    source_adapter: "shell",
  };
}

describe("rollup", () => {
  test("applyRecord increments totals and rings", () => {
    const rollup = emptyRollup("repo:abc123");
    applyRecord(rollup, sampleRecord());
    applyRecord(
      rollup,
      sampleRecord({
        timestamp: "2026-06-07T11:00:00.000Z",
        handler: "fallback",
        command: "",
        quality_status: "failure",
        saved_tokens: 0,
        savings_pct: 0,
      }),
    );
    expect(rollup.source_lines).toBe(2);
    expect(rollup.totals.commands).toBe(2);
    expect(rollup.totals.saved_tokens).toBe(15);
    expect(rollup.by_handler["git-status"]?.count).toBe(1);
    expect(rollup.fallback_count).toBe(1);
    expect(rollup.recent).toHaveLength(1);
    expect(rollup.failures).toHaveLength(1);
  });

  test("L1: an inflating command nets out of the headline saved figure (not rounded up)", () => {
    const rollup = emptyRollup("repo:l1");
    // One compressing command and one INFLATING command (output > raw; its per-row
    // saved is clamped to 0). The clamped sum would round the total up to 60.
    applyRecord(rollup, sampleRecord({ raw_tokens: 100, output_tokens: 40, saved_tokens: 60 }));
    applyRecord(
      rollup,
      sampleRecord({
        timestamp: "2026-06-07T12:00:00.000Z",
        raw_tokens: 10,
        output_tokens: 30,
        saved_tokens: 0,
      }),
    );

    expect(rollup.totals.saved_tokens).toBe(60); // internal clamped accumulation, unchanged
    const summary = rollupToGainSummary(mergeRollups([rollup]));
    // Headline = NET (110 raw − 70 output) = 40: the inflation is subtracted, not hidden.
    expect(summary.saved_tokens).toBe(40);
  });

  test("mergeRollups combines projects", () => {
    const a = emptyRollup("repo:a");
    const b = emptyRollup("repo:b");
    applyRecord(a, sampleRecord({ saved_tokens: 10, raw_tokens: 20 }));
    applyRecord(b, sampleRecord({ saved_tokens: 30, raw_tokens: 40 }));
    const merged = mergeRollups([a, b]);
    expect(merged.totals.commands).toBe(2);
    expect(merged.totals.saved_tokens).toBe(40);
    expect(rollupToGainSummary(merged).saved_tokens).toBe(40);
  });

  test("ensureProjectRollup rebuilds from jsonl on cold path (hot path does not write rollup)", async () => {
    await withHome(async (home) => {
      const opts: TkOptions = {
        raw: false,
        stats: false,
        maxLines: 120,
        maxChars: 12000,
        saveRaw: false,
        cwd: home,
      };
      await recordHistory(
        { command: "git status", stdout: "ok", stderr: "", exitCode: 0, durationMs: 1 },
        {
          handler: "git-status",
          output: "ok",
          rawChars: 2,
          outputChars: 2,
          rawTokens: 10,
          outputTokens: 4,
          savedTokens: 6,
          savingsPct: 60,
          exitCode: 0,
          qualityStatus: "passed",
        },
        opts,
      );

      await expect(readFile(rollupFile(home), "utf8")).rejects.toThrow();

      const cached = await ensureProjectRollup(home);
      expect(cached.source_lines).toBe(1);
      expect(cached.totals.saved_tokens).toBe(6);

      const rebuilt = await rebuildRollupFromJsonl(home);
      expect(rebuilt.source_lines).toBe(1);
      expect(rebuilt.totals.saved_tokens).toBe(6);

      const rollupText = await readFile(rollupFile(home), "utf8");
      expect(rollupText).toContain('"source_lines":1');
    });
  });

  test("M5: source_lines tracks PHYSICAL lines so one corrupt line never forces a perpetual rebuild", async () => {
    await withHome(async (home) => {
      const opts: TkOptions = {
        raw: false,
        stats: false,
        maxLines: 120,
        maxChars: 12000,
        saveRaw: false,
        cwd: home,
      };
      const filtered: FilteredResult = {
        handler: "git-status",
        output: "ok",
        rawChars: 2,
        outputChars: 2,
        rawTokens: 10,
        outputTokens: 4,
        savedTokens: 6,
        savingsPct: 60,
        exitCode: 0,
        qualityStatus: "passed",
      };
      const rawRec: RawResult = {
        command: "git status",
        stdout: "ok",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      };
      await recordHistory(rawRec, filtered, opts);
      await recordHistory(rawRec, filtered, opts);
      // Inject a corrupt (unparseable) line: 3 PHYSICAL lines, only 2 parseable.
      await writeFile(historyFile(home), "not-json-garbage\n", { flag: "a" });

      // Keyed on the physical line count (3), not the parsed-record count (2):
      // otherwise the cache key never matches and every `tk gain` rebuilds forever.
      const rollup = await ensureProjectRollup(home);
      expect(rollup.source_lines).toBe(3);

      // A second call with the file unchanged is a cache HIT (same source_lines).
      const again = await ensureProjectRollup(home);
      expect(again.source_lines).toBe(3);
    });
  });

  test("ensureProjectRollup rebuilds when jsonl grows without cache update", async () => {
    await withHome(async (home) => {
      const history = path.join(home, "projects");
      // write via record first
      const opts: TkOptions = {
        raw: false,
        stats: false,
        maxLines: 120,
        maxChars: 12000,
        saveRaw: false,
        cwd: home,
      };
      await recordHistory(
        { command: "git status", stdout: "a", stderr: "", exitCode: 0, durationMs: 1 },
        {
          handler: "git-status",
          output: "a",
          rawChars: 1,
          outputChars: 1,
          rawTokens: 5,
          outputTokens: 2,
          savedTokens: 3,
          savingsPct: 60,
          exitCode: 0,
          qualityStatus: "passed",
        },
        opts,
      );

      const dir = path.dirname(rollupFile(home));
      const histPath = path.join(dir, "history.jsonl");
      await writeFile(
        histPath,
        `${JSON.stringify(sampleRecord({ saved_tokens: 99, raw_tokens: 100 }))}\n`,
        {
          flag: "a",
        },
      );

      const rebuilt = await ensureProjectRollup(home);
      expect(rebuilt.source_lines).toBe(2);
      expect(rebuilt.totals.saved_tokens).toBe(102);
    });
  });

  test("fast path: an unchanged (size, mtime) stamp skips re-reading history.jsonl", async () => {
    await withHome(async (home) => {
      const opts: TkOptions = {
        raw: false,
        stats: false,
        maxLines: 120,
        maxChars: 12000,
        saveRaw: false,
        cwd: home,
      };
      await recordHistory(
        { command: "git status", stdout: "ok", stderr: "", exitCode: 0, durationMs: 1 },
        {
          handler: "git-status",
          output: "ok",
          rawChars: 2,
          outputChars: 2,
          rawTokens: 10,
          outputTokens: 4,
          savedTokens: 6,
          savingsPct: 60,
          exitCode: 0,
          qualityStatus: "passed",
        },
        opts,
      );

      // First call builds + persists the rollup with a (size, mtime) stamp.
      const first = await ensureProjectRollup(home);
      expect(first.source_bytes).toBeGreaterThan(0);
      expect(first.source_mtime_ms).toBeGreaterThan(0);

      // Poison the CACHED rollup's totals while leaving the stamp untouched and the
      // history file unchanged. A correct fast path returns this poisoned value (it
      // trusts the stamp and never re-reads history, which would yield 6).
      const poisoned = { ...first, totals: { ...first.totals, saved_tokens: 999 } };
      await writeFile(rollupFile(home), `${JSON.stringify(poisoned)}\n`, "utf8");

      const second = await ensureProjectRollup(home);
      expect(second.totals.saved_tokens).toBe(999);
    });
  });

  test("listProjectRollups stamps size/mtime so subsequent --user reads take the fast path", async () => {
    await withHome(async (home) => {
      const opts: TkOptions = {
        raw: false,
        stats: false,
        maxLines: 120,
        maxChars: 12000,
        saveRaw: false,
        cwd: home,
      };
      await recordHistory(
        { command: "git status", stdout: "ok", stderr: "", exitCode: 0, durationMs: 1 },
        {
          handler: "git-status",
          output: "ok",
          rawChars: 2,
          outputChars: 2,
          rawTokens: 10,
          outputTokens: 4,
          savedTokens: 6,
          savingsPct: 60,
          exitCode: 0,
          qualityStatus: "passed",
        },
        opts,
      );

      const rollups = await listProjectRollups();
      expect(rollups).toHaveLength(1);
      expect(rollups[0]!.totals.saved_tokens).toBe(6);
      expect(rollups[0]!.source_lines).toBe(1);
      expect(rollups[0]!.source_bytes).toBeGreaterThan(0);
      expect(rollups[0]!.source_mtime_ms).toBeGreaterThan(0);
    });
  });
});
