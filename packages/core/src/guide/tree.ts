/**
 * The scope/directory tree and the attention counts (D28 left rail, D29 cards).
 *
 * ADDITIVE to K1. Nothing in `atlas.ts` / `bounded.ts` / `projections.ts` changes: the tree
 * is a second, differently-shaped read of the SAME complete atlas, and the shell needs it
 * because the rail is DOM text at every zoom (D28) while the canvas is a bounded projection.
 * The renderer must not build it: `packages/guide` computes no projection, and grouping 621
 * lots into a directory hierarchy — with per-node roll-ups — is exactly that.
 *
 * ATTENTION IS MECHANICAL, AND HONEST ABOUT ITS ZEROES.
 *
 *   changed      a lot the code ingest saw AND that one of the `recentCommits` most recent
 *                commits `touches`. The window is D10's "latest N commits"; ordering is the
 *                commit's own git date, tie-broken by id, so it is deterministic and carries
 *                no ranking judgment (D25/D40 forbid importance ordering pre-Artifact-2).
 *   needsReview  a memory whose status is `needs-review` AND whose stored ANCHOR resolves to
 *                this lot / to a declaration in it.
 *   conflict     an OPEN conflict one of whose two claims has this lot (or a declaration in
 *                it) as its subject.
 *
 * The last two are ZERO on the current corpus, and that zero is a FACT the UI must be able to
 * explain rather than a blank it should hide: 113 memories are `needs-review` and 4 conflicts
 * are open, but every one of them is memory-to-memory or unanchored — no code anchor exists
 * (U13/D16: the anchor ladder is a later, separately-ordered store WRITE). So the counts that
 * cannot be placed on the map are COUNTED at the root, in `unanchored` — nothing vanishes
 * without a number attached (D33), and "0 changed" on a card never has to mean "we did not
 * look".
 */
import type { Store } from "../store/store.ts";
import type { AtlasModel, GenerationView } from "./types.ts";

/** D10's window: the latest N commits are what "recently changed" means. */
export const DEFAULT_RECENT_COMMITS = 20;

export interface AttentionCounts {
  changed: number;
  needsReview: number;
  conflict: number;
}

export type TreeNodeKind = "scope" | "dir" | "file";

/**
 * One rail row. `name` is NEVER empty — E1 forbids an unlabelled anything, and that rule
 * does not stop at the canvas edge.
 */
export interface TreeNode {
  id: string;
  kind: TreeNodeKind;
  /** Display label: the scope path, the directory segment, or the file's basename. */
  name: string;
  /** Repo-relative path. For a scope this equals `name`. */
  path: string;
  /** Lots at or below this node. `1` for a file. */
  fileCount: number;
  /** Declarations at or below this node (the complete atlas count — never budgeted). */
  declarationCount: number;
  /** Rolled up from the subtree; a file's own counts at the leaves. */
  attention: AttentionCounts;
  children: readonly TreeNode[];
}

export interface GuideTree {
  generation: GenerationView;
  /** One root per scope, in the atlas's own (sorted) scope order. */
  roots: readonly TreeNode[];
  /** Repo totals — the rail's header counts. */
  attention: AttentionCounts;
  /** How many commits `changed` looked back over. Rendered, never assumed. */
  recentCommits: number;
  /**
   * Attention that exists in the store but resolves to NO code anchor, so it can appear on
   * no card and no rail row. Disclosed, never dropped (D16/D33). On the current corpus this
   * is where all 113 needs-review memories and all 4 open conflicts live.
   */
  unanchored: { needsReview: number; conflict: number };
}

export interface TreeOptions {
  /** Size of the `changed` window. Default `DEFAULT_RECENT_COMMITS`. */
  recentCommits?: number;
}

