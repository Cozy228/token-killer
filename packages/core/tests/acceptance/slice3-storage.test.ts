/**
 * Slice 3 — storage locus swap acceptance.
 *
 * Committed `.contexa/` files become the source of truth; the SQLite store is a
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
    // S8a (slice 4): the AGENT surface is `surface: "mcp"` → overlay needs-review.
    const r = remember(store, {
      note: "an agent gotcha to keep local",
      surface: "mcp",
      now,
      files,
    });
    expect(r.ok).toBe(true);
    expect(files.readMemories("overlay").map((m) => m.gist)).toEqual([
      "an agent gotcha to keep local",
    ]);
    expect(files.readMemories("mainline")).toHaveLength(0);
    // The committed memory log file was never created.
    expect(existsSync(join(repo, ".contexa", "memory", "log.md"))).toBe(false);
    // ctx wrote the scaffold: gitignore covers the overlay, gitattributes union-merges.
    expect(readFileSync(join(repo, ".contexa", ".gitignore"), "utf8")).toContain("*.local.md");
    expect(readFileSync(join(repo, ".contexa", ".gitattributes"), "utf8")).toContain("merge=union");
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
    // An agent (overlay) note, then a human confirm: the confirm decision is
    // committed to Mainline AND (slice-4 item 4) the create body is PROMOTED to
    // Mainline, so no committed `dec` line dangles on an overlay-only id (D3).
    const r = remember(store, { note: "confirm this one", surface: "mcp", now, files });
    if (!r.ok) throw new Error("remember failed");
    const res = setMemoryLifecycle(store, r.entityId, "active", files);
    if (!res.ok) throw new Error("confirm failed");
    expect(res.promoted).toBe(true);
    const decisions = files.readDecisions("mainline");
    expect(decisions.some((d) => d.verb === "confirm" && d.memoryId === r.entityId)).toBe(true);
    // The promoted create now lives in Mainline (its overlay line stays, shadowed).
    expect(files.readMemories("mainline").map((m) => m.memoryId)).toContain(r.entityId);
  });

  test("without a files writer the write path stays store-only (slice-2 behaviour)", () => {
    const r = remember(store, { surface: "cli", note: "no file writer here", now });
    expect(r.ok).toBe(true);
    expect(existsSync(join(repo, ".contexa"))).toBe(false); // nothing written
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
    const logDir = join(repo, ".contexa", "memory");
    mkdirSync(logDir, { recursive: true });
    const createLine =
      "- mem id=01A at=1000 mid=mem:01ORDER00000000000000000 verb=create actor=cli carrier=cli method=explicit-key authority=confirmed status=active origin=human-note gist=order%20test";
    const reviewLine =
      "- dec id=01B at=2000 mid=mem:01ORDER00000000000000000 verb=review actor=cli carrier=cli method=explicit-key authority=confirmed";
    writeFileSync(join(logDir, "decisions.md"), `${reviewLine}\n`, "utf8");
    writeFileSync(join(logDir, "log.md"), `${createLine}\n`, "utf8");
    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
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

  test("same committed .contexa content → equal dumps across two fresh stores", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
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
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".contexa")));
      reindexMemoryFromFiles(b, new MemoryFiles(join(repo, ".contexa")));
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
    expect(isMigrationDue(store, files)).toBe(true);
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
    // Marker set (a last-run stamp) + every store event now committed → not due.
    expect(store.getMeta(MIGRATION_MARKER)).toBeDefined();
    expect(isMigrationDue(store, files)).toBe(false);

    // Status is derived from the verbatim events → a FRESH reindex reproduces it.
    const fresh = openStore({ projectDir: repo, home: join(root, "fresh"), now });
    try {
      reindexMemoryFromFiles(fresh, new MemoryFiles(join(repo, ".contexa")));
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
      reindexMemoryFromFiles(fresh, new MemoryFiles(join(repo, ".contexa")));
      expect(fresh.getMemory("mem:01MIGSECRETDEAD00000000A")?.status).toBe("retired");
    } finally {
      fresh.close();
    }
  });

  test("re-running is an idempotent no-op (marker is a stamp, not a gate)", () => {
    migrateStoreMemoryToFiles(store, files);
    const mainlineBefore = files.memoryLines("mainline").length;
    const overlayBefore = files.memoryLines("overlay").length;
    const again = migrateStoreMemoryToFiles(store, files);
    expect(again.exported).toBe(0); // nothing new to export
    expect(files.memoryLines("mainline").length).toBe(mainlineBefore);
    expect(files.memoryLines("overlay").length).toBe(overlayBefore);
  });

  test("F1: crash between the create line and its lifecycle line resumes cleanly", () => {
    // A memory with a real create + retire history.
    const gen = store.beginGeneration("memory");
    const MEM = "mem:01F1RESUME00000000000AAA";
    store.upsertEntity({
      id: MEM,
      kind: "memory",
      name: "resumable",
      locator: { t: "store" },
      attrs: { origin: "remember" },
      gen,
    });
    store.writeMemory({
      entityId: MEM,
      gist: "created then retired",
      origin: "remember",
      authority: "confirmed",
      status: "retired",
    });
    store.appendMemoryEvent({
      memoryId: MEM,
      verb: "create",
      actor: "agent",
      refs: { status: "active" },
      carrier: "memory",
      method: "explicit-key",
      authority: "confirmed",
    });
    store.appendMemoryEvent({
      memoryId: MEM,
      verb: "retire",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
    });
    store.publishGeneration("memory");

    // Simulate a crash: the create line was flushed to the files, the retire dec
    // line was NOT (and the marker is unset).
    const createEv = store.memoryEvents(MEM).find((e) => e.verb === "create")!;
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: MEM,
        eventId: createEv.id,
        at: createEv.at,
        gist: "created then retired",
        origin: "remember",
        actor: "agent",
        carrier: "memory",
        status: "active",
      }),
    );

    // Resume: the id-keyed catch-up skips the present create + writes the retire.
    migrateStoreMemoryToFiles(store, files);
    const memLines = files.readMemories("mainline").filter((m) => m.memoryId === MEM);
    expect(memLines).toHaveLength(1); // no duplicate create
    const fresh = openStore({ projectDir: repo, home: join(root, "fresh-f1"), now });
    try {
      reindexMemoryFromFiles(fresh, new MemoryFiles(join(repo, ".contexa")));
      expect(fresh.getMemory(MEM)?.status).toBe("retired"); // the retire line was completed
    } finally {
      fresh.close();
    }
  });

  test("F4: a post-migration store-only row is swept on the next due-check", () => {
    migrateStoreMemoryToFiles(store, files);
    expect(isMigrationDue(store, files)).toBe(false);
    // A store-only write lands after migration (the slice-4 live paths do this).
    const gen = store.beginGeneration("memory");
    const MEM = "mem:01F4STRANDED0000000000AA";
    store.upsertEntity({
      id: MEM,
      kind: "memory",
      name: "stranded",
      locator: { t: "store" },
      attrs: { origin: "remember" },
      gen,
    });
    store.writeMemory({
      entityId: MEM,
      gist: "written store-only after migration",
      origin: "remember",
      authority: "confirmed",
      status: "active",
    });
    store.appendMemoryEvent({
      memoryId: MEM,
      verb: "create",
      actor: "agent",
      refs: { status: "active" },
      carrier: "memory",
      method: "explicit-key",
      authority: "confirmed",
    });
    store.publishGeneration("memory");

    // The catch-up net catches it: due again → sweep → committed + indexed.
    expect(isMigrationDue(store, files)).toBe(true);
    const again = migrateStoreMemoryToFiles(store, files);
    expect(again.exported).toBe(1);
    expect(files.readMemories("mainline").map((m) => m.memoryId)).toContain(MEM);
    expect(store.getMemory(MEM)?.gist).toBe("written store-only after migration");
    expect(isMigrationDue(store, files)).toBe(false);
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
    const logPath = join(repo, ".contexa", "memory", "log.md");
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
    const logDir = join(repo, ".contexa", "memory");
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
        report = reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
      reindexMemoryFromFiles(peer, new MemoryFiles(join(repo, ".contexa")));
      const gen = peer.publishedGen("memory");
      flagAnchored(peer, "sym:src/x.ts#present", "signature-changed", gen);
      expect(peer.openStaleSuspects("mem:01PEERMEM000000000000000A").length).toBeGreaterThan(0);

      // A full reindex recomputes the derived stale-suspect layer from scratch.
      reindexMemoryFromFiles(peer, new MemoryFiles(join(repo, ".contexa")));
      reindexMemoryFromFiles(clone, new MemoryFiles(join(repo, ".contexa")));

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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".contexa")));
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
        new MemoryFiles(join(repo, ".contexa")),
      );

      // Peer B (fresh store, its OWN claim numbering) reindexes the same files.
      b.beginGeneration("code");
      b.publishGeneration("code");
      reindexMemoryFromFiles(b, new MemoryFiles(join(repo, ".contexa")));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".contexa")));
      expect(a.getMemory(MEM)?.status).toBe("needs-review"); // target-removed drift
      // Human confirm (E7-recovery) → committed, carrying clearedDrift + confirmedAt.
      setMemoryLifecycle(a, MEM, "active", new MemoryFiles(join(repo, ".contexa")));
      expect(a.getMemory(MEM)?.status).toBe("active");
      // A later full reindex (a branch switch, slice 4) must NOT re-undo the confirm.
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".contexa")));
      expect(a.getMemory(MEM)?.status).toBe("active");
      expect(a.openStaleSuspects(MEM)).toHaveLength(0);

      // A fresh clone reads the SAME committed confirm bytes → same suppression.
      const b = openStore({ projectDir: repo, home: join(root, "b"), now });
      try {
        b.beginGeneration("code");
        b.publishGeneration("code");
        reindexMemoryFromFiles(b, new MemoryFiles(join(repo, ".contexa")));
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
    const files = new MemoryFiles(join(repo, ".contexa"));
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
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
      setMemoryLifecycle(store, MEM, "active", new MemoryFiles(join(repo, ".contexa")));
      // Now the target is (still) absent AND a code index exists → a REAL removal.
      store.beginGeneration("code");
      store.publishGeneration("code");
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
      expect(store.getMemory(MEM)?.status).toBe("needs-review");
      expect(store.openStaleSuspects(MEM).length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  test("R10: a dismissed stale-suspect stays dismissed across a full reindex", () => {
    const head = currentHeadCommit(repo)!;
    const MEM = "mem:01R10DISMISS000000000AAA";
    const files = new MemoryFiles(join(repo, ".contexa"));
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
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
      const conf = store.openStaleSuspects(MEM)[0]!;
      resolveConflictViaEvent(
        store,
        MEM,
        conf.a,
        conf.b,
        "dismiss",
        "cli",
        new MemoryFiles(join(repo, ".contexa")),
      );
      // Full reindex: the stale-suspect is still derivable (target absent+ancestor),
      // so it re-files — but the committed dismiss re-applies AFTER the re-file.
      reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
      expect(store.openStaleSuspects(MEM)).toHaveLength(0);
      expect(store.conflicts("dismissed").some((c) => c.kind === "stale-suspect")).toBe(true);
    } finally {
      store.close();
    }
  });
});

describe("slice 3 — review round 3 fixes (cache reset seam + distribution)", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-r3-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  function commit(msg: string): string {
    git(["add", "-A"], repo);
    git(["commit", "-q", "-m", msg], repo);
    return git(["rev-parse", "HEAD"], repo);
  }

  /** Seed a store-only memory row + arbitrary event history. */
  function seed(
    store: Store,
    gen: number,
    id: string,
    gist: string,
    status: MemoryStatus,
    verbs: MemoryStatus[] = [],
  ): void {
    store.upsertEntity({
      id,
      kind: "memory",
      name: gist.slice(0, 40),
      locator: { t: "store" },
      attrs: { origin: "remember" },
      gen,
    });
    store.writeMemory({ entityId: id, gist, origin: "remember", authority: "confirmed", status });
    store.appendMemoryEvent({
      memoryId: id,
      verb: "create",
      actor: "agent",
      refs: { status: "active" },
      carrier: "memory",
      method: "explicit-key",
      authority: "confirmed",
    });
    const V: Record<MemoryStatus, "confirm" | "review" | "retire" | "supersede"> = {
      active: "confirm",
      "needs-review": "review",
      retired: "retire",
      superseded: "supersede",
    };
    for (const s of verbs) {
      store.appendMemoryEvent({
        memoryId: id,
        verb: V[s],
        actor: "cli",
        carrier: "cli",
        method: "explicit-key",
        authority: "confirmed",
      });
    }
  }

  test("F2: post-migration the machine dumps identically to a fresh clone (verbatim history + secret)", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    const store = openStore({ projectDir: repo, home: join(root, "src"), now });
    const gen = store.beginGeneration("memory");
    // A real lifecycle history: create → supersede → retire (an E5 contradiction).
    seed(store, gen, "mem:01F2HISTORY000000000000A", "has a lifecycle history", "retired", [
      "superseded",
      "retired",
    ]);
    // A secret row (diverted to the overlay).
    seed(store, gen, "mem:01F2SECRET0000000000000A", "leak sk-ABCDEFGH1234567890secret", "active");
    store.publishGeneration("memory");

    migrateStoreMemoryToFiles(store, files); // ends with the reset rebuild

    const clone = openStore({ projectDir: repo, home: join(root, "clone"), now });
    try {
      reindexMemoryFromFiles(clone, new MemoryFiles(join(repo, ".contexa")));
      // The migrating machine re-derived from the files exactly like a fresh clone.
      expect(dumpJson(store)).toBe(dumpJson(clone));
      // The legacy history folded to a terminal state + filed a contradiction.
      const h = store.getMemory("mem:01F2HISTORY000000000000A")?.status;
      expect(h === "retired" || h === "superseded").toBe(true);
      expect(store.conflicts("open").some((c) => c.kind === "contradiction")).toBe(true);
    } finally {
      clone.close();
      store.close();
    }
  });

  test("F3: pull-delta survives a user diff.external (delta / difftastic)", () => {
    // An external diff driver that emits NOTHING (like `true`) — without
    // --no-ext-diff the delta path would see zero content and index nothing.
    git(["config", "diff.external", "true"], repo);
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01F3EXTERNAL00000000000A", gist: "pulled under diff.external" }),
    );
    const oldTip = commit("ctx: before");
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01F3PULLED0000000000000A", gist: "must still be indexed" }),
    );
    const newTip = commit("ctx: appended");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("delta");
      expect(res.added).toBe(1);
      expect(store.getMemory("mem:01F3PULLED0000000000000A")?.gist).toBe("must still be indexed");
    } finally {
      store.close();
    }
  });

  test("F5: a non-append redaction PURGES the row; the reset preserves store-only rows", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01F5KEEP00000000000000A", gist: "a keeper" }),
    );
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01F5SECRET0000000000000A",
        gist: "oops committed sk-ABCDEFGH1234567890x",
      }),
    );
    const oldTip = commit("ctx: two memories");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      reindexMemoryFromFiles(store, files); // store has KEEP + SECRET
      // A store-only row lands AFTER (the ordering guard must preserve it).
      const gen = store.beginGeneration("memory");
      seed(store, gen, "mem:01F5LOCAL00000000000000A", "store-only local row", "active");
      store.publishGeneration("memory");

      // The human REDACTS: removes the secret line from the committed log.
      const logPath = join(repo, ".contexa", "memory", "log.md");
      const kept = readFileSync(logPath, "utf8")
        .split("\n")
        .filter((l) => l.includes("01F5KEEP00000000000000A"))
        .join("\n");
      writeFileSync(logPath, `${kept}\n`, "utf8");
      const newTip = commit("ctx: redact the secret");

      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("full-fallback");
      // Purge path: the redacted secret is no longer served.
      expect(store.getMemory("mem:01F5SECRET0000000000000A")).toBeUndefined();
      expect(store.getMemory("mem:01F5KEEP00000000000000A")?.gist).toBe("a keeper");
      // Ordering guard: the store-only row was exported before the reset → preserved.
      expect(store.getMemory("mem:01F5LOCAL00000000000000A")?.gist).toBe("store-only local row");
    } finally {
      store.close();
    }
  });

  test("F6: same id in both zones — MAINLINE wins, overlay shadow counted", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    const ID = "mem:01F6SHADOW0000000000000A";
    files.appendMemory("mainline", memEntry({ memoryId: ID, gist: "committed redacted text" }));
    files.appendMemory("overlay", memEntry({ memoryId: ID, gist: "unredacted overlay text" }));

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      const report = reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
      expect(store.getMemory(ID)?.gist).toBe("committed redacted text"); // mainline wins
      expect(report.shadowedOverlay).toBe(1);
    } finally {
      store.close();
    }
  });

  test("F7: a mem line in the wrong file is skipped, not misapplied; deletion → full-fallback", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.ensureScaffold();
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01F7GOOD00000000000000A", gist: "a proper memory" }),
    );
    const oldTip = commit("ctx: one memory");

    // Append a valid memory AND (wrongly) a mem line into decisions.md.
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01F7NEW000000000000000A", gist: "a new memory" }),
    );
    const misplaced =
      "- mem id=01WRONG at=9 mid=mem:01F7MISPLACED000000000A verb=create actor=cli carrier=cli method=explicit-key authority=confirmed status=active origin=human-note gist=misplaced";
    writeFileSync(join(repo, ".contexa", "memory", "decisions.md"), `${misplaced}\n`, "utf8");
    const newTip = commit("ctx: append + a misplaced line");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("delta");
      // The mem line in decisions.md is routed by file → parsed as a decision →
      // fails → skipped, NEVER indexed as a memory.
      expect(store.getMemory("mem:01F7MISPLACED000000000A")).toBeUndefined();
      expect(res.skipped).toBeGreaterThan(0);
      expect(store.getMemory("mem:01F7NEW000000000000000A")?.gist).toBe("a new memory");
    } finally {
      store.close();
    }
  });

  test("F7: deleting the committed log (rename half) → non-append full-fallback", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01F7DEL000000000000000A", gist: "will be removed by a rename" }),
    );
    const oldTip = commit("ctx: has a log");
    rmSync(join(repo, ".contexa", "memory", "log.md"), { force: true });
    const newTip = commit("ctx: log renamed away");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("full-fallback"); // --no-renames → delete → non-append
      expect(store.getMemory("mem:01F7DEL000000000000000A")).toBeUndefined();
    } finally {
      store.close();
    }
  });
});

