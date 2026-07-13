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

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

type Box = { x: number; y: number; w: number; h: number };

interface Cap {
  initialViewport: null | Box;
  viewport: null | Box;
  slice: null | {
    nodes: { id: string; kind: string }[];
    edges: { src: string; dst: string }[];
    counts: { visibleNodes: number };
  };
  onFocus: null | ((id: string) => void);
}

const h = vi.hoisted(() => ({
  cap: { initialViewport: null, viewport: null, slice: null, onFocus: null } as Cap,
}));

vi.mock("../src/ui/ReactFlowRenderer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/ReactFlowRenderer.js")>();
  const React = await import("react");
  const MockRenderer = (props: {
    slice: Cap["slice"];
    litState: unknown;
    variant: unknown;
    focusedId: string | null;
    initialViewport: Cap["initialViewport"];
    viewport: Cap["viewport"];
    onFocus: (id: string) => void;
    onApiReady?: (api: unknown) => void;
  }) => {
    h.cap.initialViewport = props.initialViewport;
    h.cap.viewport = props.viewport;
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
  h.cap.viewport = null;
  h.cap.slice = null;
  h.cap.onFocus = null;
});

describe("SpikeApp integration smoke", () => {
  it("renders edges, lights the event, opens on the event viewport, footer matches", async () => {
    const { container } = render(<SpikeApp />);
    await waitFor(() => expect(container.querySelector(".atlas-edge")).toBeTruthy());

    const slice = h.cap.slice!;
    // Option-A quiet map: at rest (no selection) the ONLY structural edges drawn
    // are the lit Change Trace trunk edges — DOM edges == lit edges, not the full
    // slice. There is at least one lit edge for the fixture event.
    const drawn = container.querySelectorAll(".atlas-edge").length;
    const lit = container.querySelectorAll(".atlas-edge.edge-lit").length;
    expect(lit).toBeGreaterThan(0);
    expect(drawn).toBe(lit);
    // At rest the drawn set is the lit trunk only — never the whole slice.
    expect(drawn).toBeLessThanOrEqual(slice.edges.length);

    const iv = h.cap.initialViewport!;
    expect(iv.w).toBeLessThan(100);
    expect(iv.h).toBeLessThan(100);
    expect(iv.w).toBeGreaterThan(0);

    const mapHud = container.querySelector(".map-hud");
    expect(mapHud?.textContent).toContain(`visible ${slice.counts.visibleNodes}/`);

    // Data-state honesty badge (D33 / E5): the stubbed live endpoint succeeds, so
    // the top bar truthfully shows the "live" source.
    const badge = container.querySelector(".hud-data-state");
    expect(badge?.textContent).toBe("live");
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

  it("programmatic focus (search activation) forces an immediate re-slice centered on the target", async () => {
    const model = compile(makeFixtureCorpus());
    const target = model.nodeIndex.get("file:docs/guide.md")!;
    const tcx = target.rect.x + target.rect.w / 2;
    const tcy = target.rect.y + target.rect.h / 2;

    const { container } = render(<SpikeApp />);
    await waitFor(() => expect(container.querySelector(".atlas-edge")).toBeTruthy());

    // Before: the cold-open slice is framed on the hotspot (dir:src), NOT docs.
    const before = h.cap.viewport!;
    const bDist = Math.hypot(before.x + before.w / 2 - tcx, before.y + before.h / 2 - tcy);
    expect(bDist).toBeGreaterThan(3);

    // Activate docs/guide.md via search (rail/search/connections all route here).
    const omni = container.querySelector(".omnibox") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(omni, { target: { value: "guide.md" } });
    });
    const hit = await waitFor(() => {
      const b = container.querySelector(".search-hit") as HTMLButtonElement | null;
      if (!b) throw new Error("no search hit rendered");
      return b;
    });
    await act(async () => {
      fireEvent.click(hit);
    });

    // The very next renderer input (no Fit repo / manual zoom in between) is a
    // slice re-centered on the target AND it contains the target node — the
    // reveal forced an immediate re-slice, bypassing the pan/zoom hysteresis.
    const after = h.cap.viewport!;
    expect(Math.abs(after.x + after.w / 2 - tcx)).toBeLessThan(1);
    expect(Math.abs(after.y + after.h / 2 - tcy)).toBeLessThan(1);
    expect(h.cap.slice!.nodes.map((n) => n.id)).toContain("file:docs/guide.md");
  });
});
