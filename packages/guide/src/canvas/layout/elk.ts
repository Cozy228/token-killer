/**
 * The layout engine seam (D34/D37). ONE process decides node placement, port assignment and
 * edge channels — routing is not a post-pass over frozen coordinates.
 *
 * ATTRIBUTION — the ELK integration below is adapted from
 * `.research/understand-anything/understand-anything-plugin/packages/dashboard/src/utils/`
 * (`elk-layout.ts` `repairElkInput` / `applyElkLayout`, and `layout.ts`
 * `ELK_DEFAULT_LAYOUT_OPTIONS` / `nodesToElkInput`), MIT licence,
 * Copyright (c) 2026 Yuxiang Lin / Infinite Universe, Inc. Its input repair, its option set
 * and its `elk.bundled.js` entry point are reused with thanks. Its 1,580-line god component
 * is not.
 *
 * THREE OF ITS BEHAVIOURS ARE DELIBERATELY NOT REPRODUCED (verified in its source
 * 2026-07-14; each is a ruled-out defect here):
 *
 *  1. `mergeElkPositions` (`utils/layout.ts:231-266`) reads only `children[].{x,y,w,h}` and
 *     never touches `positioned.edges`. It asks ELK for ORTHOGONAL routing, ELK routes every
 *     edge, and it then DISCARDS every routed section and lets React Flow draw default
 *     centre-to-centre curves. `readSections()` below consumes them, and `routed === false`
 *     is a disclosed condition rather than a silent fallback (D33/D37).
 *  2. It feeds ELK fixed 280x120 boxes while rendering a `min-w-180/max-w-220` auto-height
 *     card. Here the ELK box IS the measured rendered box — `measure.ts` reads it off the
 *     real component with the real CSS, and the renderer pins the node to the very same
 *     numbers. A `LayoutRequest` cannot even express a size the renderer did not measure.
 *  3. It auto-expands containers above zoom 1.0. D27 forbids zoom-driven projection changes
 *     outright: zoom scales geometry, nothing else. Nothing in this module reads the zoom.
 */
import ELK from "elkjs/lib/elk.bundled.js";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutNodeInput {
  id: string;
  /** The REAL rendered width, in world units. Measured, never assumed. */
  width: number;
  /** The REAL rendered height, in world units. Measured, never assumed. */
  height: number;
}

export interface LayoutEdgeInput {
  id: string;
  /** `source` DEPENDS ON `target` (caller -> callee, importer -> imported). */
  source: string;
  target: string;
}

export interface LayoutRequest {
  nodes: readonly LayoutNodeInput[];
  edges: readonly LayoutEdgeInput[];
  /**
   * `DOWN` puts dependents above their dependencies — the axis along which D34 requires
   * dependency direction to be legible as spatial direction.
   */
  direction?: "DOWN" | "RIGHT";
  /** Extra ELK options, merged over the defaults. */
  options?: Readonly<Record<string, string>>;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  /**
   * The polyline the renderer draws, in the SAME world coordinates as the nodes:
   * `[startPoint, ...bendPoints, endPoint]`, straight from ELK's routed section. The
   * endpoints sit on the nodes' BORDERS at ELK's assigned ports — never at their centres.
   */
  points: readonly LayoutPoint[];
  /**
   * True when `points` came from an ELK section. False is a real, disclosed condition (ELK
   * routed nothing for this edge) and the renderer says so — it does not quietly substitute
   * a curve, which is exactly how the reference lost its routing.
   */
  routed: boolean;
  /**
   * True when this edge runs AGAINST the layout axis: `target` was placed upstream of
   * `source`, so ELK had to reverse the edge to layer the graph at all (it is in the
   * feedback arc set of a cycle).
   *
   * This is READ OFF THE LAYOUT RESULT — the two nodes' own layer coordinates — not guessed
   * and not hardcoded. It is the fact that makes the spatial convention non-universal: for a
   * back edge, "above" means the OPPOSITE of "depends on". The renderer must therefore draw
   * it distinguishably, and the map must never state a rule that these edges contradict
   * (D34: a false ordering is never fabricated for a cycle; D37: direction always explicit).
   */
  backEdge: boolean;
}

export interface LayoutIssue {
  level: "auto-corrected" | "dropped" | "fatal";
  category: string;
  message: string;
}

export interface LayoutResult {
  nodes: readonly LayoutNode[];
  edges: readonly LayoutEdge[];
  /**
   * The dependency cycles among the laid-out nodes: each entry is one strongly connected
   * component of size >= 2, sorted, and the components sorted among themselves.
   *
   * A cycle is the exact set of nodes for which NO top-to-bottom order is true. The layered
   * engine still has to stack them somewhere, so the picture necessarily shows one member
   * above another — and that stacking carries no dependency meaning. Naming the block is what
   * keeps the map from fabricating an ordering it does not have (D34).
   */
  cycles: readonly (readonly string[])[];
  /** The laid-out world's own bounding box. */
  width: number;
  height: number;
  /** Wall-clock of the ELK call — the perf HUD's only number that is not invented. */
  ms: number;
  issues: readonly LayoutIssue[];
}

