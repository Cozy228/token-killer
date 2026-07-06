/**
 * Slice 2c — Fingerprint invalidation + incremental correctness trio
 * (M2-ACCEPTANCE.md "2c"). Owns B3-cosmetic · B3-drift · B3-boundary ·
 * B3-shadow · B3-shrink.
 *
 * Deterministic CI tier (CTX-IMPL §10): script-generated fixture repos in temp
 * dirs — a cosmetic-vs-structural edit, an (import-based) barrel re-export, a
 * same-basename/different-ext shadow, and a truncated-extraction simulation. The
 * living-repo ⚠ evidence (a real symbol + the fingerprint on real content) is
 * recorded in the slice report via explicit commands.
 *
 * ⚠ verify-at-wiring values are asserted here and echoed in the report:
 *   • B3-cosmetic: claim + link counts unchanged across the cosmetic edit, and
 *     the anchored symbol's entity (gen + content_hash) is byte-stable.
 *   • B3-drift: the fixture symbol `sym:drift.ts#target`, an anchored `remember`
 *     note, and the observed reason class per edit (body-changed /
 *     signature-changed / signature-changed on an overload re-key).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CodeSourceAdapter, type CodeParserLike } from "../../src/ingest/code/adapter.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { remember } from "../../src/memory/remember.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import type { Budget, IngestResult } from "../../src/ingest/adapter.ts";
import type { ExtractResult } from "../../src/extract/code/symbol.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };

let root: string;
let proj: string;
let store: Store;

beforeEach(() => {
  root = makeTempDir("ctx-2c-");
  proj = join(root, "proj");
  mkdirSync(proj, { recursive: true });
  store = openStore({ projectDir: proj, home: join(root, "home") });
});
afterEach(() => {
  store.close();
  cleanupTempDir(root);
});

function write(rel: string, content: string): void {
  writeFileSync(join(proj, rel), content, "utf8");
}

async function ingest(adapter: CodeSourceAdapter): Promise<IngestResult> {
  clearScanCache(); // the fixture tree is mutated between passes (§4.2 TTL)
  const dirty = await adapter.dirtyCheck(store);
  return adapter.ingest(store, dirty, MAX_BUDGET);
}

/** Raw claim/link counts (no store enumeration API — a read-only 2nd connection,
 *  WAL readers never block; matches the 1b/2a test pattern). */
function claimLinkCounts(): { claims: number; links: number } {
  const db = new DatabaseSync(store.dbPath);
  db.exec("PRAGMA busy_timeout=5000");
  const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  const out = {
    claims: n("SELECT COUNT(*) n FROM claims"),
    links: n("SELECT COUNT(*) n FROM links"),
  };
  db.close();
  return out;
}

function reasonClasses(memId: string): string[] {
  return store.claimsFor(memId, "stale-reason").map((c) => c.object ?? "");
}

