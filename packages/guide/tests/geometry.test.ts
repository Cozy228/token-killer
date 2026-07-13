import { describe, expect, it } from "vitest";
import { clipEdge, rectExitPoint } from "../src/atlas/geometry.js";
import type { Rect } from "../src/atlas/types.js";

const EPS = 1e-9;

function onBoundary(rect: Rect, p: { x: number; y: number }): boolean {
  const within =
    p.x >= rect.x - EPS &&
    p.x <= rect.x + rect.w + EPS &&
    p.y >= rect.y - EPS &&
    p.y <= rect.y + rect.h + EPS;
  const onEdge =
    Math.abs(p.x - rect.x) < EPS ||
    Math.abs(p.x - (rect.x + rect.w)) < EPS ||
    Math.abs(p.y - rect.y) < EPS ||
    Math.abs(p.y - (rect.y + rect.h)) < EPS;
  return within && onEdge;
}

function insideInterior(rect: Rect, p: { x: number; y: number }): boolean {
  return (
    p.x > rect.x + EPS &&
    p.x < rect.x + rect.w - EPS &&
    p.y > rect.y + EPS &&
    p.y < rect.y + rect.h - EPS
  );
}

describe("rectExitPoint", () => {
  it("hits the boundary in the direction of the target", () => {
    const rect: Rect = { x: 0, y: 0, w: 4, h: 4 };
    expect(rectExitPoint(rect, 12, 2)).toEqual({ x: 4, y: 2 });
    expect(rectExitPoint(rect, 2, 12)).toEqual({ x: 2, y: 4 });
    expect(onBoundary(rect, rectExitPoint(rect, 12, 12))).toBe(true);
  });
});

describe("clipEdge", () => {
  it("clips both ends to the rect boundaries (never through a body)", () => {
    const src: Rect = { x: 0, y: 0, w: 4, h: 4 };
    const dst: Rect = { x: 10, y: 0, w: 4, h: 4 };
    const c = clipEdge(src, dst);
    expect(onBoundary(src, { x: c.x1, y: c.y1 })).toBe(true);
    expect(onBoundary(dst, { x: c.x2, y: c.y2 })).toBe(true);
    // The clipped segment's endpoints are not inside either node interior.
    expect(insideInterior(src, { x: c.x1, y: c.y1 })).toBe(false);
    expect(insideInterior(dst, { x: c.x2, y: c.y2 })).toBe(false);
    expect(c.midX).toBe(7);
    expect(c.midY).toBe(2);
  });

  it("clips a diagonal edge at both corners", () => {
    const src: Rect = { x: 0, y: 0, w: 4, h: 4 };
    const dst: Rect = { x: 10, y: 10, w: 4, h: 4 };
    const c = clipEdge(src, dst);
    expect(onBoundary(src, { x: c.x1, y: c.y1 })).toBe(true);
    expect(onBoundary(dst, { x: c.x2, y: c.y2 })).toBe(true);
  });
});
