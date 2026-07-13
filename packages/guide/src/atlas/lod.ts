// LOD / spatial slice (D7/D12). PURE: (AtlasModel, viewport, zoom, opts) -> VisibleSlice.
//
// The renderer NEVER receives the full logical set. This function is the only
// path to React Flow, and it hard-caps nodes/edges with a deterministic drop
// order and disclosed omissions.

import { ancestors as ancestorsOf } from "./compile.js";
import type { AtlasEdge, AtlasModel, AtlasNode, Viewport, VisibleSlice } from "./types.js";
import { accumulateClaims, emptyClaimAccumulator, finalizeClaimSet } from "./types.js";

export interface LodOptions {
  maxNodes: number;
  maxEdges: number;
  overscan: number;
}

export const DEFAULT_LOD: LodOptions = {
  maxNodes: 900,
  maxEdges: 1400,
  overscan: 1.5,
};

interface Reveal {
  maxFolderDepth: number;
  showFiles: boolean;
}

// Semantic-zoom levels (D9). Under the Option-A map slim-down the map answers
// "where" with folders + files ONLY — declarations never render on the map, so
// the ladder is folders -> files (three discrete levels), not four. The numeric
// zoom is mapped onto a level with HYSTERESIS so a zoom sitting near a boundary
// cannot flap the visible slice open/closed. UP[k] = zoom needed to REVEAL level
// k; DOWN[k] = the LOWER zoom needed to DROP back out of level k. DOWN < UP for
// every level is the whole point (asserted in tests). The UP thresholds equal
// the historical folder/file boundaries, so a fresh (no-history) mapping is
// byte-for-byte what revealFor() used to return up to the file level.
export const ZOOM_UP: readonly number[] = [0, 0.35, 0.7];
export const ZOOM_DOWN: readonly number[] = [0, 0.28, 0.56];

const REVEAL_BY_LEVEL: readonly Reveal[] = [
  { maxFolderDepth: 1, showFiles: false },
  { maxFolderDepth: 2, showFiles: false },
  { maxFolderDepth: 99, showFiles: true },
];

const MAX_LEVEL = REVEAL_BY_LEVEL.length - 1;

/** Reveal spec for a discrete semantic-zoom level (0..3). */
export function revealForLevel(level: number): Reveal {
  const clamped = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  return REVEAL_BY_LEVEL[clamped];
}

/**
 * Next semantic-zoom level given the CURRENT level and a new zoom, with
 * hysteresis: climb only when zoom clears the (higher) UP threshold of the next
 * level; drop only when zoom falls below the (lower) DOWN threshold of the
 * current level. Monotone and flap-free — repeatedly calling it inside the dead
 * band [DOWN[k], UP[k]) returns the same level. Pass current=0 for a fresh map.
 */
export function nextZoomLevel(current: number, zoom: number): number {
  let level = Math.max(0, Math.min(MAX_LEVEL, Math.round(current)));
  while (level < MAX_LEVEL && zoom >= ZOOM_UP[level + 1]) level++;
  while (level > 0 && zoom < ZOOM_DOWN[level]) level--;
  return level;
}

/** Fresh (history-free) zoom -> level. Equivalent to the old bucket boundaries. */
export function zoomBucketIndex(zoom: number): number {
  return nextZoomLevel(0, zoom);
}

/** Zoom bucket -> which hierarchy levels are readable (D9 semantic zoom). */
export function revealFor(zoom: number): Reveal {
  return revealForLevel(zoomBucketIndex(zoom));
}

function intersects(a: Viewport, b: Viewport): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function overscanViewport(vp: Viewport, factor: number): Viewport {
  const growX = (vp.w * (factor - 1)) / 2;
  const growY = (vp.h * (factor - 1)) / 2;
  return { x: vp.x - growX, y: vp.y - growY, w: vp.w * factor, h: vp.h * factor };
}

function centerDist(node: AtlasNode, cx: number, cy: number): number {
  const nx = node.rect.x + node.rect.w / 2;
  const ny = node.rect.y + node.rect.h / 2;
  return Math.hypot(nx - cx, ny - cy);
}

/** Bounding box over all root regions — used for "Fit repo". */
export function fitViewport(model: AtlasModel): Viewport {
  const root = model.nodes.find((n) => n.parent === null);
  if (root) return { ...root.rect };
  return { x: 0, y: 0, w: 1, h: 1 };
}

/** Grow a rect by a fraction of its own size on every side (padding). */
function padRect(r: Viewport, frac: number): Viewport {
  const gx = r.w * frac;
  const gy = r.h * frac;
  return { x: r.x - gx, y: r.y - gy, w: r.w + gx * 2, h: r.h + gy * 2 };
}

/**
 * Cold-open viewport (D10): the DENSEST code region touched by the default event
 * — the folder region containing the most lit FILE lots — padded by `pad`
 * (default 0.25). NOT the whole-repo lit bbox (which opens the map at ~0.13).
 * With no lit files (no code activity) it fits the repository.
 *
 * "Densest region" is resolved at a fixed folder depth so the frame is a real
 * neighbourhood, not a single file: each lit file votes for its ancestor folder
 * at `regionDepth` (default 1 = a top-level area), and the winner's padded rect
 * is returned. Ties break on the lexicographically smallest region id.
 */
