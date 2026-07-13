/**
 * Overview (D29) — "what is this repo", answered in ten seconds (E1).
 *
 * THE ONE THING THIS FILE IS FOR: the cards are positioned by DEPENDENCY DIRECTION, not in a
 * directory grid. `packages/cli` depends on `packages/core`, and that fact is a POSITION —
 * cli sits above core, on the one axis the whole map reads along — not a number in a corner.
 * The directory only decides WHICH scopes exist (D35: the directory selects, relationships
 * position). Nothing here sorts by path.
 *
 * The pipeline, in order, and every step of it is load-bearing:
 *
 *   projection (kernel)  ->  measure the real cards  ->  ELK layered  ->  render at the
 *   measured box, along ELK's routed sections
 *
 * D27 holds absolutely: zoom scales geometry and NOTHING else. There is no zoom threshold in
 * this file, no auto-expand, no LOD. The set of projected things changes only when the user
 * explicitly drills — which, in this slice, means entering a Scope Graph (slice G).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { AttentionCounts, BoundedProjection, GuideTree } from "../../data/dto.ts";
import { layoutGraph, type LayoutResult } from "../layout/elk.ts";
import { useMeasuredNodes, type Measurable } from "../layout/measure.tsx";
import { MAX_FIT_ZOOM, MIN_ZOOM } from "../layout/readability.ts";
import { OverviewCard, type CardTrust } from "./OverviewCard.tsx";
import { RoutedEdge, ROUTED_EDGE_TYPE, type RoutedEdgeData } from "../RoutedEdge.tsx";
import { PerfHud } from "../PerfHud.tsx";
import { useView } from "../../state/view.ts";

const ZERO: AttentionCounts = { changed: 0, needsReview: 0, conflict: 0 };

/**
 * The arrowhead's marker box, in React Flow's `markerUnits: "strokeWidth"` units.
 *
 * Direction is the one thing on this map that position CANNOT carry — the scope graph is
 * cyclic, so no placement makes "above" mean "depends on" for every route. The arrowhead is
 * therefore the load-bearing carrier, and it has to survive the fitted zoom: at MIN_ZOOM the
 * 14-unit default drew an arrow about five screen px long, which reads as the end of a line
 * rather than as an arrow. Markers are painted on top of the routes and are not part of the
 * ELK world, so this costs the layout nothing.
 */
const ARROW_UNITS = 26;

export interface OverviewCanvasProps {
  overview: BoundedProjection;
  tree: GuideTree;
}

