/**
 * The routed edge (D33/D37/D38).
 *
 * It draws ELK's OWN polyline. React Flow hands every custom edge `sourceX/sourceY/targetX/
 * targetY` — the handle anchors it computed itself — and every default edge type turns those
 * into a bezier between two node centres. This component ignores all four. The path comes
 * from `data.points`, which is `[startPoint, ...bendPoints, endPoint]` straight out of the
 * layout's routed section, in the same world coordinates as the nodes.
 *
 * That single decision is the difference between "ELK computed orthogonal routing" and "the
 * user can see orthogonal routing".
 *
 * D38 economy: the KIND is the stroke (calls solid, imports dashed) — never a printed word on
 * every edge, or a dense region becomes a pile of the word "calls". The COUNT is printed,
 * because an aggregate edge that hides how many relations it stands for is not claim-backed
 * (D33). Kind, count and provenance appear together on hover/focus.
 *
 * DIRECTION IS DRAWN, NOT IMPLIED (D37). The arrowhead sits at the DEPENDENCY end of every
 * route — the polyline runs source -> target and `markerEnd` lands on the target, which is the
 * thing depended upon. Spatial position may reinforce that; it is never the sole carrier,
 * because it CANNOT be: this repo's scope graph is cyclic, and inside a cycle no top-to-bottom
 * order is true. A `backEdge` — one the engine had to reverse to layer the graph at all — is
 * therefore drawn in its own colour and carries a cycle glyph, so the reader can see at a
 * glance which routes the vertical convention does not describe. Its KIND is still legible:
 * `imports` stays dashed, `calls` stays solid (D38).
 */
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { LayoutPoint } from "./layout/elk.ts";
import type { RelationKind } from "../data/dto.ts";

export interface RoutedEdgeData extends Record<string, unknown> {
  points: readonly LayoutPoint[];
  routed: boolean;
  /**
   * The layout had to reverse this edge to lay the graph out: its target sits UPSTREAM of its
   * source, so for this route "above" means the opposite of "depends on". Straight from the
   * layout result — never guessed, never hardcoded.
   */
  backEdge: boolean;
  kind: RelationKind;
  count: number;
  /** Weakest tier across the constituents — the only tier the aggregate may claim. */
  weakest: string | null;
  freshness: "fresh" | "stale";
  claims: number;
  srcName: string;
  dstName: string;
}

export const ROUTED_EDGE_TYPE = "routed";

export function RoutedEdge(props: EdgeProps): React.ReactNode {
  const data = props.data as RoutedEdgeData | undefined;
  const points = data?.points ?? [];
  if (points.length < 2) return null;

  const path = polyline(points);
  const kind = data?.kind ?? "calls";
  const backEdge = data?.backEdge === true;
  const selected = props.selected === true;
  // Colour carries the AXIS EXCEPTION; the dash still carries the kind (D38). A rose route is
  // one the vertical convention does not describe — it runs back up the map, into a cycle.
  const colour = backEdge ? "var(--edge-cycle)" : `var(--edge-${kind})`;

  // A tiny orthogonal corner radius. It rounds the CORNERS of ELK's polyline; it never
  // replaces the polyline with a curve of its own, so every bend point is still honoured.
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        interactionWidth={16}
        style={{
          stroke: selected ? "var(--edge-focus)" : colour,
          strokeWidth: selected ? 2.5 : 1.6,
          strokeDasharray: kind === "imports" ? "6 4" : undefined,
          fill: "none",
        }}
        // The proof, readable from the DOM: the exact point list this path was built from.
        // The Playwright floor reads it back and compares it with the source/target centres,
        // and reads `data-edge-back` to check the arrowhead landed on the DEPENDENCY end even
        // when the route runs against the axis.
        data-edge-routed={data?.routed === true ? "true" : "false"}
        data-edge-kind={kind}
        data-edge-back={backEdge ? "true" : "false"}
        data-edge-points={JSON.stringify(points.map((p) => [round(p.x), round(p.y)]))}
      />
      <EdgeLabelRenderer>
        <div
          data-edge-label={props.id}
          className={`ctx-edge-label nodrag nopan pointer-events-auto absolute rounded border bg-zinc-950/95 px-1 font-mono ${
            backEdge ? "ctx-edge-label-cycle" : "border-zinc-700 text-zinc-300"
          }`}
          style={{ transform: `translate(-50%, -50%) translate(${anchor(points).x}px, ${anchor(points).y}px)` }}
          title={
            data
              ? `${data.count} ${data.kind} · ${data.srcName} depends on ${data.dstName} · ` +
                (backEdge
                  ? "this route runs back up the map: the two scopes are in a dependency " +
                    "cycle, so their top-to-bottom order carries no meaning · "
                  : "") +
                `${data.claims} constituent claims · weakest ${data.weakest ?? "unknown"} · ${data.freshness}`
              : undefined
          }
        >
          {data?.count ?? 0}
          {backEdge ? <span aria-hidden="true">&nbsp;&#8634;</span> : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/** The polyline, corner-rounded. Every ELK point survives. */
function polyline(points: readonly LayoutPoint[]): string {
  const r = 8;
  const first = points[0]!;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const a = shorten(curr, prev, r);
    const b = shorten(curr, next, r);
    d += ` L ${a.x} ${a.y} Q ${curr.x} ${curr.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** Step from `from` toward `to` by at most `r` — never past the midpoint. */
function shorten(from: LayoutPoint, to: LayoutPoint, r: number): LayoutPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: from.x, y: from.y };
  const step = Math.min(r, length / 2);
  return { x: from.x + (dx / length) * step, y: from.y + (dy / length) * step };
}

/** The count sits at the polyline's own midpoint — on the route, not between two centres. */
function anchor(points: readonly LayoutPoint[]): LayoutPoint {
  const total = length(points);
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + segment >= total / 2) {
      const t = segment === 0 ? 0 : (total / 2 - walked) / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    walked += segment;
  }
  return points[points.length - 1]!;
}

function length(points: readonly LayoutPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
