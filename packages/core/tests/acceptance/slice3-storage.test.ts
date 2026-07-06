/**
 * Slice 3 — storage locus swap acceptance.
 *
 * Committed `.ctx/` files become the source of truth; the SQLite store is a
 * rebuildable index over them (B1). Covers: write-through zone routing (E3 —
 * agent/import events never in committed files), file→index round-trip
 * (order-independent, E2), migration (S3 — idempotent + resumable + secret guard
 * E4 + zone routing), E6 two-store logical-dump equality, pull-delta reindex +
 * non-append fallback (S10 #3), drift recomputed from scratch at reindex
 * (S4/R2-2), and sidecar dangling/orphan integrity (S1).
 *
 * Every fixture is a temp-dir git repo (never the real repo — the living-repo
 * suite must not see new tracked files). Clock injected; no wall-clock, no
 * network, no LLM.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStore, type Store } from "../../src/store/store.ts";
import { remember, setMemoryLifecycle } from "../../src/memory/remember.ts";
import { importClaudeCodeMemory } from "../../src/memory/claudeImporter.ts";
import { MemoryFiles } from "../../src/memory/fileStore.ts";
import { pullDeltaReindex, reindexMemoryFromFiles } from "../../src/memory/reindex.ts";
import {
  isMigrationDue,
  MIGRATION_MARKER,
  migrateStoreMemoryToFiles,
} from "../../src/memory/exportMigration.ts";
import { dumpJson } from "../../src/memory/dump.ts";
import { classifyAbsentAnchor, currentHeadCommit } from "../../src/memory/anchoredAt.ts";
import { flagAnchored } from "../../src/ingest/code/incremental.ts";
import { resolveConflictViaEvent } from "../../src/memory/fold.ts";
import type { SerializedMemory } from "../../src/memory/serialize.ts";
import type { MemoryOrigin, MemoryStatus } from "../../src/store/types.ts";
import { cleanupTempDir, git, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";
import { hostMemoryDir } from "../helpers/memoryFixture.ts";

let clock = 1_700_000_000_000;
const now = (): number => (clock += 1000);

function memEntry(over: Partial<SerializedMemory> & { memoryId: string }): SerializedMemory {
  return {
    eventId: `01EV${over.memoryId.slice(4, 12)}`,
    at: (clock += 1000),
    actor: "cli",
    carrier: "cli",
    method: "explicit-key",
    authority: "confirmed",
    status: "active",
    gist: "committed note",
    origin: "human-note",
    anchors: [],
    ...over,
  };
}

/** Seed a store-only (slice-2 shaped) memory row + its create event. */
function seedMemory(
  store: Store,
  gen: number,
  o: { id: string; gist: string; detail?: string; origin: MemoryOrigin; status: MemoryStatus },
): void {
  const host = o.origin.startsWith("host-import");
  store.upsertEntity({
    id: o.id,
    kind: "memory",
    name: o.gist.slice(0, 80),
    locator: { t: "store" },
    attrs: { origin: o.origin },
    gen,
  });
  store.writeMemory({
    entityId: o.id,
    gist: o.gist,
    detail: o.detail,
    origin: o.origin,
    authority: "confirmed",
    status: o.status,
  });
  store.appendMemoryEvent({
    memoryId: o.id,
    verb: "create",
    actor: host ? "host:claude-code" : "agent",
    refs: { status: o.status },
    carrier: host ? "host:claude-code" : "memory",
    method: host ? "structural" : "explicit-key",
    authority: "confirmed",
  });
}