/**
 * Defaults for the dependency-direction layout.
 *
 * `considerModelOrder` + `GREEDY_MODEL_ORDER` cycle breaking are what make this
 * DETERMINISTIC in the presence of the repo's real cycles (measured: 5 SCCs at file grain;
 * the scope graph has them too — `src` and `tests` call each other). Given the same input
 * ARRAY ORDER, ELK resolves each cycle the same way every run; `layoutGraph` sorts its input,
 * so the array order is a function of the data alone (D34: input array order never changes
 * the result).
 */
export const ELK_LAYERED_OPTIONS: Readonly<Record<string, string>> = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  // Spacing is what keeps routes visually SEPARABLE (D37/E6) rather than merely
  // non-overlapping: edges get their own channels between the layers. It is also the number
  // that decides whether the map FITS at the readability floor — the between-layers gap is
  // multiplied by the layer count, so it is the single biggest term in the world's height.
  // Tuned against the real corpus: 9 scopes over 6 layers must fit a 1440x900 viewport at
  // MIN_ZOOM, or E1's "without touching the mouse" is a lie.
  "elk.spacing.nodeNode": "36",
  "elk.layered.spacing.nodeNodeBetweenLayers": "46",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.edgeEdge": "12",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
  "elk.layered.spacing.edgeNodeBetweenLayers": "20",
  "elk.padding": "[top=12,left=12,right=12,bottom=12]",
};

const elk = new ELK();

/**
 * Lay the graph out. Async and cancellable: elkjs itself cannot be aborted mid-run, so an
 * aborted call still finishes inside the worker but its RESULT is refused here — the caller
 * can never be handed a layout it no longer wants.
 */
