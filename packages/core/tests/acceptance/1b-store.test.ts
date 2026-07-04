import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { shortHandleCandidate } from "../../src/store/handles.ts";
import { resolveShard, storePath } from "../../src/store/shard.ts";
import { openStore } from "../../src/store/store.ts";
import { cleanupTempDir, git, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

// Slice 1b — Store spine (M1-ACCEPTANCE.md). All stores live under a temp
// CTX_HOME sandbox (G-7); the living-repo assertions only READ this repo.
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");
const HELPERS = join(PKG_DIR, "tests", "helpers");
// --experimental-sqlite: flag-gated on Node 22.5–22.12, an accepted no-op later.
const NODE_ARGS = ["--experimental-sqlite", "--import", "tsx"];
const SPAWN_TIMEOUT = 20_000; // explicit — CI cold-start tax (§10)

describe("acceptance: 1b store spine", () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir("ctx-a12-");
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  test("A12-shard", () => {
    // Living-repo tier: opening from a git worktree of this repo resolves the
    // SAME shard as the main checkout (this test runs inside either; both
    // derive the main root from --git-common-dir, so the equality is real).
    const here = resolveShard(REPO_ROOT);
    expect(resolveShard(here.mainRoot).shard).toBe(here.shard);

    // Deterministic tier: fixture repo + a real worktree.
    const repo = makeGitFixture(root);
    const wt = join(root, "wt");
    git(["worktree", "add", "-q", wt], repo);
    expect(resolveShard(wt).shard).toBe(resolveShard(repo).shard);

    // .ctx data survives worktree deletion: write via the worktree, delete the
    // worktree, read via the main checkout.
    const home = join(root, "ctx-home");
    const viaWorktree = openStore({ projectDir: wt, home });
    viaWorktree.upsertEntity({
      id: "file:README.md",
      kind: "file",
      name: "README.md",
      locator: { t: "file", path: "README.md" },
      gen: 1,
    });
    viaWorktree.close();
    git(["worktree", "remove", "--force", wt], repo);
    expect(existsSync(wt)).toBe(false);
    const viaMain = openStore({ projectDir: repo, home });
    expect(viaMain.getEntity("file:README.md")?.name).toBe("README.md");
    expect(viaMain.dbPath).toBe(storePath(resolveShard(repo).shard, home));
    viaMain.close();
  });

  test("A12-handles", () => {
    const repo = makeGitFixture(root);
    const entityId = "file:README.md";

    // Determinism across two SEPARATE processes: a child interns the handle in
    // its own fresh store; this process does the same in another fresh store.
    const child = spawnSync(
      process.execPath,
      [...NODE_ARGS, join(HELPERS, "handleChild.ts"), repo, join(root, "home-child"), entityId],
      { cwd: PKG_DIR, encoding: "utf8", timeout: SPAWN_TIMEOUT },
    );
    expect(child.status, child.stderr).toBe(0);
    const local = openStore({ projectDir: repo, home: join(root, "home-local") });
    local.upsertEntity({
      id: entityId,
      kind: "file",
      name: entityId,
      locator: { t: "file", path: "README.md" },
      gen: 1,
    });
    const localShort = local.internHandle(entityId, "text");
    expect(child.stdout.trim()).toBe(localShort);

    // Collision bump extends the prefix 5→6 (P28 addenda): occupy the 5-char
    // candidate with a different entity, then intern.
    const victim = "file:collide.md";
    const candidate5 = shortHandleCandidate(victim, undefined, 5);
    const db = new DatabaseSync(local.dbPath);
    db.exec("PRAGMA busy_timeout=5000");
    db.prepare("INSERT INTO handles (short, entity_id, facet) VALUES (?, ?, NULL)").run(
      candidate5,
      "file:squatter.md",
    );
    db.close();
    local.upsertEntity({
      id: victim,
      kind: "file",
      name: victim,
      locator: { t: "file", path: "collide.md" },
      gen: 1,
    });
    const bumped = local.internHandle(victim);
    expect(bumped).toBe(shortHandleCandidate(victim, undefined, 6));
    expect(bumped).toHaveLength(7); // initial + 6 hex
    expect(local.resolveHandle(bumped)).toEqual({ entityId: victim, facet: undefined });
    expect(local.resolveHandle(candidate5)?.entityId).toBe("file:squatter.md");
    local.close();
  });

  test("A12-generations", async () => {
    const repo = makeGitFixture(root);
    const home = join(root, "ctx-home");
    const GENS = 40;
    const PER_GEN = 5;
    // Create the store (and run migrations) before the writer starts.
    openStore({ projectDir: repo, home }).close();
    const dbPath = storePath(resolveShard(repo).shard, home);

    // Concurrent writer (separate process) + reader (this process).
    const writer = spawn(
      process.execPath,
      [...NODE_ARGS, join(HELPERS, "genWriter.ts"), repo, home, String(GENS), String(PER_GEN)],
      { cwd: PKG_DIR, stdio: ["ignore", "pipe", "pipe"], timeout: SPAWN_TIMEOUT },
    );
    let stderr = "";
    writer.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const exited = new Promise<number | null>((res) => writer.on("close", res));

    // Reader: one SELECT = one atomic WAL snapshot. A complete published
    // generation means exactly published_gen * PER_GEN entities are visible.
    const reader = new DatabaseSync(dbPath);
    reader.exec("PRAGMA busy_timeout=5000");
    const snap = reader.prepare(
      `SELECT g.published_gen AS gen,
              (SELECT COUNT(*) FROM entities e WHERE e.gen <= g.published_gen) AS visible
       FROM generations g WHERE g.source = 'git'`,
    );
    let observations = 0;
    let done = false;
    void exited.then(() => {
      done = true;
    });
    while (!done) {
      const row = snap.get() as { gen: number; visible: number } | undefined;
      if (row) {
        observations++;
        // NEVER a torn generation: visible count reconciles exactly.
        expect(row.visible).toBe(row.gen * PER_GEN);
      }
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(await exited, stderr).toBe(0);
    expect(observations).toBeGreaterThan(10); // the read genuinely raced writes
    const final = snap.get() as { gen: number; visible: number };
    expect(final).toEqual({ gen: GENS, visible: GENS * PER_GEN });
    reader.close();

    // Lease steal works after TTL expiry (fixed clock injection).
    const clock = { t: 5_000_000 };
    const store = openStore({ projectDir: repo, home, now: () => clock.t });
    expect(store.acquireLease("crashed-writer", 30_000).acquired).toBe(true);
    expect(store.acquireLease("new-writer", 30_000).acquired).toBe(false); // TTL live
    clock.t += 30_001; // TTL expired — stealable (§4.5)
    expect(store.acquireLease("new-writer", 30_000).acquired).toBe(true);
    expect(store.currentLease()?.holder).toBe("new-writer");
    store.close();
  });

  test("A12-readthrough", () => {
    // Living-repo tier: read-through on CTX-IMPL.md returns its exact bytes.
    // The store sandbox is a temp home; the project is THIS checkout (read-only).
    const store = openStore({ projectDir: REPO_ROOT, home: join(root, "ctx-home") });
    store.upsertEntity({
      id: "file:CTX-IMPL.md",
      kind: "file",
      name: "CTX-IMPL.md",
      locator: { t: "file", path: "CTX-IMPL.md" },
      gen: 1,
    });
    const result = store.readThrough("file:CTX-IMPL.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe(readFileSync(join(REPO_ROOT, "CTX-IMPL.md"), "utf8"));
      expect(result.via).toBe("file");
    }

    // Traversal attempts are rejected (recoverable refusals, not throws).
    expect(store.resolveLocator({ t: "file", path: "../outside.md" })).toMatchObject({
      ok: false,
      reason: "traversal-rejected",
    });
    expect(store.resolveLocator({ t: "file", path: join(REPO_ROOT, "CTX-IMPL.md") })).toMatchObject(
      { ok: false, reason: "traversal-rejected" }, // absolute path
    );
    expect(store.resolveLocator({ t: "file", path: "docs/../../secret" })).toMatchObject({
      ok: false,
      reason: "traversal-rejected",
    });
    store.close();
  });
});
