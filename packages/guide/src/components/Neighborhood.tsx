/**
 * Bounded local neighborhood (P40 R14 / brief §3.2) — a depth-1 ego-graph of the
 * subject, rendered with React Flow. This is the ONLY graph in the product and it
 * is always bounded by the projection budget (nodeCap 24, depth 1), never a global
 * layout over the entity set — the exact wall the v2 canvas died on. Layout is a
 * cheap hand-computed radial (center + ring); no ELK/two-stage needed at ≤24
 * nodes. Clicking a neighbor re-centers on it (UA "expand-on-demand"): navigation,
 * not relayout of a huge graph.
 */
import { useMemo } from "react";
import { ReactFlow, Background, type Node, type Edge, type NodeProps } from "@xyflow/react";
import type { ClaimStatus, NeighborhoodEdge, NeighborhoodNode } from "@contexa/core";
import { navigate } from "../router.ts";

const STATUS_VAR: Record<ClaimStatus, string> = {
  resolved: "var(--st-resolved)",
  conflicting: "var(--st-conflicting)",
  stale: "var(--st-stale)",
  unavailable: "var(--st-unavailable)",
  restricted: "var(--st-restricted)",
  unknown: "var(--st-unknown)",
};

interface EgoData extends Record<string, unknown> {
  label: string;
  kind: string;
  center: boolean;
}

function EgoNode({ data }: NodeProps<Node<EgoData>>): React.ReactElement {
  return (
    <div className={`egonode ${data.center ? "center" : ""}`} title={data.label}>
      <span className="ek">{data.kind}</span>
      <div>{data.label}</div>
    </div>
  );
}

const nodeTypes = { ego: EgoNode };

export interface NeighborhoodProps {
  subjectId: string;
  centerStatus: ClaimStatus;
  nodes: NeighborhoodNode[];
  edges: NeighborhoodEdge[];
  omittedNote?: string;
}

export function Neighborhood({
  subjectId,
  centerStatus,
  nodes,
  edges,
  omittedNote,
}: NeighborhoodProps): React.ReactElement {
  const flowNodes = useMemo<Node<EgoData>[]>(() => {
    const ring = nodes.filter((n) => n.entityId !== subjectId);
    const cx = 280;
    const cy = 170;
    const radius = 150;
    const out: Node<EgoData>[] = [];
    const center = nodes.find((n) => n.entityId === subjectId) ?? nodes[0];
    if (center) {
      out.push({
        id: center.entityId,
        type: "ego",
        position: { x: cx, y: cy },
        data: { label: center.name, kind: center.kind, center: true },
        style: { ["--status" as string]: STATUS_VAR[centerStatus] },
        draggable: false,
      });
    }
    ring.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(ring.length, 1) - Math.PI / 2;
      out.push({
        id: n.entityId,
        type: "ego",
        position: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) },
        data: { label: n.name, kind: n.kind, center: false },
        draggable: false,
      });
    });
    return out;
  }, [nodes, subjectId, centerStatus]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e, i) => ({
        id: `e${i}`,
        source: e.src,
        target: e.dst,
        label: e.predicate,
        labelStyle: { fill: "var(--ink-mute)", fontSize: 9, fontFamily: "var(--font-mono)" },
        labelBgStyle: { fill: "var(--bg-sunken)" },
        style: { strokeWidth: Math.max(1, Math.min(3, e.confidence * 2)) },
      })),
    [edges],
  );

  return (
    <div className="neigh">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.id !== subjectId) navigate({ view: "subject", ref: node.id });
        }}
      >
        <Background gap={22} color="var(--line)" />
      </ReactFlow>
      {omittedNote && <span className="budget-note">{omittedNote}</span>}
    </div>
  );
}