describe("slice 3 — write-through zone routing (E3)", () => {
  let root: string;
  let repo: string;
  let store: Store;
  let files: MemoryFiles;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-zone-");
    repo = makeGitFixture(root);
    store = openStore({ projectDir: repo, home: join(root, "home"), now });
    files = MemoryFiles.forStore(store);
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("agent remember() lands ONLY in the gitignored overlay, never committed", () => {
    const r = remember(store, { note: "an agent gotcha to keep local", now, files });
    expect(r.ok).toBe(true);
    expect(files.readMemories("overlay").map((m) => m.gist)).toEqual([
      "an agent gotcha to keep local",
    ]);
    expect(files.readMemories("mainline")).toHaveLength(0);
    // The committed memory log file was never created.
    expect(existsSync(join(repo, ".ctx", "memory", "log.md"))).toBe(false);
    // ctx wrote the scaffold: gitignore covers the overlay, gitattributes union-merges.
    expect(readFileSync(join(repo, ".ctx", ".gitignore"), "utf8")).toContain("*.local.md");
    expect(readFileSync(join(repo, ".ctx", ".gitattributes"), "utf8")).toContain("merge=union");
  });

  test("host imports land in the overlay as needs-review, never committed", () => {
    const dir = hostMemoryDir(join(root, "claude"), store.projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "note.md"), "# Note\nkeep the idempotency key on redelivery\n");
    const report = importClaudeCodeMemory(store, {
      claudeHome: join(root, "claude"),
      files,
      now,
    });
    expect(report.entities).toBeGreaterThan(0);
    const overlay = files.readMemories("overlay");
    expect(overlay.length).toBe(report.entities);
    expect(overlay.every((m) => m.status === "needs-review")).toBe(true);
    expect(files.readMemories("mainline")).toHaveLength(0);
  });

  test("CLI/human confirm writes a committed MAINLINE decision (E3 confirmation path)", () => {
    const r = remember(store, { note: "confirm this one", now, files });
    if (!r.ok) throw new Error("remember failed");
    setMemoryLifecycle(store, r.entityId, "active", files);
    const decisions = files.readDecisions("mainline");
    expect(decisions.some((d) => d.verb === "confirm" && d.memoryId === r.entityId)).toBe(true);
    // The overlay create stays local; only the decision is committed.
    expect(files.readMemories("mainline")).toHaveLength(0);
  });

  test("without a files writer the write path stays store-only (slice-2 behaviour)", () => {
    const r = remember(store, { note: "no file writer here", now });
    expect(r.ok).toBe(true);
    expect(existsSync(join(repo, ".ctx"))).toBe(false); // nothing written
    expect(store.getMemory((r as { entityId: string }).entityId)?.status).toBe("active");
  });
});

describe("slice 3 — file → index round-trip + order independence (E2)", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-rt-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("committed entries + a detail sidecar reindex into the store", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01ROUNDTRIP000000000000AA",
        gist: "committed note with detail",
        origin: "human-note",
        anchors: ["file:README.md"],
        validFrom: 100,
        validTo: 200,
        detailPointer: "01ROUNDTRIP000000000000AA",
      }),
      "a multi-line\ndetail body\nthat lives in a sidecar",
    );
    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      reindexMemoryFromFiles(store, files);
      const m = store.getMemory("mem:01ROUNDTRIP000000000000AA");
      expect(m?.gist).toBe("committed note with detail");
      expect(m?.status).toBe("active");
      expect(m?.detail).toContain("detail body");
      expect(m?.validFrom).toBe(100);
      expect(m?.validTo).toBe(200);
      expect(store.anchorsOf("mem:01ROUNDTRIP000000000000AA")).toEqual(["file:README.md"]);
    } finally {
      store.close();
    }
  });

  test("fold is order-independent: a later-`at` review before the create still wins", () => {
    // Write the decision line FIRST (higher at), the create line SECOND (lower at):
    // the fold reads total order (at, id), never file line order.
    const logDir = join(repo, ".ctx", "memory");
    mkdirSync(logDir, { recursive: true });
    const createLine =
      "- mem id=01A at=1000 mid=mem:01ORDER00000000000000000 verb=create actor=cli carrier=cli method=explicit-key authority=confirmed status=active origin=human-note gist=order%20test";
    const reviewLine =
      "- dec id=01B at=2000 mid=mem:01ORDER00000000000000000 verb=review actor=cli carrier=cli method=explicit-key authority=confirmed";
    writeFileSync(join(logDir, "decisions.md"), `${reviewLine}\n`, "utf8");
    writeFileSync(join(logDir, "log.md"), `${createLine}\n`, "utf8");
    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".ctx")));
      expect(store.getMemory("mem:01ORDER00000000000000000")?.status).toBe("needs-review");
    } finally {
      store.close();
    }
  });
});