export async function layoutGraph(
  request: LayoutRequest,
  signal?: AbortSignal,
): Promise<LayoutResult> {
  const { graph, issues } = buildGraph(request);
  const started = performance.now();

  let positioned: ElkNode;
  try {
    positioned = (await elk.layout(graph as never)) as unknown as ElkNode;
  } catch (error) {
    throw new Error(`ELK layout failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const ms = performance.now() - started;

  if (signal?.aborted) throw new DOMException("layout superseded", "AbortError");

  const nodes: LayoutNode[] = (positioned.children ?? []).map((child) => ({
    id: child.id,
    x: child.x ?? 0,
    y: child.y ?? 0,
    // ELK echoes back the width/height we gave it, which is the measured rendered box.
    width: child.width ?? 0,
    height: child.height ?? 0,
  }));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const axis = (request.direction ?? "DOWN") === "RIGHT" ? "x" : "y";
  const edges: LayoutEdge[] = (positioned.edges ?? []).map((edge) =>
    readSections(edge, byId, axis, issues),
  );

  return {
    nodes,
    edges,
    cycles: stronglyConnected(edges),
    width: positioned.width ?? bounds(nodes).width,
    height: positioned.height ?? bounds(nodes).height,
    ms,
    issues,
  };
}

/**
 * THE LINE THE REFERENCE DID NOT WRITE. ELK's routed section is the layout's own answer to
 * "where does this edge run" — including the port it leaves from and the port it arrives at,
 * which is what makes a fan-out readable as a fan-out (D37). Reading `children` and throwing
 * `edges` away means asking for orthogonal routing and then drawing a curve between two
 * centres, through whatever happens to be in the way.
 */
function readSections(
  edge: ElkEdge,
  nodes: ReadonlyMap<string, LayoutNode>,
  axis: "x" | "y",
  issues: LayoutIssue[],
): LayoutEdge {
  const source = edge.sources[0] ?? "";
  const target = edge.targets[0] ?? "";
  const section = edge.sections?.[0];
  const backEdge = runsAgainstAxis(nodes, source, target, axis);

  if (!section) {
    // Not a fallback that hides itself: the edge is drawn border-to-border and DECLARED
    // unrouted, so the disclosure survives into the UI and into the test.
    issues.push({
      level: "auto-corrected",
      category: "elk-no-section",
      message: `ELK returned no routed section for ${edge.id}; drawn unrouted.`,
    });
    return {
      id: edge.id,
      source,
      target,
      points: fallback(nodes, source, target),
      routed: false,
      backEdge,
    };
  }

  const points: LayoutPoint[] = [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ].map((p) => ({ x: p.x, y: p.y }));

  return { id: edge.id, source, target, points, routed: true, backEdge };
}

/**
 * Did the engine have to reverse this edge to layer the graph?
 *
 * Read off the RESULT: the target's layer coordinate against the source's, on the layout's
 * own axis. ELK's layered algorithm places `target` downstream of `source` for every edge it
 * did NOT reverse; the ones it reversed (its feedback arc set) are exactly the ones whose
 * target ends up upstream. Same-layer edges are neither and are not back edges.
 *
 * Note what this does NOT do: it does not read the section's own start/end to decide. ELK
 * RESTORES a reversed edge's routed section to run from the declared source to the declared
 * target (verified against elkjs 0.10 on this repo's real scope graph, and pinned by a test
 * in `tests/layout.test.ts`), so the polyline — and therefore the arrowhead at its end —
 * already points at the dependency. What is reversed is the edge's relationship to the AXIS,
 * and that is what the axis-position test detects.
 */
function runsAgainstAxis(
  nodes: ReadonlyMap<string, LayoutNode>,
  source: string,
  target: string,
  axis: "x" | "y",
): boolean {
  const a = nodes.get(source);
  const b = nodes.get(target);
  if (!a || !b) return false;
  return b[axis] < a[axis];
}

/**
 * The cycle blocks: Tarjan's strongly connected components over the drawn edges, keeping only
 * the components with more than one member (a component of one is an ordinary node).
 *
 * Every back edge lies inside one of these. The component — not the back edge alone — is the
 * set of nodes among which the picture's top-to-bottom stacking means nothing.
 */
function stronglyConnected(edges: readonly LayoutEdge[]): readonly (readonly string[])[] {
  const out = new Map<string, string[]>();
  for (const edge of edges) {
    if (!out.has(edge.source)) out.set(edge.source, []);
    if (!out.has(edge.target)) out.set(edge.target, []);
    out.get(edge.source)!.push(edge.target);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let next = 0;

  const visit = (node: string): void => {
    index.set(node, next);
    low.set(node, next);
    next += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbour of out.get(node) ?? []) {
      if (!index.has(neighbour)) {
        visit(neighbour);
        low.set(node, Math.min(low.get(node)!, low.get(neighbour)!));
      } else if (onStack.has(neighbour)) {
        low.set(node, Math.min(low.get(node)!, index.get(neighbour)!));
      }
    }

    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      for (;;) {
        const member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
        if (member === node) break;
      }
      if (component.length > 1) components.push(component.sort(cmp));
    }
  };

  for (const node of [...out.keys()].sort(cmp)) {
    if (!index.has(node)) visit(node);
  }

  return components.sort((a, b) => cmp(a[0] ?? "", b[0] ?? ""));
}

/** Border-to-border, never centre-to-centre. Used only when ELK routed nothing. */
function fallback(
  nodes: ReadonlyMap<string, LayoutNode>,
  source: string,
  target: string,
): LayoutPoint[] {
  const a = nodes.get(source);
  const b = nodes.get(target);
  if (!a || !b) return [];
  return [
    { x: a.x + a.width / 2, y: a.y + a.height },
    { x: b.x + b.width / 2, y: b.y },
  ];
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface ElkPort {
  x: number;
  y: number;
}
interface ElkSection {
  startPoint: ElkPort;
  endPoint: ElkPort;
  bendPoints?: ElkPort[];
}
interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: ElkSection[];
}
interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
}

/**
 * Repair, then sort. Adapted from the MIT reference's `repairElkInput` — a node without a
 * size and an edge pointing at a node that is not there are both defects ELK answers with an
 * exception, and a local tool should say what is wrong rather than blank the canvas.
 *
 * The SORT is ours and is load-bearing: `elk.layered.considerModelOrder` makes ELK's cycle
 * breaking depend on the input array order, so the array order has to be a pure function of
 * the data (D34's determinism constraint), not of whatever order the DTO happened to arrive
 * in.
 */
function buildGraph(request: LayoutRequest): { graph: ElkNode; issues: LayoutIssue[] } {
  const issues: LayoutIssue[] = [];

  const sized = [...request.nodes]
    .filter((node) => {
      if (node.width > 0 && node.height > 0) return true;
      issues.push({
        level: "dropped",
        category: "elk-missing-dimensions",
        message: `node ${node.id} was not measured; it is not on the map.`,
      });
      return false;
    })
    .sort((a, b) => cmp(a.id, b.id));

  const ids = new Set(sized.map((n) => n.id));
  const edges = [...request.edges]
    .filter((edge) => {
      if (ids.has(edge.source) && ids.has(edge.target)) return true;
      issues.push({
        level: "dropped",
        category: "elk-orphan-edge",
        message: `relation ${edge.id} points outside the projected set; it is not drawn.`,
      });
      return false;
    })
    .sort((a, b) => cmp(a.id, b.id));

  return {
    graph: {
      id: "root",
      layoutOptions: {
        ...ELK_LAYERED_OPTIONS,
        "elk.direction": request.direction ?? "DOWN",
        ...request.options,
      },
      children: sized.map((node) => ({
        id: node.id,
        width: node.width,
        height: node.height,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    },
    issues,
  };
}

function bounds(nodes: readonly LayoutNode[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width);
    height = Math.max(height, node.y + node.height);
  }
  return { width, height };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
