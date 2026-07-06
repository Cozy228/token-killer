/**
 * M2 perf gates (M2-ACCEPTANCE.md "Perf gates"). Re-recorded post-M2 by slice
 * 2e as the closer, with everything (2a–2d) merged. Same discipline as the M1
 * A11 gate (perf-gates.test.ts): RECORD the observed number + the command that
 * produced it, assert the §10 design target where met and a generous
 * non-regression ceiling where the prose-heavy living fixture does not (hard
 * enforcement is M5). Timing ceilings scale by the CI runner factor (win 6× /
 * other 2×; exact on dev hardware).
 *
 * ── Observed on THIS worktree (Node 22.22.2, Apple M-series, 2026-07-05) ──────
 *   full sync (real registry, symbolTouches on) : ~4.3 s → 7113 entities
 *   B7-dirty  warm all-source                    : ~9–13 ms   (target <20 ms)   → MEETS
 *   B7-size   store (real serve store)           : ~15.85 MB  (M1 was ~8.0 MB)
 *             vs content(tracked+.git ~21.6 MB)   : ~73%       (§10 target <5%)  → OVER*
 *   B7-parse  cold code-only full-parse          : ~1.15 s → 503 files / 2932 symbols
 *             incremental 1-file edit             : re-parses that file + its
 *                                                   1-hop import boundary ONLY
 *   *§10's 5%-of-content target is calibrated for a code repo with large git
 *    history; THIS repo is prose-heavy (the FTS index over the design docs/ADRs
 *    dominates), same finding the A11 header records. index-not-copy still holds
 *    (store < content); the non-regression ceiling guards a real balloon.
 *
 * B7-size measures the REAL serve store (the CLI builds
 * `createDefaultRegistry({ git: { symbolTouches: true } })` — mcp.ts/cli.ts), so
 * the symbol-level `touches` graph is IN; that is a superset of A11-size's bare
 * registry, hence its own ceiling here.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, type Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { createDefaultRegistry } from "../../src/ingest/registry.ts";
import { RefreshEngine } from "../../src/ingest/refresh.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
const PKG_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");
const RUNNER_FACTOR = process.env.CI ? (process.platform === "win32" ? 6 : 2) : 1;

/** best-of-N warm min (drops cold-spawn / JIT tax, 1d convention). */
async function bestOfAsync(iters: number, fn: () => Promise<unknown>): Promise<number> {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    await fn();
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

/** Portable recursive on-disk byte total (no `du`: Windows-safe; 1i pattern). */
function dirBytes(root: string, skipDir: (name: string) => boolean = () => false): number {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!skipDir(e.name)) stack.push(p);
        continue;
      }
      try {
        total += statSync(p).size;
      } catch {
        /* transient — skip */
      }
    }
  }
  return total;
}

