/**
 * M3 K1 — the guide projection kernel. Gate = the CENSUS, on the REAL corpus.
 *
 * THE CENSUS HAS NO MAGIC NUMBERS. Every equality below computes BOTH sides from the live
 * store at run time. A hardcoded total (4,498 declarations; 3,809 `contains`) would drift
 * at the next `ctx sync` and start lying — and worse, it would still be GREEN while the
 * kernel silently dropped rows. So: the store side is computed by a DIFFERENT mechanism
 * than the model side, and the two must agree.
 *
 * The real corpus here is THIS repository, ingested by a full `ctx sync` into a temp
 * CONTEXA_HOME (the 2e-perf living-repo pattern). It is the real corpus AND hermetic: it
 * never reads or writes the maintainer's `~/.contexa`.
 *
 * Deliberately NOT asserted anywhere in this file: any count of entities, links,
 * declarations, files or scopes. Those are inputs, not expectations.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { createDefaultRegistry } from "../../src/ingest/registry.ts";
import { RefreshEngine } from "../../src/ingest/refresh.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { buildAtlas } from "../../src/guide/atlas.ts";
import { resolveGeneration } from "../../src/guide/freshness.ts";
import {
  projectConnections,
  projectEvent,
  projectOverview,
  projectScope,
} from "../../src/guide/projections.ts";
import {
  diffForCommits,
  filesInCommit,
  liveCodeFiles,
  retiredSymbolsOf,
  symbolsInFile,
} from "../../src/guide/queries.ts";
import { RELATION_KINDS, RELATION_LAYER, type AtlasModel } from "../../src/guide/types.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import { cleanupTempDir, makeTempDir, git } from "../helpers/sandbox.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
const PKG_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");
const GUIDE_SRC = join(PKG_DIR, "src/guide");

/** The three backbone kinds the census pins exactly (D25). */
const BACKBONE = ["contains", "calls", "imports"] as const;

