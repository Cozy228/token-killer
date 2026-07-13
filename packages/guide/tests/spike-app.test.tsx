// Integration smoke: mount SpikeApp with the fixture corpus + default event and
// assert the wiring that unit tests kept missing (unit-green, browser-dead):
//   (a) rendered .atlas-edge count == the slice's edge count,
//   (b) at least one .edge-lit exists for the fixture event at the initial zoom,
//   (c) the renderer received a NON-identity initial viewport (the event bbox),
//   (d) the footer counts bind to the SAME slice the renderer received.
//
// The renderer seam is replaced by a double that renders the REAL EdgeLayer (so
// edges reach the DOM without a full React Flow layout) and captures its props.

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const h = vi.hoisted(() => ({
  capture: { initialViewport: null as null | { x: number; y: number; w: number; h: number }, slice: null as unknown },
}));

vi.mock("../src/ui/ReactFlowRenderer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/ReactFlowRenderer.js")>();
  const React = await import("react");
  const MockRenderer = (props: {
    slice: unknown;
    litState: unknown;
    variant: unknown;
    initialViewport: { x: number; y: number; w: number; h: number };
    onApiReady?: (api: unknown) => void;
  }) => {
    h.capture.initialViewport = props.initialViewport;
    h.capture.slice = props.slice;
    React.useEffect(() => {
      props.onApiReady?.({ setViewport() {}, fitView() {}, runSweep: async () => {} });
    }, []);
    return React.createElement(actual.EdgeLayer, {
      slice: props.slice as never,
      litState: props.litState as never,
      variant: props.variant as never,
    });
  };
  return { ...actual, ReactFlowRenderer: MockRenderer };
});

const { SpikeApp } = await import("../src/ui/SpikeApp.js");

beforeEach(() => {
  const corpusJson = JSON.stringify(makeFixtureCorpus());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => corpusJson })) as unknown as typeof fetch,
  );
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  h.capture.initialViewport = null;
  h.capture.slice = null;
});

describe("SpikeApp integration smoke", () => {
  it("renders edges, lights the event, opens on the event viewport, footer matches", async () => {
    const { container } = render(<SpikeApp />);

    await waitFor(() => {
      expect(container.querySelector(".atlas-edge")).toBeTruthy();
    });

    const slice = h.capture.slice as { edges: unknown[]; counts: { visibleNodes: number } };

    // (a) DOM edge count == slice edge count.
    expect(container.querySelectorAll(".atlas-edge").length).toBe(slice.edges.length);

    // (b) at least one lit edge for the fixture event at the initial zoom.
    expect(container.querySelectorAll(".atlas-edge.edge-lit").length).toBeGreaterThan(0);

    // (c) non-identity initial viewport: the event bbox (28x35), not the 100x100 placeholder.
    const iv = h.capture.initialViewport!;
    expect(iv).not.toBeNull();
    expect(iv.w).toBeLessThan(100);
    expect(iv.h).toBeLessThan(100);
    expect(iv.w).toBeGreaterThan(0);

    // (d) footer counts bind to the same slice the renderer received.
    const mapHud = container.querySelector(".map-hud");
    expect(mapHud?.textContent).toContain(`visible ${slice.counts.visibleNodes}/`);
  });
});