export function hotspotViewport(
  model: AtlasModel,
  litNodeIds: ReadonlySet<string> | undefined,
  pad = 0.25,
  regionDepth = 1,
): Viewport {
  if (!litNodeIds || litNodeIds.size === 0) return fitViewport(model);

  const litFiles: AtlasNode[] = [];
  for (const id of litNodeIds) {
    const n = model.nodeIndex.get(id);
    if (n && n.kind === "file") litFiles.push(n);
  }
  if (litFiles.length === 0) return fitViewport(model);

  // Each lit file votes for its ancestor folder at regionDepth (or its immediate
  // parent folder if it is shallower than regionDepth).
  const regionOf = (file: AtlasNode): AtlasNode | null => {
    let chosen: AtlasNode | null = null;
    for (const anc of ancestorsOf(model, file.id)) {
      if (anc.kind !== "folder") continue;
      chosen = anc; // ancestorsOf walks nearest -> root; keep updating
      if (anc.depth === regionDepth) return anc;
    }
    return chosen; // shallower than regionDepth: nearest folder toward root
  };

  const counts = new Map<string, number>();
  const regionById = new Map<string, AtlasNode>();
  for (const f of litFiles) {
    const region = regionOf(f);
    if (!region) continue;
    counts.set(region.id, (counts.get(region.id) ?? 0) + 1);
    regionById.set(region.id, region);
  }
  if (counts.size === 0) return fitViewport(model);

  let bestId = "";
  let bestCount = -1;
  for (const [id, c] of counts) {
    if (c > bestCount || (c === bestCount && id < bestId)) {
      bestCount = c;
      bestId = id;
    }
  }
  const region = regionById.get(bestId);
  if (!region) return fitViewport(model);
  return padRect(region.rect, pad);
}

/** Dynamic per-frame slice inputs that are NOT part of the static LOD budget. */
export interface SliceState {
  /**
   * Explicit semantic-zoom level (0..3) to render at. When set it overrides the
   * fresh zoom->level mapping so the caller can carry hysteresis state across
   * frames (D9 flap-free zoom). Omit for a history-free mapping from `zoom`.
   */
  revealLevel?: number;
  /**
   * Folder ids whose next hierarchy level is PINNED open regardless of the
   * current zoom (D9 "click pins an expansion"). A pinned folder's direct
   * children are revealed even at overview zoom; cleared on Esc/deselect.
   */
  pinnedIds?: ReadonlySet<string>;
}