export function projectTree(atlas: AtlasModel, store: Store, opts: TreeOptions = {}): GuideTree {
  const recentCommits = opts.recentCommits ?? DEFAULT_RECENT_COMMITS;

  const changed = changedLots(atlas, store, recentCommits);
  const review = anchoredAttention(atlas, needsReviewAnchors(store));
  const conflict = anchoredAttention(atlas, conflictSubjects(store));

  const attentionOf = (fileId: string): AttentionCounts => ({
    changed: changed.has(fileId) ? 1 : 0,
    needsReview: review.byLot.get(fileId) ?? 0,
    conflict: conflict.byLot.get(fileId) ?? 0,
  });

  const roots = atlas.scopes.map((scope) => {
    const lots = atlas.files.filter((f) => f.scope === scope);
    // A scope IS a directory, so its subtree is the directory tree below its own path.
    // `(root)` is the synthetic scope of repo-root files, which have no directory at all.
    const prefix = scope === "(root)" ? "" : scope;
    const children = directoryChildren(lots, prefix, attentionOf, atlas);
    return finish({
      id: `scope:${scope}`,
      kind: "scope",
      name: scope,
      path: prefix,
      children,
    });
  });

  return {
    generation: atlas.generation,
    roots,
    attention: sum(roots.map((r) => r.attention)),
    recentCommits,
    unanchored: {
      needsReview: review.unanchored,
      conflict: conflict.unanchored,
    },
  };
}

// ---------------------------------------------------------------------------
// The directory hierarchy under one scope
// ---------------------------------------------------------------------------

interface Draft {
  id: string;
  kind: TreeNodeKind;
  name: string;
  path: string;
  children: TreeNode[];
  /** Files only: their own counts. Directories roll up instead. */
  own?: { fileCount: number; declarationCount: number; attention: AttentionCounts };
}

/**
 * Group `lots` by their next path segment below `prefix`. Directories first, then files;
 * each group sorted by path. Deterministic, and it never invents a level: a directory node
 * exists only because a lot lives under it.
 */
function directoryChildren(
  lots: readonly AtlasModel["files"][number][],
  prefix: string,
  attentionOf: (fileId: string) => AttentionCounts,
  atlas: AtlasModel,
): TreeNode[] {
  const here: TreeNode[] = [];
  const dirs = new Map<string, AtlasModel["files"][number][]>();

  for (const lot of lots) {
    const rest = prefix === "" ? lot.path : lot.path.slice(prefix.length + 1);
    const cut = rest.indexOf("/");
    if (cut === -1) {
      here.push(
        finish({
          id: lot.id,
          kind: "file",
          name: lot.name,
          path: lot.path,
          children: [],
          own: {
            fileCount: 1,
            declarationCount: lot.declarationIds.length,
            attention: attentionOf(lot.id),
          },
        }),
      );
      continue;
    }
    const segment = rest.slice(0, cut);
    const bucket = dirs.get(segment) ?? [];
    bucket.push(lot);
    dirs.set(segment, bucket);
  }

  const directories = [...dirs.entries()]
    .sort((a, b) => cmp(a[0], b[0]))
    .map(([segment, bucket]) => {
      const path = prefix === "" ? segment : `${prefix}/${segment}`;
      return finish({
        id: `dir:${path}`,
        kind: "dir",
        name: segment,
        path,
        children: directoryChildren(bucket, path, attentionOf, atlas),
      });
    });

  here.sort((a, b) => cmp(a.path, b.path));
  return [...directories, ...here];
}

/** Roll the subtree up. A leaf carries its own counts; a directory carries its children's. */
function finish(draft: Draft): TreeNode {
  if (draft.own) {
    return {
      id: draft.id,
      kind: draft.kind,
      name: draft.name,
      path: draft.path,
      fileCount: draft.own.fileCount,
      declarationCount: draft.own.declarationCount,
      attention: draft.own.attention,
      children: draft.children,
    };
  }
  return {
    id: draft.id,
    kind: draft.kind,
    name: draft.name,
    path: draft.path,
    fileCount: draft.children.reduce((n, c) => n + c.fileCount, 0),
    declarationCount: draft.children.reduce((n, c) => n + c.declarationCount, 0),
    attention: sum(draft.children.map((c) => c.attention)),
    children: draft.children,
  };
}

