// The ONLY module that imports @xyflow/react (renderer seam, D12). Everything
// upstream sees the GraphRenderer contract, never React Flow types.
//
// Edges are drawn by our own SVG layer inside the viewport transform, NOT by
// React Flow's edge system. Reason: RF v12 will not route an edge until both
// endpoint nodes expose measured Handle bounds; our custom lot/decl nodes have
// no handles, so RF silently dropped every edge. Our edges are precomputed
// straight segments from rect geometry, so one SVG layer (with non-scaling
// strokes) is simpler, faster (one element tree, not N components), keeps the
// D12 seam honest, and feeds variant.EdgePath directly.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AtlasNode } from "../atlas/types.js";
import type { EdgeGeometry } from "../variants/types.js";
import { UNIT, edgeKey, type GraphRendererProps, type LitState, type RendererApi } from "./GraphRenderer.js";

interface AtlasNodeData extends Record<string, unknown> {
  atlas: AtlasNode;
  lit: boolean;
  dimmed: boolean;
  focused: boolean;
  render: GraphRendererProps["variant"]["NodeContent"];
}

type AtlasFlowNode = Node<AtlasNodeData, "atlas">;

// Memoized so an unchanged node (identical lit/dimmed/focused/atlas) does not
// re-render during a focus-only or viewport change (defect 3).
const AtlasNodeComp = memo(
  function AtlasNodeComp({ data }: NodeProps<AtlasFlowNode>) {
    const Content = data.render;
    return <Content node={data.atlas} lit={data.lit} dimmed={data.dimmed} focused={data.focused} />;
  },
  (prev, next) =>
    prev.data.atlas === next.data.atlas &&
    prev.data.lit === next.data.lit &&
    prev.data.dimmed === next.data.dimmed &&
    prev.data.focused === next.data.focused &&
    prev.data.render === next.data.render,
);

const nodeTypes: NodeTypes = { atlas: AtlasNodeComp };

function zIndexFor(kind: AtlasNode["kind"]): number {
  return kind === "folder" ? 0 : kind === "file" ? 1 : 2;
}

function center(n: AtlasNode): { x: number; y: number } {
  return { x: (n.rect.x + n.rect.w / 2) * UNIT, y: (n.rect.y + n.rect.h / 2) * UNIT };
}

/**
 * SVG layer rendered inside the viewport transform. Draws:
 *  - lit region overlays (litVisibleIds) so the trace is unmistakable at far
 *    zoom (non-scaling stroke + light tint), and
 *  - every slice edge as a straight segment, delegating to variant.EdgePath
 *    when present, with edge-lit / edge-dimmed / edge-<kind> classes on the SVG
 *    element so variant CSS can hook them.
 * Strokes use vector-effect: non-scaling-stroke so they stay legible at any zoom.
 */