describe("slice 3 — E6 canonical logical-dump determinism", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-e6-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("same committed .ctx content → equal dumps across two fresh stores", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01DETERMIN000000000000AAA", gist: "alpha stays active" }),
    );
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01DETERMIN000000000000BBB",
        gist: "beta gets superseded then retired",
      }),
    );
    // A retire AND a supersede on the same memory → E5 collision (both retained,
    // contradiction filed, later-by-total-order wins). Exercises the fold + the
    // conflict dump keyed by stable claim content (not per-store claim ids).
    files.appendDecision("mainline", {
      eventId: "01DECR",
      at: (clock += 1000),
      memoryId: "mem:01DETERMIN000000000000BBB",
      verb: "supersede",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
    });
    files.appendDecision("mainline", {
      eventId: "01DECS",
      at: (clock += 1000),
      memoryId: "mem:01DETERMIN000000000000BBB",
      verb: "retire",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
    });

    const a = openStore({ projectDir: repo, home: join(root, "home-a"), now });
    const b = openStore({ projectDir: repo, home: join(root, "home-b"), now });
    try {
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".ctx")));
      reindexMemoryFromFiles(b, new MemoryFiles(join(repo, ".ctx")));
      expect(dumpJson(a)).toBe(dumpJson(b)); // canonical logical equality (E6)
      // The later-by-total-order decision (retire) won the derived status.
      expect(a.getMemory("mem:01DETERMIN000000000000BBB")?.status).toBe("retired");
      // A contradiction was filed (nothing auto-merged).
      expect(a.conflicts("open").some((c) => c.kind === "contradiction")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("slice 3 — migration (S3)", () => {
  let root: string;
  let repo: string;
  let store: Store;
  let files: MemoryFiles;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-mig-");
    repo = makeGitFixture(root);
    store = openStore({ projectDir: repo, home: join(root, "home"), now });
    files = MemoryFiles.forStore(store);
    const gen = store.beginGeneration("memory");
    seedMemory(store, gen, {
      id: "mem:01MIGACTIVE0000000000000A",
      gist: "authored active memory",
      origin: "remember",
      status: "active",
    });
    seedMemory(store, gen, {
      id: "mem:01MIGRETIRE0000000000000A",
      gist: "authored then retired",
      origin: "remember",
      status: "retired",
    });
    seedMemory(store, gen, {
      id: "mem:01MIGHOSTREVIEW000000000A",
      gist: "imported note pending review",
      origin: "host-import:claude-code",
      status: "needs-review",
    });
    seedMemory(store, gen, {
      id: "mem:01MIGHOSTOK000000000000AA",
      gist: "imported note a human confirmed",
      origin: "host-import:claude-code",
      status: "active",
    });
    seedMemory(store, gen, {
      id: "mem:01MIGSECRET0000000000000A",
      gist: "prod api key sk-ABCDEFGH1234567890secret do not lose",
      origin: "remember",
      status: "active",
    });
    store.publishGeneration("memory");
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("routes by zone, replays status, diverts secrets, writes the marker last", () => {
    expect(isMigrationDue(store)).toBe(true);
    const report = migrateStoreMemoryToFiles(store, files);
    expect(report.migrated).toBe(true);
    expect(report.exported).toBe(5);
    expect(report.diverted).toBe(1);

    const mainlineIds = files.readMemories("mainline").map((m) => m.memoryId);
    const overlayIds = files.readMemories("overlay").map((m) => m.memoryId);
    // Authored + human-confirmed host import → committed; unconfirmed import → overlay.
    expect(mainlineIds).toContain("mem:01MIGACTIVE0000000000000A");
    expect(mainlineIds).toContain("mem:01MIGRETIRE0000000000000A");
    expect(mainlineIds).toContain("mem:01MIGHOSTOK000000000000AA");
    expect(overlayIds).toContain("mem:01MIGHOSTREVIEW000000000A");
    // E4: the secret-shaped entry is diverted to the overlay, never committed.
    expect(overlayIds).toContain("mem:01MIGSECRET0000000000000A");
    expect(mainlineIds).not.toContain("mem:01MIGSECRET0000000000000A");
    const secret = files
      .readMemories("overlay")
      .find((m) => m.memoryId === "mem:01MIGSECRET0000000000000A");
    expect(secret?.status).toBe("needs-review");
    expect(secret?.reason?.toLowerCase()).toContain("secret");
    // Marker set → migration no longer due.
    expect(store.getMeta(MIGRATION_MARKER)).toBeDefined();
    expect(isMigrationDue(store)).toBe(false);

    // Status is replayed via decision events → a FRESH reindex reproduces it.
    const fresh = openStore({ projectDir: repo, home: join(root, "fresh"), now });
    try {
      reindexMemoryFromFiles(fresh, new MemoryFiles(join(repo, ".ctx")));
      expect(fresh.getMemory("mem:01MIGRETIRE0000000000000A")?.status).toBe("retired");
      expect(fresh.getMemory("mem:01MIGACTIVE0000000000000A")?.status).toBe("active");
      expect(fresh.getMemory("mem:01MIGHOSTOK000000000000AA")?.status).toBe("active");
      expect(fresh.getMemory("mem:01MIGHOSTREVIEW000000000A")?.status).toBe("needs-review");
    } finally {
      fresh.close();
    }
  });

  test("R5: a retired secret-shaped row does not resurrect as needs-review", () => {
    const gen = store.beginGeneration("memory");
    seedMemory(store, gen, {
      id: "mem:01MIGSECRETDEAD00000000A",
      gist: "dead key sk-ABCDEFGH1234567890secret was rotated long ago",
      origin: "remember",
      status: "retired",
    });
    store.publishGeneration("memory");
    migrateStoreMemoryToFiles(store, files);
    // The secret is diverted to the overlay, but its terminal status is replayed,
    // so it stays retired (not resurrected into the review queue).
    const fresh = openStore({ projectDir: repo, home: join(root, "fresh-r5"), now });
    try {
      reindexMemoryFromFiles(fresh, new MemoryFiles(join(repo, ".ctx")));
      expect(fresh.getMemory("mem:01MIGSECRETDEAD00000000A")?.status).toBe("retired");
    } finally {
      fresh.close();
    }
  });

  test("re-running after the marker is a no-op", () => {
    migrateStoreMemoryToFiles(store, files);
    const mainlineBefore = files.memoryLines("mainline").length;
    const again = migrateStoreMemoryToFiles(store, files);
    expect(again.migrated).toBe(false);
    expect(again.exported).toBe(0);
    expect(files.memoryLines("mainline").length).toBe(mainlineBefore); // no new lines
  });

  test("resumable: a partially-flushed entry (marker unset) is skipped, no duplicates", () => {
    // Simulate a crash after flushing ONE entry but before the marker: pre-write
    // the active memory's line, leave the marker unset, then migrate.
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01MIGACTIVE0000000000000A",
        gist: "authored active memory",
        origin: "remember",
      }),
    );
    expect(store.getMeta(MIGRATION_MARKER)).toBeUndefined();
    const report = migrateStoreMemoryToFiles(store, files);
    expect(report.migrated).toBe(true);
    expect(report.skipped).toBe(1); // the already-present ULID
    // The pre-flushed ULID appears exactly once (id-keyed skip = no duplicate).
    const active = files
      .readMemories("mainline")
      .filter((m) => m.memoryId === "mem:01MIGACTIVE0000000000000A");
    expect(active).toHaveLength(1);
  });
});

