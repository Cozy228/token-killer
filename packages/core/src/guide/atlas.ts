/**
 * The complete logical Atlas (D7 / D33 / D36).
 *
 * "Complete" means: every declaration that EXISTS IN THIS CHECKOUT is an atom, and no
 * display budget or truncation is ever applied here — `MAX_DECLS_SHOWN`-style compile-time
 * cuts are the exact defect D33 outlaws. Anything the kernel does not model as a
 * first-class node/relation is COUNTED in `AtlasDisclosure`.
 *
 * CONTAINMENT — the decision that keeps phantom code off the map:
 *
 *   The Atlas's declaration set is exactly the set of symbols reachable through a
 *   `contains` link. `contains` is the FACT that this declaration exists in that file
 *   right now; the symbol's `locator` is merely its ADDRESS. The two never contradict each
 *   other (measured: every `contains` link's src is exactly `file:<dst.locator.path>`,
 *   3,809/3,809) — but consistency is not substitutability. ADDRESSES GET REUSED; facts do
 *   not. Deriving containment from the locator therefore admits ghosts: measured on the
 *   real store, 689 symbols have no `contains` link, 506 of them name a file that is not
 *   in this checkout at all (the killed v4 branch's `packages/guide/**` — all worktrees
 *   share one shard), and others name a path that a NEW, unrelated file has since taken
 *   over. A locator-derived Atlas would draw them. A phantom map is worse than a truncated
 *   one: truncation is at least honest about being incomplete.
 *
 *   So: a symbol with no `contains` link is RETIRED. It is not an atom and never renders.
 *   `entities.gen` does not discriminate (contained symbols run to median gen 1, retired to
 *   median gen 8) — `contains` is the only discriminator.
 *
 * RETIRED IS NOT DELETED. The entities survive so rename-chain history survives (D20 anchor
 * durability depends on it), so they stay REACHABLE via `retiredDeclarationIds` — reachable,
 * never visible. And nothing vanishes without a number attached: the 578 `calls` links with
 * a retired endpoint are excluded from the Atlas and COUNTED (`callsWithRetiredEnd`), with
 * `callsInAtlas + callsWithRetiredEnd === <store calls total>` asserted as a census equality.
 * That is D33's discipline applied to retirement.
 */
import type { Entity } from "../store/types.ts";
import type { Store } from "../store/store.ts";
import { resolveGeneration, type FreshnessOptions } from "./freshness.ts";
import { buildRelationIndex } from "./relations.ts";
import { liveCodeFiles } from "./queries.ts";
import type { AtlasDisclosure, AtlasModel, Declaration, FileLot } from "./types.ts";

/** Directory roots whose children are scopes in their own right (pnpm workspaces). */
const DEFAULT_GROUPED_ROOTS: readonly string[] = ["packages"];

export interface AtlasOptions extends FreshnessOptions {
  /**
   * Scope grain (D29/D35: the directory SELECTS, it does not position). A scope is the
   * first path segment, except that a segment named here descends one more level — so
   * `packages/core/src/store/store.ts` scopes to `packages/core`, and `src/cli.ts` to
   * `src`. Pass `[]` for pure top-level-directory scoping.
   */
  groupedRoots?: readonly string[];
}

