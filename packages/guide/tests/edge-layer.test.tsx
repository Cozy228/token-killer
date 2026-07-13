// EdgeLayer DOM regressions: (round 2) edges must reach the DOM 1:1 with the
// slice; (round 4) clipping, count/relation labels, and selection emphasis.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { computeSlice, DEFAULT_LOD, fitViewport } from "../src/atlas/lod.js";
import { project, resolveEvent } from "../src/atlas/event.js";
import { edgeKey, type LitState } from "../src/ui/GraphRenderer.js";
import { EdgeLayer } from "../src/ui/ReactFlowRenderer.js";
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

const plainVariant: VariantSpec = {
  id: "test-plain",
  label: "Test",
  description: "",
  themeClass: "variant-test",
  NodeContent: () => null,
};

function renderLayer(
  slice: ReturnType<typeof sliceAt>,
  opts: { focusedId?: string | null; hoveredId?: string | null; variant?: VariantSpec } = {},
) {
  return render(
    <EdgeLayer
      slice={slice}
      litState={litStateFor(slice)}
      variant={opts.variant ?? plainVariant}
      focusedId={opts.focusedId ?? null}
      hoveredId={opts.hoveredId ?? null}
    />,
  );
}

describe("EdgeLayer DOM census (round-2 defect)", () => {
  it("renders one .atlas-edge element per slice edge, at every zoom", () => {
    for (const zoom of [0.2, 0.6, 1.0, 1.5, 3]) {
      const slice = sliceAt(zoom);
      const { container } = renderLayer(slice);
      expect(container.querySelectorAll(".atlas-edge").length).toBe(slice.edges.length);
      cleanup();
    }
  });

  it("draws lit region overlays for each lit-visible node", () => {
    const slice = sliceAt(0.2);
    const { container } = renderLayer(slice);
    expect(container.querySelectorAll(".atlas-lit-region").length).toBe(slice.litVisibleIds.length);
    expect(slice.litVisibleIds.length).toBeGreaterThan(0);
  });

  it("puts edge-lit / edge-<kind> classes on the edge element", () => {
    const slice = sliceAt(1.5);
    const { container } = renderLayer(slice);
    expect(container.querySelectorAll(".atlas-edge.edge-lit").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".atlas-edge.edge-calls").length).toBeGreaterThan(0);
  });

  it("routes through variant.EdgePath with clipped geometry (transit's mechanism)", () => {
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
    expect(calls).toBe(slice.edges.length);
    expect(container.querySelectorAll("g.atlas-edge").length).toBe(slice.edges.length);
    // Additive clipped geometry + count + direction are present (R4-2).
    for (const g of seen) {
      expect(g.clippedX1).toBeTypeOf("number");
      expect(g.midX).toBeTypeOf("number");
      expect(g.count).toBeTypeOf("number");
      expect(g.direction).toBe("src->dst");
    }
  });
});

describe("EdgeLayer round-4 presentation", () => {
  it("shows a count label only for aggregated (file/folder) edges, not raw sym-sym", () => {
    const slice = sliceAt(1.5); // decls revealed → calls are sym-sym, imports are file-level
    const { container } = renderLayer(slice);
    const aggregated = slice.edges.filter((e) => !e.src.startsWith("sym:") || !e.dst.startsWith("sym:"));
    expect(container.querySelectorAll(".edge-count").length).toBe(aggregated.length);
  });

  it("emphasizes the selected node's edges and fades the rest (R4-1)", () => {
    const slice = sliceAt(1.5);
    const anchor = slice.edges.find((e) => e.src.startsWith("sym:"))?.src;
    expect(anchor).toBeTruthy();
    const { container } = renderLayer(slice, { focusedId: anchor });
    const selected = container.querySelectorAll(".atlas-edge.edge-selected").length;
    const faded = container.querySelectorAll(".atlas-edge.edge-faded").length;
    expect(selected).toBeGreaterThan(0);
    // Every non-adjacent edge is faded; selected + faded covers all edges.
    expect(selected + faded).toBe(slice.edges.length);
  });

  it("draws a relation label for a selected raw sym-sym edge", () => {
    const slice = sliceAt(1.5);
    const symEdge = slice.edges.find((e) => e.src.startsWith("sym:") && e.dst.startsWith("sym:"));
    expect(symEdge).toBeTruthy();
    const { container } = renderLayer(slice, { focusedId: symEdge!.src });
    expect(container.querySelectorAll(".edge-relation").length).toBeGreaterThan(0);
  });
});
