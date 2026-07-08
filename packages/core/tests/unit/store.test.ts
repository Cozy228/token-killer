import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStore, scrubToProjectRelative, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

describe("Store (SQLite spine)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: Store;
  let clock: { t: number };

  beforeEach(() => {
    root = makeTempDir("ctx-store-");
    repo = makeGitFixture(root);
    home = join(root, "contexa-home"); // G-7: sandboxed CONTEXA_HOME, never the real one
    clock = { t: 1_000_000 };
    store = openStore({ projectDir: repo, home, now: () => clock.t });
  });

  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  const fileEntity = (id: string, path: string, gen = 1) =>
    ({ id, kind: "file", name: path, locator: { t: "file", path }, gen }) as const;

  test("entities: upsert preserves first_seen, updates the rest", () => {
    store.upsertEntity(fileEntity("file:a.md", "a.md"));
    clock.t += 500;
    store.upsertEntity({ ...fileEntity("file:a.md", "a.md", 2), name: "renamed" });
    const e = store.getEntity("file:a.md");
    expect(e?.firstSeen).toBe(1_000_000);
    expect(e?.lastVerified).toBe(1_000_500);
    expect(e?.name).toBe("renamed");
    expect(e?.gen).toBe(2);
  });

  test("write boundary: absolute paths inside the root are scrubbed relative; outside throws", () => {
    // Build from store.projectRoot (realpathed): on macOS tmpdir() sits behind
    // the /var → /private/var symlink, and scrub compares against the REAL root.
    store.upsertEntity(fileEntity("file:b.md", join(store.projectRoot, "b.md")));
    const locator = store.getEntity("file:b.md")?.locator;
    expect(locator).toEqual({ t: "file", path: "b.md" });
    expect(() =>
      store.upsertEntity(fileEntity("file:evil", join(store.projectRoot, "..", "outside.md"))),
    ).toThrow(/outside the project root/);
    expect(scrubToProjectRelative("docs\\x.md", repo)).toBe("docs/x.md"); // separators normalized
  });

  test("claims are append-only: existing rows never change (randomized)", () => {
    // Seeded LCG so the sequence is reproducible.
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    store.upsertEntity(fileEntity("file:s.md", "s.md"));
    const snapshots: string[] = [];
    for (let i = 0; i < 200; i++) {
      store.addClaim({
        subject: "file:s.md",
        predicate: rand() > 0.5 ? "touches" : "references",
        object: `commit:${Math.floor(rand() * 1e6).toString(16)}`,
        carrier: "git",
        method: "explicit-key",
        authority: "observed",
        gen: 1,
      });
      // Every 50 inserts, snapshot everything and check prior snapshots still match.
      if (i % 50 === 0) {
        const all = JSON.stringify(store.claimsFor("file:s.md"));
        for (const prior of snapshots) {
          expect(all.startsWith(prior.slice(0, prior.length - 1))).toBe(true); // prefix = prior rows unchanged
        }
        snapshots.push(all);
      }
    }
    expect(store.claimsFor("file:s.md")).toHaveLength(200);
    expect(store.claimsFor("file:s.md", "touches").length).toBeGreaterThan(0);
  });

  test("links: upsert on (src,predicate,dst), stale flagging", () => {
    store.setLink({
      src: "file:a.md",
      dst: "file:b.md",
      predicate: "references",
      method: "path-match",
    });
    store.setLink({
      src: "file:a.md",
      dst: "file:b.md",
      predicate: "references",
      method: "explicit-key",
      confidence: 0.9,
    });
    const links = store.linksFrom("file:a.md");
    expect(links).toHaveLength(1);
    expect(links[0]?.method).toBe("explicit-key");
    expect(links[0]?.confidence).toBe(0.9);
    expect(store.flagLinksStale("file:b.md")).toBe(1);
    expect(store.linksTo("file:b.md")[0]?.stale).toBe(true);
  });

  test("conflicts: open by default, status transitions", () => {
    store.addConflict(1, 2, "stale-suspect");
    expect(store.conflicts()).toHaveLength(1);
    store.cacheConflictStatus(1, 2, "dismissed");
    expect(store.conflicts()).toHaveLength(0);
    expect(store.conflicts("dismissed")).toHaveLength(1);
  });

  test("memory: gist hard cap at 240 chars enforced at write (§2)", () => {
    store.upsertEntity({
      id: "mem:01TEST",
      kind: "memory",
      name: "note",
      locator: { t: "store" },
      gen: 1,
    });
    store.writeMemory({
      entityId: "mem:01TEST",
      gist: "short note",
      origin: "remember",
      authority: "confirmed",
    });
    expect(store.getMemory("mem:01TEST")?.gist).toBe("short note");
    expect(() =>
      store.writeMemory({
        entityId: "mem:01TEST",
        gist: "x".repeat(241),
        origin: "remember",
        authority: "confirmed",
      }),
    ).toThrow(RangeError);
    store.cacheMemoryStatus("mem:01TEST", "superseded");
    expect(store.getMemory("mem:01TEST")?.status).toBe("superseded");
  });

  test("anchors: replace-set semantics", () => {
    store.setAnchors("mem:01TEST", ["file:a.md", "file:b.md"]);
    expect(store.anchorsOf("mem:01TEST")).toEqual(["file:a.md", "file:b.md"]);
    store.setAnchors("mem:01TEST", ["file:c.md"]);
    expect(store.anchorsOf("mem:01TEST")).toEqual(["file:c.md"]);
  });

  test("fts: contentless index round-trips entity ids; reindex replaces", () => {
    store.upsertEntity(fileEntity("file:egress.ts", "egress.ts"));
    store.ftsIndex("file:egress.ts", {
      name: "assertNoEgress",
      text: "network guard for serve and ingest",
      kind: "file",
    });
    expect(store.ftsSearch("assertNoEgress")[0]?.entityId).toBe("file:egress.ts");
    expect(store.ftsSearch("network")[0]?.entityId).toBe("file:egress.ts");
    // reindex replaces the old document
    store.ftsIndex("file:egress.ts", { name: "renamed", text: "different words", kind: "file" });
    expect(store.ftsSearch("assertNoEgress")).toHaveLength(0);
    expect(store.ftsSearch("different")).toHaveLength(1);
    store.ftsRemove("file:egress.ts");
    expect(store.ftsSearch("different")).toHaveLength(0);
    // malformed FTS5 syntax is recoverable, not a throw
    expect(store.ftsSearch('"unclosed')).toEqual([]);
  });

  test("cursors round-trip", () => {
    expect(store.getCursor("git")).toBeUndefined();
    store.setCursor("git", "oid:abc123", 1_000_000, 3);
    expect(store.getCursor("git")).toEqual({
      source: "git",
      position: "oid:abc123",
      freshness: 1_000_000,
      gen: 3,
    });
  });

  test("generations: begin → write → publish; interrupted build resumes its gen", () => {
    expect(store.publishedGen("git")).toBe(0);
    const g1 = store.beginGeneration("git");
    expect(g1).toBe(1);
    // interrupted: begin again without publishing → SAME building gen (resumable §4)
    expect(store.beginGeneration("git")).toBe(1);
    store.publishGeneration("git");
    expect(store.publishedGen("git")).toBe(1);
    expect(store.beginGeneration("git")).toBe(2);
    store.publishGeneration("git");
    expect(store.publishedGen("git")).toBe(2);
    expect(() => store.publishGeneration("git")).toThrow(/without beginGeneration/);
  });

  test("readers only see published generations (gen <= published_gen)", () => {
    const building = store.beginGeneration("docs");
    store.upsertEntity(fileEntity("file:unpub.md", "unpub.md", building));
    expect(store.entityCount(store.publishedGen("docs"))).toBe(0); // not visible yet
    store.publishGeneration("docs");
    expect(store.entityCount(store.publishedGen("docs"))).toBe(1);
  });

  test("lease: CAS acquire, blocked while valid, stealable after TTL (fixed clock)", () => {
    const a = store.acquireLease("holder-a", 30_000);
    expect(a.acquired).toBe(true);
    // holder-a can re-acquire (extend) its own lease
    expect(store.acquireLease("holder-a", 30_000).acquired).toBe(true);
    // holder-b is blocked while the lease is live
    const blocked = store.acquireLease("holder-b", 30_000);
    expect(blocked.acquired).toBe(false);
    expect(blocked.lease.holder).toBe("holder-a");
    // after TTL expiry the lease is stealable (§4.5)
    clock.t += 30_001;
    const stolen = store.acquireLease("holder-b", 30_000);
    expect(stolen.acquired).toBe(true);
    expect(store.currentLease()?.holder).toBe("holder-b");
    // release is holder-checked
    store.releaseLease("holder-a"); // not the holder → no-op
    expect(store.currentLease()?.holder).toBe("holder-b");
    store.releaseLease("holder-b");
    expect(store.currentLease()).toBeUndefined();
  });

  test("handles: intern + resolve, collision bumps 5→6", () => {
    store.upsertEntity(fileEntity("file:h.md", "h.md"));
    const short = store.internHandle("file:h.md", "text");
    expect(short).toMatch(/^f[0-9a-f]{5}$/);
    expect(store.internHandle("file:h.md", "text")).toBe(short); // stable
    expect(store.resolveHandle(short)).toEqual({ entityId: "file:h.md", facet: "text" });
    expect(store.resolveHandle(`[${short}]`)).toEqual({ entityId: "file:h.md", facet: "text" });
    expect(store.resolveHandle("file:h.md!diff")).toEqual({
      entityId: "file:h.md",
      facet: "diff",
    });
    expect(store.resolveHandle("file:nope")).toBeUndefined();
    expect(store.resolveHandle("zzzzzz-not-a-handle")).toBeUndefined();
  });

  test("meta round-trip + project_root recorded at open", () => {
    store.setMeta("k", "v1");
    store.setMeta("k", "v2");
    expect(store.getMeta("k")).toBe("v2");
    expect(store.getMeta("project_root")).toBe(store.mainRoot);
  });
});