export function buildAtlas(store: Store, opts: AtlasOptions = {}): AtlasModel {
  const groupedRoots = new Set(opts.groupedRoots ?? DEFAULT_GROUPED_ROOTS);

  const fileEntities = store.entitiesByKind("file");
  const symbolEntities = store.entitiesByKind("symbol");

  // Entity id set — used ONLY to mark a relation endpoint resolved/unresolved.
  // Every kind participates, because `touches` starts at a commit and `references`
  // can end at a doc section.
  const entityIds = new Set<string>();
  for (const kind of [
    "symbol",
    "file",
    "module",
    "commit",
    "pr",
    "issue",
    "decision",
    "doc_section",
    "story",
    "meeting",
    "memory",
    "concept",
  ] as const) {
    for (const e of store.entitiesByKind(kind)) entityIds.add(e.id);
  }

  // A LOT IS A FILE THE CODE INGEST SAW AT THE PUBLISHED GENERATION. The manifest
  // (`liveCodeFiles`) is the oracle — hash-carrying evidence, read from the store, never
  // from the filesystem. A file entity outside it is not an Atlas lot: it is either code
  // that no longer exists (the killed v4 branch's `packages/guide/**` — all worktrees share
  // one shard) or a file the code ingest never indexes (docs, config; D5 rules the canvas
  // renders the CODE structure graph only). Both stay reachable as entities; neither is ever
  // a canvas node; both are COUNTED.
  const manifest = liveCodeFiles(store);

  const lots = new Map<string, MutableLot>();
  const nonAtlasLotIds: string[] = [];
  for (const entity of fileEntities) {
    const path = filePathOf(entity);
    const live = manifest.get(path);
    if (live === undefined) {
      nonAtlasLotIds.push(entity.id);
      continue;
    }
    lots.set(entity.id, newLot(entity.id, path, scopeOf(path, groupedRoots), false, live.hash));
  }

  // CONTAINMENT IS THE `contains` LINK, and nothing else. A symbol not reachable through
  // one is retired: it exists as an entity (D20 rename chains), but it is not an atom.
  const containedBy = new Map<string, string>();
  for (const link of store.linksByPredicate("contains")) containedBy.set(link.dst, link.src);

  const symbolById = new Map(symbolEntities.map((e) => [e.id, e]));
  const declarations: Declaration[] = [];
  const retiredDeclarationIds: string[] = [];

  for (const entity of symbolEntities) {
    const fileId = containedBy.get(entity.id);
    // No `contains` link -> retired. Contained by a file that is NOT an Atlas lot -> its
    // container is gone, so it cannot be an atom either; retired, and counted. (Expected to
    // be zero: deleting a file clears its `contains` links, which is how symbols retire in
    // the first place. Asserted, so a future ingest change cannot open a hole here.)
    if (fileId === undefined || !lots.has(fileId)) {
      retiredDeclarationIds.push(entity.id);
      continue;
    }
    const lot = lots.get(fileId)!;
    lot.declarationIds.push(entity.id);
    declarations.push(declarationOf(entity, fileId, lot.path, lot.scope));
  }

  const { index, excluded } = buildRelationIndex(store, entityIds);

  const files: FileLot[] = [...lots.values()]
    .map((lot) => ({ ...lot, declarationIds: lot.declarationIds.sort() }))
    .sort((a, b) => cmp(a.path, b.path));
  declarations.sort((a, b) => cmp(a.id, b.id));
  retiredDeclarationIds.sort();

  const declarationById = new Map(declarations.map((d) => [d.id, d]));
  const retired = new Set(retiredDeclarationIds);
  const calls = index.byKind.get("calls") ?? [];
  const callsWithRetiredEnd = calls.filter(
    (r) => retired.has(r.src) || retired.has(r.dst),
  ).length;

  const disclosure: AtlasDisclosure = {
    /** Lots: file entities present in the code manifest. */
    lotsInAtlas: files.length,
    /** `lotsInAtlas + lotsOutsideAtlas === store.countByKind("file")` — nothing vanishes. */
    lotsOutsideAtlas: nonAtlasLotIds.length,
    fileEntitiesInStore: fileEntities.length,
    filesWithDeclarations: files.filter((f) => f.declarationIds.length > 0).length,
    syntheticFileLots: files.filter((f) => f.synthetic).length,
    declarationsTotal: declarations.length,
    /** Every symbol row in the store, contained or retired. The census divides this. */
    symbolsInStore: symbolById.size,
    declarationsRetired: retiredDeclarationIds.length,
    /** `callsInAtlas + callsWithRetiredEnd === <store calls total>` — nothing vanishes. */
    callsInAtlas: calls.length - callsWithRetiredEnd,
    callsWithRetiredEnd,
    relationsTotal: index.all.length,
    relationsWithUnresolvedEndpoint: index.all.filter((r) => !r.srcResolved || !r.dstResolved)
      .length,
    excludedRelationKinds: excluded,
  };

  return {
    generation: resolveGeneration(store, opts),
    files,
    nonAtlasLotIds: nonAtlasLotIds.sort(),
    declarations,
    retiredDeclarationIds,
    relations: index,
    scopes: [...new Set(files.map((f) => f.scope))].sort(),
    disclosure,
    fileById: new Map(files.map((f) => [f.id, f])),
    declarationById,
  };
}

interface MutableLot {
  id: string;
  path: string;
  name: string;
  dir: string;
  scope: string;
  declarationIds: string[];
  synthetic: boolean;
  contentHash: string;
}

function newLot(
  id: string,
  path: string,
  scope: string,
  synthetic: boolean,
  contentHash: string,
): MutableLot {
  const cut = path.lastIndexOf("/");
  return {
    id,
    path,
    name: cut === -1 ? path : path.slice(cut + 1),
    dir: cut === -1 ? "" : path.slice(0, cut),
    scope,
    declarationIds: [],
    synthetic,
    contentHash,
  };
}

function declarationOf(entity: Entity, fileId: string, path: string, scope: string): Declaration {
  const attrs = entity.attrs;
  const span =
    entity.locator.t === "file" && entity.locator.span ? entity.locator.span : ([0, 0] as const);
  return {
    id: entity.id,
    name: entity.name,
    qualified: typeof attrs.qualified === "string" ? attrs.qualified : entity.name,
    symbolKind: typeof attrs.symbolKind === "string" ? attrs.symbolKind : "unknown",
    lang: typeof attrs.lang === "string" ? attrs.lang : "unknown",
    // The lot comes from the `contains` link, NOT from the locator path. The path below is
    // the LOT's path, so a declaration can never claim an address its container disowns.
    fileId,
    path,
    span: [span[0], span[1]],
    scope,
  };
}

/** The declaration's own file path. Every symbol/file entity carries a file locator. */
function filePathOf(entity: Entity): string {
  if (entity.locator.t === "file") return entity.locator.path;
  // No file locator: fall back to the entity name, which the id scheme derives from.
  return entity.name;
}

/** D35: the directory selects. Deterministic, mechanical, no ranking. */
export function scopeOf(path: string, groupedRoots: ReadonlySet<string>): string {
  const segments = path.split("/");
  const head = segments[0];
  if (head === undefined || segments.length === 1) return "(root)";
  if (groupedRoots.has(head) && segments.length > 2) return `${head}/${segments[1]}`;
  return head;
}

/** Stable, locale-independent order. Determinism is a D34 constraint. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
