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
import { generationIdentity } from "../../src/store/generation.ts";
import { memoryClaimStatus, memoryStatusAsOf } from "../../src/serve/status.ts";
import { foldStatusAsOf } from "../../src/memory/fold.ts";
import { expandSubgraph, linkConfidence } from "../../src/select/subgraph.ts";
import { snapshotVisibility } from "../../src/select/visibility.ts";
import { freshnessLabel } from "../../src/serve/render.ts";
import { needsReverification, SOURCE_FRESHNESS } from "../../src/serve/freshness.ts";
import { remember } from "../../src/memory/remember.ts";
import { renderAtTier } from "../../src/select/project.ts";
import {
  claimEnvelopeFor,
  renderEnvelopeTerse,
  ACCELERATOR_DISCLOSURE,
} from "../../src/serve/envelope.ts";
import { execFileSync as childExecFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
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

  // ---- DR-03: computed per-claim status view (item 2) ----
  const setStatus = (entityId: string, status: import("../../src/store/types.ts").MemoryStatus) =>
    store.cacheMemoryStatus(entityId, status);
  const st = (entityId: string) => memoryClaimStatus(store, store.getMemory(entityId)!);

  test("A2 (DR-03): active memory → resolved", () => {
    addMemory("mem:s1", "remember");
    expect(st("mem:s1")).toBe("resolved");
  });

  test("A2 (DR-03): needs-review with drift → stale; without drift → unknown", () => {
    addMemory("mem:s2", "remember");
    setStatus("mem:s2", "needs-review");
    expect(st("mem:s2")).toBe("unknown"); // pending confirmation
    store.setMemoryDrift("mem:s2", "body-changed");
    expect(st("mem:s2")).toBe("stale"); // an anchor drifted
  });

  test("A2 (DR-03): unresolvedHere → unavailable; retired → unavailable", () => {
    addMemory("mem:s3", "remember");
    store.setMemoryUnresolvedHere("mem:s3", true);
    expect(st("mem:s3")).toBe("unavailable");
    addMemory("mem:s4", "remember");
    setStatus("mem:s4", "retired");
    expect(st("mem:s4")).toBe("unavailable");
  });

  test("A2 (DR-03): superseded → stale", () => {
    addMemory("mem:s5", "remember");
    setStatus("mem:s5", "superseded");
    expect(st("mem:s5")).toBe("stale");
  });

  test("A2 (DR-03): restricted disclosure → restricted (outranks a stale body)", () => {
    store.upsertEntity({
      id: "mem:s6",
      kind: "memory",
      name: "mem:s6",
      locator: { t: "store" },
      gen: 1,
    });
    store.writeMemory({
      entityId: "mem:s6",
      gist: "secret",
      origin: "remember",
      authority: "confirmed",
      disclosure: "restricted",
    });
    setStatus("mem:s6", "superseded");
    expect(st("mem:s6")).toBe("restricted");
  });

  // ---- DR-10: equivalent as-of recompute path (item 5) ----
  test("A5 (DR-10): status recomputes as-of a past instant from the event log", () => {
    store.upsertEntity({
      id: "mem:asof",
      kind: "memory",
      name: "mem:asof",
      locator: { t: "store" },
      gen: 1,
    });
    // create @100 (active) → retire @200. The current answer is retired; the
    // answer AS OF 150 must still be active (a later event never rewrites history).
    store.appendMemoryEvent({
      id: "01ASOFCREATE0000000000000",
      memoryId: "mem:asof",
      verb: "create",
      actor: "cli",
      refs: { status: "active" },
      carrier: "remember",
      method: "explicit-key",
      authority: "confirmed",
      at: 100,
    });
    store.appendMemoryEvent({
      id: "01ASOFRETIRE0000000000000",
      memoryId: "mem:asof",
      verb: "retire",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
      at: 200,
    });
    expect(memoryStatusAsOf(store, "mem:asof", 150)).toBe("active");
    expect(memoryStatusAsOf(store, "mem:asof", 250)).toBe("retired");
    // pure fold-as-of over an event array (no store) — the equivalent scheme unit.
    expect(foldStatusAsOf(store.memoryEvents("mem:asof"), 99)).toBe("active");
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

describe("R-slice Phase 1: DR-06 generation identity tuple (item 4)", () => {
  let root: string;
  let repo: string;
  let home: string;

  beforeEach(() => {
    root = makeTempDir("ctx-rslice-gen-");
    repo = makeGitFixture(root);
    home = join(root, "contexa-home");
  });
  afterEach(() => cleanupTempDir(root));

  test("A4 (DR-06): identity is sensitive to every tuple component", () => {
    const base = {
      repoRev: "abc",
      worktreeDigest: "wt1",
      schemaVersion: 6,
      policyVersion: 1,
    };
    const id = generationIdentity(base);
    expect(generationIdentity({ ...base, repoRev: "def" })).not.toBe(id);
    expect(generationIdentity({ ...base, worktreeDigest: "wt2" })).not.toBe(id);
    expect(generationIdentity({ ...base, schemaVersion: 7 })).not.toBe(id);
    expect(generationIdentity({ ...base, policyVersion: 2 })).not.toBe(id);
    expect(generationIdentity(base)).toBe(id); // deterministic
  });

  test("A4 (DR-06): a published generation stamps the current identity; same worktree serves", () => {
    const store = openStore({ projectDir: repo, home, worktreeId: "wtA" });
    store.beginGeneration("git");
    store.publishGeneration("git");
    expect(store.publishedGen("git")).toBe(1); // identity matches → visible
    expect(store.generationIdentityOf("git")).toBe(store.currentGenerationIdentity());
    store.close();
  });

  test("A4 (DR-06): two worktrees sharing a shard do NOT cross-serve", () => {
    // Worktree A publishes a git generation into the shared shard.
    const a = openStore({ projectDir: repo, home, worktreeId: "wtA" });
    a.beginGeneration("git");
    a.publishGeneration("git");
    expect(a.publishedGen("git")).toBe(1);
    const shardPath = a.dbPath;
    const aIdentity = a.currentGenerationIdentity();
    a.close();

    // Worktree B opens the SAME shard file (same repo, same shard) with a
    // different worktree digest → the generation A built is rejected: B must not
    // reuse/serve rows built under A's identity.
    const b = openStore({ projectDir: repo, home, worktreeId: "wtB" });
    expect(b.dbPath).toBe(shardPath); // same shard, as real worktrees share
    expect(b.currentGenerationIdentity()).not.toBe(aIdentity);
    expect(b.publishedGen("git")).toBe(0); // DR-06: identity mismatch → not cross-served

    // After B rebuilds under its own identity, B serves again.
    b.beginGeneration("git");
    b.publishGeneration("git");
    expect(b.publishedGen("git")).toBe(2);
    b.close();
  });
});

describe("R-slice Phase 2: freshness wiring (DR-04, item 3)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-rslice-fresh-");
    repo = makeGitFixture(root);
    home = join(root, "contexa-home");
    store = openStore({ projectDir: repo, now: () => 1_000_000, home });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("A3 (DR-04): a stale link is downgraded (traversal + ranking), never full-weight", () => {
    const clean = linkConfidence({ predicate: "calls", confidence: 1.0, stale: false });
    const stale = linkConfidence({ predicate: "calls", confidence: 1.0, stale: true });
    expect(stale).toBeLessThan(clean);
    expect(stale).toBeGreaterThan(0); // downgraded, not excluded
  });

  test("A3 (DR-04): the traversal downgrades an edge once its link goes stale", () => {
    for (const id of ["file:a", "file:b"]) {
      store.upsertEntity({
        id,
        kind: "file",
        name: id,
        locator: { t: "file", path: id.slice(5) },
        gen: 1,
      });
    }
    store.beginGeneration("git");
    store.setLink({
      src: "file:a",
      dst: "file:b",
      predicate: "calls",
      method: "structural",
      confidence: 1.0,
    });
    store.publishGeneration("git");
    const seeds = [{ entityId: "file:a", weight: 1, lexicalScore: 1, named: true }];
    const vis = snapshotVisibility(store);
    const entityOf = (id: string) => store.getEntity(id);
    const before = expandSubgraph(store, seeds, vis, entityOf);
    const edgeBefore = before.edges.find((e) => e.dst === "file:b")!;

    store.flagLinksStale("file:b"); // an endpoint's content drifted
    const after = expandSubgraph(store, seeds, vis, entityOf);
    const edgeAfter = after.edges.find((e) => e.dst === "file:b")!;
    expect(edgeAfter.confidence).toBeLessThan(edgeBefore.confidence);
  });

  test("A3 (DR-04): the header names the index state honestly, NEVER a false 'fresh'", () => {
    expect(freshnessLabel(undefined)).toBe("indexed");
    expect(freshnessLabel(undefined)).not.toBe("fresh");
    const report: import("../../src/ingest/refresh.ts").RefreshReport = {
      status: "reconciling",
      sources: [],
      pendingSources: ["git", "docs"],
      frozenSources: [],
    };
    expect(freshnessLabel(report)).toBe("index-catchup (docs, git)");
    expect(freshnessLabel(report)).not.toContain("fresh");
  });

  test("A3 (DR-04): per-source decay class + re-verification trigger scaffold", () => {
    expect(SOURCE_FRESHNESS.git.decay).toBe("content-hash");
    expect(SOURCE_FRESHNESS.github.decay).toBe("snapshot-ttl");
    // content-hash sources re-verify at ingest → never time-stale.
    expect(needsReverification("git", Number.MAX_SAFE_INTEGER)).toBe(false);
    // a snapshot past its TTL needs re-verification before backing a served claim.
    expect(needsReverification("github", 0)).toBe(false);
    expect(needsReverification("github", 16 * 60_000)).toBe(true);
  });
});

describe("R-slice Phase 3: restricted enforcement (DR-05 serve half, item 7)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: Store;
  const SECRET = "sk-ABCDEFGHIJKLMNOP1234567890"; // openai-key shape (secretGuard)

  beforeEach(() => {
    root = makeTempDir("ctx-rslice-restrict-");
    repo = makeGitFixture(root);
    home = join(root, "contexa-home");
    store = openStore({ projectDir: repo, now: () => 1_000_000, home });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("A7 (DR-05): a secret-shaped MCP note is classified restricted (guard runs off-mainline)", () => {
    const r = remember(store, { surface: "mcp", note: `deploy key is ${SECRET}` });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("remember failed");
    expect(store.getMemory(r.entityId)!.disclosure).toBe("restricted");
  });

  test("A7 (DR-05): a restricted MCP note is NEVER searchable (body out of FTS/MCP)", () => {
    const r = remember(store, { surface: "mcp", note: `token ${SECRET} rotate quarterly` });
    if (!r.ok) throw new Error("remember failed");
    // Neither the secret nor the surrounding gist words are indexed.
    expect(store.ftsSearch("rotate")).toHaveLength(0);
    expect(store.ftsSearch("quarterly")).toHaveLength(0);
    expect(store.ftsSearch(SECRET)).toHaveLength(0);
  });

  test("A7 (DR-05): a restricted note renders a cited withheld outcome, never its body", () => {
    const r = remember(store, { surface: "mcp", note: `secret ${SECRET} here`, detail: SECRET });
    if (!r.ok) throw new Error("remember failed");
    const entity = store.getEntity(r.entityId)!;
    const rendered = renderAtTier(store, entity, r.handle, "full");
    expect(rendered.text).toContain("withheld (restricted)");
    expect(rendered.text).toContain(`[${r.handle}]`); // cited
    expect(rendered.text).not.toContain(SECRET); // body never leaks
  });

  test("A7 (DR-05): a non-secret note is unaffected (local, searchable, rendered)", () => {
    const r = remember(store, { surface: "mcp", note: "ordinary reviewable note about retries" });
    if (!r.ok) throw new Error("remember failed");
    expect(store.getMemory(r.entityId)!.disclosure).toBe("local");
    expect(store.ftsSearch("retries").length).toBeGreaterThanOrEqual(1);
  });
});

describe("R-slice Phase 4: minimum claim envelope (DR-07/DR-01, item 6)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-rslice-env-");
    repo = makeGitFixture(root);
    home = join(root, "contexa-home");
    store = openStore({ projectDir: repo, now: () => 1_000_000, home });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  const mem = (
    entityId: string,
    origin: Parameters<Store["writeMemory"]>[0]["origin"],
    extra?: Partial<Parameters<Store["writeMemory"]>[0]>,
  ) => {
    store.upsertEntity({
      id: entityId,
      kind: "memory",
      name: entityId,
      locator: { t: "store" },
      gen: 1,
    });
    store.writeMemory({ entityId, gist: "note", origin, authority: "confirmed", ...extra });
  };

  test("A6 (DR-07): the envelope carries every §3 axis for a memory claim", () => {
    mem("mem:e1", "remember");
    const env = claimEnvelopeFor(store, store.getEntity("mem:e1")!);
    expect(env.subject).toBe("mem:e1");
    expect(env.evidence.uri).toBe("store:mem:e1");
    expect(env.derivation).toBe("DECLARED");
    expect(env.confidence).toBe("LIKELY");
    expect(env.status).toBe("resolved");
    expect(env.disclosure).toBe("local");
    expect(typeof env.observedAt).toBe("number");
    expect(env.freshness).toBe("content-hash");
  });

  test("A6 (DR-07): a restricted memory's envelope reports restricted status+disclosure", () => {
    mem("mem:e2", "remember", { disclosure: "restricted" });
    const env = claimEnvelopeFor(store, store.getEntity("mem:e2")!);
    expect(env.status).toBe("restricted");
    expect(env.disclosure).toBe("restricted");
  });

  test("A6 (DR-07): a drifted claim's freshness is unknown-until-reverified, status stale", () => {
    mem("mem:e3", "remember");
    store.setMemoryDrift("mem:e3", "body-changed");
    const env = claimEnvelopeFor(store, store.getEntity("mem:e3")!);
    expect(env.status).toBe("stale");
    expect(env.freshness).toBe("unknown-until-reverified");
  });

  test("A6 (DR-07): ambiguous provenance renders '?' glyphs, never a likely fact", () => {
    store.upsertEntity({
      id: "file:x.ts",
      kind: "file",
      name: "x.ts",
      locator: { t: "file", path: "x.ts" },
      gen: 1,
    });
    const env = claimEnvelopeFor(store, store.getEntity("file:x.ts")!);
    expect(env.derivation).toBeNull();
    expect(env.confidence).toBeNull();
    const terse = renderEnvelopeTerse(env);
    expect(terse).toContain("‹?·?·");
    expect(terse).toContain("file:x.ts");
  });

  test("A6 (DR-07): terse render is a compact one-line glyph string", () => {
    mem("mem:e4", "remember");
    const terse = renderEnvelopeTerse(claimEnvelopeFor(store, store.getEntity("mem:e4")!));
    expect(terse).toContain("‹D·L·resolved·");
    expect(terse.split("\n")).toHaveLength(1);
  });

  test("A10 (DR-01): the accelerator-not-validated disclosure exists", () => {
    expect(ACCELERATOR_DISCLOSURE).toMatch(/accelerator/i);
    expect(ACCELERATOR_DISCLOSURE).toMatch(/not validated|not a verified/i);
  });
});