export function computeSlice(
  model: AtlasModel,
  viewport: Viewport,
  zoom: number,
  opts: LodOptions = DEFAULT_LOD,
  litNodeIds?: ReadonlySet<string>,
  litEdgeKeys?: ReadonlySet<string>,
  state?: SliceState,
): VisibleSlice {
  const reveal =
    state?.revealLevel !== undefined ? revealForLevel(state.revealLevel) : revealFor(zoom);
  const pinned = state?.pinnedIds;
  const over = overscanViewport(viewport, opts.overscan);
  const cx = viewport.x + viewport.w / 2;
  const cy = viewport.y + viewport.h / 2;

  const isRevealed = (n: AtlasNode): boolean => {
    // A pinned folder's direct children are revealed at any zoom (click-pin, D9).
    if (n.parent !== null && pinned && pinned.has(n.parent)) return true;
    if (n.kind === "folder") return n.depth <= reveal.maxFolderDepth;
    if (n.kind === "file") return reveal.showFiles;
    // Declarations never render on the map (Option-A slim-down): the map grain
    // is folders + files only. Lit decls light their FILE lot via the aggregation
    // below; searching/lighting still address decl atoms in the kernel model.
    return false;
  };

  // 1. Candidate nodes: kind revealed at this zoom AND intersecting the overscan box.
  //    Decl atoms are never map nodes, so they are skipped outright (not counted
  //    as a "hidden" omission — they are simply not part of this view's grain).
  const candidates: AtlasNode[] = [];
  let fileHidden = 0;
  for (const n of model.nodes) {
    if (n.kind === "decl") continue;
    if (!isRevealed(n)) {
      if (n.kind === "file") fileHidden++;
      continue;
    }
    if (intersects(over, n.rect)) candidates.push(n);
  }

  // 1b. Lit protection + aggregation (D22/D25): a lit node hidden by the current
  // zoom promotes its nearest REVEALED ancestor to a lit aggregation, so the
  // Change Trace stays legible at every zoom and lit atoms never vanish.
  const litVisible = new Set<string>();
  const forceKeep = new Set<string>();
  if (litNodeIds && litNodeIds.size > 0) {
    const candidateIds = new Set(candidates.map((n) => n.id));
    for (const id of litNodeIds) {
      const node = model.nodeIndex.get(id);
      if (!node) continue;
      if (candidateIds.has(id)) {
        litVisible.add(id);
        forceKeep.add(id);
        continue;
      }
      // Walk to the nearest revealed ancestor that is (or can be) a candidate.
      for (const anc of ancestorsOf(model, id)) {
        if (isRevealed(anc) && intersects(over, anc.rect)) {
          if (!candidateIds.has(anc.id)) {
            candidates.push(anc);
            candidateIds.add(anc.id);
          }
          litVisible.add(anc.id);
          forceKeep.add(anc.id);
          break;
        }
      }
    }
  }

  // 2. Cap: force-keep lit nodes first, then shallow + near-center; drop deepest, then farthest.
  const rank = (n: AtlasNode) => (forceKeep.has(n.id) ? 0 : 1);
  const ordered = [...candidates].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.depth - b.depth ||
      centerDist(a, cx, cy) - centerDist(b, cx, cy) ||
      (a.id < b.id ? -1 : 1),
  );
  const kept = ordered.slice(0, opts.maxNodes);
  const droppedNodes = ordered.length - kept.length;
  const visibleIds = new Set(kept.map((n) => n.id));

  // 3. Aggregate logical edges to nearest visible ancestor.
  const nearestVisible = (id: string): string | null => {
    let cur = model.nodeIndex.get(id);
    while (cur) {
      if (visibleIds.has(cur.id)) return cur.id;
      cur = cur.parent ? model.nodeIndex.get(cur.parent) : undefined;
    }
    return null;
  };

  const logicalEdges: AtlasEdge[] = [
    ...model.edges.sym,
    ...model.edges.file.filter((e) => e.kind === "imports"),
  ];

  interface EdgeAgg {
    src: string;
    dst: string;
    kind: "calls" | "imports";
    count: number;
    claims: ReturnType<typeof emptyClaimAccumulator>;
    lit: boolean;
  }
  const agg = new Map<string, EdgeAgg>();
  for (const e of logicalEdges) {
    const vs = nearestVisible(e.src);
    const vd = nearestVisible(e.dst);
    if (vs === null || vd === null || vs === vd) continue;
    // An aggregated edge is lit iff ANY constituent atom edge is lit (defect 2).
    const atomLit = litEdgeKeys ? litEdgeKeys.has(`${e.kind} ${e.src} ${e.dst}`) : false;
    const key = `${e.kind} ${vs} ${vd}`;
    let cur = agg.get(key);
    if (!cur) {
      cur = {
        src: vs,
        dst: vd,
        kind: e.kind,
        count: 0,
        claims: emptyClaimAccumulator(),
        lit: false,
      };
      agg.set(key, cur);
    }
    cur.count += e.count;
    // Visible-ancestor claim-set rollup (D33): union constituent ids of every
    // atom edge folded into this visible aggregate; carry omitted counts forward.
    accumulateClaims(cur.claims, e.constituentClaimIds, e.omittedClaimCount);
    if (atomLit) cur.lit = true;
  }

  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const aggEdges: AtlasEdge[] = [...agg.values()]
    .sort(
      (a, b) => b.count - a.count || cmp(a.kind, b.kind) || cmp(a.src, b.src) || cmp(a.dst, b.dst),
    )
    .map((a) => {
      const cs = finalizeClaimSet(a.claims);
      return {
        src: a.src,
        dst: a.dst,
        kind: a.kind,
        count: a.count,
        constituentClaimIds: cs.constituentClaimIds,
        omittedClaimCount: cs.omittedClaimCount,
        lit: a.lit,
      };
    });
  const keptEdges = aggEdges.slice(0, opts.maxEdges);
  const droppedEdges = aggEdges.length - keptEdges.length;

  // The map is quiet at rest: structural edges are not drawn except the lit
  // Change Trace trunk, selection-adjacent, and hover pre-highlight edges (the
  // renderer decides which of the slice edges to paint). No slice-level noise
  // floor is needed — an edge nobody has lit or selected simply is not drawn.

  // 4. Omissions (non-empty whenever something is not shown).
  const omissions: string[] = [];
  if (fileHidden > 0)
    omissions.push(`${fileHidden} file lots aggregated into folder regions at current zoom`);
  if (droppedNodes > 0) {
    omissions.push(
      `${droppedNodes} nodes beyond the ${opts.maxNodes}-node budget dropped (deepest, farthest first)`,
    );
  }
  if (droppedEdges > 0) {
    omissions.push(
      `${droppedEdges} edges beyond the ${opts.maxEdges}-edge budget dropped (lowest count first)`,
    );
  }

  const logicalEdgeCount =
    model.edges.sym.length + model.edges.file.filter((e) => e.kind === "imports").length;

  return {
    nodes: kept,
    edges: keptEdges,
    counts: {
      logicalNodes: model.nodes.length,
      logicalEdges: logicalEdgeCount,
      visibleNodes: kept.length,
      visibleEdges: keptEdges.length,
    },
    omissions,
    generation: model.generations,
    projectionId: model.projectionId,
    litVisibleIds: [...litVisible].filter((id) => visibleIds.has(id)).sort(cmp),
  };
}
