// The ONLY module that imports @xyflow/react (renderer seam, D12). Everything
// upstream sees the GraphRenderer contract, never React Flow types.
//
// Edges are drawn by our own SVG layer inside the viewport transform, NOT by
// React Flow's edge system (RF v12 drops handle-less custom nodes). Our edges
// are precomputed straight segments; one SVG layer with non-scaling strokes is
// simpler, faster, keeps the D12 seam honest, and feeds variant.EdgePath.

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
import { clipEdge } from "../atlas/geometry.js";
import type { AtlasEdge, AtlasNode } from "../atlas/types.js";
import type { EdgeGeometry } from "../variants/types.js";
import {
  UNIT,
  edgeKey,
  nodeSelectionClassName,
  type GraphRendererProps,
  type LitState,
  type RendererApi,
} from "./GraphRenderer.js";

interface AtlasNodeData extends Record<string, unknown> {
  atlas: AtlasNode;
  lit: boolean;
  dimmed: boolean;
  focused: boolean;
  showDeclLabel: boolean;
  render: GraphRendererProps["variant"]["NodeContent"];
}

type AtlasFlowNode = Node<AtlasNodeData, "atlas">;

// Selection fade/neighbor/select live as classes on the React Flow node WRAPPER
// (.react-flow__node.node-faded etc.), so every variant inherits the R4-1
// emphasis from substrate CSS without a variant edit.
const AtlasNodeComp = memo(
  function AtlasNodeComp({ data }: NodeProps<AtlasFlowNode>) {
    const Content = data.render;
    return (
      <Content
        node={data.atlas}
        lit={data.lit}
        dimmed={data.dimmed}
        focused={data.focused}
        showDeclLabel={data.showDeclLabel}
      />
    );
  },
  (prev, next) =>
    prev.data.atlas === next.data.atlas &&
    prev.data.lit === next.data.lit &&
    prev.data.dimmed === next.data.dimmed &&
    prev.data.focused === next.data.focused &&
    prev.data.showDeclLabel === next.data.showDeclLabel &&
    prev.data.render === next.data.render,
);

const nodeTypes: NodeTypes = { atlas: AtlasNodeComp };

function zIndexFor(kind: AtlasNode["kind"]): number {
  return kind === "folder" ? 0 : kind === "file" ? 1 : 2;
}

function isAggregated(edge: AtlasEdge): boolean {
  // Aggregated rollup edges have folder/file endpoints; raw call edges are sym->sym.
  return !edge.src.startsWith("sym:") || !edge.dst.startsWith("sym:");
}