describe("R-slice Phase 5: DR-27 disclosure half — named blind spot (item 11)", () => {
  let root: string;
  let repo: string;
  let store: Store;

  const gitIn = (args: string[]) =>
    childExecFileSync("git", args, {
      cwd: repo,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 15_000,
    });

  beforeEach(() => {
    root = makeTempDir("ctx-rslice-o16-");
    repo = makeGitFixture(root);
    store = openStore({ projectDir: repo, home: join(root, "contexa-home") });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("A11 (DR-27): an unresolved backticked symbol mention is a NAMED blind spot, no spurious link", async () => {
    // A doc backticks a symbol that exists in NO published code → the O-16 path
    // used to `continue` silently. Now it is flagged + counted as a blind spot.
    writeFileSync(
      join(repo, "guide.md"),
      "# Guide\n\nSee `ThisSymbolDoesNotExistAnywhere` for the retry protocol.\n",
    );
    gitIn(["add", "guide.md"]);
    gitIn(["commit", "-q", "-m", "docs: guide"]);
    clearScanCache();
    const docs = new DocsAdapter();
    const result = await docs.ingest(store, await docs.dirtyCheck(store), {
      deadline: Date.now() + 60_000,
      now: () => Date.now(),
    });
    // Named blind spot surfaced in the ingest envelope (never silent).
    expect(result.blindSpots ?? 0).toBeGreaterThanOrEqual(1);
    // Suppressed relation: NO spurious `references` link/claim to a made-up symbol.
    expect(store.linksFrom("file:guide.md", "references")).toHaveLength(0);
    expect(
      store
        .claimsFor("file:guide.md", "references")
        .filter((c) => c.object?.includes("DoesNotExist")),
    ).toHaveLength(0);
  });
});
