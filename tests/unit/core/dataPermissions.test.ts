// Plan 003 — every store under ~/.token-killer/ must be created owner-only
// (0o700 dirs / 0o600 files), matching the rawStore precedent (the command line
// tk persists routinely carries secrets). `mode` is honored only at CREATE time
// and ignored by Node on Windows, so each case skips on win32.

import { mkdtempSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dedupStoreFile, historyFile } from "../../../src/core/dataDir.js";
import { recordHistory } from "../../../src/core/history.js";
import { governanceFile, recordGovernance } from "../../../src/core/governance.js";
import { entryKey, normalizeCommand, upsertEntry } from "../../../src/core/dedupStore.js";
import { resolveCachedBinary } from "../../../src/core/pathCache.js";
import { ensureProjectRollup, rollupFile } from "../../../src/core/rollup.js";
import type { DedupEntry } from "../../../src/core/dedupStore.js";
import type { FilteredResult, RawResult, TkOptions } from "../../../src/types.js";

const SKIP_WIN = process.platform === "win32";
const mode777 = (file: string) => statSync(file).mode & 0o777;

let home: string;
let cwd: string;
let savedUmask: number;

beforeEach(async () => {
  // Pin a permissive umask for the assertion window. Without this the suite inherits
  // the ambient umask, so under e.g. `umask 077` the files come out 0o600 / dirs 0o700
  // even with NO explicit mode — the assertions would pass while a bare-write
  // regression is present. 0o022 strips nothing from owner bits, so explicit
  // 0o600/0o700 modes are the only thing that produces owner-only perms.
  savedUmask = process.umask(0o022);
  home = await mkdtemp(path.join(tmpdir(), "tk-perm-home-"));
  cwd = await mkdtemp(path.join(tmpdir(), "tk-perm-cwd-"));
  process.env.TOKEN_KILLER_HOME = home;
});

afterEach(async () => {
  delete process.env.TOKEN_KILLER_HOME;
  await rm(home, { recursive: true, force: true });
  await rm(cwd, { recursive: true, force: true });
  process.umask(savedUmask);
});

function rawResult(command: string): RawResult {
  return { command, stdout: "out", stderr: "", exitCode: 0, durationMs: 1 };
}

function filteredResult(): FilteredResult {
  return {
    handler: "git",
    output: "out",
    rawChars: 3,
    outputChars: 3,
    rawTokens: 1,
    outputTokens: 1,
    savedTokens: 0,
    savingsPct: 0,
    qualityStatus: "passed",
  } as FilteredResult;
}

const tkOptions = (): TkOptions => ({ cwd, saveRaw: false }) as TkOptions;

function dedupEntry(): DedupEntry {
  return {
    normCmd: "git status",
    rawHash: "deadbeef",
    exitCode: 0,
    ttlClass: "fast",
    lastEmittedAt: Date.now(),
    lastDifferedAt: Date.now(),
    rawPointer: "raw/x.log",
  };
}

describe("Plan 003 — owner-only metrics-store permissions", () => {
  it.skipIf(SKIP_WIN)("history.jsonl is created 0o600 and its parent dir 0o700", async () => {
    const file = historyFile(cwd);
    await recordHistory(
      rawResult("curl -H 'Authorization: Bearer secret'"),
      filteredResult(),
      tkOptions(),
    );
    expect(mode777(file)).toBe(0o600);
    expect(mode777(path.dirname(file))).toBe(0o700);
  });

  it.skipIf(SKIP_WIN)("dedup.json is created 0o600", async () => {
    const file = dedupStoreFile(cwd);
    const key = entryKey(normalizeCommand({ program: "git", args: ["status"] } as never));
    await upsertEntry(file, key, dedupEntry(), Date.now());
    expect(mode777(file)).toBe(0o600);
    expect(mode777(path.dirname(file))).toBe(0o700);
  });

  it.skipIf(SKIP_WIN)("governance.jsonl is created 0o600", async () => {
    const file = governanceFile(cwd);
    await recordGovernance(cwd, {
      ts: new Date().toISOString(),
      kind: "denied_large_reads",
      decision: "deny",
      category: "read",
    });
    expect(mode777(file)).toBe(0o600);
    expect(mode777(path.dirname(file))).toBe(0o700);
  });

  it.skipIf(SKIP_WIN)("path-cache.json is created 0o600 under a 0o700 home", () => {
    // resolveCachedBinary writes the cache only when the program resolves. `node` is
    // present in every CI/runtime PATH, so the cache file is materialized here.
    resolveCachedBinary("node", process.env.PATH);
    const file = path.join(home, "path-cache.json");
    expect(mode777(file)).toBe(0o600);
    expect(mode777(home)).toBe(0o700);
  });

  it.skipIf(SKIP_WIN)("rollup.json is created 0o600 under a 0o700 project dir", async () => {
    // rollup.recent stores the full command line (a secret-bearing field), so the
    // cold-path cache must be owner-only like every other store. ensureProjectRollup
    // rebuilds + writes rollup.json once history.jsonl exists for the project.
    await recordHistory(
      rawResult("curl -H 'Authorization: Bearer secret'"),
      filteredResult(),
      tkOptions(),
    );
    await ensureProjectRollup(cwd);
    const file = rollupFile(cwd);
    expect(mode777(file)).toBe(0o600);
    expect(mode777(path.dirname(file))).toBe(0o700);
  });

  it.skipIf(SKIP_WIN)(
    "appending a second row to an existing history file does not throw (mode applies at create only)",
    async () => {
      await recordHistory(rawResult("git status"), filteredResult(), tkOptions());
      await expect(
        recordHistory(rawResult("git log"), filteredResult(), tkOptions()),
      ).resolves.not.toThrow();
      const file = historyFile(cwd);
      // first-create mode persists; the append leaves it untouched
      expect(mode777(file)).toBe(0o600);
    },
  );
});