describe("slice 3 — pull-delta reindex (S10 #3)", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-pull-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  function commit(msg: string): string {
    git(["add", "-A"], repo);
    git(["commit", "-q", "-m", msg], repo);
    return git(["rev-parse", "HEAD"], repo);
  }

  test("processes only the appended lines between two commits", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01PULLA00000000000000000A", gist: "first, at old tip" }),
    );
    const oldTip = commit("ctx: memory A");
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01PULLB00000000000000000B", gist: "second, pulled" }),
    );
    const newTip = commit("ctx: memory B");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("delta");
      expect(res.added).toBe(1); // only B's line was in the delta
      expect(store.getMemory("mem:01PULLB00000000000000000B")?.gist).toBe("second, pulled");
    } finally {
      store.close();
    }
  });

  test("a non-append diff shape falls back to a full rebuild", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01PULLC00000000000000000C", gist: "keep me" }),
    );
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01PULLD00000000000000000D", gist: "remove me later" }),
    );
    const oldTip = commit("ctx: two memories");
    // Rewrite the log removing a line (a manual conflict resolution / rewrite).
    const logPath = join(repo, ".ctx", "memory", "log.md");
    // NB: the `mid` token is percent-encoded (`:` → `%3A`), so match on the ULID.
    const kept = readFileSync(logPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("01PULLC00000000000000000C"))
      .join("\n");
    writeFileSync(logPath, `${kept}\n`, "utf8");
    const newTip = commit("ctx: rewrite log");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("full-fallback");
      // Full rebuild ingested the surviving entry.
      expect(store.getMemory("mem:01PULLC00000000000000000C")?.gist).toBe("keep me");
    } finally {
      store.close();
    }
  });
});

