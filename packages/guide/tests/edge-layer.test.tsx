// Regression for the round-2 critical defect: edges never reached the DOM
// (React Flow drops handle-less custom nodes). We draw edges in our own SVG
// layer, so the DOM edge count MUST equal the slice edge count, at every zoom.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { computeSlice, DEFAULT_LOD, fitViewport } from "../src/atlas/lod.js";
import { project, resolveEvent } from "../src/atlas/event.js";
import { edgeKey, type LitState } from "../src/ui/GraphRenderer.js";
import { EdgeLayer } from "../src/ui/ReactFlowRenderer.js";
import type { VariantSpec } from "../src/variants/types.js";
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
  return {
    litNodeIds: new Set(slice.litVisibleIds),
    hasEvent: true,
  };
}

const plainVariant: VariantSpec = {
  id: "test-plain",
  label: "Test",
  description: "",
  themeClass: "variant-test",
  NodeContent: () => null,
};

describe("EdgeLayer DOM census (round-2 defect)", () => {
  it("renders one .atlas-edge element per slice edge, at every zoom", () => {
    for (const zoom of [0.2, 0.6, 1.0, 1.5, 3]) {
      const slice = sliceAt(zoom);
      const { container } = render(<EdgeLayer slice={slice} litState={litStateFor(slice)} variant={plainVariant} />);
      expect(container.querySelectorAll(".atlas-edge").length).toBe(slice.edges.length);
      cleanup();
    }
  });

  it("draws lit region overlays for each lit-visible node", () => {
    const slice = sliceAt(0.2); // overview: lit aggregates onto folder regions
    const { container } = render(<EdgeLayer slice={slice} litState={litStateFor(slice)} variant={plainVariant} />);
    expect(container.querySelectorAll(".atlas-lit-region").length).toBe(slice.litVisibleIds.length);
    expect(slice.litVisibleIds.length).toBeGreaterThan(0);
  });

  it("puts edge-lit / edge-<kind> classes on the edge element", () => {
    const slice = sliceAt(1.5);
    const { container } = render(<EdgeLayer slice={slice} litState={litStateFor(slice)} variant={plainVariant} />);
    // The fixture event lights a calls edge; at least one edge must carry edge-lit.
    expect(container.querySelectorAll(".atlas-edge.edge-lit").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".atlas-edge.edge-calls").length).toBeGreaterThan(0);
  });

  it("routes through variant.EdgePath when provided (transit's mechanism)", () => {
    let calls = 0;
    const edgeVariant: VariantSpec = {
      ...plainVariant,
      id: "test-edgepath",
      EdgePath: (_e, g) => {
        calls++;
        return <path d={`M${g.x1},${g.y1} L${g.x2},${g.y2}`} />;
      },
    };
    const slice = sliceAt(1.5);
    const { container } = render(<EdgeLayer slice={slice} litState={litStateFor(slice)} variant={edgeVariant} />);
    expect(calls).toBe(slice.edges.length);
    // Classes land on the wrapping <g> so variant CSS can hook lit/dim.
    expect(container.querySelectorAll("g.atlas-edge").length).toBe(slice.edges.length);
  });
});
