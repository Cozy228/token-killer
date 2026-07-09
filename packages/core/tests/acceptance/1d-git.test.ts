import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createGitAdapter } from "../../src/ingest/git/adapter.ts";
import { RefreshEngine } from "../../src/ingest/refresh.ts";
import { SourceRegistry } from "../../src/ingest/adapter.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// Slice 1d — Git source (M1-ACCEPTANCE.md §1d). Living-repo acceptance tier:
// this checkout IS the fixture. Its real history is immutable, so the values
// asserted below (⚠ verify-at-wiring) are stable once observed.
//
// The store lives under a temp CONTEXA_HOME sandbox (G-7); the project is THIS
// checkout, read-only. The git adapter walks store.projectRoot (the current
// checkout) so read-through of the same oids resolves from the same checkout.
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");

// ⚠ verify-at-wiring anchors (confirmed 2026-07-04 against this repo):
//   commit 12dc674 subject:  git show 12dc674 --format=%s -s
//   rename 28318c3:          git show 28318c3 --diff-filter=R --name-status -M
//     → R082 docs/codemap/codemap-contract.md → docs/codemap/DESIGN.md
const COMMIT_OID12 = "12dc67446a34"; // first 12 of 12dc67446a34689f00a2c6a464514513895540d5
const COMMIT_SUBJECT = "add ctx design and implementation documents";
const RENAME_OLD = "file:docs/codemap/codemap-contract.md";
const RENAME_NEW = "file:docs/codemap/DESIGN.md";

interface CochangeRow {
  src: string;
  dst: string;
  support: number;
  confidence: number;
}

/** Read co-change links joined to their backing claim (support lives in the
 *  claim locus `support=N;window=…`, confidence on the link). */
function readCochange(dbPath: string): CochangeRow[] {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout=5000");
  try {
    const rows = db
      .prepare(
        `SELECT l.src AS src, l.dst AS dst, l.confidence AS confidence, c.locus AS locus
         FROM links l JOIN claims c ON c.id = l.claim_id
         WHERE l.predicate = 'co-changed'`,
      )
      .all() as Array<{ src: string; dst: string; confidence: number; locus: string }>;
    return rows.map((r) => ({
      src: r.src,
      dst: r.dst,
      confidence: r.confidence,
      support: Number(/support=(\d+)/.exec(r.locus)?.[1] ?? "0"),
    }));
  } finally {
    db.close();
  }
}