describe("acceptance: 2e perf gates (M2 re-record)", () => {
  let liveRoot: string;
  let store: Store;

  beforeAll(async () => {
    liveRoot = makeTempDir("ctx-b7-");
    store = openStore({ projectDir: REPO_ROOT, home: join(liveRoot, "ctx-home") });
    // The REAL serve registry (symbolTouches on) — the store a `ctx sync` leaves.
    clearScanCache();
    const registry = createDefaultRegistry({
      code: { inProcess: true },
      git: { symbolTouches: true },
      // Slice 4: sandbox memory's `.ctx` writer off the real repo (hard constraint).
      memory: { ctxRoot: join(liveRoot, "ctx-mem") },
    });
    const engine = new RefreshEngine(store, registry, { catchupGateMs: 600_000 });
    await engine.refresh(600_000);
    await engine.background;
    expect(store.entityCount()).toBeGreaterThan(0);
  }, 300_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(liveRoot);
  });

  test("B7-dirty: warm all-source dirtyCheck (incl. code) < 20ms dev / ×runner-factor CI", async () => {
    // Cursors are all set post-sync, so every adapter short-circuits (warm).
    const adapters = createDefaultRegistry({
      code: { inProcess: true },
      git: { symbolTouches: true },
      memory: { ctxRoot: join(liveRoot, "ctx-mem") },
    }).list();
    clearScanCache();
    const min = await bestOfAsync(16, () => Promise.all(adapters.map((a) => a.dirtyCheck(store))));
    // Recorded observed (this worktree): ~9–13 ms. Target <20 ms → MEETS.
    expect(min, `B7-dirty observed ${min.toFixed(2)}ms (target <20ms)`).toBeLessThan(
      20 * RUNNER_FACTOR,
    );
  });

  test("B7-size: store size re-recorded with symbols in (non-regression; ⚠ record before/after)", () => {
    const cp = new DatabaseSync(store.dbPath);
    try {
      cp.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* another connection open — sum the live footprint */
    } finally {
      cp.close();
    }
    let storeBytes = statSync(store.dbPath).size;
    for (const suf of ["-wal", "-shm"]) {
      const p = store.dbPath + suf;
      if (existsSync(p)) storeBytes += statSync(p).size;
    }
    // Denominator = git-tracked working set + the .git object store (stable,
    // dependency-free — the honest "what the repo is" size; 1i/A11 method).
    const gitCommon = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    const gitBytes = dirBytes(resolve(REPO_ROOT, gitCommon));
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean)
      .reduce((sum, f) => {
        try {
          return sum + statSync(join(REPO_ROOT, f)).size;
        } catch {
          return sum;
        }
      }, 0);
    const contentBytes = tracked + gitBytes;
    const pctContent = (storeBytes / contentBytes) * 100;
    const record =
      `B7-size store ${(storeBytes / 1048576).toFixed(2)}MB (M1 A11 baseline ~8.0MB); ` +
      `vs content(tracked+.git ${(contentBytes / 1048576).toFixed(1)}MB)=${pctContent.toFixed(1)}% ` +
      `(§10 target <5% — prose-heavy repo, see header)`;

    // Non-regression: index-not-copy must hold (store < the tracked+.git data it
    // indexes, i.e. <100%) and the real serve store stays under the 25MB absolute
    // cap (the HARD gate). The pct is denominator-sensitive — a fresh CI clone's
    // .git is leaner than a dev checkout's, so the same store reads higher (dev
    // ~73% / CI ~91%); gate on the robust <100% bound, cap is the real ceiling.
    expect(storeBytes, record).toBeLessThan(25 * 1048576);
    expect(pctContent, record).toBeLessThan(100);
    expect(contentBytes, "repo content measured").toBeGreaterThan(0);
  });

  test("B7-parse: cold full-parse of packages/ TS bounded + recorded", async () => {
    const parseRoot = makeTempDir("ctx-b7-parse-");
    const parseStore = openStore({ projectDir: REPO_ROOT, home: join(parseRoot, "ctx-home") });
    try {
      const adapter = new CodeSourceAdapter({ inProcess: true });
      clearScanCache();
      const dirty = await adapter.dirtyCheck(parseStore);
      const t0 = performance.now();
      const result = await adapter.ingest(parseStore, dirty, MAX_BUDGET);
      const ms = performance.now() - t0;
      const symbols = parseStore.countByKind("symbol");
      // Recorded observed: ~1.15s cold, ~503 files, ~2932 symbols. Generous
      // non-regression ceiling (real number in the message; §10 hard gate = M5).
      expect(
        ms,
        `B7-parse cold code full-parse ${ms.toFixed(0)}ms over ${symbols} symbols`,
      ).toBeLessThan(10_000 * RUNNER_FACTOR);
      expect(result.complete).toBe(true);
      expect(symbols, "packages/ TS yields a real symbol population").toBeGreaterThan(1000);
    } finally {
      parseStore.close();
      cleanupTempDir(parseRoot);
    }
  }, 300_000);

  test("B7-parse: incremental re-parse after a 1-file edit touches only that file's symbols (+1-hop boundary)", async () => {
    const incRoot = makeTempDir("ctx-b7-inc-");
    const proj = join(incRoot, "proj");
    mkdirSync(proj, { recursive: true });
    const incStore = openStore({ projectDir: proj, home: join(incRoot, "home") });
    const write = (rel: string, c: string): void => writeFileSync(join(proj, rel), c, "utf8");
    const ingest = async (): Promise<import("../../src/ingest/adapter.ts").IngestResult> => {
      clearScanCache();
      const a = new CodeSourceAdapter({ inProcess: true });
      return a.ingest(incStore, await a.dirtyCheck(incStore), MAX_BUDGET);
    };
    try {
      // a.ts imports b.ts; c.ts is unrelated (no import edge to it).
      write("b.ts", `export function b(): number { return 1; }\n`);
      write(
        "a.ts",
        `import { b } from "./b.ts";\nexport function callsB(): number { return b(); }\n`,
      );
      write("c.ts", `export function c(): number { return 2; }\n`);
      await ingest();
      const cGenBefore = incStore.getEntity("sym:c.ts#c")?.gen;
      const aGenBefore = incStore.getEntity("sym:a.ts#callsB")?.gen;
      expect(cGenBefore).toBeDefined();

      // Edit ONLY a.ts (a structural body change).
      write(
        "a.ts",
        `import { b } from "./b.ts";\nexport function callsB(): number { return b() + 1; }\n`,
      );
      const result = await ingest();

      // The re-parse set = a.ts + its 1-hop import boundary (b.ts); NOT c.ts.
      expect(
        result.boundaryExpanded,
        "b.ts pulled in as a.ts's 1-hop boundary",
      ).toBeGreaterThanOrEqual(1);
      expect(result.reingested, "only a.ts (+ boundary b.ts) re-parsed").toBe(2);
      // a.ts's symbol was rewritten (new gen); c.ts's symbol was NOT touched.
      expect(incStore.getEntity("sym:a.ts#callsB")?.gen).toBeGreaterThan(aGenBefore!);
      expect(incStore.getEntity("sym:c.ts#c")?.gen, "unrelated file untouched").toBe(cGenBefore);
    } finally {
      incStore.close();
      cleanupTempDir(incRoot);
    }
  });
});