export function OverviewCanvas(props: OverviewCanvasProps): React.ReactNode {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas(props: OverviewCanvasProps): React.ReactNode {
  const { overview, tree } = props;
  const select = useView((s) => s.select);
  const selectedId = useView((s) => s.selectedId);
  const hud = useView((s) => s.hud);
  const { fitView } = useReactFlow();

  const [layout, setLayout] = useState<LayoutResult | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // Attention + trust, per scope. Both come from the kernel; nothing is derived here beyond
  // picking the weakest tier, which is the ratified rule (PRODUCT-DESIGN §3), not a judgment.
  const attention = useMemo(() => {
    const byScope = new Map<string, AttentionCounts>();
    for (const root of tree.roots) byScope.set(root.id, root.attention);
    return byScope;
  }, [tree]);

  const trust = useMemo(() => trustByScope(overview), [overview]);

  const measurables: Measurable[] = useMemo(
    () =>
      overview.containers.map((container) => ({
        id: container.id,
        render: () => (
          <OverviewCard
            container={container}
            attention={attention.get(container.id) ?? ZERO}
            trust={trust.get(container.id) ?? NO_CLAIMS}
            noVisibleRoute={container.noVisibleRoute}
          />
        ),
      })),
    [overview, attention, trust],
  );

  const { boxes, layer } = useMeasuredNodes(measurables);

  // ELK: async, cancellable, and keyed by the projection + the measured sizes. A superseded
  // run can never overwrite a newer one — the abort signal refuses its own result.
  useEffect(() => {
    if (!boxes || boxes.size === 0) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await layoutGraph(
          {
            nodes: overview.containers.map((container) => {
              const box = boxes.get(container.id) ?? { width: 0, height: 0 };
              return { id: container.id, width: box.width, height: box.height };
            }),
            // `source` depends on `target`; direction DOWN puts the dependent ABOVE its
            // dependency. That is the whole of E1's "spatial direction".
            edges: overview.edges.map((edge) => ({
              id: edge.id,
              source: edge.src,
              target: edge.dst,
            })),
            direction: "DOWN",
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setLayout(result);
        setError(undefined);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => controller.abort();
  }, [overview, boxes]);

  const nodes: Node[] = useMemo(() => {
    if (!layout) return [];
    const byId = new Map(overview.containers.map((c) => [c.id, c]));
    return layout.nodes.map((node) => {
      const container = byId.get(node.id)!;
      return {
        id: node.id,
        type: "scope",
        position: { x: node.x, y: node.y },
        // PINNED to the measured box: what ELK laid out is what the DOM gets.
        width: node.width,
        height: node.height,
        style: { width: node.width, height: node.height },
        selected: selectedId === node.id,
        data: {
          container,
          attention: attention.get(node.id) ?? ZERO,
          trust: trust.get(node.id) ?? NO_CLAIMS,
          elk: { width: node.width, height: node.height },
        },
      } satisfies Node;
    });
  }, [layout, overview, attention, trust, selectedId]);

  const edges: Edge[] = useMemo(() => {
    if (!layout) return [];
    const byId = new Map(overview.edges.map((e) => [e.id, e]));
    const nameOf = new Map(overview.containers.map((c) => [c.id, c.name]));
    return layout.edges.map((edge) => {
      const aggregate = byId.get(edge.id)!;
      const data: RoutedEdgeData = {
        points: edge.points,
        routed: edge.routed,
        backEdge: edge.backEdge,
        kind: aggregate.claimSet.relationKind,
        count: aggregate.claimSet.count,
        weakest: aggregate.claimSet.confidenceSummary.weakest,
        freshness: aggregate.claimSet.freshness,
        claims: aggregate.claimSet.constituentClaimIds.length,
        srcName: nameOf.get(edge.source) ?? edge.source,
        dstName: nameOf.get(edge.target) ?? edge.target,
      };
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: ROUTED_EDGE_TYPE,
        // The arrowhead is the ONLY universal carrier of direction on this map, so it is
        // sized to be seen at the fitted zoom rather than at 1:1 — at MIN_ZOOM the previous
        // 14-unit marker rendered about five screen px and read as a line ending, not as an
        // arrow. It sits at the polyline's END, which is the node depended UPON, for forward
        // and cycle routes alike.
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: ARROW_UNITS,
          height: ARROW_UNITS,
          color: edge.backEdge ? "var(--edge-cycle)" : `var(--edge-${data.kind})`,
        },
        data,
      } satisfies Edge;
    });
  }, [layout, overview]);

  // Cold open: fit the whole map, but never below the readability floor. If the world does
  // not fit at MIN_ZOOM the user pans — an unreadable label is not an option we take.
  useEffect(() => {
    if (nodes.length === 0) return;
    void fitView({ padding: 0.04, minZoom: MIN_ZOOM, maxZoom: MAX_FIT_ZOOM, duration: 0 });
  }, [nodes, fitView]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => select(node.id, "canvas"),
    [select],
  );

  if (error) {
    return (
      <div data-testid="canvas-error" className="p-8 text-sm text-amber-300">
        The map could not be laid out: {error}
      </div>
    );
  }

  // The axis and the legend are STRIPS, not overlays. An overlay floating over the canvas
  // lands on top of whatever card happens to be under it — and "text does not appear to
  // overlap" is one of D41's explicit sight tests. A strip cannot overlap anything, and it
  // costs the canvas a few pixels of height, which is the correct trade.
  return (
    <div className="flex h-full w-full flex-col" data-testid="canvas-overview">
      {layer}
      <Axis
        cycles={layout?.cycles ?? []}
        cycleRoutes={(layout?.edges ?? []).filter((edge) => edge.backEdge).length}
      />
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={onNodeClick}
          minZoom={MIN_ZOOM}
          maxZoom={2.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          className="ctx-canvas"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1}
            color="var(--canvas-dot)"
          />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
        {hud && layout ? (
          <PerfHud
            layoutMs={layout.ms}
            nodes={layout.nodes.length}
            edges={layout.edges.length}
            issues={layout.issues}
          />
        ) : null}
      </div>
      <Legend
        omitted={overview.omitted.notes}
        cycleRoutes={(layout?.edges ?? []).filter((edge) => edge.backEdge).length}
      />
    </div>
  );
}

/**
 * The axis strip. A static screenshot must state which way dependency runs, or the reader has
 * to guess — and E1 is judged from a screenshot.
 *
 * IT MAY ONLY STATE WHAT THE PICTURE IN FRONT OF THE READER ACTUALLY DOES. Its first sentence
 * held on a DAG and nowhere else: this repo's scope graph is cyclic, the engine reverses the
 * cycle's routes to layer it, and for those routes the card ABOVE is the one depended upon —
 * the exact reverse of the rule the strip used to print. A universal claim that the map itself
 * contradicts is the fabricated ordering D34 forbids.
 *
 * So the convention is stated together with its exception, in one line, and every number in it
 * is read off the layout result — never a constant. When the graph really is acyclic the
 * exception clause disappears and the universal rule is stated plainly, because then it is
 * true.
 */
function Axis(props: {
  cycles: readonly (readonly string[])[];
  cycleRoutes: number;
}): React.ReactNode {
  const scopes = props.cycles.reduce((total, cycle) => total + cycle.length, 0);
  const acyclic = props.cycles.length === 0 || props.cycleRoutes === 0;

  return (
    <div
      data-testid="canvas-axis"
      className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-400"
    >
      <span className="shrink-0 font-medium text-zinc-200">Overview</span>
      <span className="shrink-0 text-zinc-600">·</span>
      <span className="shrink-0 text-zinc-200">
        the arrowhead points at what is depended on
      </span>
      <span className="shrink-0 text-zinc-600">·</span>
      {acyclic ? (
        <span>a card above another one depends on it (&darr;)</span>
      ) : (
        <span>
          a card above another depends on it &mdash; except on the{" "}
          <span className="ctx-cycle-ink">
            {props.cycleRoutes} &#8634;
          </span>{" "}
          {plural(props.cycleRoutes, "route", "routes")} of{" "}
          {props.cycles.length === 1
            ? `1 cycle (${scopes} scopes, no true order)`
            : `${props.cycles.length} cycles (${scopes} scopes, no true order)`}
        </span>
      )}
    </div>
  );
}

/** Stroke is the kind (D38). The word appears here once, not printed on every edge. */
function Legend(props: { omitted: readonly string[]; cycleRoutes: number }): React.ReactNode {
  return (
    <div
      data-testid="canvas-legend"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-500"
    >
      <span className="flex items-center gap-1.5 text-zinc-400">
        <svg width="26" height="8" aria-hidden="true">
          <line x1="0" y1="4" x2="26" y2="4" stroke="var(--edge-calls)" strokeWidth="1.6" />
        </svg>
        calls
      </span>
      <span className="flex items-center gap-1.5 text-zinc-400">
        <svg width="26" height="8" aria-hidden="true">
          <line
            x1="0"
            y1="4"
            x2="26"
            y2="4"
            stroke="var(--edge-imports)"
            strokeWidth="1.6"
            strokeDasharray="6 4"
          />
        </svg>
        imports
      </span>
      {props.cycleRoutes > 0 ? (
        // The exception, drawn the way it is drawn on the map. Colour marks the cycle; the
        // dash still marks the kind, so nothing about D38 is given up to say this.
        <span
          data-testid="legend-cycle"
          className="flex items-center gap-1.5 ctx-cycle-ink"
        >
          <svg width="26" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="26" y2="4" stroke="var(--edge-cycle)" strokeWidth="1.6" />
          </svg>
          &#8634; runs back up the map: in a cycle
        </span>
      ) : null}
      <span className="text-zinc-600">·</span>
      <span>the number on a route is how many relations it stands for</span>
      {props.omitted.map((note) => (
        <span key={note} className="text-amber-300">
          {note}
        </span>
      ))}
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ---------------------------------------------------------------------------

const NO_CLAIMS: CardTrust = { weakest: null, freshness: "fresh", claims: 0, none: true };

/**
 * The trust a card may claim = the weakest tier across the relation claims that touch its
 * scope. PRODUCT-DESIGN §3: an aggregate is never more confident than its weakest
 * constituent. A scope no relation claim names gets `none` — an honest absence, not a
 * flattering default.
 */
function trustByScope(overview: BoundedProjection): Map<string, CardTrust> {
  // Strongest first. An UNKNOWN tier (`null`) is the weakest thing there is — a claim whose
  // confidence the store does not record cannot lend its aggregate any.
  const order = ["EXACT", "LIKELY", "REPORTED", "STALE"];
  const rank = (tier: string | null): number => {
    if (tier === null) return order.length + 1;
    const at = order.indexOf(tier);
    return at === -1 ? order.length : at;
  };

  const trust = new Map<string, CardTrust>();
  for (const edge of overview.edges) {
    for (const id of [edge.src, edge.dst]) {
      const current = trust.get(id);
      const incoming = edge.claimSet.confidenceSummary.weakest;
      trust.set(id, {
        // The aggregate is never more confident than its weakest constituent (§3): keep the
        // HIGHER rank, i.e. the weaker tier. The first edge seeds it — the old code compared
        // against a seeded `null` (rank = worst) and so could never move off "unknown".
        weakest:
          current === undefined || rank(incoming) > rank(current.weakest)
            ? incoming
            : current.weakest,
        freshness:
          current?.freshness === "stale" || edge.claimSet.freshness === "stale"
            ? "stale"
            : "fresh",
        claims: (current?.claims ?? 0) + edge.claimSet.constituentClaimIds.length,
        none: false,
      });
    }
  }
  return trust;
}

/** The React Flow node. Hidden handles exist only so React Flow will attach an edge to it. */
function ScopeNode(props: NodeProps): React.ReactNode {
  const data = props.data as {
    container: OverviewCanvasProps["overview"]["containers"][number];
    attention: AttentionCounts;
    trust: CardTrust;
    elk: { width: number; height: number };
  };
  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
      <div
        className="h-full w-full"
        data-elk-width={data.elk.width}
        data-elk-height={data.elk.height}
      >
        <OverviewCard
          container={data.container}
          attention={data.attention}
          trust={data.trust}
          selected={props.selected}
          noVisibleRoute={data.container.noVisibleRoute}
        />
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
        isConnectable={false}
      />
    </>
  );
}

const NODE_TYPES = { scope: ScopeNode };
const EDGE_TYPES = { [ROUTED_EDGE_TYPE]: RoutedEdge };
