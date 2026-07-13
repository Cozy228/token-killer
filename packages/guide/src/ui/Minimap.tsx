// Minimap (D9 spec, verbatim). Substrate component — structural CSS + tokens
// only, so any variant can restyle via the exposed `--minimap-*` CSS variables.
//
// "The bottom-right folder minimap is always available and contains region
//  summaries, viewport, search marks, and active-lens marks. It does not
//  reproduce declaration-level detail."
//
// It draws TOP-LEVEL folder regions only (never files/decls), plus:
//   - the current viewport rectangle (live, draggable — dragging pans the canvas)
//   - search-hit marks (dots at matched nodes' region positions)
//   - active-lens marks (lit regions when an event is active)
// Clicking a region pans the camera to it. DOM/SVG only, no libraries.

import { useCallback, useRef, useState } from "react";
import type { AtlasRegion, Viewport } from "../atlas/types.js";

/** A scaled screen rect inside the minimap box. */
interface MiniRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MinimapProps {
  /** Top-level folder regions to draw (already filtered — no files/decls). */
  regions: AtlasRegion[];
  /** World bounds used to scale everything (the repo root rect). */
  worldBounds: Viewport;
  /** Current canvas viewport in world units. */
  viewport: Viewport;
  /** Region ids that are lit for the active lens/event. */
  litRegionIds: ReadonlySet<string>;
  /** Search-hit centers in WORLD coordinates. */
  searchMarks: ReadonlyArray<{ x: number; y: number }>;
  /** Pan the camera to a region. */
  onRegionClick: (regionId: string) => void;
  /** Drag the viewport rect → pan the canvas (same width/height, new origin). */
  onViewportChange: (viewport: Viewport) => void;
  boxW?: number;
  boxH?: number;
}

const DEFAULT_W = 180;
const DEFAULT_H = 140;
const MARGIN = 6;

interface Scale {
  s: number;
  offX: number;
  offY: number;
}

function makeScale(bounds: Viewport, boxW: number, boxH: number): Scale {
  const w = Math.max(bounds.w, 1);
  const h = Math.max(bounds.h, 1);
  const s = Math.min((boxW - MARGIN * 2) / w, (boxH - MARGIN * 2) / h);
  // Center the scaled world inside the box.
  const offX = MARGIN + (boxW - MARGIN * 2 - w * s) / 2 - bounds.x * s;
  const offY = MARGIN + (boxH - MARGIN * 2 - h * s) / 2 - bounds.y * s;
  return { s, offX, offY };
}

function project(rect: Viewport, scale: Scale): MiniRect {
  return {
    x: rect.x * scale.s + scale.offX,
    y: rect.y * scale.s + scale.offY,
    w: rect.w * scale.s,
    h: rect.h * scale.s,
  };
}

export function Minimap(props: MinimapProps) {
  const {
    regions,
    worldBounds,
    viewport,
    litRegionIds,
    searchMarks,
    onRegionClick,
    onViewportChange,
    boxW = DEFAULT_W,
    boxH = DEFAULT_H,
  } = props;
  const [collapsed, setCollapsed] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number } | null>(null);

  const scale = makeScale(worldBounds, boxW, boxH);
  const vpRect = project(viewport, scale);

  // Convert a client point to WORLD coords, then re-center the viewport there.
  const panToClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const localX = clientX - box.left;
      const localY = clientY - box.top;
      const worldCx = (localX - scale.offX) / scale.s;
      const worldCy = (localY - scale.offY) / scale.s;
      onViewportChange({
        x: worldCx - viewport.w / 2,
        y: worldCy - viewport.h / 2,
        w: viewport.w,
        h: viewport.h,
      });
    },
    [scale.offX, scale.offY, scale.s, viewport.w, viewport.h, onViewportChange],
  );

  const onViewportPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      e.stopPropagation();
      dragRef.current = { pointerId: e.pointerId };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      panToClientPoint(e.clientX, e.clientY);
    },
    [panToClientPoint],
  );
  const onViewportPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!dragRef.current) return;
      panToClientPoint(e.clientX, e.clientY);
    },
    [panToClientPoint],
  );
  const onViewportPointerUp = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <div className={`minimap ${collapsed ? "minimap-collapsed" : ""}`} aria-label="folder minimap">
      <button
        type="button"
        className="minimap-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? "Map ▸" : "Map ▾"}
      </button>
      {collapsed ? null : (
        <svg
          ref={svgRef}
          className="minimap-svg"
          width={boxW}
          height={boxH}
          viewBox={`0 0 ${boxW} ${boxH}`}
          role="img"
        >
          {/* Region summaries — top-level folders, tinted by depth. */}
          {regions.map((r) => {
            const m = project(r.rect, scale);
            const lit = litRegionIds.has(r.id);
            return (
              <rect
                key={r.id}
                className={`minimap-region depth-${r.depth} ${lit ? "minimap-region-lit" : ""}`}
                x={m.x}
                y={m.y}
                width={Math.max(1, m.w)}
                height={Math.max(1, m.h)}
                data-region-id={r.id}
                onClick={() => onRegionClick(r.id)}
              >
                <title>{r.path || "/"}</title>
              </rect>
            );
          })}

          {/* Search-hit marks. */}
          {searchMarks.map((p, i) => (
            <circle
              key={`sm-${i}`}
              className="minimap-search-mark"
              cx={p.x * scale.s + scale.offX}
              cy={p.y * scale.s + scale.offY}
              r={2.2}
            />
          ))}

          {/* Live viewport rectangle — draggable to pan the canvas. */}
          <rect
            className="minimap-viewport"
            x={vpRect.x}
            y={vpRect.y}
            width={Math.max(2, vpRect.w)}
            height={Math.max(2, vpRect.h)}
            onPointerDown={onViewportPointerDown}
            onPointerMove={onViewportPointerMove}
            onPointerUp={onViewportPointerUp}
          />
        </svg>
      )}
    </div>
  );
}