export function EdgeLayer(props: {
  slice: GraphRendererProps["slice"];
  litState: LitState;
  variant: GraphRendererProps["variant"];
}) {
  const { slice, litState, variant } = props;
  const centers = useMemo(() => {
    const m = new Map<string, AtlasNode>();
    for (const n of slice.nodes) m.set(n.id, n);
    return m;
  }, [slice.nodes]);

  const EdgePath = variant.EdgePath;

  return (
    <svg className="edge-layer" style={{ position: "absolute", overflow: "visible", pointerEvents: "none" }}>
      {/* Lit region overlays first (painted under the edges). */}
      {litState.hasEvent
        ? slice.nodes
            .filter((n) => litState.litNodeIds.has(n.id))
            .map((n) => (
              <rect
                key={`lit:${n.id}`}
                className={`atlas-lit-region lit-${n.kind}`}
                x={n.rect.x * UNIT}
                y={n.rect.y * UNIT}
                width={n.rect.w * UNIT}
                height={n.rect.h * UNIT}
                vectorEffect="non-scaling-stroke"
              />
            ))
        : null}
      {slice.edges.map((e) => {
        const src = centers.get(e.src);
        const dst = centers.get(e.dst);
        if (!src || !dst) return null;
        const a = center(src);
        const b = center(dst);
        const key = edgeKey(e);
        // The slice edge carries `lit` (aggregation-aware, defect 2).
        const lit = litState.hasEvent && e.lit === true;
        const dimmed = litState.hasEvent && !lit;
        const strokeWidth = (lit ? 2.5 : 1) + Math.log2(e.count + 1);
        const cls = ["atlas-edge", `edge-${e.kind}`, lit ? "edge-lit" : "", dimmed ? "edge-dimmed" : ""]
          .filter(Boolean)
          .join(" ");
        const geometry: EdgeGeometry = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, strokeWidth };
        if (EdgePath) {
          return (
            <g key={key} className={cls}>
              {EdgePath(e, geometry)}
            </g>
          );
        }
        return (
          <line
            key={key}
            className={cls}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

interface Transform {
  x: number;
  y: number;
  zoom: number;
}

/** Center + fit a world-unit viewport into a pane, as a React Flow transform. */
function worldToTransform(vp: GraphRendererProps["initialViewport"], paneW: number, paneH: number): Transform {
  const w = Math.max(vp.w, 1) * UNIT;
  const h = Math.max(vp.h, 1) * UNIT;
  const zoom = Math.min(4, Math.max(0.02, Math.min(paneW / w, paneH / h) * 0.9));
  const cx = (vp.x + vp.w / 2) * UNIT;
  const cy = (vp.y + vp.h / 2) * UNIT;
  return { x: paneW / 2 - cx * zoom, y: paneH / 2 - cy * zoom, zoom };
}

function Inner(props: GraphRendererProps) {
  const { slice, litState, focusedId, variant, initialViewport, onFocus, onViewportChange, fitRequest, onApiReady } =
    props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  // Measure the pane BEFORE first mounting React Flow so the event viewport can
  // be handed in as a deterministic `defaultViewport` (no identity-scale race).
  const [pane, setPane] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setPane({ w, h });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return;
  }, []);

  // Captured once per pane; the first paint uses this exact transform.
  const initialViewportRef = useRef(initialViewport);
  const defaultTransform = useMemo<Transform>(
    () => (pane ? worldToTransform(initialViewportRef.current, pane.w, pane.h) : { x: 0, y: 0, zoom: 1 }),
    [pane],
  );

  // Stable-identity node cache: reuse the exact node object when nothing that
  // affects its render changed, so React Flow reconciles only changed nodes.
  const nodeCacheRef = useRef<Map<string, AtlasFlowNode>>(new Map());
  const nodes = useMemo<AtlasFlowNode[]>(() => {
    const cache = nodeCacheRef.current;
    const next = new Map<string, AtlasFlowNode>();
    const out: AtlasFlowNode[] = [];
    for (const n of slice.nodes) {
      const lit = litState.hasEvent && litState.litNodeIds.has(n.id);
      const dimmed = litState.hasEvent && !lit;
      const focused = n.id === focusedId;
      const cached = cache.get(n.id);
      let node: AtlasFlowNode;
      if (
        cached &&
        cached.data.atlas === n &&
        cached.data.lit === lit &&
        cached.data.dimmed === dimmed &&
        cached.data.focused === focused &&
        cached.data.render === variant.NodeContent
      ) {
        node = cached;
      } else {
        node = {
          id: n.id,
          type: "atlas",
          position: { x: n.rect.x * UNIT, y: n.rect.y * UNIT },
          width: n.rect.w * UNIT,
          height: n.rect.h * UNIT,
          draggable: false,
          selectable: true,
          connectable: false,
          zIndex: zIndexFor(n.kind),
          data: { atlas: n, lit, dimmed, focused, render: variant.NodeContent },
        };
      }
      next.set(n.id, node);
      out.push(node);
    }
    nodeCacheRef.current = next;
    return out;
  }, [slice.nodes, litState, focusedId, variant]);

  const emitViewport = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const { x, y, zoom } = rf.getViewport();
    const w = el.clientWidth || 1000;
    const h = el.clientHeight || 700;
    onViewportChange({ x: -x / zoom / UNIT, y: -y / zoom / UNIT, w: w / zoom / UNIT, h: h / zoom / UNIT }, zoom);
  }, [rf, onViewportChange]);

  // Fit on explicit request only (never fights the event viewport on mount).
  useEffect(() => {
    if (fitRequest > 0) rf.fitView({ duration: 200 });
  }, [fitRequest, rf]);

  // Imperative API for the app (event viewport, fit, sweep).
  useEffect(() => {
    if (!onApiReady) return;
    const api: RendererApi = {
      setViewport(vp) {
        rf.fitBounds({ x: vp.x * UNIT, y: vp.y * UNIT, width: vp.w * UNIT, height: vp.h * UNIT }, { duration: 220 });
      },
      fitView() {
        rf.fitView({ duration: 200 });
      },
      runSweep(onFps) {
        const el = wrapperRef.current;
        const w = el?.clientWidth ?? 1000;
        const h = el?.clientHeight ?? 700;
        return runViewportSweep(rf, onFps, w, h);
      },
    };
    onApiReady(api);
  }, [rf, onApiReady]);

  return (
    <div ref={wrapperRef} className="graph-wrapper">
      {pane ? (
        <ReactFlow
          nodes={nodes}
          edges={NO_EDGES}
          nodeTypes={nodeTypes}
          defaultViewport={defaultTransform}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnDoubleClick={false}
          onlyRenderVisibleElements={false}
          minZoom={0.02}
          maxZoom={4}
          onInit={() => {
            // Belt-and-braces: re-apply the event viewport once RF is initialized,
            // then sync app state to the true transform in a single pass.
            const iv = initialViewportRef.current;
            rf.fitBounds({ x: iv.x * UNIT, y: iv.y * UNIT, width: iv.w * UNIT, height: iv.h * UNIT }, { duration: 0 });
            emitViewport();
          }}
          onNodeClick={(_e, node) => onFocus(node.id)}
          onMoveEnd={() => emitViewport()}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={UNIT} />
          <ViewportPortal>
            <EdgeLayer slice={slice} litState={litState} variant={variant} />
          </ViewportPortal>
        </ReactFlow>
      ) : null}
    </div>
  );
}

const NO_EDGES: Edge[] = [];

/**
 * Scripted ~3 s viewport tour. Pans by a visible fraction of the pane and
 * oscillates the zoom, sampling fps ONLY across the animation window.
 */
function runViewportSweep(
  rf: ReturnType<typeof useReactFlow>,
  onFps: (fps: number) => void,
  paneW: number,
  paneH: number,
): Promise<void> {
  return new Promise((resolveDone) => {
    const start = rf.getViewport();
    const duration = 3000;
    const panX = paneW * 0.35;
    const panY = paneH * 0.28;
    const t0 = performance.now();
    let frames = 0;
    let windowStart = t0;
    function frame(now: number) {
      const t = Math.min(1, (now - t0) / duration);
      const phase = t * Math.PI * 2;
      const zoom = start.zoom * (1 + 0.4 * Math.sin(t * Math.PI));
      const x = start.x + panX * Math.sin(phase);
      const y = start.y + panY * Math.cos(phase);
      rf.setViewport({ x, y, zoom });
      frames++;
      const dt = now - windowStart;
      if (dt >= 200) {
        onFps((frames * 1000) / dt);
        frames = 0;
        windowStart = now;
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        rf.setViewport(start, { duration: 200 });
        resolveDone();
      }
    }
    requestAnimationFrame(frame);
  });
}

export function ReactFlowRenderer(props: GraphRendererProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