describe("slice 3 — drift recomputed from scratch at reindex (S4 / R2-2)", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-drift-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("classifyAbsentAnchor splits target-removed vs unresolved-here by git ancestry", () => {
    const c0 = git(["rev-parse", "HEAD"], repo); // the base commit (main)
    // A divergent branch commit that is NOT an ancestor of main's HEAD.
    git(["checkout", "-q", "-b", "feature"], repo);
    writeFileSync(join(repo, "feature.txt"), "x\n");
    git(["add", "-A"], repo);
    git(["commit", "-q", "-m", "feature commit"], repo);
    const cFeature = git(["rev-parse", "HEAD"], repo);
    git(["checkout", "-q", "main"], repo);
    writeFileSync(join(repo, "main.txt"), "y\n");
    git(["add", "-A"], repo);
    git(["commit", "-q", "-m", "main commit"], repo);

    // On main: c0 is an ancestor → target-removed; the feature commit is not → unresolved-here.
    expect(classifyAbsentAnchor(repo, c0)).toBe("target-removed");
    expect(classifyAbsentAnchor(repo, cFeature)).toBe("unresolved-here");
    // A legacy row with no anchored-at is never fabricated → skip.
    expect(classifyAbsentAnchor(repo, undefined)).toBe("skip");
  });

  test("full reindex clears sticky drift, then re-derives target-removed by ancestry", () => {
    const head = currentHeadCommit(repo)!;
    const files = new MemoryFiles(join(repo, ".ctx"));
    // Two memories anchored to a symbol that does not exist in the index (ghost):
    // one anchored-at HEAD (ancestor → target-removed), one anchored-at a bogus
    // non-ancestor commit (branch-absent → unresolved-here, never stale).
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01DRIFTREMOVED0000000000A",
        gist: "anchored to a now-removed symbol",
        anchors: ["sym:src/x.ts#ghost"],
        anchoredAt: head,
      }),
    );
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01DRIFTBRANCH00000000000A",
        gist: "anchored to a symbol from a divergent branch",
        anchors: ["sym:src/x.ts#ghost"],
        anchoredAt: "0000000000000000000000000000000000000000",
      }),
    );

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      // Publish a code generation so the reindex trusts the index for freshness.
      store.beginGeneration("code");
      store.publishGeneration("code");
      reindexMemoryFromFiles(store, files);

      const removed = store.getMemory("mem:01DRIFTREMOVED0000000000A");
      expect(removed?.driftReason).toBe("target-removed");
      expect(removed?.status).toBe("needs-review"); // composeStatus effect (A5)
      const branch = store.getMemory("mem:01DRIFTBRANCH00000000000A");
      expect(branch?.driftReason).toBeUndefined(); // unresolved-here, NOT stale
      expect(branch?.status).toBe("active");

      // Sticky-drift unsticking (R2-2): force a drift, reindex again → recomputed.
      store.setMemoryDrift("mem:01DRIFTBRANCH00000000000A", "target-removed");
      reindexMemoryFromFiles(store, files);
      expect(store.getMemory("mem:01DRIFTBRANCH00000000000A")?.driftReason).toBeUndefined();
    } finally {
      store.close();
    }
  });
});

