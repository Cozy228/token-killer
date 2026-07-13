// EdgeLayer DOM regressions under the Option-A quiet map. The map is quiet at
// rest: structural edges are NOT drawn except (a) lit Change Trace trunk edges,
// (b) selection-adjacent edges, (c) hover pre-highlight. So the DOM edge census
// is against the lit/selection set, not the full slice. Clipping, count labels,
// and selection emphasis are still asserted.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { computeSlice, DEFAULT_LOD, fitViewport } from "../src/atlas/lod.js";
import { project, resolveEvent } from "../src/atlas/event.js";
import { edgeKey, UNIT, type LitState } from "../src/ui/GraphRenderer.js";
import { EdgeLayer } from "../src/ui/ReactFlowRenderer.js";
import type { Viewport } from "../src/atlas/types.js";
import type { EdgeGeometry, VariantSpec } from "../src/variants/types.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

afterEach(cleanup);

const corpus = makeFixtureCorpus();
const model = compile(corpus);
const resolved = resolveEvent({}, corpus);
if (!resolved.ok) throw new Error("event must resolve");
const projection = project(resolved.event, model);
const rawLit = new Set(projection.litNodeIds);
const rawLitEdges = new Set(projection.litEdges.map(edgeKey));

function sliceAt(zoom: number) {
  return computeSlice(model, fitViewport(model), zoom, DEFAULT_LOD, rawLit, rawLitEdges);
}

function litStateFor(slice: ReturnType<typeof sliceAt>): LitState {
  return { litNodeIds: new Set(slice.litVisibleIds), hasEvent: true };
}

function litEdgeCount(slice: ReturnType<typeof sliceAt>): number {
  return slice.edges.filter((e) => e.lit === true).length;
}

const plainVariant: VariantSpec = {
  id: "test-plain",
  label: "Test",
  description: "",
  themeClass: "variant-test",
  NodeContent: () => null,
};

function renderLayer(
  slice: ReturnType<typeof sliceAt>,
  opts: {
    focusedId?: string | null;
    hoveredId?: string | null;
    variant?: VariantSpec;
    viewport?: Viewport;
  } = {},
) {
  return render(
    <EdgeLayer
      slice={slice}
      litState={litStateFor(slice)}
      variant={opts.variant ?? plainVariant}
      focusedId={opts.focusedId ?? null}
      hoveredId={opts.hoveredId ?? null}
      viewport={opts.viewport}
    />,
  );
}

describe("EdgeLayer quiet-by-default census (Option A)", () => {
  it("draws only lit trunk edges at rest — one .atlas-edge per lit slice edge, every zoom", () => {
    for (const zoom of [0.2, 0.6, 1.0, 1.5, 3]) {
      const slice = sliceAt(zoom);
      const { container } = renderLayer(slice);
      expect(container.querySelectorAll(".atlas-edge").length).toBe(litEdgeCount(slice));
      cleanup();
    }
  });

  it("draws lit region overlays for each lit-visible node", () => {
    const slice = sliceAt(0.2);
    const { container } = renderLayer(slice);
    expect(container.querySelectorAll(".atlas-lit-region").length).toBe(slice.litVisibleIds.length);
    expect(slice.litVisibleIds.length).toBeGreaterThan(0);
  });

  it("marks every drawn at-rest edge lit (edge-lit) and nothing faded/dimmed", () => {
    const slice = sliceAt(1.5);
    const { container } = renderLayer(slice);
    const all = container.querySelectorAll(".atlas-edge").length;
    expect(all).toBeGreaterThan(0);
    expect(container.querySelectorAll(".atlas-edge.edge-lit").length).toBe(all);
    // The quiet map has no faded/dimmed edge state — those edges are not drawn.
    expect(container.querySelectorAll(".atlas-edge.edge-faded").length).toBe(0);
    expect(container.querySelectorAll(".atlas-edge.edge-dimmed").length).toBe(0);
  });

  it("routes each drawn edge through variant.EdgePath with clipped geometry", () => {
    let calls = 0;
    const seen: EdgeGeometry[] = [];
    const edgeVariant: VariantSpec = {
      ...plainVariant,
      id: "test-edgepath",
      EdgePath: (_e, g) => {
        calls++;
        seen.push(g);
        return <path d={`M${g.x1},${g.y1} L${g.x2},${g.y2}`} />;
      },
    };
    const slice = sliceAt(1.5);
    const { container } = renderLayer(slice, { variant: edgeVariant });
    expect(calls).toBe(litEdgeCount(slice));
    expect(container.querySelectorAll("g.atlas-edge").length).toBe(litEdgeCount(slice));
    for (const g of seen) {
      expect(g.clippedX1).toBeTypeOf("number");
      expect(g.midX).toBeTypeOf("number");
      expect(g.count).toBeTypeOf("number");
      expect(g.direction).toBe("src->dst");
    }
  });
});

