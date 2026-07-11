/**
 * R-slice acceptance — claim-serving integrity (CONTEXA-IMPL §8; Appendix A
 * DR-02/05/09 for Phase 1). One file per phase group; grows as later phases land.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStore, type Store } from "../../src/store/store.ts";
import { openDatabase } from "../../src/store/sqlite.ts";
import { runMigrations } from "../../src/store/migrate.ts";
import { trustFor, memoryTrustFor } from "../../src/store/trust.ts";
import { cleanupTempDir, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

const REAL_MIGRATIONS = fileURLToPath(new URL("../../src/store/migrations/", import.meta.url));

describe("R-slice Phase 1: derivation+confidence split (DR-02)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-rslice-");
    repo = makeGitFixture(root);
    home = join(root, "contexa-home");
    store = openStore({ projectDir: repo, now: () => 1_000_000, home });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  const addMemory = (entityId: string, origin: Parameters<Store["writeMemory"]>[0]["origin"]) => {
    store.upsertEntity({
      id: entityId,
      kind: "memory",
      name: entityId,
      locator: { t: "store" },
      gen: 1,
    });
    store.writeMemory({ entityId, gist: "a note", origin, authority: "confirmed" });
  };

  test("A1 (DR-02): an OBSERVED claim splits to OBSERVED + LIKELY (not from the legacy enum)", () => {
    const id = store.addClaim({
      subject: "file:a.ts",
      predicate: "contains",
      carrier: "tree-sitter",
      method: "structural",
      authority: "observed",
      gen: 1,
    });
    const c = store.getClaim(id)!;
    expect(c.derivation).toBe("OBSERVED");
    expect(c.confidence).toBe("LIKELY");
    expect(c.authority).toBe("observed"); // shadow preserved (D-SHADOW)
  });

  test("A1 (DR-02): a semantic-proposal claim splits to INFERRED + POSSIBLE", () => {
    const id = store.addClaim({
      subject: "doc:x",
      predicate: "mentions",
      carrier: "files",
      method: "semantic-proposal",
      authority: "inferred",
      gen: 1,
    });
    const c = store.getClaim(id)!;
    expect(c.derivation).toBe("INFERRED");
    expect(c.confidence).toBe("POSSIBLE");
  });

  test("A1 (DR-02): a declared (remember) claim splits to DECLARED + LIKELY", () => {
    const id = store.addClaim({
      subject: "mem:1",
      predicate: "asserts",
      carrier: "remember",
      method: "explicit-key",
      authority: "confirmed",
      gen: 1,
    });
    const c = store.getClaim(id)!;
    expect(c.derivation).toBe("DECLARED");
    expect(c.confidence).toBe("LIKELY");
  });

  test("A1 (DR-02): ambiguous provenance stays unknown (null/null), never a likely fact", () => {
    const id = store.addClaim({
      subject: "mem:legacy",
      predicate: "x",
      carrier: "migration",
      method: "structural",
      authority: "derived",
      gen: 1,
    });
    const c = store.getClaim(id)!;
    expect(c.derivation).toBeNull();
    expect(c.confidence).toBeNull();
  });

  test("A1 (DR-02) PROPERTY: trustFor never returns CONFIRMED (needs corroboration)", () => {
    const carriers = [
      "git",
      "files",
      "tree-sitter",
      "scip",
      "remember",
      "host:claude",
      "migration",
    ];
    const methods = [
      "explicit-key",
      "path-match",
      "symbol-match",
      "rename-tracked",
      "structural",
      "semantic-proposal",
    ];
    for (const carrier of carriers) {
      for (const method of methods) {
        expect(trustFor(carrier, method).confidence).not.toBe("CONFIRMED");
      }
    }
    for (const origin of ["remember", "remember-local", "human-note", "host-import:x", "?"]) {
      expect(memoryTrustFor(origin).confidence).not.toBe("CONFIRMED");
    }
  });

  test("A1 (DR-02) PROPERTY: no persisted claim/memory/event row is CONFIRMED", () => {
    store.addClaim({
      subject: "file:z",
      predicate: "contains",
      carrier: "tree-sitter",
      method: "structural",
      authority: "observed",
      gen: 1,
    });
    addMemory("mem:p1", "remember");
    store.appendMemoryEvent({
      memoryId: "mem:p1",
      verb: "confirm",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
    });
    expect(store.getClaim(1)!.confidence).not.toBe("CONFIRMED");
    for (const m of store.allMemories()) expect(m.confidence).not.toBe("CONFIRMED");
    for (const e of store.allMemoryEvents()) expect(e.confidence).not.toBe("CONFIRMED");
  });

  test("A6 (DR-02): a remember-origin memory row is DECLARED + LIKELY", () => {
    addMemory("mem:decl", "remember");
    const row = store.getMemory("mem:decl")!;
    expect(row.derivation).toBe("DECLARED");
    expect(row.confidence).toBe("LIKELY");
  });

  test("A6 (DR-02): a host-import memory row is DECLARED + POSSIBLE (unverified)", () => {
    addMemory("mem:imp", "host-import:claude-code");
    const row = store.getMemory("mem:imp")!;
    expect(row.derivation).toBe("DECLARED");
    expect(row.confidence).toBe("POSSIBLE");
  });

  test("DR-05 schema half: memory disclosure defaults to local", () => {
    addMemory("mem:disc", "remember");
    expect(store.getMemory("mem:disc")!.disclosure).toBe("local");
  });
});

describe("R-slice Phase 1: DR-09 dead columns cut + DR-02 backfill (migration 006)", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir("ctx-rslice-mig-");
  });
  afterEach(() => cleanupTempDir(dir));

  test("DR-09: served_count / last_served dropped; DR-02/05 columns added", () => {
    const db = openDatabase(join(dir, "store.sqlite"));
    runMigrations(db);
    const cols = (db.prepare("PRAGMA table_info(memory)").all() as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(cols).not.toContain("served_count");
    expect(cols).not.toContain("last_served");
    expect(cols).toEqual(expect.arrayContaining(["derivation", "confidence", "disclosure"]));
    db.close();
  });

  test("DR-02 backfill: pre-006 claim + memory + event rows are split from carrier+method", () => {
    // Apply migrations 001..005 only (pre-R-slice), seed legacy rows, then apply
    // the full set (006 lands) and assert the backfill == trustFor / memoryTrustFor.
    const only005 = join(dir, "m005");
    mkdirSync(only005);
    for (const f of readdirSync(REAL_MIGRATIONS)) {
      if (/^00[1-5]-/.test(f)) copyFileSync(join(REAL_MIGRATIONS, f), join(only005, f));
    }
    const db = openDatabase(join(dir, "store.sqlite"));
    expect(runMigrations(db, only005).applied).toEqual([1, 2, 3, 4, 5]);

    db.prepare(
      `INSERT INTO claims (subject,predicate,object,carrier,locus,method,authority,at,gen)
       VALUES ('s','p',NULL,'git',NULL,'structural','observed',1,1),
              ('s2','p',NULL,'files',NULL,'semantic-proposal','inferred',1,1)`,
    ).run();
    db.prepare(
      "INSERT INTO entities (id,kind,name,locator,attrs,first_seen,last_verified,gen) VALUES ('mem:L','memory','mem:L','{\"t\":\"store\"}','{}',1,1,1)",
    ).run();
    db.prepare(
      "INSERT INTO memory (entity_id,gist,origin,authority,status) VALUES ('mem:L','g','host-import:claude-code','confirmed','active')",
    ).run();
    db.prepare(
      `INSERT INTO memory_events (id,memory_id,verb,actor,refs,carrier,method,authority,at)
       VALUES ('E1','mem:L','create','agent','{}','host-import:claude-code','explicit-key','inferred',1)`,
    ).run();

    // Land 006 (full migrations dir).
    expect(runMigrations(db).applied).toEqual([6]);

    const c1 = db.prepare("SELECT derivation,confidence FROM claims WHERE subject='s'").get() as {
      derivation: string | null;
      confidence: string | null;
    };
    expect(c1).toEqual(trustFor("git", "structural"));
    const c2 = db.prepare("SELECT derivation,confidence FROM claims WHERE subject='s2'").get() as {
      derivation: string | null;
      confidence: string | null;
    };
    expect(c2).toEqual(trustFor("files", "semantic-proposal"));
    const m = db
      .prepare("SELECT derivation,confidence,disclosure FROM memory WHERE entity_id='mem:L'")
      .get() as {
      derivation: string | null;
      confidence: string | null;
      disclosure: string;
    };
    expect({ derivation: m.derivation, confidence: m.confidence }).toEqual(
      memoryTrustFor("host-import:claude-code"),
    );
    expect(m.disclosure).toBe("local"); // DR-05 default
    const e = db.prepare("SELECT derivation,confidence FROM memory_events WHERE id='E1'").get() as {
      derivation: string | null;
      confidence: string | null;
    };
    expect(e).toEqual(trustFor("host-import:claude-code", "explicit-key", "agent"));
    db.close();
  });
});
