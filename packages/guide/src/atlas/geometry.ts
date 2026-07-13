// Pure edge geometry helpers (R4-2 edge legibility). Clip an edge segment at
// the rect BOUNDARY of both endpoints so a line never runs through a node body.

import type { Rect } from "./types.js";

export interface ClippedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
}

/**
 * The point on `rect`'s boundary along the ray from the rect center toward
 * (towardX, towardY). Center-inside → boundary-crossing (axis-aligned slab).
 */
export function rectExitPoint(
  rect: Rect,
  towardX: number,
  towardY: number,
): { x: number; y: number } {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = rect.w / 2;
  const hh = rect.h / 2;
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Clip a center-to-center edge to both endpoint rect boundaries. */
export function clipEdge(srcRect: Rect, dstRect: Rect): ClippedEdge {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const dc = { x: dstRect.x + dstRect.w / 2, y: dstRect.y + dstRect.h / 2 };
  const p1 = rectExitPoint(srcRect, dc.x, dc.y);
  const p2 = rectExitPoint(dstRect, sc.x, sc.y);
  return {
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    midX: (p1.x + p2.x) / 2,
    midY: (p1.y + p2.y) / 2,
  };
}
