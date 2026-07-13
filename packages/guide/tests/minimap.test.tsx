// Minimap substrate (D9): renders TOP-LEVEL folder regions only (never
// files/decls), a live viewport rect, search-hit marks, and active-lens marks;
// clicking a region pans the camera.

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { fitViewport } from "../src/atlas/lod.js";
import { Minimap } from "../src/ui/Minimap.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const model = compile(makeFixtureCorpus());
const topRegions = model.regions.filter((r) => r.depth === 1);
const worldBounds = fitViewport(model);

afterEach(cleanup);

describe("Minimap (D9 spec)", () => {
  it("draws top-level folder regions only — no file or decl nodes", () => {
    const { container } = render(
      <Minimap
        regions={topRegions}
        worldBounds={worldBounds}
        viewport={{ x: 0, y: 0, w: 20, h: 20 }}
        litRegionIds={new Set()}
        searchMarks={[]}
        onRegionClick={() => {}}
        onViewportChange={() => {}}
      />,
    );
    const rects = container.querySelectorAll(".minimap-region");
    expect(rects.length).toBe(topRegions.length);
    expect(topRegions.length).toBeGreaterThan(0);
    // Every drawn region is a folder region id — never a file:/sym: atom.
    for (const r of rects) {
      const id = r.getAttribute("data-region-id") ?? "";
      expect(id.startsWith("file:")).toBe(false);
      expect(id.startsWith("sym:")).toBe(false);
    }
  });

  it("renders a live viewport rectangle", () => {
    const { container } = render(
      <Minimap
        regions={topRegions}
        worldBounds={worldBounds}
        viewport={{ x: 5, y: 5, w: 15, h: 12 }}
        litRegionIds={new Set()}
        searchMarks={[]}
        onRegionClick={() => {}}
        onViewportChange={() => {}}
      />,
    );
    const vp = container.querySelector(".minimap-viewport");
    expect(vp).toBeTruthy();
    expect(Number(vp!.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(vp!.getAttribute("height"))).toBeGreaterThan(0);
  });

  it("pans the camera when a region is clicked", () => {
    const onRegionClick = vi.fn();
    const { container } = render(
      <Minimap
        regions={topRegions}
        worldBounds={worldBounds}
        viewport={{ x: 0, y: 0, w: 20, h: 20 }}
        litRegionIds={new Set()}
        searchMarks={[]}
        onRegionClick={onRegionClick}
        onViewportChange={() => {}}
      />,
    );
    const first = container.querySelector(".minimap-region")!;
    fireEvent.click(first);
    expect(onRegionClick).toHaveBeenCalledWith(first.getAttribute("data-region-id"));
  });

  it("shows a mark per search hit", () => {
    const { container } = render(
      <Minimap
        regions={topRegions}
        worldBounds={worldBounds}
        viewport={{ x: 0, y: 0, w: 20, h: 20 }}
        litRegionIds={new Set()}
        searchMarks={[
          { x: 3, y: 3 },
          { x: 10, y: 8 },
        ]}
        onRegionClick={() => {}}
        onViewportChange={() => {}}
      />,
    );
    expect(container.querySelectorAll(".minimap-search-mark").length).toBe(2);
  });

  it("lights active-lens regions", () => {
    const litId = topRegions[0].id;
    const { container } = render(
      <Minimap
        regions={topRegions}
        worldBounds={worldBounds}
        viewport={{ x: 0, y: 0, w: 20, h: 20 }}
        litRegionIds={new Set([litId])}
        searchMarks={[]}
        onRegionClick={() => {}}
        onViewportChange={() => {}}
      />,
    );
    const lit = container.querySelectorAll(".minimap-region-lit");
    expect(lit.length).toBe(1);
    expect(lit[0].getAttribute("data-region-id")).toBe(litId);
  });

  it("is collapsible and hides the map body when collapsed", () => {
    const { container, getByRole } = render(
      <Minimap
        regions={topRegions}
        worldBounds={worldBounds}
        viewport={{ x: 0, y: 0, w: 20, h: 20 }}
        litRegionIds={new Set()}
        searchMarks={[]}
        onRegionClick={() => {}}
        onViewportChange={() => {}}
      />,
    );
    expect(container.querySelector(".minimap-svg")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /Map/ }));
    expect(container.querySelector(".minimap-svg")).toBeNull();
  });
});
