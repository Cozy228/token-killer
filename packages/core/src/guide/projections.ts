/**
 * The four bounded projections of the D27 canvas.
 *
 *   overview    — what is this repo            -> module/package cards (D29)
 *   scope       — what is inside this scope    -> file containers + declarations (D30/D36)
 *   connections — what connects to THIS thing  -> inbound | subject | outbound (D31)
 *   event       — what does this event touch   -> bounded event projection (D32)
 *
 * Each returns a COMPOUND, BOUNDED DTO and nothing else: file containers with declaration
 * children, aggregate edges carrying full claim sets, boundary nodes for out-of-scope
 * relations, relation groups, the no-visible-route periphery at both grains, and an exact
 * count for every omission. All of the hard work is in `bounded.ts`; a projection here only
 * chooses its bounded set and its grain.
 *
 * The atlas they read is COMPLETE (D7/D33). Budgets exist only here.
 */
import { assemble, mergeBudget, ROUTE_KINDS, cmp, type BoundaryRef } from "./bounded.ts";
import { ClaimReader } from "./claims.ts";
import type { Store } from "../store/store.ts";
import {
  DEFAULT_BUDGET,
  type AtlasModel,
  type BoundedProjection,
  type ConnectionsOptions,
  type Declaration,
  type EventOptions,
  type FileLot,
  type Grain,
  type GuideEvent,
  type OverviewOptions,
  type ProjectedContainer,
  type ProjectedDeclaration,
  type ProjectionSubject,
  type ScopeOptions,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Overview (D29) — the repo's scopes, positioned downstream by dependency direction
// ---------------------------------------------------------------------------

export function projectOverview(
  atlas: AtlasModel,
  store: Store,
  opts: OverviewOptions = {},
): BoundedProjection {
  const budget = mergeBudget(DEFAULT_BUDGET, opts.budget);
  const scopeOfFile = new Map(atlas.files.map((f) => [f.id, f.scope]));
  const scopeOfDecl = new Map(atlas.declarations.map((d) => [d.id, d.scope]));

  const containers: ProjectedContainer[] = atlas.scopes.map((scope) => {
    const files = atlas.files.filter((f) => f.scope === scope);
    return {
      id: scopeId(scope),
      grain: "scope",
      name: scope,
      path: scope,
      scope,
      declarations: [],
      declarationCount: files.reduce((n, f) => n + f.declarationIds.length, 0),
      omittedDeclarations: 0,
      omittedNoVisibleRoute: 0,
      expanded: false,
      degree: { inbound: 0, outbound: 0 },
      noVisibleRoute: false,
      fileCount: files.length,
    };
  });

  const nodeOf = (id: string): string | undefined => {
    const scope = scopeOfFile.get(id) ?? scopeOfDecl.get(id);
    return scope === undefined ? undefined : scopeId(scope);
  };

  const assembled = assemble({
    atlas,
    reader: new ClaimReader(store),
    budget,
    kinds: ROUTE_KINDS,
    containers,
    nodeOf,
    grainOf: () => "scope",
    // Every file and declaration belongs to a scope, so nothing falls out of bounds.
    boundaryOf: () => undefined,
  });

  return { kind: "overview", subject: undefined, generation: atlas.generation, ...assembled };
}

// ---------------------------------------------------------------------------
// Scope Graph (D30/D35/D36) — the directory SELECTS; relationships position
// ---------------------------------------------------------------------------

/** `scopePath` is a directory (`packages/core`, `packages/core/src/store`, ...). */
export function projectScope(
  atlas: AtlasModel,
  store: Store,
  scopePath: string,
  opts: ScopeOptions = {},
): BoundedProjection {
  const budget = mergeBudget(DEFAULT_BUDGET, opts.budget);
  const expanded = new Set(opts.expand ?? []);

  const inScope = atlas.files.filter((f) => underDirectory(f.path, scopePath));
  const fileIds = new Set(inScope.map((f) => f.id));

  const containers: ProjectedContainer[] = inScope.map((file) =>
    fileContainer(atlas, file, expanded.has(file.id) ? allDeclarations(atlas, file) : []),
  );

  const nodeOf = (id: string): string | undefined => {
    if (fileIds.has(id)) return id;
    const declaration = atlas.declarationById.get(id);
    if (!declaration || !fileIds.has(declaration.fileId)) return undefined;
    return expanded.has(declaration.fileId) ? declaration.id : declaration.fileId;
  };

  const assembled = assemble({
    atlas,
    reader: new ClaimReader(store),
    budget,
    kinds: ROUTE_KINDS,
    containers,
    nodeOf,
    grainOf: (id) => grainOf(atlas, id),
    boundaryOf: (id) => scopeBoundary(atlas, id),
  });

  return {
    kind: "scope",
    subject: { id: scopePath, grain: "scope", name: scopePath, path: scopePath },
    generation: atlas.generation,
    ...assembled,
  };
}

// ---------------------------------------------------------------------------
// Focused Connections (D31) — inbound | subject | outbound, 1 hop
// ---------------------------------------------------------------------------

export function projectConnections(
  atlas: AtlasModel,
  store: Store,
  subjectId: string,
  opts: ConnectionsOptions = {},
): BoundedProjection {
  const budget = mergeBudget(DEFAULT_BUDGET, opts.budget);
  const kinds = opts.kinds ?? ROUTE_KINDS;

  const declaration = atlas.declarationById.get(subjectId);
  const file = atlas.fileById.get(subjectId);
  if (!declaration && !file) {
    return empty(atlas, "connections", undefined);
  }

  // Declaration subject -> a declaration-grain neighbourhood, grouped into its files.
  // File subject -> a file-grain neighbourhood (calls lift through containment).
  const declarationGrain = declaration !== undefined;
  const lit = new Set<string>([subjectId]);
  for (const relation of atlas.relations.all) {
    if (!kinds.includes(relation.kind)) continue;
    const from = declarationGrain ? relation.src : liftToFile(atlas, relation.src);
    const to = declarationGrain ? relation.dst : liftToFile(atlas, relation.dst);
    if (from === subjectId && to !== undefined) lit.add(to);
    if (to === subjectId && from !== undefined) lit.add(from);
  }

  const containers = declarationGrain
    ? declarationContainers(atlas, lit)
    : [...lit]
        .map((id) => atlas.fileById.get(id))
        .filter((f): f is FileLot => f !== undefined)
        .sort((a, b) => cmp(a.path, b.path))
        .map((f) => fileContainer(atlas, f, []));

  const nodeOf = (id: string): string | undefined => {
    if (declarationGrain) return lit.has(id) ? id : undefined;
    const fileId = liftToFile(atlas, id);
    return fileId !== undefined && lit.has(fileId) ? fileId : undefined;
  };

  const subject = subjectOf(atlas, subjectId);
  const assembled = assemble({
    atlas,
    reader: new ClaimReader(store),
    budget,
    kinds,
    containers,
    nodeOf,
    grainOf: (id) => grainOf(atlas, id),
    // No boundary nodes here. The 1-hop set is CLOSED around the subject: every relation
    // incident to it already has both ends in bounds. A relation from a NEIGHBOUR out to
    // some 2-hop node answers a different question, and re-rooting on that neighbour is
    // how the user asks it (D31 breadcrumb re-root). Collapsing those into boundaries
    // would fill the "what connects to THIS thing" surface with things that do not.
    boundaryOf: () => undefined,
  });

  return {
    kind: "connections",
    subject,
    anchors: [subjectId],
    generation: atlas.generation,
    ...assembled,
  };
}

// ---------------------------------------------------------------------------
// Change Trace (D32) — a bounded EVENT projection, never the whole repo
// ---------------------------------------------------------------------------

/**
 * D32: changed anchors + direct observed 1-hop neighbours (a real expansion, not the
 * anchor-induced subgraph) + boundary aggregates.
 *
 * ROOT POLLUTION is a defect class here, and it is structurally impossible in this
 * kernel: no directory, scope or repo-root node is ever modelled, so no ancestor can
 * enter the lit set and inflate the viewport. The projection's containers are exactly the
 * lots of the lit anchors and their lit neighbours — the projection's own bbox IS the
 * event's viewport. Regression-tested.
 */
export function projectEvent(
  atlas: AtlasModel,
  store: Store,
  event: GuideEvent,
  opts: EventOptions = {},
): BoundedProjection {
  const budget = mergeBudget(DEFAULT_BUDGET, opts.budget);

  // 1. Anchors: a commit's `touches` (files AND declarations) + explicit hard anchors.
  //
  // A touched entity that is not an Atlas lot/atom cannot be a canvas anchor — but the two
  // reasons are DIFFERENT and must not be conflated into one weasel message:
  //   • not in the store at all (a `touches` dst with no entity row — measured: 460);
  //   • in the store, but not code (a doc/config file, or a retired symbol). D5 rules the
  //     canvas renders the CODE structure graph only; these stay reachable via search and
  //     Subject. A docs-only commit therefore has NO code anchors, and saying so plainly is
  //     the honest answer — not an empty canvas with no explanation.
  const anchors = new Set<string>();
  let unresolvedAnchors = 0;
  let nonCodeAnchors = 0;
  const add = (id: string): void => {
    if (atlas.declarationById.has(id) || atlas.fileById.has(id)) anchors.add(id);
    else if (store.getEntity(id) !== undefined) nonCodeAnchors += 1;
    else unresolvedAnchors += 1;
  };
  for (const commit of event.commits ?? []) {
    for (const relation of atlas.relations.outgoing.get(commit) ?? []) {
      if (relation.kind === "touches") add(relation.dst);
    }
  }
  for (const anchor of event.anchors ?? []) add(anchor);

  // 2. A real 1-hop expansion over the observed backbone routes.
  const lit = new Set(anchors);
  for (const anchor of anchors) {
    for (const relation of atlas.relations.outgoing.get(anchor) ?? []) {
      if (ROUTE_KINDS.includes(relation.kind) && relation.dstResolved) lit.add(relation.dst);
    }
    for (const relation of atlas.relations.incoming.get(anchor) ?? []) {
      if (ROUTE_KINDS.includes(relation.kind) && relation.srcResolved) lit.add(relation.src);
    }
  }

  // 3. Declarations show inside their lots; a lot enters ONLY because it is lit itself
  //    or holds a lit declaration — never because it is somebody's ancestor.
  const litDeclarations = [...lit].filter((id) => atlas.declarationById.has(id));
  const litFiles = new Set([
    ...[...lit].filter((id) => atlas.fileById.has(id)),
    ...litDeclarations.map((id) => atlas.declarationById.get(id)!.fileId),
  ]);

  const containers = [...litFiles]
    .map((id) => atlas.fileById.get(id))
    .filter((f): f is FileLot => f !== undefined)
    .sort((a, b) => cmp(a.path, b.path))
    .map((file) => {
      const shown = file.declarationIds
        .filter((id) => lit.has(id))
        .map((id) => atlas.declarationById.get(id))
        .filter((d): d is Declaration => d !== undefined);
      return fileContainer(atlas, file, shown);
    });

  const nodeOf = (id: string): string | undefined => {
    if (lit.has(id) && atlas.declarationById.has(id)) return id;
    if (litFiles.has(id)) return id;
    const declaration = atlas.declarationById.get(id);
    // A non-lit declaration of a lit file lifts to its lot; a declaration of an
    // unlit file is out of bounds and collapses into a boundary node.
    if (declaration && litFiles.has(declaration.fileId)) return declaration.fileId;
    return undefined;
  };

  const assembled = assemble({
    atlas,
    reader: new ClaimReader(store),
    budget,
    kinds: ROUTE_KINDS,
    containers,
    nodeOf,
    grainOf: (id) => grainOf(atlas, id),
    boundaryOf: (id) => scopeBoundary(atlas, id),
  });

  const notes = [...assembled.omitted.notes];
  if (nonCodeAnchors > 0) {
    notes.push(`${nonCodeAnchors} touched files are not code — find them in search`);
  }
  if (unresolvedAnchors > 0) {
    notes.push(`${unresolvedAnchors} touched entities are not in the store and cannot be shown`);
  }

  return {
    kind: "event",
    subject: undefined,
    anchors: [...anchors].sort(),
    generation: atlas.generation,
    ...assembled,
    omitted: { ...assembled.omitted, notes },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function scopeId(scope: string): string {
  return `scope:${scope}`;
}

/** `path` is inside directory `dir` (a bare scope name is a directory too). */
function underDirectory(path: string, dir: string): boolean {
  return dir === "" || path === dir || path.startsWith(`${dir}/`);
}

function allDeclarations(atlas: AtlasModel, file: FileLot): Declaration[] {
  return file.declarationIds
    .map((id) => atlas.declarationById.get(id))
    .filter((d): d is Declaration => d !== undefined);
}

/** The declarations' lots, each expanded to show ONLY the participating declarations. */
function declarationContainers(atlas: AtlasModel, lit: ReadonlySet<string>): ProjectedContainer[] {
  const byFile = new Map<string, Declaration[]>();
  for (const id of lit) {
    const declaration = atlas.declarationById.get(id);
    if (!declaration) continue;
    const bucket = byFile.get(declaration.fileId) ?? [];
    bucket.push(declaration);
    byFile.set(declaration.fileId, bucket);
  }
  return [...byFile.entries()]
    .sort((a, b) => cmp(a[0], b[0]))
    .map(([fileId, declarations]) => {
      const file = atlas.fileById.get(fileId);
      if (!file) throw new Error(`no lot for ${fileId}`);
      return fileContainer(atlas, file, declarations);
    });
}

function fileContainer(
  atlas: AtlasModel,
  file: FileLot,
  shown: readonly Declaration[],
): ProjectedContainer {
  const declarations: ProjectedDeclaration[] = [...shown]
    .sort((a, b) => a.span[0] - b.span[0] || cmp(a.id, b.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      symbolKind: d.symbolKind,
      path: d.path,
      span: d.span,
      // Filled in by `assemble` once the bounded edge set is known.
      degree: { inbound: 0, outbound: 0 },
      noVisibleRoute: false,
    }));
  return {
    id: file.id,
    grain: "file",
    name: file.name,
    path: file.path,
    scope: file.scope,
    declarations,
    // The TOTAL in the complete atlas — never the drawn count. This is what makes
    // `omittedDeclarations` an honest `+N more` (D33/D40).
    declarationCount: file.declarationIds.length,
    omittedDeclarations: file.declarationIds.length - declarations.length,
    omittedNoVisibleRoute: 0,
    expanded: declarations.length > 0,
    degree: { inbound: 0, outbound: 0 },
    noVisibleRoute: false,
  };
}

/** Out-of-bounds ends aggregate by SCOPE; clicking the boundary re-roots there (D30). */
function scopeBoundary(atlas: AtlasModel, atlasId: string): BoundaryRef | undefined {
  const scope =
    atlas.declarationById.get(atlasId)?.scope ?? atlas.fileById.get(atlasId)?.scope ?? undefined;
  if (scope === undefined) return undefined;
  return {
    id: `boundary:${scope}`,
    name: scope,
    path: scope,
    reroot: scope,
  };
}

function liftToFile(atlas: AtlasModel, atlasId: string): string | undefined {
  if (atlas.fileById.has(atlasId)) return atlasId;
  return atlas.declarationById.get(atlasId)?.fileId;
}

function grainOf(atlas: AtlasModel, nodeId: string): Grain {
  if (nodeId.startsWith("boundary:")) return "boundary";
  if (nodeId.startsWith("scope:")) return "scope";
  if (atlas.declarationById.has(nodeId)) return "declaration";
  return "file";
}

function subjectOf(atlas: AtlasModel, id: string): ProjectionSubject | undefined {
  const declaration = atlas.declarationById.get(id);
  if (declaration) {
    return { id, grain: "declaration", name: declaration.name, path: declaration.path };
  }
  const file = atlas.fileById.get(id);
  if (file) return { id, grain: "file", name: file.name, path: file.path };
  return undefined;
}

function empty(
  atlas: AtlasModel,
  kind: BoundedProjection["kind"],
  subject: ProjectionSubject | undefined,
): BoundedProjection {
  return {
    kind,
    subject,
    generation: atlas.generation,
    containers: [],
    boundaries: [],
    edges: [],
    groups: [],
    noVisibleRoute: { containerIds: [], omittedContainerCount: 0, declarations: [] },
    omitted: { containers: 0, declarations: 0, edges: 0, boundaryMembers: 0, notes: [] },
  };
}