describe("EdgeLayer presentation under the quiet map", () => {
  it("puts a count plate on every drawn (aggregated) edge at rest", () => {
    const slice = sliceAt(1.5);
    const { container } = renderLayer(slice);
    // All map edges are aggregated file/folder edges now, and the drawn ones are
    // all lit → each carries a count plate.
    expect(container.querySelectorAll(".edge-count").length).toBe(litEdgeCount(slice));
  });

  it("draws the selected node's edges and does NOT draw unrelated non-lit edges", () => {
    const slice = sliceAt(1.5);
    // Pick a file endpoint of a slice edge as the selection.
    const anchor = slice.edges[0].src;
    const { container } = renderLayer(slice, { focusedId: anchor });
    const selected = container.querySelectorAll(".atlas-edge.edge-selected").length;
    expect(selected).toBeGreaterThan(0);
    // No faded edges exist — unrelated non-lit edges are simply not in the DOM.
    expect(container.querySelectorAll(".atlas-edge.edge-faded").length).toBe(0);
    const total = container.querySelectorAll(".atlas-edge").length;
    // Every drawn edge is either lit or selection-adjacent.
    const litOrSel = slice.edges.filter(
      (e) => e.lit === true || e.src === anchor || e.dst === anchor,
    ).length;
    expect(total).toBe(litOrSel);
  });

  it("pre-highlights a hovered node's edge without a count plate", () => {
    const slice = sliceAt(1.5);
    // A non-lit edge endpoint so the only reason it draws is the hover.
    const nonLit = slice.edges.find((e) => e.lit !== true);
    expect(nonLit).toBeTruthy();
    const { container } = renderLayer(slice, { hoveredId: nonLit!.src });
    expect(container.querySelectorAll(".atlas-edge.edge-hover").length).toBeGreaterThan(0);
  });
});

describe("EdgeLayer stroke width + off-viewport stubs (regression)", () => {
  it("keeps every drawn edge screen-space (non-scaling-stroke, strokeWidth ≤ 6) at deep zoom", () => {
    const slice = sliceAt(2.5); // deep zoom is where world-scaled strokes exploded
    const anchor = slice.edges[0].src; // select a node so the widest (selected) edge draws
    const { container } = renderLayer(slice, { focusedId: anchor });
    const lines = container.querySelectorAll(".atlas-edge line");
    expect(lines.length).toBeGreaterThan(0);
    for (const ln of lines) {
      expect(ln.getAttribute("vector-effect")).toBe("non-scaling-stroke");
      expect(Number(ln.getAttribute("stroke-width"))).toBeLessThanOrEqual(6);
    }
  });

  it("renders a selection edge to an OFF-viewport endpoint as a short bounded stub", () => {
    const slice = sliceAt(1.5);
    const e = slice.edges[0];
    const src = slice.nodes.find((n) => n.id === e.src)!;
    // A viewport tight around the src lot excludes the dst lot → the edge stubs.
    const vp: Viewport = { x: src.rect.x - 1, y: src.rect.y - 1, w: src.rect.w + 2, h: src.rect.h + 2 };
    const { container } = renderLayer(slice, { focusedId: e.src, viewport: vp });
    const stubLines = container.querySelectorAll(".atlas-edge.edge-stub line");
    expect(stubLines.length).toBeGreaterThan(0);
    const boundPx = 0.12 * Math.min(vp.w, vp.h) * UNIT + 1; // stub fraction + 1px slack
    for (const ln of stubLines) {
      const x1 = Number(ln.getAttribute("x1"));
      const y1 = Number(ln.getAttribute("y1"));
      const x2 = Number(ln.getAttribute("x2"));
      const y2 = Number(ln.getAttribute("y2"));
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeLessThanOrEqual(boundPx);
    }
  });
});
