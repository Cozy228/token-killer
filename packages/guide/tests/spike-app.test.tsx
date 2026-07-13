// Integration smoke: mount SpikeApp with the fixture corpus + default event and
// assert the wiring that unit tests kept missing (unit-green, browser-dead):
//   (a) rendered .atlas-edge count == the slice's edge count,
//   (b) at least one .edge-lit exists for the fixture event at the initial zoom,
//   (c) the renderer received a NON-identity initial viewport (the event bbox),
//   (d) the footer counts bind to the SAME slice the renderer received,
//   (e) [R4] selecting a node emphasizes its edges + opens the evidence panel.
//
// The renderer seam is replaced by a double that renders the REAL EdgeLayer (so
// edges reach the DOM without a full React Flow layout) and captures its props.

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

interface Cap {
  initialViewport: null | { x: number; y: number; w: number; h: number };
  slice: null | { edges: { src: string; dst: string }[]; counts: { visibleNodes: number } };
  onFocus: null | ((id: string) => void);
}

const h = vi.hoisted(() => ({ cap: { initialViewport: null, slice: null, onFocus: null } as Cap }));

vi.mock("../src/ui/ReactFlowRenderer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/ReactFlowRenderer.js")>();
  const React = await import("react");
  const MockRenderer = (props: {
    slice: Cap["slice"];
    litState: unknown;
    variant: unknown;
    focusedId: string | null;
    initialViewport: Cap["initialViewport"];
    onFocus: (id: string) => void;
    onApiReady?: (api: unknown) => void;
  }) => {
    h.cap.initialViewport = props.initialViewport;
    h.cap.slice = props.slice;
    h.cap.onFocus = props.onFocus;
    React.useEffect(() => {
      props.onApiReady?.({
        setViewport() {},
        fitView() {},
        revealNode: () => false,
        centerOn() {},
        runSweep: async () => {},
      });
    }, []);
    return React.createElement(actual.EdgeLayer, {
      slice: props.slice as never,
      litState: props.litState as never,
      variant: props.variant as never,
      focusedId: props.focusedId,
      hoveredId: null,
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
  h.cap.initialViewport = null;
  h.cap.slice = null;
  h.cap.onFocus = null;
});

describe("SpikeApp integration smoke", () => {
  it("renders edges, lights the event, opens on the event viewport, footer matches", async () => {
    const { container } = render(<SpikeApp />);
    await waitFor(() => expect(container.querySelector(".atlas-edge")).toBeTruthy());

    const slice = h.cap.slice!;
    expect(container.querySelectorAll(".atlas-edge").length).toBe(slice.edges.length);
    expect(container.querySelectorAll(".atlas-edge.edge-lit").length).toBeGreaterThan(0);

    const iv = h.cap.initialViewport!;
    expect(iv.w).toBeLessThan(100);
    expect(iv.h).toBeLessThan(100);
    expect(iv.w).toBeGreaterThan(0);

    const mapHud = container.querySelector(".map-hud");
    expect(mapHud?.textContent).toContain(`visible ${slice.counts.visibleNodes}/`);
  });

  it("selecting a node emphasizes its edges and opens the evidence panel (R4-1/R4-3)", async () => {
    const { container } = render(<SpikeApp />);
    await waitFor(() => expect(container.querySelector(".atlas-edge")).toBeTruthy());

    // Pick a node that is an endpoint of a slice edge, then select it.
    const anchor = h.cap.slice!.edges[0].src;
    await act(async () => {
      h.cap.onFocus!(anchor);
    });

    // Canvas emphasis: selected edges appear, everything else fades.
    expect(container.querySelectorAll(".atlas-edge.edge-selected").length).toBeGreaterThan(0);

    // Evidence panel opens with directional-verb connection rows.
    const panel = container.querySelector(".focused-evidence");
    expect(panel).toBeTruthy();
    expect(panel!.querySelectorAll(".fe-row").length).toBeGreaterThan(0);
    const verbs = panel!.textContent ?? "";
    expect(/calls|called by|imports|imported by/.test(verbs)).toBe(true);
  });
});