describe("slice 3 — sidecar integrity (S1)", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-side-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("a dangling detail pointer reads as undefined, never a crash", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01DANGLING00000000000000A",
        gist: "note with a missing sidecar",
        detailPointer: "01DANGLING00000000000000A",
      }),
      "detail body that we then delete",
    );
    // Delete the sidecar to create a dangling pointer.
    rmSync(files.sidecarPath("mainline", "01DANGLING00000000000000A"), { force: true });

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      expect(() => reindexMemoryFromFiles(store, files)).not.toThrow();
      const m = store.getMemory("mem:01DANGLING00000000000000A");
      expect(m?.gist).toBe("note with a missing sidecar");
      expect(m?.detail).toBeUndefined(); // success-shaped (S1b)
    } finally {
      store.close();
    }
  });

  test("an orphan sidecar (no referencing entry) never crashes a reindex", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.ensureScaffold();
    writeFileSync(
      files.sidecarPath("mainline", "01ORPHAN0000000000000000AA"),
      "orphan body\n",
      "utf8",
    );
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01HASENTRY0000000000000A", gist: "a real entry" }),
    );

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      expect(() => reindexMemoryFromFiles(store, files)).not.toThrow();
      expect(store.getMemory("mem:01HASENTRY0000000000000A")?.gist).toBe("a real entry");
    } finally {
      store.close();
    }
  });
});