describe("slice 3 — Codex post-merge review fixes (O-17/O-20)", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = makeTempDir("ctx-s3-cx-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  function commit(msg: string): string {
    git(["add", "-A"], repo);
    git(["commit", "-q", "-m", msg], repo);
    return git(["rev-parse", "HEAD"], repo);
  }

  test("F-A: pull-delta recomputes drift — a pulled anchor to a removed target files stale-suspect", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01FAKEEP0000000000000000A", gist: "first at old tip" }),
    );
    const oldTip = commit("ctx: memory A");
    const head = currentHeadCommit(repo)!; // = oldTip, an ancestor of the pulled commit
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01FASTALE000000000000000A",
        gist: "pulled note anchored to a now-removed symbol",
        anchors: ["sym:src/x.ts#faGhost"],
        anchoredAt: head,
      }),
    );
    const newTip = commit("ctx: memory B (pulled)");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      // A code index exists → the reindex may judge anchor freshness.
      store.beginGeneration("code");
      store.publishGeneration("code");
      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("delta");
      expect(res.added).toBe(1);
      // Pre-fix the delta path never recomputed drift → this stayed clean-active.
      const m = store.getMemory("mem:01FASTALE000000000000000A");
      expect(m?.driftReason).toBe("target-removed");
      expect(m?.status).toBe("needs-review"); // composeStatus (A5)
      expect(store.openStaleSuspects("mem:01FASTALE000000000000000A").length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  test("F-B: catch-up exclusion is per-event — a still-committed memory's new store-only retire survives", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    const A = "mem:01FBMEMA0000000000000000A";
    const B = "mem:01FBMEMB0000000000000000A";
    files.appendMemory("mainline", memEntry({ memoryId: A, gist: "still-committed keeper" }));
    files.appendMemory("mainline", memEntry({ memoryId: B, gist: "will be redacted" }));
    const oldTip = commit("ctx: two memories");

    const store = openStore({ projectDir: repo, home: join(root, "home"), now });
    try {
      reindexMemoryFromFiles(store, files); // store now holds A + B (create events)
      // A NEW store-only lifecycle event lands on the still-committed A.
      store.appendMemoryEvent({
        memoryId: A,
        verb: "retire",
        actor: "cli",
        carrier: "cli",
        method: "explicit-key",
        authority: "confirmed",
      });

      // A human redacts B (removes its line) → the pull sees a non-append shape →
      // the reset fallback runs catch-up with the old committed ids as excludeIds.
      const logPath = join(repo, ".contexa", "memory", "log.md");
      const kept = readFileSync(logPath, "utf8")
        .split("\n")
        .filter((l) => l.includes("01FBMEMA0000000000000000A"))
        .join("\n");
      writeFileSync(logPath, `${kept}\n`, "utf8");
      const newTip = commit("ctx: redact B");

      const res = pullDeltaReindex(store, files, { projectRoot: repo, oldTip, newTip });
      expect(res.mode).toBe("full-fallback");
      // (i) A survives AND its new store-only retire was exported + folded (pre-fix
      //     the whole memory was skipped because its create id was in excludeIds).
      expect(
        files.readDecisions("mainline").some((d) => d.verb === "retire" && d.memoryId === A),
      ).toBe(true);
      expect(store.getMemory(A)?.status).toBe("retired");
      // (ii) B (committed-then-removed) is purged, not re-exported.
      expect(store.getMemory(B)).toBeUndefined();
      expect(files.readMemories("mainline").map((m) => m.memoryId)).not.toContain(B);
    } finally {
      store.close();
    }
  });

  test("F-C: an overlay dec on a mainline-owned id is shadowed (non-opt-out), but folds under opt-out", () => {
    const ctx = join(repo, ".contexa");
    const writer = new MemoryFiles(ctx); // lay down the literal files (not opt-out)
    const X = "mem:01FCMEMX0000000000000000A";
    writer.appendMemory("mainline", memEntry({ memoryId: X, gist: "committed active memory" }));
    writer.appendDecision("overlay", {
      eventId: "01FCRETIRE",
      at: (clock += 1000),
      memoryId: X,
      verb: "retire",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
    });

    // Non-opt-out reindex: MAINLINE wins → X stays active; the overlay dec is
    // shadowed + counted (pre-fix it was ingested and flipped X to retired).
    const a = openStore({ projectDir: repo, home: join(root, "a"), now });
    try {
      const report = reindexMemoryFromFiles(a, new MemoryFiles(ctx));
      expect(a.getMemory(X)?.status).toBe("active");
      expect(report.shadowedOverlay).toBe(1);
    } finally {
      a.close();
    }

    // Opt-out repo: every legit decision is routed to the overlay, so it must FOLD.
    const b = openStore({ projectDir: repo, home: join(root, "b"), now });
    try {
      reindexMemoryFromFiles(b, new MemoryFiles(ctx, true /* localOnly */));
      expect(b.getMemory(X)?.status).toBe("retired");
    } finally {
      b.close();
    }
  });
});