describe("acceptance: 1d git source", () => {
  let root: string;
  let store: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-1d-");
    store = openStore({ projectDir: REPO_ROOT, home: join(root, "contexa-home") });
    const registry = new SourceRegistry();
    registry.register(createGitAdapter());
    const engine = new RefreshEngine(store, registry, { catchupGateMs: 600_000 });
    const report = await engine.refresh(600_000);
    await engine.background;
    // Fail fast if ingest didn't complete (assertions live in the tests below).
    if (report.status !== "fresh" || report.sources[0]?.state !== "complete") {
      throw new Error(`1d ingest did not complete: ${JSON.stringify(report.sources)}`);
    }
  });

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("A3-rename", () => {
    // The 28318c3 rename produces a `rename-tracked` link OLD → NEW.
    const into = store.linksTo(RENAME_NEW, "renamed-to");
    const renameLink = into.find((l) => l.src === RENAME_OLD);
    expect(renameLink, "renamed-to link into DESIGN.md").toBeDefined();
    expect(renameLink!.method).toBe("rename-tracked");
    expect(store.getEntity(RENAME_OLD)?.kind).toBe("file");
    expect(store.getEntity(RENAME_NEW)?.kind).toBe("file");

    // The old path's history is reachable FROM the new entity: hop back across
    // the rename, then read the old path's own `touches` history (≥1 commit).
    const oldEntity = renameLink!.src;
    const oldHistory = store.linksTo(oldEntity, "touches");
    expect(oldHistory.length).toBeGreaterThanOrEqual(1);
    // Every hit is a commit that touched the old path (provenance intact).
    for (const h of oldHistory) expect(h.src.startsWith("commit:")).toBe(true);
  });

  test("A3-commit", () => {
    const id = `commit:${COMMIT_OID12}`;
    const entity = store.getEntity(id);
    expect(entity?.kind).toBe("commit");
    // Index-not-copy: the locator is a git handle; the message is NOT stored.
    expect(entity?.locator).toEqual({
      t: "git",
      oid: "12dc67446a34689f00a2c6a464514513895540d5",
    });

    // file-level `touches` preserves the historical path recorded by the commit.
    const touched = store.linksFrom(id, "touches").map((l) => l.dst);
    expect(touched).toContain("file:CTX-DESIGN.md");

    // The message is read back via the git locator (git cat-file), not a stored
    // copy — the full commit object round-trips and carries the subject.
    const rt = store.readThrough(id);
    expect(rt.ok).toBe(true);
    if (rt.ok) {
      expect(rt.via).toBe("git");
      expect(rt.text).toContain(COMMIT_SUBJECT);
      expect(rt.text).toMatch(/^tree [0-9a-f]{40}/m); // proves it came from git, not the DB
    }
    // The DB stores only the subject label; no column holds the message body.
    expect(entity?.name).not.toMatch(/^tree /);
  });

  test("A4-cochange", () => {
    // ⚠ verify-at-wiring. The default window covers the current branch history.
    // Independent recomputation at the original wiring point:
    //   git log --oneline -- src/cli.ts   ∩   git log --oneline -- src/parse.ts
    //   → 11 shared commits, but two are bulk commits (264- and 225-file
    //     refactors) filtered by DEFAULT_MAX_FILES_PER_COMMIT=200 as incidental
    //     co-occurrence, leaving support=9. Later branch history can change the
    //     confidence denominator without changing the top pair or support, so
    //     the exact confidence formula is covered in git-extract.test.ts.
    const links = readCochange(store.dbPath);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.every((l) => l.support >= 3)).toBe(true); // §5.1 support floor

    const top = [...links].sort(
      (a, b) =>
        b.support - a.support ||
        b.confidence - a.confidence ||
        a.src.localeCompare(b.src) ||
        a.dst.localeCompare(b.dst),
    )[0]!;
    expect(top).toMatchObject({ src: "file:src/cli.ts", dst: "file:src/parse.ts", support: 9 });
    expect(top.confidence).toBeGreaterThanOrEqual(0.6);
    expect(top.confidence).toBeLessThanOrEqual(1);
  });

  test("A4-immutable", () => {
    const adapter = createGitAdapter();
    // Cursor short-circuit: no new commits ⇒ clean, magnitude 0.
    // (async dirtyCheck; the perf assertion below measures the warm cost.)
    return (async () => {
      const before = store.entityCount();
      const beforeClaims = countClaims(store.dbPath);

      const dirty = await adapter.dirtyCheck(store);
      expect(dirty).toMatchObject({ source: "git", dirty: false, magnitude: 0 });

      // Re-running a full refresh is a no-op: nothing new lands.
      const registry = new SourceRegistry();
      registry.register(adapter);
      const engine = new RefreshEngine(store, registry, { catchupGateMs: 600_000 });
      const report = await engine.refresh(600_000);
      await engine.background;
      expect(report.status).toBe("fresh");
      expect(report.sources[0]?.state).toBe("clean");
      expect(store.entityCount()).toBe(before);
      expect(countClaims(store.dbPath)).toBe(beforeClaims);

      // <20ms warm (§4.2 / A4-immutable). Best-of-N min drops the cold spawn.
      let min = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 12; i++) {
        const t0 = performance.now();
        await adapter.dirtyCheck(store);
        min = Math.min(min, performance.now() - t0);
      }
      // Shared CI runners pay ~30-50ms per git spawn (Windows worst); the 20ms
      // bar is calibrated for real dev machines (§10).
      expect(min).toBeLessThan(process.env.CI ? (process.platform === "win32" ? 120 : 40) : 20);
    })();
  });
});

function countClaims(dbPath: string): number {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout=5000");
  try {
    return (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
  } finally {
    db.close();
  }
}