describe("acceptance: 2c fingerprint invalidation + incremental trio", () => {
  // -------------------------------------------------------------------------
  test("B3-cosmetic: reformat/comment-only edit → structural fingerprint COSMETIC → hashes updated, NO re-link/invalidation cascade, memory anchors untouched", async () => {
    // `anchored`'s body (lines 2-4) is byte-identical across the edit; only the
    // header/separator comments and `other`'s intra-line whitespace change.
    const ORIGINAL =
      `// file header\n` +
      `export function anchored(x: number): number {\n` +
      `  return x * 2;\n` +
      `}\n` +
      `\n` +
      `// separator\n` +
      `export function other(y: number): number {\n` +
      `  return y + 1;\n` +
      `}\n`;
    const COSMETIC =
      `//   file header, reworded but still just a comment\n` +
      `export function anchored(x: number): number {\n` +
      `  return x * 2;\n` +
      `}\n` +
      `\n` +
      `//   separator, also reworded\n` +
      `export function other(y: number):    number {\n` +
      `  return   y + 1;\n` +
      `}\n`;

    write("mod.ts", ORIGINAL);
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await ingest(adapter);

    const anchoredId = "sym:mod.ts#anchored";
    expect(store.getEntity(anchoredId)?.kind).toBe("symbol");
    const mem = remember(store, { note: "anchored doubles on purpose", anchors: [anchoredId] });
    expect(mem.ok).toBe(true);
    if (!mem.ok) throw new Error("anchor setup failed");

    const before = claimLinkCounts();
    const anchoredBefore = store.getEntity(anchoredId);

    write("mod.ts", COSMETIC);
    const result = await ingest(adapter);

    // Classified COSMETIC → hash carried, NOTHING re-extracted.
    expect(result.cosmetic).toBe(1);
    expect(result.reingested).toBe(0);
    expect(result.refused).toBeUndefined();
    expect(result.entities).toBe(0);
    expect(result.claims).toBe(0);

    // ⚠ NO cascade: claim + link counts are byte-for-byte unchanged.
    const after = claimLinkCounts();
    expect(after.claims, "no claims added by a cosmetic edit").toBe(before.claims);
    expect(after.links, "no links re-resolved by a cosmetic edit").toBe(before.links);

    // The anchored symbol's entity is untouched (same generation + content hash).
    const anchoredAfter = store.getEntity(anchoredId);
    expect(anchoredAfter?.gen).toBe(anchoredBefore?.gen);
    expect(anchoredAfter?.contentHash).toBe(anchoredBefore?.contentHash);

    // Memory anchor untouched.
    expect(store.getMemory(mem.entityId)?.status).toBe("active");
    expect(reasonClasses(mem.entityId)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  test("B3-drift: signature/body change to an anchored symbol → STRUCTURAL → anchored memory needs-review, reason-classed signature-changed/body-changed (the §9 anchor-drift item)", async () => {
    const symId = "sym:drift.ts#target";
    const adapter = new CodeSourceAdapter({ inProcess: true });

    // (a) BODY change: same id + arity, body hash differs → body-changed.
    write("drift.ts", `export function target(a: number): number {\n  return a + 1;\n}\n`);
    await ingest(adapter);
    expect(store.getEntity(symId)?.attrs.arity).toBe(1);
    const memBody = remember(store, { note: "target adds one", anchors: [symId] });
    if (!memBody.ok) throw new Error("body-drift anchor setup failed");
    write("drift.ts", `export function target(a: number): number {\n  return a + 999;\n}\n`);
    const bodyResult = await ingest(adapter);
    expect(bodyResult.driftFlagged).toBeGreaterThanOrEqual(1);
    // A5 (E7): a body-only change is NOISE-controlled → down-rank only, NOT a
    // status flip. The reason claim is still recorded (it powers the rank
    // freshness penalty) and a stale-suspect conflict is filed, but the memory
    // stays whatever it was (here: active) rather than flipping to needs-review.
    expect(store.getMemory(memBody.entityId)?.status).toBe("active");
    expect(reasonClasses(memBody.entityId)).toContain("body-changed");
    const bodyConflict = store
      .conflicts("open")
      .filter((c) => c.kind === "stale-suspect")
      .find((c) => store.getClaim(c.a)?.subject === memBody.entityId);
    expect(bodyConflict, "body drift files a stale-suspect conflict").toBeDefined();
    expect(store.getClaim(bodyConflict!.b)?.object).toBe("body-changed");

    // (b) SIGNATURE change (arity): same id, arity 1→2 → signature-changed.
    write("drift.ts", `export function target(a: number): number {\n  return a + 999;\n}\n`);
    await ingest(adapter); // settle (no change) — ensures a clean baseline read
    const memSig = remember(store, { note: "target's arity matters", anchors: [symId] });
    if (!memSig.ok) throw new Error("signature-drift anchor setup failed");
    write(
      "drift.ts",
      `export function target(a: number, loud: boolean): number {\n  return a + 999;\n}\n`,
    );
    await ingest(adapter);
    expect(store.getEntity(symId)?.attrs.arity).toBe(2); // same id, new arity
    expect(store.getMemory(memSig.entityId)?.status).toBe("needs-review");
    expect(reasonClasses(memSig.entityId)).toContain("signature-changed");

    // (c) OVERLOAD re-key: adding a second `target` retires the bare id
    // `sym:drift.ts#target` → `~1`/`~2`; the anchor to the old id is
    // signature-changed (never silently stranded — F1).
    write("drift2.ts", `export function target(a: number): number {\n  return a + 1;\n}\n`);
    await ingest(adapter);
    const rekeyId = "sym:drift2.ts#target";
    const memRekey = remember(store, { note: "target is unique for now", anchors: [rekeyId] });
    if (!memRekey.ok) throw new Error("re-key anchor setup failed");
    write(
      "drift2.ts",
      `export function target(a: number): number {\n  return a + 1;\n}\n` +
        `export function target(a: number, b: number): number {\n  return a + b;\n}\n`,
    );
    await ingest(adapter);
    // Entities are never deleted (2a) — "retired" means the bare id is dropped
    // from the file's current `contains` graph (2b owns the retire/rename LINK);
    // the disambiguated overloads take its place.
    expect(store.getEntity("sym:drift2.ts#target~1")?.kind).toBe("symbol");
    expect(store.getEntity("sym:drift2.ts#target~2")?.kind).toBe("symbol");
    const contained = store.linksFrom("file:drift2.ts", "contains").map((l) => l.dst);
    expect(contained, "bare id no longer in the current graph").not.toContain(rekeyId);
    expect(contained).toEqual(
      expect.arrayContaining(["sym:drift2.ts#target~1", "sym:drift2.ts#target~2"]),
    );
    // The anchor to the retired id is flagged, never silently stranded (F1).
    expect(store.getMemory(memRekey.entityId)?.status).toBe("needs-review");
    expect(reasonClasses(memRekey.entityId)).toContain("signature-changed");
  });

  // -------------------------------------------------------------------------
  test("B3-boundary: 1-hop boundary expansion — editing a barrel re-export re-ingests the unchanged-side file whose edge crossed the boundary", async () => {
    // Import-based barrel (2a captures `import ... from`, not `export ... from`).
    write("leaf.ts", `export function leafFn(): number {\n  return 1;\n}\n`);
    write("index.ts", `import { leafFn } from "./leaf";\nexport { leafFn };\n`);
    write(
      "app.ts",
      `import { leafFn } from "./index";\nexport function useApp(): number {\n  return leafFn();\n}\n`,
    );
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await ingest(adapter);

    // Baseline edges present.
    expect(store.linksFrom("file:app.ts", "imports").map((l) => l.dst)).toContain("file:index.ts");
    expect(store.linksFrom("file:index.ts", "imports").map((l) => l.dst)).toContain("file:leaf.ts");
    const appGenBefore = store.getEntity("file:app.ts")?.gen ?? 0;
    const leafGenBefore = store.getEntity("file:leaf.ts")?.gen ?? 0;

    // Edit ONLY the barrel (structurally: add a re-export const). app.ts and
    // leaf.ts bytes never change, but both sit on the barrel's `imports` edges.
    write(
      "index.ts",
      `import { leafFn } from "./leaf";\nexport { leafFn };\nexport const BARREL_VERSION = 2;\n`,
    );
    const result = await ingest(adapter);

    // The 1-hop boundary dragged both unchanged-side files back in.
    expect(result.boundaryExpanded, "app + leaf pulled across the boundary").toBe(2);
    expect(result.reingested).toBe(3);
    expect(store.getEntity("file:app.ts")?.gen).toBeGreaterThan(appGenBefore);
    expect(store.getEntity("file:leaf.ts")?.gen).toBeGreaterThan(leafGenBefore);
  });

  // -------------------------------------------------------------------------
  test("B3-shadow: adding a file that can steal an existing import/mention resolution triggers re-resolution of pre-existing files (same-basename/different-ext)", async () => {
    write(
      "app.ts",
      `import { util } from "./util";\nexport function useUtil(): number {\n  return util();\n}\n`,
    );
    write("util.js", `export function util() {\n  return 1;\n}\n`);
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await ingest(adapter);

    // Baseline: `./util` resolves to the only candidate, util.js.
    expect(store.linksFrom("file:app.ts", "imports").map((l) => l.dst)).toEqual(["file:util.js"]);
    const appGenBefore = store.getEntity("file:app.ts")?.gen ?? 0;

    // Add a higher-priority sibling — util.ts shadows util.js for `./util`.
    write("util.ts", `export function util(): number {\n  return 2;\n}\n`);
    const result = await ingest(adapter);

    // The pre-existing importer was re-resolved (shadow expansion), and its edge
    // moved to the shadowing file — the old target is gone, not merely added-to.
    expect(result.shadowExpanded, "app.ts re-resolved").toBe(1);
    expect(store.getEntity("file:app.ts")?.gen).toBeGreaterThan(appGenBefore);
    const targets = store.linksFrom("file:app.ts", "imports").map((l) => l.dst);
    expect(targets).toEqual(["file:util.ts"]);
    expect(targets).not.toContain("file:util.js");
  });

  // -------------------------------------------------------------------------
  test("B3-shrink: an extraction pass producing a drastically smaller symbol graph without observed deletions refuses to publish; success-shaped report discloses the refusal", async () => {
    write(
      "a.ts",
      `export function a1(): number {\n  return 1;\n}\nexport function a2(): number {\n  return 2;\n}\n`,
    );
    write(
      "b.ts",
      `export function b1(): number {\n  return 1;\n}\nexport function b2(): number {\n  return 2;\n}\n`,
    );
    write(
      "c.ts",
      `export function c1(): number {\n  return 1;\n}\nexport function c2(): number {\n  return 2;\n}\n`,
    );

    const baseline = new CodeSourceAdapter({ inProcess: true });
    await ingest(baseline);
    const publishedBefore = store.publishedGen("code");
    const symbolsBefore = store.countByKind("symbol");
    expect(symbolsBefore, "baseline symbol graph").toBe(6);

    // Make every file dirty (structural body edits), then re-extract through a
    // TRUNCATING parser that returns zero symbols — a silently-broken run.
    write(
      "a.ts",
      `export function a1(): number {\n  return 11;\n}\nexport function a2(): number {\n  return 22;\n}\n`,
    );
    write(
      "b.ts",
      `export function b1(): number {\n  return 11;\n}\nexport function b2(): number {\n  return 22;\n}\n`,
    );
    write(
      "c.ts",
      `export function c1(): number {\n  return 11;\n}\nexport function c2(): number {\n  return 22;\n}\n`,
    );

    const truncatingParser: CodeParserLike = {
      preload: async () => {},
      parse: async (_relPath, _content, langId): Promise<ExtractResult> => ({
        language: langId,
        symbols: [],
        imports: [],
        calls: [],
        hadError: false,
      }),
      close: async () => {},
    };
    const truncating = new CodeSourceAdapter({ parserFactory: () => truncatingParser });
    const result = await ingest(truncating);

    // SUCCESS-shaped refusal (not an error), fully disclosed.
    expect(result.complete).toBe(true);
    expect(result.refused).toBe(true);
    expect(result.refusal?.prevSymbols).toBe(6);
    expect(result.refusal?.projectedSymbols).toBe(0);
    expect(result.refusal?.reason).toMatch(/shrink|truncat/i);

    // Generation stayed on the previous published gen; the graph is intact.
    expect(store.publishedGen("code")).toBe(publishedBefore);
    expect(store.countByKind("symbol", publishedBefore)).toBe(symbolsBefore);
  });

  test("B3-shrink: a truncated re-parse is still refused when an UNRELATED file is deleted the same pass — deletions no longer disable the guard (#9)", async () => {
    write(
      "a.ts",
      `export function a1(): number {\n  return 1;\n}\nexport function a2(): number {\n  return 2;\n}\n`,
    );
    write(
      "b.ts",
      `export function b1(): number {\n  return 1;\n}\nexport function b2(): number {\n  return 2;\n}\n`,
    );
    write(
      "c.ts",
      `export function c1(): number {\n  return 1;\n}\nexport function c2(): number {\n  return 2;\n}\n`,
    );
    write("d.ts", `export function d1(): number {\n  return 1;\n}\n`); // small, unrelated

    await ingest(new CodeSourceAdapter({ inProcess: true }));
    const publishedBefore = store.publishedGen("code");
    const symbolsBefore = store.countByKind("symbol");
    expect(symbolsBefore).toBe(7);

    // Delete the unrelated d.ts (a legitimate deletion) AND truncate a/b/c. The
    // OLD guard disabled itself on any deletion, letting the truncation publish;
    // the reconciled guard measures the re-parsed files only, so it still refuses.
    rmSync(join(proj, "d.ts"));
    write(
      "a.ts",
      `export function a1(): number {\n  return 11;\n}\nexport function a2(): number {\n  return 22;\n}\n`,
    );
    write(
      "b.ts",
      `export function b1(): number {\n  return 11;\n}\nexport function b2(): number {\n  return 22;\n}\n`,
    );
    write(
      "c.ts",
      `export function c1(): number {\n  return 11;\n}\nexport function c2(): number {\n  return 22;\n}\n`,
    );

    const truncatingParser: CodeParserLike = {
      preload: async () => {},
      parse: async (_relPath, _content, langId): Promise<ExtractResult> => ({
        language: langId,
        symbols: [],
        imports: [],
        calls: [],
        hadError: false,
      }),
      close: async () => {},
    };
    const result = await ingest(new CodeSourceAdapter({ parserFactory: () => truncatingParser }));

    expect(result.refused, "deletion must not bypass the shrink guard").toBe(true);
    // Nothing published: the previous generation (incl. d.ts) stays intact.
    expect(store.publishedGen("code")).toBe(publishedBefore);
    expect(store.countByKind("symbol", publishedBefore)).toBe(symbolsBefore);
  });

  test("B3-parsefail: a file that throws on parse keeps its previous symbols AND stays dirty for retry — never frozen clean-but-stale (#3)", async () => {
    write("a.ts", `export function a1(): number {\n  return 1;\n}\n`);
    await ingest(new CodeSourceAdapter({ inProcess: true }));
    expect(store.getEntity("sym:a.ts#a1")?.kind).toBe("symbol");

    // Structurally edit a.ts (adds a2), then re-ingest through a parser that
    // THROWS on it. The old symbol is kept; the new one is not written.
    write(
      "a.ts",
      `export function a1(): number {\n  return 1;\n}\nexport function a2(): number {\n  return 2;\n}\n`,
    );
    const throwingParser: CodeParserLike = {
      preload: async () => {},
      parse: async () => {
        throw new Error("simulated parser crash");
      },
      close: async () => {},
    };
    await ingest(new CodeSourceAdapter({ parserFactory: () => throwingParser }));
    expect(store.getEntity("sym:a.ts#a1")?.kind, "old symbol kept").toBe("symbol");
    expect(store.getEntity("sym:a.ts#a2"), "failed parse wrote nothing new").toBeUndefined();

    // Crucially: a.ts must NOT have been marked clean. The next dirtyCheck still
    // flags it, so a later (working) pass retries and picks up a2.
    clearScanCache();
    const dirty = await new CodeSourceAdapter({ inProcess: true }).dirtyCheck(store);
    expect(dirty.dirty, "parse-failed file stays dirty").toBe(true);

    await ingest(new CodeSourceAdapter({ inProcess: true }));
    expect(store.getEntity("sym:a.ts#a2")?.kind, "retry recovers the new symbol").toBe("symbol");
  });

  test("B3-retire: a renamed-away symbol is dropped from search + the callee index and its `calls` edges are cleared, but its entity survives (2a — #4/#5)", async () => {
    write(
      "target.ts",
      `export function foo(): void {\n  keep();\n}\nexport function keep(): void {}\n`,
    );
    write(
      "caller.ts",
      `import { foo } from "./target";\nexport function caller(): void {\n  foo();\n}\n`,
    );
    await ingest(new CodeSourceAdapter({ inProcess: true }));

    const FOO = "sym:target.ts#foo";
    // Baseline: caller --calls--> foo, foo --calls--> keep, and FTS finds foo.
    expect(store.linksFrom("sym:caller.ts#caller", "calls").map((l) => l.dst)).toContain(FOO);
    expect(store.linksFrom(FOO, "calls").map((l) => l.dst)).toContain("sym:target.ts#keep");
    expect(store.ftsSearch("foo").map((h) => h.entityId)).toContain(FOO);

    // Rename foo → bar. caller (imports target) is boundary-expanded and re-parsed.
    write(
      "target.ts",
      `export function bar(): void {\n  keep();\n}\nexport function keep(): void {}\n`,
    );
    await ingest(new CodeSourceAdapter({ inProcess: true }));

    // #4: the retired id is gone from the callee index (caller's stale `foo()` no
    // longer resolves to it) and from full-text search...
    expect(store.linksFrom("sym:caller.ts#caller", "calls").map((l) => l.dst)).not.toContain(FOO);
    expect(store.ftsSearch("foo").map((h) => h.entityId)).not.toContain(FOO);
    // #5: ...and its own outgoing `calls` edges are cleared.
    expect(store.linksFrom(FOO, "calls")).toHaveLength(0);
    // 2a invariant: the entity itself is NOT deleted (rename-chain / history).
    expect(store.getEntity(FOO)?.kind, "entity survives retirement").toBe("symbol");
    // The new name is a live, searchable symbol.
    expect(store.ftsSearch("bar").map((h) => h.entityId)).toContain("sym:target.ts#bar");
  });
});