describe("slice 3 — review round 1 fixes", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-r1-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("R1: a corrupt committed line is skipped + counted, good lines still index", () => {
    const logDir = join(repo, ".ctx", "memory");
    mkdirSync(logDir, { recursive: true });
    const good =
      "- mem id=01G at=1000 mid=mem:01GOODLINE0000000000000A verb=create actor=cli carrier=cli method=explicit-key authority=confirmed status=active origin=human-note gist=good%20line";
    // Bad percent-escape in the gist AND bad refs JSON on a decision — both would
    // throw inside decodeURIComponent / JSON.parse without the R1 guard.
    const badMem =
      "- mem id=01B at=2000 mid=mem:01BADLINE00000000000000A verb=create actor=cli carrier=cli method=explicit-key authority=confirmed status=active origin=human-note gist=%ZZbroken";
    const badDec =
      "- dec id=01D at=3000 mid=mem:01GOODLINE0000000000000A verb=confirm actor=cli carrier=cli method=explicit-key authority=confirmed refs=%GG";
    writeFileSync(join(logDir, "log.md"), `${good}\n${badMem}\n`, "utf8");
    writeFileSync(join(logDir, "decisions.md"), `${badDec}\n`, "utf8");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      let report!: ReturnType<typeof reindexMemoryFromFiles>;
      expect(() => {
        report = reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".ctx")));
      }).not.toThrow();
      expect(report.memories).toBe(1);
      expect(report.skipped).toBe(2); // one mem + one dec line skipped
      expect(store.getMemory("mem:01GOODLINE0000000000000A")?.gist).toBe("good line");
      expect(store.getMemory("mem:01BADLINE00000000000000A")).toBeUndefined();
    } finally {
      store.close();
    }
  });

  test("R2(i): a peer's historical stale-suspect is recomputed → dump equals a fresh clone", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01PEERMEM000000000000000A",
        gist: "anchored to a symbol that once drifted",
        anchors: ["sym:src/x.ts#present"],
      }),
    );

    // Peer A: reindex, then a within-process code re-ingest flags signature-changed
    // (drift + an open stale-suspect conflict), exactly like the landed 2c path.
    const peer = openStore({ projectDir: repo, home: join(root, "peer"), now });
    // Fresh clone B: same committed files, never saw the drift.
    const clone = openStore({ projectDir: repo, home: join(root, "clone"), now });
    try {
      reindexMemoryFromFiles(peer, new MemoryFiles(join(repo, ".ctx")));
      const gen = peer.publishedGen("memory");
      flagAnchored(peer, "sym:src/x.ts#present", "signature-changed", gen);
      expect(peer.openStaleSuspects("mem:01PEERMEM000000000000000A").length).toBeGreaterThan(0);

      // A full reindex recomputes the derived stale-suspect layer from scratch.
      reindexMemoryFromFiles(peer, new MemoryFiles(join(repo, ".ctx")));
      reindexMemoryFromFiles(clone, new MemoryFiles(join(repo, ".ctx")));

      // The historical signature-changed conflict is gone (not ancestry-provable).
      expect(peer.conflicts("open").filter((c) => c.kind === "stale-suspect")).toHaveLength(0);
      // E6: the peer and the fresh clone now dump identically.
      expect(dumpJson(peer)).toBe(dumpJson(clone));
    } finally {
      peer.close();
      clone.close();
    }
  });

  test("R2(ii): stale-suspect re-files when the target is absent, clears when present", () => {
    const head = currentHeadCommit(repo)!;
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01RECOMPUTE00000000000AA",
        gist: "anchored to a ghost symbol on this line of history",
        anchors: ["sym:src/x.ts#ghost2"],
        anchoredAt: head,
      }),
    );

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      store.beginGeneration("code");
      store.publishGeneration("code");
      reindexMemoryFromFiles(store, files);
      // Target absent + anchored-at ancestor → stale-suspect filed, needs-review.
      expect(store.openStaleSuspects("mem:01RECOMPUTE00000000000AA").length).toBeGreaterThan(0);
      expect(store.getMemory("mem:01RECOMPUTE00000000000AA")?.status).toBe("needs-review");

      // The symbol comes back (a later checkout / re-ingest): reindex clears both
      // the drift annotation AND the derived conflict; status returns to the fold.
      store.upsertEntity({
        id: "sym:src/x.ts#ghost2",
        kind: "symbol",
        name: "ghost2",
        locator: { t: "file", path: "src/x.ts", span: [1, 1] },
        gen: store.publishedGen("code"),
      });
      reindexMemoryFromFiles(store, files);
      expect(store.openStaleSuspects("mem:01RECOMPUTE00000000000AA")).toHaveLength(0);
      expect(store.getMemory("mem:01RECOMPUTE00000000000AA")?.driftReason).toBeUndefined();
      expect(store.getMemory("mem:01RECOMPUTE00000000000AA")?.status).toBe("active");
    } finally {
      store.close();
    }
  });

  test("R4: a 4-valued authority (observed) survives serialize → reindex → dump", () => {
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01AUTHOBSERVED00000000AA",
        gist: "an observed-authority memory",
        authority: "observed",
      }),
    );
    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".ctx")));
      expect(store.getMemory("mem:01AUTHOBSERVED00000000AA")?.authority).toBe("observed");
      const dump = JSON.parse(dumpJson(store)) as {
        memories: Array<{ entityId: string; authority: string }>;
      };
      expect(
        dump.memories.find((m) => m.entityId === "mem:01AUTHOBSERVED00000000AA")?.authority,
      ).toBe("observed");
    } finally {
      store.close();
    }
  });
});