export function EdgeLayer(props: {
  slice: GraphRendererProps["slice"];
  litState: LitState;
  variant: GraphRendererProps["variant"];
  focusedId: string | null;
  hoveredId: string | null;
}) {
  const { slice, litState, variant, focusedId, hoveredId } = props;
  const nodeById = useMemo(() => {
    const m = new Map<string, AtlasNode>();
    for (const n of slice.nodes) m.set(n.id, n);
    return m;
  }, [slice.nodes]);

  const EdgePath = variant.EdgePath;
  const selectionActive = focusedId != null;

  return (
    <svg className="edge-layer" style={{ position: "absolute", overflow: "visible", pointerEvents: "none" }}>
      <defs>
        <marker
          id="atlas-arrow"
          markerWidth="9"
          markerHeight="9"
          refX="7"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L9,4.5 L0,9 z" className="atlas-arrowhead" />
        </marker>
      </defs>

      {/* Lit region overlays (painted under the edges). */}
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
        const src = nodeById.get(e.src);
        const dst = nodeById.get(e.dst);
        if (!src || !dst) return null;
        const srcPx = { x: src.rect.x * UNIT, y: src.rect.y * UNIT, w: src.rect.w * UNIT, h: src.rect.h * UNIT };
        const dstPx = { x: dst.rect.x * UNIT, y: dst.rect.y * UNIT, w: dst.rect.w * UNIT, h: dst.rect.h * UNIT };
        const clip = clipEdge(srcPx, dstPx); // endpoints at rect boundaries (R4-2a)
        const key = edgeKey(e);

        const lit = litState.hasEvent && e.lit === true;
        const selAdj = selectionActive && (e.src === focusedId || e.dst === focusedId);
        const hovAdj = hoveredId != null && (e.src === hoveredId || e.dst === hoveredId);
        const faded = selectionActive && !selAdj; // selection wins over event dim (R4-1)
        const dimmed = !selectionActive && litState.hasEvent && !lit;
        const belowHidden = e.belowFloor === true && !lit && !selAdj && !hovAdj;
        const emphasized = selAdj || lit;
        const aggregated = isAggregated(e);

        const strokeWidth = selAdj ? 2.5 : lit ? 2.5 + Math.log2(e.count + 1) : 1 + Math.log2(e.count + 1);
        const cls = [
          "atlas-edge",
          `edge-${e.kind}`,
          lit ? "edge-lit" : "",
          selAdj ? "edge-selected" : "",
          faded ? "edge-faded" : "",
          hovAdj && !selAdj ? "edge-hover" : "",
          dimmed ? "edge-dimmed" : "",
          belowHidden ? "edge-belowfloor" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const geometry: EdgeGeometry = {
          x1: clip.x1,
          y1: clip.y1,
          x2: clip.x2,
          y2: clip.y2,
          strokeWidth,
          clippedX1: clip.x1,
          clippedY1: clip.y1,
          clippedX2: clip.x2,
          clippedY2: clip.y2,
          midX: clip.midX,
          midY: clip.midY,
          count: e.count,
          direction: "src->dst",
        };

        // Label policy (R4-2b): aggregated edges get an always-on count plate;
        // raw sym->sym edges show a relation-kind label only when selected.
        const showCount = aggregated && !belowHidden;
        const showRelation = !aggregated && selAdj;

        return (
          <g key={key} className={cls}>
            {EdgePath ? (
              EdgePath(e, geometry)
            ) : (
              <line
                x1={clip.x1}
                y1={clip.y1}
                x2={clip.x2}
                y2={clip.y2}
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
                markerEnd={emphasized ? "url(#atlas-arrow)" : undefined}
              />
            )}
            {showCount ? (
              <text className="edge-count" x={clip.midX} y={clip.midY} textAnchor="middle" dominantBaseline="central">
                {e.count}
              </text>
            ) : null}
            {showRelation ? (
              <text className="edge-relation" x={clip.midX} y={clip.midY - 2} textAnchor="middle">
                {e.kind}
              </text>
            ) : null}
          </g>
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

function worldToTransform(vp: GraphRendererProps["initialViewport"], paneW: number, paneH: number): Transform {
  const w = Math.max(vp.w, 1) * UNIT;
  const h = Math.max(vp.h, 1) * UNIT;
  const zoom = Math.min(4, Math.max(0.02, Math.min(paneW / w, paneH / h) * 0.9));
  const cx = (vp.x + vp.w / 2) * UNIT;
  const cy = (vp.y + vp.h / 2) * UNIT;
  return { x: paneW / 2 - cx * zoom, y: paneH / 2 - cy * zoom, zoom };
}

function Inner(props: GraphRendererProps) {
  const {
    slice,
    litState,
    focusedId,
    variant,
    initialViewport,
    onFocus,
    onViewportChange,
    fitRequest,
    onApiReady,
    onClearSelection,
    onDrill,
  } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

  const initialViewportRef = useRef(initialViewport);
  const defaultTransform = useMemo<Transform>(
    () => (pane ? worldToTransform(initialViewportRef.current, pane.w, pane.h) : { x: 0, y: 0, zoom: 1 }),
    [pane],
  );

  const setZoomVar = useCallback((zoom: number) => {
    wrapperRef.current?.style.setProperty("--zoom", String(zoom));
  }, []);

  // Selection neighbor set (endpoints of the selected node's direct edges, R4-1).
  const neighborIds = useMemo(() => {
    const set = new Set<string>();
    if (focusedId == null) return set;
    for (const e of slice.edges) {
      if (e.src === focusedId) set.add(e.dst);
      else if (e.dst === focusedId) set.add(e.src);
    }
    return set;
  }, [slice.edges, focusedId]);

  const nodeCacheRef = useRef<Map<string, AtlasFlowNode>>(new Map());
  const nodes = useMemo<AtlasFlowNode[]>(() => {
    const cache = nodeCacheRef.current;
    const next = new Map<string, AtlasFlowNode>();
    const out: AtlasFlowNode[] = [];
    const selectionActive = focusedId != null;
    for (const n of slice.nodes) {
      const lit = litState.hasEvent && litState.litNodeIds.has(n.id);
      const dimmed = !selectionActive && litState.hasEvent && !lit;
      const focused = n.id === focusedId;
      const showDeclLabel = n.kind === "decl" && slice.declLabelsVisible;
      const className = nodeSelectionClassName(n.id, focusedId, neighborIds);
      const cached = cache.get(n.id);
      let node: AtlasFlowNode;
      if (
        cached &&
        cached.data.atlas === n &&
        cached.data.lit === lit &&
        cached.data.dimmed === dimmed &&
        cached.data.focused === focused &&
        cached.data.showDeclLabel === showDeclLabel &&
        cached.className === className &&
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
          className,
          data: { atlas: n, lit, dimmed, focused, showDeclLabel, render: variant.NodeContent },
        };
      }
      next.set(n.id, node);
      out.push(node);
    }
    nodeCacheRef.current = next;
    return out;
  }, [slice.nodes, slice.declLabelsVisible, litState, focusedId, neighborIds, variant]);

  const emitViewport = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const { x, y, zoom } = rf.getViewport();
    setZoomVar(zoom);
    const w = el.clientWidth || 1000;
    const h = el.clientHeight || 700;
    onViewportChange({ x: -x / zoom / UNIT, y: -y / zoom / UNIT, w: w / zoom / UNIT, h: h / zoom / UNIT }, zoom);
  }, [rf, onViewportChange, setZoomVar]);

  useEffect(() => {
    if (fitRequest > 0) rf.fitView({ duration: 200 });
  }, [fitRequest, rf]);

  useEffect(() => {
    if (!onApiReady) return;
    const api: RendererApi = {
      setViewport(vp) {
        rf.fitBounds({ x: vp.x * UNIT, y: vp.y * UNIT, width: vp.w * UNIT, height: vp.h * UNIT }, { duration: 220 });
      },
      fitView() {
        rf.fitView({ duration: 200 });
      },
      revealNode(rect, minPx = 24) {
        const el = wrapperRef.current;
        if (!el) return false;
        const { x, y, zoom } = rf.getViewport();
        const paneW = el.clientWidth || 1000;
        const paneH = el.clientHeight || 700;
        const sx = rect.x * UNIT * zoom + x;
        const sy = rect.y * UNIT * zoom + y;
        const sw = rect.w * UNIT * zoom;
        const sh = rect.h * UNIT * zoom;
        const offscreen = sx + sw < 0 || sy + sh < 0 || sx > paneW || sy > paneH;
        if (!offscreen && sw >= minPx) return false;
        const fitZoom = Math.min(paneW / (rect.w * UNIT), paneH / (rect.h * UNIT)) * 0.7; // padding 0.3
        const maxZoom = Math.max(zoom, 1.2);
        const targetZoom = Math.max(0.02, Math.min(fitZoom, maxZoom, 4));
        const cx = (rect.x + rect.w / 2) * UNIT;
        const cy = (rect.y + rect.h / 2) * UNIT;
        rf.setViewport(
          { x: paneW / 2 - cx * targetZoom, y: paneH / 2 - cy * targetZoom, zoom: targetZoom },
          { duration: 400 },
        );
        return true;
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

  const hovered = hoveredId != null ? slice.nodes.find((n) => n.id === hoveredId) ?? null : null;

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
            const iv = initialViewportRef.current;
            rf.fitBounds({ x: iv.x * UNIT, y: iv.y * UNIT, width: iv.w * UNIT, height: iv.h * UNIT }, { duration: 0 });
            emitViewport();
          }}
          onNodeClick={(_e, node) => onFocus(node.id)}
          onNodeDoubleClick={(_e, node) => onDrill?.(node.id)}
          onNodeMouseEnter={(_e, node) => setHoveredId(node.id)}
          onNodeMouseLeave={() => setHoveredId(null)}
          onPaneClick={() => onClearSelection?.()}
          onMove={(_e, vp) => setZoomVar(vp.zoom)}
          onMoveEnd={() => emitViewport()}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={UNIT} />
          <ViewportPortal>
            <EdgeLayer
              slice={slice}
              litState={litState}
              variant={variant}
              focusedId={focusedId}
              hoveredId={hoveredId}
            />
          </ViewportPortal>
        </ReactFlow>
      ) : null}
      {hovered ? (
        <div className="hover-readout" aria-hidden="true">
          <span className="hr-kind">{hovered.kind}</span>
          <span className="hr-name">{hovered.name}</span>
          <span className="hr-path">{hovered.path}</span>
        </div>
      ) : null}
    </div>
  );
}

const NO_EDGES: Edge[] = [];

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