// ---------------------------------------------------------------------------
// The three attention facts
// ---------------------------------------------------------------------------

/**
 * Lots touched by one of the N most recent commits.
 *
 * The order is the commit's own git date (`attrs.date`), descending, tie-broken by entity id
 * so two commits sharing a second still order the same way on every run. A commit with no
 * date sorts last rather than being dropped — an undated commit is a store fact too.
 *
 * A `touches` link onto a DECLARATION counts for its lot: the declaration changed, so the
 * file did. A `touches` link onto anything that is not an atlas atom/lot (a doc, a retired
 * symbol, an entity with no row) touches no lot and is simply not counted here — it is not
 * lost, it is just not a code change, and D5 rules the canvas renders code only.
 */
function changedLots(atlas: AtlasModel, store: Store, recentCommits: number): Set<string> {
  const commits = store
    .entitiesByKind("commit")
    .map((entity) => {
      const raw = entity.attrs["date"];
      const at = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
      return { id: entity.id, at: Number.isNaN(at) ? -1 : at };
    })
    .sort((a, b) => b.at - a.at || cmp(a.id, b.id))
    .slice(0, recentCommits);

  const lots = new Set<string>();
  for (const commit of commits) {
    for (const link of store.linksFrom(commit.id, "touches")) {
      const lotId = lotOf(atlas, link.dst);
      if (lotId !== undefined) lots.add(lotId);
    }
  }
  return lots;
}

/**
 * ONE attention item and every entity it points at. An item is the unit that gets counted —
 * a memory, a conflict — so that a conflict whose two claims share a lot counts ONCE there
 * rather than twice, and a memory anchored to three lots counts once on each.
 */
interface AttentionItem {
  targets: readonly string[];
}

/** Every `needs-review` memory, with the anchors the store actually holds for it. */
function needsReviewAnchors(store: Store): AttentionItem[] {
  return store
    .listMemoryEntries("needs-review")
    .map((row) => ({ targets: store.anchorsOf(row.entityId) }));
}

/** Every OPEN conflict, pointing at both of its claims' subjects. */
function conflictSubjects(store: Store): AttentionItem[] {
  return store.conflicts("open").map((conflict) => ({
    targets: [conflict.a, conflict.b]
      .map((claimId) => store.getClaim(claimId)?.subject)
      .filter((subject): subject is string => subject !== undefined),
  }));
}

/**
 * Resolve each item's targets onto lots. An item that lands on no lot at all is UNANCHORED
 * and counted as such — the number survives even though the pin does not (D16/D33).
 */
function anchoredAttention(
  atlas: AtlasModel,
  items: readonly AttentionItem[],
): { byLot: Map<string, number>; unanchored: number } {
  const byLot = new Map<string, number>();
  let unanchored = 0;
  for (const item of items) {
    const lots = new Set<string>();
    for (const target of item.targets) {
      const lotId = lotOf(atlas, target);
      if (lotId !== undefined) lots.add(lotId);
    }
    if (lots.size === 0) {
      unanchored += 1;
      continue;
    }
    for (const lotId of lots) byLot.set(lotId, (byLot.get(lotId) ?? 0) + 1);
  }
  return { byLot, unanchored };
}

/** The atlas lot an entity id belongs to: itself if a lot, its container if an atom. */
function lotOf(atlas: AtlasModel, entityId: string): string | undefined {
  if (atlas.fileById.has(entityId)) return entityId;
  return atlas.declarationById.get(entityId)?.fileId;
}

function sum(parts: readonly AttentionCounts[]): AttentionCounts {
  return {
    changed: parts.reduce((n, p) => n + p.changed, 0),
    needsReview: parts.reduce((n, p) => n + p.needsReview, 0),
    conflict: parts.reduce((n, p) => n + p.conflict, 0),
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
