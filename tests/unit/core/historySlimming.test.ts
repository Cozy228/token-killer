import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  historyFile,
  projectFingerprint,
  projectMetaFile,
  resetFingerprintCacheForTests,
} from "../../../src/core/dataDir.js";
import { recordHistory } from "../../../src/core/history.js";
import type { FilteredResult, RawResult, TkOptions } from "../../../src/types.js";

let home: string;
const previousHome = process.env.TOKEN_KILLER_HOME;
const previousNoHistory = process.env.TK_NO_HISTORY;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-hist-slim-"));
  process.env.TOKEN_KILLER_HOME = home;
  delete process.env.TK_NO_HISTORY;
  resetFingerprintCacheForTests();
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = previousHome;
  if (previousNoHistory === undefined) delete process.env.TK_NO_HISTORY;
  else process.env.TK_NO_HISTORY = previousNoHistory;
  rmSync(home, { recursive: true, force: true });
});

function raw(): RawResult {
  return { command: "git status", stdout: "x".repeat(400), stderr: "", exitCode: 0, durationMs: 5 };
}

function filtered(): FilteredResult {
  return {
    handler: "git-status",
    output: "y",
    rawChars: 400,
    outputChars: 100,
    rawTokens: 100,
    outputTokens: 25,
    savedTokens: 75,
    savingsPct: 75,
    exitCode: 0,
    qualityStatus: "passed",
  };
}

function options(cwd: string): TkOptions {
  return { raw: false, stats: false, maxLines: 120, maxChars: 12000, saveRaw: false, cwd };
}

describe("projectFingerprint memoization (2.4a)", () => {
  test("computes once per cwd and ignores a mid-run git-layout change until reset", () => {
    const repo = mkdtempSync(join(tmpdir(), "tk-fp-repo-"));
    const sub = join(repo, "sub");
    mkdirSync(sub);
    try {
      const before = projectFingerprint(sub); // no .git up-tree → anchors to sub
      // A new .git appears mid-run. The memoized value must NOT change (pure within a
      // process, by design) — proving the walk was not re-run.
      mkdirSync(join(repo, ".git"));
      expect(projectFingerprint(sub)).toBe(before);

      // After an explicit reset the walk runs again and now anchors to the repo root.
      resetFingerprintCacheForTests();
      const after = projectFingerprint(sub);
      expect(after).not.toBe(before);
      expect(after).toBe(projectFingerprint(repo));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("recordHistory fs-op slimming (2.4)", () => {
  test("records a complete row (regression guard)", async () => {
    const cwd = join(home, "workspace");
    await recordHistory(raw(), filtered(), options(cwd));
    const rows = (await readFile(historyFile(cwd), "utf8")).trim().split("\n");
    expect(rows).toHaveLength(1);
    const row = JSON.parse(rows[0]) as Record<string, unknown>;
    expect(row.handler).toBe("git-status");
    expect(row.saved_tokens).toBe(75);
    expect(row.project_fingerprint).toBe(projectFingerprint(cwd));
  });

  test("writes project meta on first record, and self-heals it when missing", async () => {
    const cwd = join(home, "workspace");
    await recordHistory(raw(), filtered(), options(cwd)); // dir created → meta written
    expect(existsSync(projectMetaFile(cwd))).toBe(true);

    // Delete the meta but leave the dir: a subsequent record RECREATES it. Legacy rows
    // that showed as a bare fingerprint hash (no meta) recover their name on next visit.
    // The read-then-write-if-stale runs in the deferred accounting commit, off the hot
    // path, so the steady state (meta already correct) is a single read and no write.
    rmSync(projectMetaFile(cwd));
    await recordHistory(raw(), filtered(), options(cwd));
    expect(existsSync(projectMetaFile(cwd))).toBe(true);
  });

  test("self-heals when the data dir is deleted mid-run (ledger-① never dropped)", async () => {
    const cwd = join(home, "workspace");
    await recordHistory(raw(), filtered(), options(cwd));
    // Drop the whole data dir (the ensure-once memo now points at a missing dir).
    rmSync(join(home, "projects"), { recursive: true, force: true });
    await recordHistory(raw(), filtered(), options(cwd));
    const rows = (await readFile(historyFile(cwd), "utf8")).trim().split("\n");
    expect(rows).toHaveLength(1); // the second row, re-created after the ENOENT self-heal
  });

  test("TK_NO_HISTORY=1 suppresses the row (2.4e)", async () => {
    const cwd = join(home, "workspace");
    process.env.TK_NO_HISTORY = "1";
    await recordHistory(raw(), filtered(), options(cwd));
    expect(existsSync(historyFile(cwd))).toBe(false);

    // Falsy values do NOT disable history.
    process.env.TK_NO_HISTORY = "0";
    await recordHistory(raw(), filtered(), options(cwd));
    expect(existsSync(historyFile(cwd))).toBe(true);
  });
});