// ===========================================================================
// Real corpus: a full sync of THIS repo into a sandboxed CONTEXA_HOME.
// ===========================================================================
describe("K1 census — the complete logical Atlas on the real corpus", () => {
  let root: string;
  let store: Store;
  let atlas: AtlasModel;

  beforeAll(async () => {
    root = makeTempDir("ctx-k1-");
    store = openStore({ projectDir: REPO_ROOT, home: join(root, "contexa-home") });
    clearScanCache();
    const registry = createDefaultRegistry({
      code: { inProcess: true },
      git: { symbolTouches: true },
      memory: { contexaRoot: join(root, "contexa-mem") },
    });
    const engine = new RefreshEngine(store, registry, { catchupGateMs: 600_000 });
    await engine.refresh(600_000);
    await engine.background;
    expect(store.entityCount()).toBeGreaterThan(0);
    atlas = buildAtlas(store);
  }, 300_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  /** The commit that touched the most CODE — mechanical, no hand-picked oid. */
  const codeCommit = () =>
    [...store.entitiesByKind("commit")]
      .map((c) => ({
        entity: c,
        code: store
          .linksFrom(c.id, "touches")
          .filter((l) => atlas.declarationById.has(l.dst) || atlas.fileById.has(l.dst)).length,
      }))
      .sort((a, b) => b.code - a.code)[0]!.entity;

  // ---- Completeness of the atoms -----------------------------------------

  test("the atoms are exactly the CONTAINED symbols (D7/D36)", () => {
    // The corrected census. `countByKind("symbol")` counts RETIRED symbols too — symbols
    // that no longer exist in their file — so it is NOT the atom count. The atom set is
    // the set of symbols a `contains` link reaches. Both sides computed live, no magic
    // numbers.
    const containedSymbols = new Set(
      store
        .linksByPredicate("contains")
        .map((l) => l.dst)
        .filter((id) => store.getEntity(id)?.kind === "symbol"),
    );

    expect(atlas.declarations.length).toBe(containedSymbols.size);
    expect(new Set(atlas.declarations.map((d) => d.id))).toEqual(containedSymbols);
    expect(atlas.disclosure.declarationsTotal).toBe(containedSymbols.size);

    // Nothing vanishes without a number: atoms + retired = every symbol row in the store.
    expect(atlas.disclosure.symbolsInStore).toBe(store.countByKind("symbol"));
    expect(atlas.disclosure.declarationsTotal + atlas.disclosure.declarationsRetired).toBe(
      store.countByKind("symbol"),
    );
    expect(atlas.retiredDeclarationIds.length).toBe(atlas.disclosure.declarationsRetired);

    // ...and every atom is one of D7's four declaration kinds.
    const kinds = new Set(atlas.declarations.map((d) => d.symbolKind));
    expect([...kinds].sort()).toEqual(["class", "const", "function", "method"]);
  });

  test("a retired symbol is REACHABLE but never an atom (D20)", () => {
    const retired = new Set(atlas.retiredDeclarationIds);

    // Disjoint from the atoms, by construction.
    for (const id of retired) expect(atlas.declarationById.has(id)).toBe(false);

    // Store side, computed independently: symbols with no incoming `contains` link.
    const storeSide = store
      .entitiesByKind("symbol")
      .filter((e) => store.linksTo(e.id, "contains").length === 0)
      .map((e) => e.id)
      .sort();
    expect([...atlas.retiredDeclarationIds]).toEqual(storeSide);

    // They survive as entities — rename chains and anchor repair depend on it (D20).
    for (const id of storeSide) expect(store.getEntity(id)).toBeDefined();

    // And no lot claims one.
    for (const lot of atlas.files) {
      for (const id of lot.declarationIds) expect(retired.has(id)).toBe(false);
    }
  });

  test("zero atoms lack a container — an atom with no lot is a contradiction now", () => {
    for (const declaration of atlas.declarations) {
      const lot = atlas.fileById.get(declaration.fileId);
      expect(lot, `no lot for ${declaration.id}`).toBeDefined();
      expect(lot!.declarationIds).toContain(declaration.id);
      // The lot's path is the declaration's path — it cannot claim an address its
      // container disowns.
      expect(declaration.path).toBe(lot!.path);
    }
    expect(atlas.disclosure.syntheticFileLots).toBe(0);
  });

  test("the lots are exactly the files in the code ingest's manifest (D5)", () => {
    // The liveness oracle for lots. It is NOT in `links` — it is the `code` cursor's file
    // manifest, the ingest's own record of every file it saw at the published generation.
    // Store-derived, hash-carrying, and readable with no filesystem present.
    const manifest = liveCodeFiles(store);
    expect(manifest.size).toBeGreaterThan(0);

    const lotPaths = new Set(atlas.files.map((f) => f.path));
    const manifestFileEntities = store
      .entitiesByKind("file")
      .filter((e) => e.locator.t === "file" && manifest.has(e.locator.path));

    expect(atlas.files.length).toBe(manifestFileEntities.length);
    for (const path of lotPaths) expect(manifest.has(path)).toBe(true);

    // Nothing vanishes without a number: lots + non-lots = every file entity in the store.
    expect(atlas.disclosure.lotsInAtlas).toBe(atlas.files.length);
    expect(atlas.disclosure.lotsOutsideAtlas).toBe(atlas.nonAtlasLotIds.length);
    expect(atlas.disclosure.lotsInAtlas + atlas.disclosure.lotsOutsideAtlas).toBe(
      store.countByKind("file"),
    );
    expect(atlas.disclosure.fileEntitiesInStore).toBe(store.countByKind("file"));

    // The non-lots are reachable as entities, and disjoint from the lots.
    for (const id of atlas.nonAtlasLotIds) {
      expect(store.getEntity(id)).toBeDefined();
      expect(atlas.fileById.has(id)).toBe(false);
    }

    // Every lot carries its evidence anchor — the manifest's content hash (D15/D33).
    for (const lot of atlas.files) {
      expect(lot.contentHash).toBe(manifest.get(lot.path)!.hash);
      expect(lot.contentHash.length).toBeGreaterThan(0);
    }
    expect(atlas.disclosure.syntheticFileLots).toBe(0);
  });

  test("every declaration has a lot, and the lot back-references it", () => {
    for (const declaration of atlas.declarations) {
      const lot = atlas.fileById.get(declaration.fileId);
      expect(lot, `no lot for ${declaration.id}`).toBeDefined();
      expect(lot!.declarationIds).toContain(declaration.id);
    }
    // The lots' declaration lists partition the declaration set exactly — no atom
    // counted twice, none missing.
    const listed = atlas.files.flatMap((f) => f.declarationIds);
    expect(listed.length).toBe(atlas.declarations.length);
    expect(new Set(listed).size).toBe(atlas.declarations.length);

    // The two liveness facts agree: a file the ingest still `contains` declarations for is
    // always a file the ingest still SEES. If a future ingest ever violates that agreement,
    // this goes RED rather than the model quietly dropping the atoms in the gap.
    const bearing = new Set(store.linksByPredicate("contains").map((l) => l.src));
    for (const fileId of bearing) expect(atlas.fileById.has(fileId)).toBe(true);
  });

  // ---- Completeness of the relation index --------------------------------

  test("every backbone link appears in the relation index EXACTLY once", () => {
    for (const kind of BACKBONE) {
      const modelSide = atlas.relations.byKind.get(kind) ?? [];

      // Store side, computed INDEPENDENTLY of the model's bulk read: walk adjacency
      // from every entity that can be a source of this predicate. Valid only because
      // the backbone has zero unresolved src endpoints — asserted right below.
      const storeSide = new Set<string>();
      for (const kindOfEntity of ["file", "symbol"] as const) {
        for (const entity of store.entitiesByKind(kindOfEntity)) {
          for (const link of store.linksFrom(entity.id, kind)) {
            storeSide.add(`${link.src} ${link.dst}`);
          }
        }
      }

      expect(modelSide.every((r) => r.srcResolved)).toBe(true);
      expect(modelSide.length).toBe(storeSide.size);

      const modelKeys = modelSide.map((r) => `${r.src} ${r.dst}`);
      expect(new Set(modelKeys).size).toBe(modelKeys.length); // exactly once, not twice
      expect(new Set(modelKeys)).toEqual(storeSide);
    }
  });

  test("the relation index carries all seven D25 kinds, stratified", () => {
    for (const kind of RELATION_KINDS) {
      const bucket = atlas.relations.byKind.get(kind) ?? [];
      expect(bucket.length).toBe(store.linksByPredicate(kind).length);
      expect(bucket.every((r) => r.layer === RELATION_LAYER[kind])).toBe(true);
    }
    expect(atlas.relations.all.length).toBe(
      RELATION_KINDS.reduce((n, k) => n + store.linksByPredicate(k).length, 0),
    );
    expect(atlas.disclosure.relationsTotal).toBe(atlas.relations.all.length);
    expect(RELATION_LAYER.calls).toBe("backbone");
    expect(RELATION_LAYER["co-changed"]).toBe("historical-correlation");
    expect(RELATION_LAYER["renamed-to"]).toBe("identity");
    expect(RELATION_LAYER.touches).toBe("event-evidence");
  });

  test("a link with an unresolved endpoint is KEPT and counted, never fabricated", () => {
    const unresolved = atlas.relations.all.filter((r) => !r.srcResolved || !r.dstResolved);
    expect(atlas.disclosure.relationsWithUnresolvedEndpoint).toBe(unresolved.length);
    // No unresolved endpoint was invented as a node.
    for (const relation of unresolved) {
      if (!relation.dstResolved) {
        expect(atlas.fileById.has(relation.dst)).toBe(false);
        expect(atlas.declarationById.has(relation.dst)).toBe(false);
      }
    }
  });

  test("store predicates outside D25's seven kinds are disclosed, not silently dropped", () => {
    const modelled = new Set<string>(RELATION_KINDS);
    for (const excluded of atlas.disclosure.excludedRelationKinds) {
      expect(modelled.has(excluded.kind)).toBe(false);
      expect(excluded.count).toBe(store.linksByPredicate(excluded.kind).length);
      expect(excluded.count).toBeGreaterThan(0);
    }
  });

  // ---- Retirement: excluded from the Atlas, but never without a number ----

  test("`calls` are CONSERVED: atlas calls + retired-end calls === the store's total", () => {
    // D33's discipline applied to retirement. A call whose endpoint no longer exists cannot
    // be drawn — but it may not evaporate either. Both sides computed live.
    const retired = new Set(atlas.retiredDeclarationIds);
    const calls = store.linksByPredicate("calls");
    const withRetiredEnd = calls.filter((l) => retired.has(l.src) || retired.has(l.dst)).length;

    expect(atlas.disclosure.callsWithRetiredEnd).toBe(withRetiredEnd);
    expect(atlas.disclosure.callsInAtlas + atlas.disclosure.callsWithRetiredEnd).toBe(
      calls.length,
    );
    // The relation INDEX still holds every call (the census pins that separately); it is
    // the ATLAS that excludes them. Both facts are true at once, and both are counted.
    expect((atlas.relations.byKind.get("calls") ?? []).length).toBe(calls.length);
    expect(atlas.disclosure.callsInAtlas).toBe(
      calls.filter((l) => !retired.has(l.src) && !retired.has(l.dst)).length,
    );
  });

  test("NO projected node resolves to a path absent from the checkout", () => {
    // The whole point of the retirement rule. A locator-derived Atlas put ~500 declarations
    // of code that does not exist in this checkout onto the map — including the killed v4
    // branch's `packages/guide/**`, and dead symbols squatting on paths that NEW files have
    // since taken over. This asserts the ghosts are gone, against the real filesystem.
    const scope = "packages/core/src/store";
    const dense = `file:${scope}/store.ts`;
    const commit = codeCommit();
    const subject = [...atlas.declarations]
      .map((d) => ({
        id: d.id,
        fanIn: (atlas.relations.incoming.get(d.id) ?? []).filter((r) => r.kind === "calls").length,
      }))
      .sort((a, b) => b.fanIn - a.fanIn)[0]!.id;

    const projections = [
      projectOverview(atlas, store),
      projectScope(atlas, store, scope, { expand: [dense] }),
      projectConnections(atlas, store, subject),
      projectEvent(atlas, store, { commits: [commit.id] }),
    ];

    const manifest = liveCodeFiles(store);
    let checked = 0;
    for (const projection of projections) {
      for (const container of projection.containers) {
        // LOT grain. The kernel's own oracle is the manifest; the filesystem is used here
        // ONLY to validate the oracle — the kernel never stats anything.
        if (container.grain === "file") {
          expect(
            manifest.has(container.path),
            `projected lot ${container.id} is not in the code manifest`,
          ).toBe(true);
          expect(existsSync(join(REPO_ROOT, container.path))).toBe(true);
          checked += 1;
        }
        // DECLARATION grain.
        for (const declaration of container.declarations) {
          expect(
            existsSync(join(REPO_ROOT, declaration.path)),
            `projected declaration ${declaration.id} names a path that is not in the checkout`,
          ).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);

    // ...and every ATOM and every LOT in the whole atlas, not just the projected ones.
    for (const declaration of atlas.declarations) {
      expect(existsSync(join(REPO_ROOT, declaration.path))).toBe(true);
    }
    for (const lot of atlas.files) {
      expect(existsSync(join(REPO_ROOT, lot.path)), `lot ${lot.id} is not on disk`).toBe(true);
    }
  });

  test("no projected lot names a path absent from the code ingest manifest", () => {
    // WHAT THIS REPLACES, AND WHY. This test used to read "the killed v4 branch's
    // `packages/guide` never draws a card" and assert `atlas.scopes` did not contain
    // "packages/guide". It was wrong THE DAY IT WAS WRITTEN: it pinned a NAME where the rule
    // is general. K2 then landed a real `packages/guide` package and a sync ingested it, so
    // the name became a legitimately live scope and the assertion became false — an absence
    // that the corpus had simply filled in.
    //
    // An assertion pinned to today's data starts lying tomorrow while staying green; that is
    // the same defect class as a magic-number census gate, and K1's own gate rules it out.
    // So this is the RULE itself, which does not rot when a package is added or removed:
    //
    //     the `code` source's ingest manifest is the only oracle of what exists. Nothing
    //     outside it is ever drawn — at any grain, in any projection.
    //
    // It held when `packages/guide` was a ghost of the killed v4 branch (all worktrees share
    // one shard, so its 56 dead lots really were in the store), it holds now that the path is
    // a live package, and it holds for whatever the next sync adds or removes.
    const manifest = liveCodeFiles(store);
    expect(manifest.size).toBeGreaterThan(0);

    // The oracle governs the ATLAS: every lot is a manifest entry, and every atom sits in one.
    for (const lot of atlas.files) {
      expect(manifest.has(lot.path), `lot ${lot.id} is not in the code manifest`).toBe(true);
    }
    for (const declaration of atlas.declarations) {
      expect(
        manifest.has(declaration.path),
        `declaration ${declaration.id} names a path the ingest never saw`,
      ).toBe(true);
    }

    // The scopes a CARD may name are exactly the scopes of manifest-backed lots. This is the
    // general form of the old assertion: a package the ingest never saw has no live lot, so it
    // has no scope, so it cannot draw a card — whatever it happens to be called.
    const liveScopes = new Set(atlas.files.map((file) => file.scope));

    const scope = "packages/core/src/store";
    const dense = `file:${scope}/store.ts`;
    const commit = codeCommit();
    const subject = [...atlas.declarations]
      .map((d) => ({
        id: d.id,
        fanIn: (atlas.relations.incoming.get(d.id) ?? []).filter((r) => r.kind === "calls").length,
      }))
      .sort((a, b) => b.fanIn - a.fanIn)[0]!.id;

    const projections = [
      projectOverview(atlas, store),
      projectScope(atlas, store, scope, { expand: [dense] }),
      projectConnections(atlas, store, subject),
      projectEvent(atlas, store, { commits: [commit.id] }),
    ];

    let checked = 0;
    for (const projection of projections) {
      for (const container of projection.containers) {
        if (container.grain === "file") {
          expect(
            manifest.has(container.path),
            `projected lot ${container.id} is not in the code manifest`,
          ).toBe(true);
        } else {
          expect(
            liveScopes.has(container.path),
            `projected scope card ${container.id} names a scope no ingested file lives in`,
          ).toBe(true);
        }
        for (const declaration of container.declarations) {
          expect(
            manifest.has(declaration.path),
            `projected declaration ${declaration.id} is not in the code manifest`,
          ).toBe(true);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);

    // The other side of the same rule: the file entities the manifest does NOT vouch for stay
    // REACHABLE (nothing is deleted) and are never a node in any projection.
    expect(atlas.nonAtlasLotIds.length).toBeGreaterThan(0); // docs/config, at minimum
    const projected = new Set(
      projections.flatMap((projection) => projection.containers.map((c) => c.id)),
    );
    for (const id of atlas.nonAtlasLotIds) {
      expect(store.getEntity(id)).toBeDefined();
      expect(atlas.fileById.has(id)).toBe(false);
      expect(projected.has(id)).toBe(false);
    }
  });

  test("a docs-only commit has NO code anchors, and says so (D5)", () => {
    // A real consequence of lots being code-only: a commit that touched only documentation
    // projects an empty canvas. That is correct — and it must be EXPLAINED, not presented as
    // a blank map. The touched files are in the store; they are simply not code.
    const docsOnly = store
      .entitiesByKind("commit")
      .find(
        (c) =>
          store.linksFrom(c.id, "touches").length > 0 &&
          store
            .linksFrom(c.id, "touches")
            .every((l) => !atlas.declarationById.has(l.dst) && !atlas.fileById.has(l.dst)),
      );
    if (!docsOnly) return; // no such commit in this corpus — nothing to assert

    const projection = projectEvent(atlas, store, { commits: [docsOnly.id] });
    expect(projection.anchors).toEqual([]);
    expect(projection.containers).toEqual([]);
    // ...and the omission is disclosed with an exact count and an honest reason — NOT the
    // old "not in the store" message, which would have been a lie: they ARE in the store.
    expect(projection.omitted.notes.join(" ")).toContain("not code");
    expect(projection.omitted.notes.join(" ")).not.toContain("not in the store");
  });

  test("every atom's file is one the store currently `contains` declarations for", () => {
    // The invariant the retirement rule rests on: a `contains` link's src is a live file
    // entity, so an atom's lot is always a current container. If a future ingest ever
    // violates it, this goes RED rather than the model silently lying.
    for (const link of store.linksByPredicate("contains")) {
      expect(store.getEntity(link.src)?.kind).toBe("file");
    }
    const bearing = new Set(store.linksByPredicate("contains").map((l) => l.src));
    for (const declaration of atlas.declarations) {
      expect(bearing.has(declaration.fileId)).toBe(true);
    }
    expect(atlas.disclosure.filesWithDeclarations).toBe(bearing.size);
  });

  // ---- Zero compile-time truncation (D33) ---------------------------------

  test("the atlas applies NO budget: the densest real file keeps every declaration", () => {
    const densest = [...atlas.files].sort(
      (a, b) => b.declarationIds.length - a.declarationIds.length,
    )[0]!;
    expect(densest.declarationIds.length).toBeGreaterThan(40); // > any projection budget

    // The model side must equal the store side for THAT file, both computed live.
    const inStore = symbolsInFile(store, densest.id).map((e) => e.id).sort();
    expect([...densest.declarationIds].sort()).toEqual(inStore);
  });

  test("a projection discloses what it omits; the atlas total is never truncated", () => {
    const densest = [...atlas.files].sort(
      (a, b) => b.declarationIds.length - a.declarationIds.length,
    )[0]!;
    const projection = projectScope(atlas, store, densest.dir, {
      expand: [densest.id],
      budget: { maxDeclarationsPerContainer: 5 },
    });
    const container = projection.containers.find((c) => c.id === densest.id)!;

    expect(container.declarations.length).toBeLessThanOrEqual(5);
    // The count the `+N more` handle shows is the atlas total, not the drawn count.
    expect(container.declarationCount).toBe(densest.declarationIds.length);
    expect(container.omittedDeclarations).toBe(
      container.declarationCount - container.declarations.length,
    );
    expect(projection.omitted.declarations).toBeGreaterThan(0);
  });

  // ---- Bounded projections ------------------------------------------------

  test("overview projects scope cards with directed, claim-backed aggregate edges", () => {
    const overview = projectOverview(atlas, store);
    expect(overview.containers.length).toBe(atlas.scopes.length);
    expect(overview.containers.every((c) => c.grain === "scope")).toBe(true);
    expect(overview.containers.every((c) => c.name.length > 0)).toBe(true); // E1: no unlabeled cards
    expect(overview.edges.length).toBeGreaterThan(0);

    // Every scope card's declaration count sums the atlas, not a drawn subset.
    const total = overview.containers.reduce((n, c) => n + c.declarationCount, 0);
    expect(total).toBe(atlas.declarations.length);

    for (const edge of overview.edges) {
      expect(edge.src).not.toBe(edge.dst); // direction is real, no self-loops
      expect(edge.claimSet.count).toBeGreaterThan(0);
      expect(edge.claimSet.constituents.length).toBe(edge.claimSet.count);
    }
  });

  test("scope graph: the directory selects, and D40 is classified at BOTH grains", () => {
    const scope = "packages/core/src/store";
    const dense = `file:${scope}/store.ts`;
    const projection = projectScope(atlas, store, scope, { expand: [dense] });

    // The directory SELECTED the bounded set (D35): every container is under it.
    expect(projection.containers.length).toBeGreaterThan(0);
    for (const container of projection.containers) {
      expect(container.path.startsWith(`${scope}/`)).toBe(true);
    }

    // D40 grain 1 — a file with degree 0 in this bounded set is named, not hidden.
    for (const container of projection.containers) {
      const isolated = container.degree.inbound + container.degree.outbound === 0;
      expect(container.noVisibleRoute).toBe(isolated);
    }
    expect(projection.noVisibleRoute.containerIds).toEqual(
      projection.containers.filter((c) => c.noVisibleRoute).map((c) => c.id),
    );

    // D40 grain 2 — declarations with degree 0 inside the expanded file are handed
    // over as the `+N more (no visible route)` set. The renderer cannot compute this.
    const container = projection.containers.find((c) => c.id === dense)!;
    expect(container.expanded).toBe(true);
    const noRoute = projection.noVisibleRoute.declarations.find((d) => d.containerId === dense);
    expect(noRoute).toBeDefined();
    expect(noRoute!.declarationIds.length).toBe(container.omittedNoVisibleRoute);
    expect(container.declarations.every((d) => !d.noVisibleRoute)).toBe(true);

    // Cross-scope relations collapsed into re-rootable boundary nodes (D30).
    expect(projection.boundaries.length).toBeGreaterThan(0);
    for (const boundary of projection.boundaries) {
      expect(boundary.memberCount).toBe(boundary.memberIds.length);
      expect(boundary.reroot.length).toBeGreaterThan(0);
    }

    // Relation groups (connected components over the atoms) are handed over, not left to
    // the renderer — it never sees the unbounded model and cannot compute them.
    const grouped = projection.groups.flatMap((g) => g.memberIds);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(projection.groups.every((g) => g.size === g.memberIds.length)).toBe(true);
    // An expanded lot is never a peer of its own children.
    expect(grouped).not.toContain(dense);
    for (const declaration of container.declarations) expect(grouped).toContain(declaration.id);
  });

  test("connections: a high fan-in subject aggregates rather than emitting 300 edges", () => {
    // Pick the real highest-fan-in declaration — mechanical, no hand-picked name.
    const subject = [...atlas.declarations]
      .map((d) => ({
        id: d.id,
        fanIn: (atlas.relations.incoming.get(d.id) ?? []).filter((r) => r.kind === "calls").length,
      }))
      .sort((a, b) => b.fanIn - a.fanIn)[0]!;
    expect(subject.fanIn).toBeGreaterThan(20);

    const projection = projectConnections(atlas, store, subject.id);
    expect(projection.subject?.id).toBe(subject.id);
    expect(projection.anchors).toEqual([subject.id]);

    // Direction is explicit and preserved: inbound edges end at the subject.
    const inbound = projection.edges.filter((e) => e.dst === subject.id);
    expect(inbound.length).toBeGreaterThan(0);
    for (const edge of inbound) expect(edge.src).not.toBe(subject.id);

    // Every constituent of every aggregate is listed — D33 forbids "count + first id".
    for (const edge of projection.edges) {
      expect(edge.claimSet.constituents.length).toBe(edge.claimSet.count);
      expect(edge.claimSet.constituentClaimIds.length).toBe(edge.claimSet.count);
    }
  });

  test("event: the projection is bounded, and no ancestor pollutes it (D32)", () => {
    // A commit that actually touched CODE. (The most recent commit may well be docs-only —
    // and a docs-only commit legitimately has zero code anchors now that lots are code-only.
    // That case is covered by its own test below.)
    const commit = codeCommit();
    const projection = projectEvent(atlas, store, { commits: [commit.id] });

    expect(projection.anchors!.length).toBeGreaterThan(0);

    // ROOT POLLUTION regression: no scope, directory or repo-root node exists in the
    // lit set at all — so the projection's own bbox can never inflate to the whole repo.
    for (const container of projection.containers) {
      expect(container.grain).toBe("file");
      expect(container.id.startsWith("scope:")).toBe(false);
    }
    expect(projection.containers.length).toBeLessThan(atlas.files.length);

    // Every container is the lot of an anchor or of a 1-hop neighbour — nothing else.
    const anchors = new Set(projection.anchors!);
    const lotOf = (id: string): string | undefined =>
      atlas.declarationById.get(id)?.fileId ?? (atlas.fileById.has(id) ? id : undefined);
    const anchorLots = new Set([...anchors].map(lotOf).filter(Boolean));
    const neighbourLots = new Set<string>();
    for (const anchor of anchors) {
      for (const relation of [
        ...(atlas.relations.outgoing.get(anchor) ?? []),
        ...(atlas.relations.incoming.get(anchor) ?? []),
      ]) {
        if (relation.kind !== "calls" && relation.kind !== "imports") continue;
        for (const end of [relation.src, relation.dst]) {
          const lot = lotOf(end);
          if (lot) neighbourLots.add(lot);
        }
      }
    }
    for (const container of projection.containers) {
      expect(anchorLots.has(container.id) || neighbourLots.has(container.id)).toBe(true);
    }
  });

  test("budgets never leave orphan nodes, and cut MECHANICALLY by degree (D40)", () => {
    // Regression: a container dropped by the container budget must not leave its
    // declarations behind as free-floating group members. Found on a live drive of a
    // 482-declaration commit, where the group count (666) exceeded the node count (425).
    const commit = [...store.entitiesByKind("commit")]
      .map((c) => ({
        id: c.id,
        decls: store.linksFrom(c.id, "touches").filter((l) => l.dst.startsWith("sym:")).length,
      }))
      .sort((a, b) => b.decls - a.decls)[0]!;
    const projection = projectEvent(atlas, store, { commits: [commit.id] }, { budget: { maxContainers: 20 } });

    expect(projection.containers.length).toBeLessThanOrEqual(20);

    const nodes = new Set([
      ...projection.containers.map((c) => c.id),
      ...projection.containers.flatMap((c) => c.declarations.map((d) => d.id)),
    ]);
    // Groups partition the ATOMS (D36): an expanded lot's atoms are its declarations, a
    // collapsed lot is itself an atom. No node grouped twice, no phantom node grouped.
    const atoms = new Set([
      ...projection.containers.filter((c) => !c.expanded).map((c) => c.id),
      ...projection.containers.flatMap((c) => c.declarations.map((d) => d.id)),
    ]);
    const grouped = projection.groups.flatMap((g) => g.memberIds);
    expect(grouped.length).toBe(atoms.size);
    expect(new Set(grouped).size).toBe(atoms.size);
    for (const id of grouped) expect(atoms.has(id)).toBe(true);

    // Every drawn edge lands on a drawn node or a boundary.
    const drawable = new Set([...nodes, ...projection.boundaries.map((b) => b.id)]);
    for (const edge of projection.edges) {
      expect(drawable.has(edge.src)).toBe(true);
      expect(drawable.has(edge.dst)).toBe(true);
    }

    // The reference: the SAME event with no container budget at all, so every relevant
    // container and its true degree are visible to the test.
    const unbudgeted = projectEvent(atlas, store, { commits: [commit.id] }, {
      budget: { maxContainers: Number.MAX_SAFE_INTEGER },
    });
    expect(unbudgeted.containers.length).toBeGreaterThan(projection.containers.length);

    // The cut is by DEGREE, never by path order: no dropped container may out-rank a
    // kept one. (D25/D40 — mechanical, never a judgment of importance.)
    const keptIds = new Set(projection.containers.map((c) => c.id));
    const kept = unbudgeted.containers.filter((c) => keptIds.has(c.id));
    const dropped = unbudgeted.containers.filter((c) => !keptIds.has(c.id));
    const deg = (c: (typeof kept)[number]): number => c.degree.inbound + c.degree.outbound;
    expect(Math.min(...kept.map(deg))).toBeGreaterThanOrEqual(Math.max(...dropped.map(deg)));

    // ...and BECAUSE the degree cut hits degree-0 first, the honest periphery is the
    // first thing it destroys. It must survive as its OWN exact count, never folded into
    // the generic "N more" bucket (D40: never silently dropped).
    const peripheryDropped = dropped.filter((c) => c.noVisibleRoute).length;
    expect(peripheryDropped).toBeGreaterThan(0); // the real corpus really does have one
    expect(projection.noVisibleRoute.omittedContainerCount).toBe(peripheryDropped);
    expect(projection.omitted.notes.join(" ")).toContain("no visible route");
    expect(projection.omitted.containers).toBe(dropped.length);
  });

  test("claim sets satisfy D33 and the §3 weakest-constituent rule", () => {
    const overview = projectOverview(atlas, store);
    const edge = [...overview.edges].sort((a, b) => b.claimSet.count - a.claimSet.count)[0]!;
    const set = edge.claimSet;

    expect(set.count).toBeGreaterThan(1); // a real aggregate
    expect(set.constituentClaimIds.length).toBe(set.count); // NOT "count + first id"
    expect(new Set(set.constituentClaimIds).size).toBe(set.count);
    expect(set.derivations.length).toBeGreaterThan(0);
    expect(set.freshness).toBe("fresh");
    expect(set.disclosure).toBe("local");
    // The aggregate stands in for constituents the consumer cannot open individually.
    expect(set.omittedCount).toBeGreaterThan(0);

    // §3: never more confident than the weakest constituent.
    const order = ["CONFIRMED", "LIKELY", "POSSIBLE"];
    const rank = (c: string | null): number => (c === null ? 99 : order.indexOf(c));
    for (const claimId of set.constituentClaimIds) {
      const claim = store.getClaim(claimId)!;
      expect(rank(set.confidenceSummary.weakest)).toBeGreaterThanOrEqual(rank(claim.confidence));
    }
    // Structural code evidence is OBSERVED/LIKELY — never self-corroborated to CONFIRMED.
    expect(set.confidenceSummary.weakest).toBe("LIKELY");
  });

  test("projections are deterministic: identical data yields an identical DTO (D34)", () => {
    const again = buildAtlas(store);
    const scope = "packages/core/src/store";
    const dense = `file:${scope}/store.ts`;
    for (const build of [
      () => projectOverview(atlas, store),
      () => projectScope(atlas, store, scope, { expand: [dense] }),
    ]) {
      expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    }
    expect(JSON.stringify(projectOverview(again, store))).toBe(
      JSON.stringify(projectOverview(atlas, store)),
    );
  });

  // ---- New core store queries ---------------------------------------------

  test("symbolsInFile returns only the CURRENTLY contained declarations, in source order", () => {
    const dense = [...atlas.files].sort(
      (a, b) => b.declarationIds.length - a.declarationIds.length,
    )[0]!;
    const symbols = symbolsInFile(store, dense.id);
    expect(symbols.map((s) => s.id).sort()).toEqual([...dense.declarationIds].sort());
    const starts = symbols.map((s) => (s.locator.t === "file" ? (s.locator.span?.[0] ?? 0) : 0));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);

    // No retired symbol leaks through the query surface, even when one still addresses
    // this exact path (`packages/core/src/guide/types.ts` is a real live example: the dead
    // v4 kernel's symbols name that path, and the file that holds it now is a NEW one).
    const retired = new Set(atlas.retiredDeclarationIds);
    for (const symbol of symbols) expect(retired.has(symbol.id)).toBe(false);
  });

  test("retired symbols stay REACHABLE through their own accessor (D20)", () => {
    // Reachable, never visible: the rows survive so rename chains and anchor repair keep
    // working, but no lot ever claims them.
    //
    // A FRESH sync retires nothing, so this asserts the accessor AGREES with the atlas for
    // every file — true whether the count is 0 (a clean sync) or 689 (the maintainer's
    // shared, cross-worktree shard). The induced-retirement suite below forces it non-zero.
    const byFile = new Map<string, string[]>();
    for (const id of atlas.retiredDeclarationIds) {
      const entity = store.getEntity(id)!;
      if (entity.locator.t !== "file") continue;
      const fileId = `file:${entity.locator.path}`;
      byFile.set(fileId, [...(byFile.get(fileId) ?? []), id]);
    }

    for (const lot of atlas.files) {
      const expected = (byFile.get(lot.id) ?? []).sort();
      expect(retiredSymbolsOf(store, lot.id).map((e) => e.id)).toEqual(expected);
      // ...and none of them is in that lot's declaration list.
      for (const id of expected) expect(lot.declarationIds).not.toContain(id);
    }
    expect([...byFile.values()].flat().length).toBeLessThanOrEqual(
      atlas.retiredDeclarationIds.length,
    );
  });

  test("filesInCommit reports the commit's touched files and declarations", () => {
    const commit = store.entitiesByKind("commit").sort((a, b) => b.firstSeen - a.firstSeen)[0]!;
    const touched = filesInCommit(store, commit.id);
    const links = store.linksFrom(commit.id, "touches");
    expect(touched.files.length + touched.declarations.length).toBe(links.length);
    expect(touched.files.every((f) => f.startsWith("file:"))).toBe(true);
  });

  test("diff hunks are re-derived from git, not read from the store", () => {
    const commit = store.entitiesByKind("commit").sort((a, b) => b.firstSeen - a.firstSeen)[0]!;
    const diffs = diffForCommits(store, [commit.id]);
    const files = diffs.get(commit.id);
    expect(files, `no diff re-derived for ${commit.id}`).toBeDefined();
    expect(files!.length).toBeGreaterThan(0);
    expect(files!.some((f) => f.hunks.length > 0)).toBe(true);
    // Nothing was persisted to get this — the store has no hunk table at all.
    expect(store.linksByPredicate("hunk").length).toBe(0);
  });
});

// ===========================================================================
// Retirement, induced deterministically — a FRESH sync cannot produce it, because
// retirement is cross-generation residue. This is the mechanism that put ~500 phantom
// declarations on the map when the Atlas trusted locators instead of `contains`.
// ===========================================================================
describe("K1 — retired symbols (no `contains` link) never become atoms", () => {
  let root: string;
  let proj: string;
  let store: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-k1-retired-");
    proj = join(root, "proj");
    mkdirSync(proj, { recursive: true });
    writeFileSync(
      join(proj, "lib.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
    );
    writeFileSync(join(proj, "app.ts"), "import { beta } from './lib.ts';\nexport function main() { return beta(); }\n");
    store = openStore({ projectDir: proj, home: join(root, "home") });
    clearScanCache();
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await adapter.ingest(store, await adapter.dirtyCheck(store), MAX_BUDGET);
  }, 60_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("a retired symbol leaves the Atlas entirely — and every loss carries a number", () => {
    const before = buildAtlas(store);
    expect(before.disclosure.declarationsRetired).toBe(0);
    const symbols = store.countByKind("symbol");
    const calls = store.linksByPredicate("calls").length;
    expect(before.declarations.length).toBe(symbols);
    expect(before.disclosure.callsInAtlas).toBe(calls);
    expect(calls).toBeGreaterThan(0);

    // Reproduce EXACTLY what the store does to a symbol dropped from a re-ingested file:
    // the `contains` link goes, the entity stays. The store's own `clearLinksTo` doc calls
    // this "a retired symbol (dropped from the `contains` graph but kept as an entity so
    // rename-chain history survives)". The symbol's LOCATOR still names `lib.ts` — which is
    // precisely why the locator cannot be trusted as the containment fact.
    const removed = store.clearLinks("file:lib.ts", "contains");
    expect(removed).toBeGreaterThan(0);

    const after = buildAtlas(store);
    const retired = new Set(after.retiredDeclarationIds);

    // 1. The retired symbols are NOT atoms. They do not render, at any grain.
    expect(after.declarations.length).toBe(symbols - removed);
    expect(after.disclosure.declarationsRetired).toBe(removed);
    expect(retired.size).toBe(removed);
    for (const id of retired) expect(after.declarationById.has(id)).toBe(false);

    // 2. Their lot disowns them — the file is now an empty container, not a haunted one.
    expect(after.fileById.get("file:lib.ts")!.declarationIds).toEqual([]);

    // 3. Nothing vanishes without a number: symbol rows and call links both conserve.
    expect(after.disclosure.declarationsTotal + after.disclosure.declarationsRetired).toBe(
      store.countByKind("symbol"),
    );
    expect(after.disclosure.callsInAtlas + after.disclosure.callsWithRetiredEnd).toBe(calls);
    expect(after.disclosure.callsWithRetiredEnd).toBeGreaterThan(0);
    // The relation index still holds every call; it is the ATLAS that excludes them.
    expect((after.relations.byKind.get("calls") ?? []).length).toBe(calls);

    // 4. They stay REACHABLE for rename chains / anchor repair (D20).
    expect(retiredSymbolsOf(store, "file:lib.ts").map((e) => e.id).sort()).toEqual(
      [...retired].sort(),
    );
    for (const id of retired) expect(store.getEntity(id)).toBeDefined();

    // 5. NO projection emits one as a node — not as a declaration, not as a boundary.
    for (const projection of [
      projectScope(after, store, "", { expand: ["file:lib.ts", "file:app.ts"] }),
      projectOverview(after, store),
      projectEvent(after, store, { anchors: ["file:lib.ts"] }),
    ]) {
      const emitted = new Set([
        ...projection.containers.flatMap((c) => c.declarations.map((d) => d.id)),
        ...projection.boundaries.flatMap((b) => b.memberIds),
        ...projection.edges.flatMap((e) => [e.src, e.dst]),
        ...projection.groups.flatMap((g) => g.memberIds),
      ]);
      for (const id of retired) {
        expect(emitted.has(id), `${projection.kind} emitted retired ${id}`).toBe(false);
      }
    }
  });
});

// ===========================================================================
// The generation trap — CONFIRMED, and now regression-tested.
// ===========================================================================
describe("K1 — the generation trap (D28/D33)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-k1-gen-");
    repo = join(root, "repo");
    home = join(root, "home");
    mkdirSync(repo, { recursive: true });
    git(["init", "-q", "-b", "main", repo], root);
    git(["config", "user.email", "ctx-test@example.invalid"], repo);
    git(["config", "user.name", "ctx test"], repo);
    writeFileSync(join(repo, "lib.ts"), "export function alpha() { return 1; }\n");
    git(["add", "-A"], repo);
    git(["commit", "-q", "-m", "init"], repo);

    store = openStore({ projectDir: repo, home });
    clearScanCache();
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await adapter.ingest(store, await adapter.dirtyCheck(store), MAX_BUDGET);
  }, 60_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("a store built under THIS identity reads live; an export of it reads snapshot", () => {
    expect(store.publishedGen("code")).toBeGreaterThan(0);
    expect(resolveGeneration(store).state).toBe("live");
    expect(resolveGeneration(store, { mode: "snapshot" }).state).toBe("snapshot");
  });

  test("another worktree's generation reads STALE — never live, never empty", () => {
    // THE TRAP. Every worktree of a repo shares ONE shard, but a generation is bound to
    // `(repoRev, worktreeDigest, schemaVersion, policyVersion)`. A different worktree
    // digest is exactly what a sibling worktree presents.
    const sibling = openStore({ projectDir: repo, home, worktreeId: "/some/other/worktree" });
    try {
      // The trap fires: the store reports NO published generation...
      expect(sibling.publishedGen("code")).toBe(0);
      // ...while every row is still sitting right there.
      expect(sibling.entityCount()).toBeGreaterThan(0);
      expect(sibling.countByKind("symbol")).toBeGreaterThan(0);

      const view = resolveGeneration(sibling);

      // A caller trusting `publishedGen()` alone would render an EMPTY STORE and send
      // the user to `ctx sync` without ever saying why. The kernel says `stale`.
      expect(view.state).toBe("stale");
      expect(view.state).not.toBe("empty");
      expect(view.state).not.toBe("live");

      // Both identities are surfaced, so the badge can tell the truth.
      const code = view.sources.find((s) => s.source === "code")!;
      expect(code.storedIdentity).toBeDefined();
      expect(code.storedIdentity).not.toBe(view.currentIdentity);
      expect(code.matchesCurrentIdentity).toBe(false);
      expect(code.publishedGen).toBe(0);
      expect(view.reason).toContain(code.storedIdentity!);

      // A stale generation is NOT servable: the projection must not present these rows
      // as current data (D33 data-state honesty).
      const atlas = buildAtlas(sibling);
      expect(atlas.generation.state).toBe("stale");
      expect(projectOverview(atlas, sibling).generation.state).toBe("stale");
      // Even in snapshot mode, a mismatched identity is stale, never "snapshot".
      expect(resolveGeneration(sibling, { mode: "snapshot" }).state).toBe("stale");
    } finally {
      sibling.close();
    }
  });

  test("a store that was never built reads EMPTY, and says to run ctx sync", () => {
    const blank = makeTempDir("ctx-k1-blank-");
    try {
      const fresh = openStore({ projectDir: repo, home: join(blank, "home") });
      const view = resolveGeneration(fresh);
      expect(view.state).toBe("empty");
      expect(view.reason).toContain("ctx sync");
      fresh.close();
    } finally {
      cleanupTempDir(blank);
    }
  });
});

// ===========================================================================
// D24 naming gate — enforced over the kernel's own source.
// ===========================================================================
describe("K1 — D24 naming gate", () => {
  test("the kernel's source never uses the pre-gate vocabulary", () => {
    const forbidden = [/\bimpacts?\b/i, /\baffected\b/i, /\bblast radius\b/i, /\brisks?\b/i, /\bbreaks\b/i];
    const offences: string[] = [];
    for (const name of readdirSync(GUIDE_SRC)) {
      const text = readFileSync(join(GUIDE_SRC, name), "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        for (const pattern of forbidden) {
          if (pattern.test(line)) offences.push(`${name}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