describe("slice 3 — review round 2 fixes (cross-machine)", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-r2f-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("R8: a committed resolution replays cross-machine by content, not numeric id", () => {
    const head = currentHeadCommit(repo)!;
    const MEM = "mem:01R8MEMORY0000000000000A";
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: MEM,
        gist: "anchored to a ghost, dismissed by a human",
        anchors: ["sym:src/x.ts#r8ghost"],
        anchoredAt: head,
      }),
    );

    const a = openStore({ projectDir: repo, home: join(root, "a"), now });
    const b = openStore({ projectDir: repo, home: join(root, "b"), now });
    try {
      a.beginGeneration("code");
      a.publishGeneration("code");
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".ctx")));
      const conf = a.openStaleSuspects(MEM)[0]!;
      // A human DISMISSES the stale-suspect → a committed decision. Its refs are
      // A's claim ids (17,18-style); the committed bytes must be content-addressed.
      resolveConflictViaEvent(
        a,
        MEM,
        conf.a,
        conf.b,
        "dismiss",
        "cli",
        new MemoryFiles(join(repo, ".ctx")),
      );

      // Peer B (fresh store, its OWN claim numbering) reindexes the same files.
      b.beginGeneration("code");
      b.publishGeneration("code");
      reindexMemoryFromFiles(b, new MemoryFiles(join(repo, ".ctx")));
      // The dismissal resolves B's conflict by content — not by A's numeric ids.
      expect(b.openStaleSuspects(MEM)).toHaveLength(0);
      expect(b.conflicts("dismissed").some((c) => c.kind === "stale-suspect")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  test("R9: a confirm that cleared target-removed survives full reindex (same machine + fresh clone)", () => {
    const head = currentHeadCommit(repo)!;
    const MEM = "mem:01R9CONFIRM0000000000AAA";
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: MEM,
        gist: "anchored to a ghost, human-confirmed fresh",
        anchors: ["sym:src/x.ts#r9ghost"],
        anchoredAt: head,
      }),
    );

    const a = openStore({ projectDir: repo, home: join(root, "a"), now });
    try {
      a.beginGeneration("code");
      a.publishGeneration("code");
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".ctx")));
      expect(a.getMemory(MEM)?.status).toBe("needs-review"); // target-removed drift
      // Human confirm (E7-recovery) → committed, carrying clearedDrift + confirmedAt.
      setMemoryLifecycle(a, MEM, "active", new MemoryFiles(join(repo, ".ctx")));
      expect(a.getMemory(MEM)?.status).toBe("active");
      // A later full reindex (a branch switch, slice 4) must NOT re-undo the confirm.
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".ctx")));
      expect(a.getMemory(MEM)?.status).toBe("active");
      expect(a.openStaleSuspects(MEM)).toHaveLength(0);

      // A fresh clone reads the SAME committed confirm bytes → same suppression.
      const b = openStore({ projectDir: repo, home: join(root, "b"), now });
      try {
        b.beginGeneration("code");
        b.publishGeneration("code");
        reindexMemoryFromFiles(b, new MemoryFiles(join(repo, ".ctx")));
        expect(b.getMemory(MEM)?.status).toBe("active");
        expect(b.openStaleSuspects(MEM)).toHaveLength(0);
      } finally {
        b.close();
      }
    } finally {
      a.close();
    }
  });

  test("R9 counter-case: a confirm that PREDATES the removal still flags target-removed", () => {
    const head = currentHeadCommit(repo)!;
    const MEM = "mem:01R9PREDATE0000000000AAA";
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: MEM,
        gist: "confirmed while the target was still present",
        anchors: ["sym:src/x.ts#r9present"],
        anchoredAt: head,
      }),
    );

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      // No code gen yet → reindex does not flag drift; confirm carries NO clearedDrift.
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".ctx")));
      setMemoryLifecycle(store, MEM, "active", new MemoryFiles(join(repo, ".ctx")));
      // Now the target is (still) absent AND a code index exists → a REAL removal.
      store.beginGeneration("code");
      store.publishGeneration("code");
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".ctx")));
      expect(store.getMemory(MEM)?.status).toBe("needs-review");
      expect(store.openStaleSuspects(MEM).length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  test("R10: a dismissed stale-suspect stays dismissed across a full reindex", () => {
    const head = currentHeadCommit(repo)!;
    const MEM = "mem:01R10DISMISS000000000AAA";
    const files = new MemoryFiles(join(repo, ".ctx"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: MEM,
        gist: "dismissed and it must stay dismissed",
        anchors: ["sym:src/x.ts#r10ghost"],
        anchoredAt: head,
      }),
    );

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      store.beginGeneration("code");
      store.publishGeneration("code");
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".ctx")));
      const conf = store.openStaleSuspects(MEM)[0]!;
      resolveConflictViaEvent(
        store,
        MEM,
        conf.a,
        conf.b,
        "dismiss",
        "cli",
        new MemoryFiles(join(repo, ".ctx")),
      );
      // Full reindex: the stale-suspect is still derivable (target absent+ancestor),
      // so it re-files — but the committed dismiss re-applies AFTER the re-file.
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".ctx")));
      expect(store.openStaleSuspects(MEM)).toHaveLength(0);
      expect(store.conflicts("dismissed").some((c) => c.kind === "stale-suspect")).toBe(true);
    } finally {
      store.close();
    }
  });
});
