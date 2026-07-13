// LOD / spatial slice (D7/D12). PURE: (AtlasModel, viewport, zoom, opts) -> VisibleSlice.
//
// The renderer NEVER receives the full logical set. This function is the only
// path to React Flow, and it hard-caps nodes/edges with a deterministic drop
// order and disclosed omissions.

import { ancestors as ancestorsOf } from "./compile.js";
import type { AtlasEdge, AtlasModel, AtlasNode, Viewport, VisibleSlice } from "./types.js";

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
  showDecls: boolean;
}

/** Zoom bucket -> which hierarchy levels are readable (D9 semantic zoom). */
export function revealFor(zoom: number): Reveal {
  if (zoom < 0.35) return { maxFolderDepth: 1, showFiles: false, showDecls: false };
  if (zoom < 0.7) return { maxFolderDepth: 2, showFiles: false, showDecls: false };
  if (zoom < 1.2) return { maxFolderDepth: 99, showFiles: true, showDecls: false };
  return { maxFolderDepth: 99, showFiles: true, showDecls: true };
}

/** Discrete zoom bucket index (0..3) — used for slice-recompute hysteresis. */
export function zoomBucketIndex(zoom: number): number {
  if (zoom < 0.35) return 0;
  if (zoom < 0.7) return 1;
  if (zoom < 1.2) return 2;
  return 3;
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

export function computeSlice(
  model: AtlasModel,
  viewport: Viewport,
  zoom: number,
  opts: LodOptions = DEFAULT_LOD,
  litNodeIds?: ReadonlySet<string>,
  litEdgeKeys?: ReadonlySet<string>,
): VisibleSlice {
  const reveal = revealFor(zoom);
  const over = overscanViewport(viewport, opts.overscan);
  const cx = viewport.x + viewport.w / 2;
  const cy = viewport.y + viewport.h / 2;

  const isRevealed = (n: AtlasNode): boolean => {
    if (n.kind === "folder") return n.depth <= reveal.maxFolderDepth;
    if (n.kind === "file") return reveal.showFiles;
    return reveal.showDecls;
  };

  // 1. Candidate nodes: kind revealed at this zoom AND intersecting the overscan box.
  const candidates: AtlasNode[] = [];
  let declHidden = 0;
  let fileHidden = 0;
  for (const n of model.nodes) {
    if (!isRevealed(n)) {
      if (n.kind === "file") fileHidden++;
      else if (n.kind === "decl") declHidden++;
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

  const agg = new Map<string, AtlasEdge>();
  for (const e of logicalEdges) {
    const vs = nearestVisible(e.src);
    const vd = nearestVisible(e.dst);
    if (vs === null || vd === null || vs === vd) continue;
    // An aggregated edge is lit iff ANY constituent atom edge is lit (defect 2).
    const atomLit = litEdgeKeys ? litEdgeKeys.has(`${e.kind} ${e.src} ${e.dst}`) : false;
    const key = `${e.kind} ${vs} ${vd}`;
    const cur = agg.get(key);
    if (cur) {
      cur.count += e.count;
      if (atomLit) cur.lit = true;
    } else {
      agg.set(key, {
        src: vs,
        dst: vd,
        kind: e.kind,
        count: e.count,
        claimId: e.claimId,
        lit: atomLit,
      });
    }
  }

  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const aggEdges = [...agg.values()].sort(
    (a, b) => b.count - a.count || cmp(a.kind, b.kind) || cmp(a.src, b.src) || cmp(a.dst, b.dst),
  );
  const keptEdges = aggEdges.slice(0, opts.maxEdges);
  const droppedEdges = aggEdges.length - keptEdges.length;

  // 4. Omissions (non-empty whenever something is not shown).
  const omissions: string[] = [];
  if (declHidden > 0) omissions.push(`${declHidden} declaration nodes hidden below current zoom`);
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
