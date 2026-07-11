/**
 * elkjs layered layout (brief "Layout = elkjs"; design §4.1 params lifted from
 * understand-anything). Async; returns positions keyed by node id. Falls back to
 * a deterministic grid if ELK throws (never blanks the canvas — design §4.1).
 */
import ELK from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";

const elk = new ELK();

const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "60",
  "elk.padding": "[top=40,left=20,bottom=20,right=20]",
  "elk.edgeRouting": "ORTHOGONAL",
};

export interface Sized {
  id: string;
  width: number;
  height: number;
}

export async function layout(
  nodes: Sized[],
  edges: Array<{ id: string; source: string; target: string }>,
): Promise<Map<string, { x: number; y: number }>> {
  try {
    const graph = {
      id: "root",
      layoutOptions: ELK_OPTIONS,
      children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
      edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    };
    const res = await elk.layout(graph);
    const pos = new Map<string, { x: number; y: number }>();
    for (const c of res.children ?? []) pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    return pos;
  } catch {
    // Deterministic grid fallback — the canvas must never render blank.
    const pos = new Map<string, { x: number; y: number }>();
    const cols = Math.ceil(Math.sqrt(nodes.length || 1));
    nodes.forEach((n, i) => pos.set(n.id, { x: (i % cols) * 220, y: Math.floor(i / cols) * 120 }));
    return pos;
  }
}

/** Apply computed positions onto React Flow nodes. */
export function positioned(nodes: Node[], pos: Map<string, { x: number; y: number }>): Node[] {
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position ?? { x: 0, y: 0 } }));
}

export type { Node, Edge };
