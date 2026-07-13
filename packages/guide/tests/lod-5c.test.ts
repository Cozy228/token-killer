import { describe, expect, it } from "vitest";
import { compile, ancestors } from "../src/atlas/compile.js";
import {
  computeSlice,
  DEFAULT_LOD,
  fitViewport,
  hotspotViewport,
  nextZoomLevel,
  revealForLevel,
  ZOOM_DOWN,
  ZOOM_UP,
} from "../src/atlas/lod.js";
import { project, resolveEvent } from "../src/atlas/event.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const corpus = makeFixtureCorpus();
const model = compile(corpus);

describe("semantic-zoom hysteresis (D9)", () => {
  it("keeps every down-threshold strictly below its up-threshold", () => {
    for (let k = 1; k < ZOOM_UP.length; k++) {
      expect(ZOOM_DOWN[k]).toBeLessThan(ZOOM_UP[k]);
    }
  });

  it("does not flap while the zoom oscillates inside a level's dead band", () => {
    // Settle at level 1 (a zoom that reveals depth-2 folders but not files).
    let level = nextZoomLevel(0, 0.5);
    expect(level).toBe(1);
    // Oscillate between DOWN[2] and UP[2] exclusive: never clears UP[2]=0.7 to
    // climb, never falls below DOWN[1]=0.28 to drop -> the level must not move.
    const band = [0.5, 0.62, 0.32, 0.66, 0.3, 0.55, 0.4];
    let flaps = 0;
    for (const z of band) {
      const next = nextZoomLevel(level, z);
      if (next !== level) flaps++;
      level = next;
    }
    expect(flaps).toBe(0);
    expect(level).toBe(1);
  });

  it("reveals the file level on zoom-in but holds it until the LOWER down-threshold", () => {
    // Climb into level 2 (files) — the top of the folders -> files ladder.
    let level = nextZoomLevel(1, 0.8);
    expect(level).toBe(2);
    // Zoom back to 0.6: below UP[2]=0.7 but above DOWN[2]=0.56 -> stays revealed.
    level = nextZoomLevel(level, 0.6);
    expect(level).toBe(2);
    // Only below DOWN[2] does it drop.
    level = nextZoomLevel(level, 0.5);
    expect(level).toBe(1);
  });

  it("bounds slice recomputes over a monotone zoom-in sweep", () => {
    // A slow monotone climb crosses each level boundary at most once. The ladder
    // now tops out at the file level (2), so <= 2 changes and it settles at 2.
    let level = 0;
    let changes = 0;
    for (let z = 0.1; z <= 2; z += 0.05) {
      const next = nextZoomLevel(level, z);
      if (next !== level) changes++;
      level = next;
    }
    expect(changes).toBeLessThanOrEqual(2);
    expect(level).toBe(2);
  });
});

describe("pinned reveal (D9 click-pins-an-expansion)", () => {
  const fit = fitViewport(model);
  const OVERVIEW = 0; // folders only, no files/decls

  function childrenOf(parentId: string, nodeIds: Set<string>): string[] {
    return model.nodes.filter((n) => n.parent === parentId && nodeIds.has(n.id)).map((n) => n.id);
  }

  it("does NOT show a folder's children at overview zoom without a pin", () => {
    const slice = computeSlice(model, fit, 0.2, DEFAULT_LOD, undefined, undefined, {
      revealLevel: OVERVIEW,
    });
    const ids = new Set(slice.nodes.map((n) => n.id));
    expect(childrenOf("dir:src", ids)).toEqual([]);
  });

  it("reveals exactly the pinned folder's direct children at that far zoom", () => {
    const slice = computeSlice(model, fit, 0.2, DEFAULT_LOD, undefined, undefined, {
      revealLevel: OVERVIEW,
      pinnedIds: new Set(["dir:src"]),
    });
    const ids = new Set(slice.nodes.map((n) => n.id));
    expect(childrenOf("dir:src", ids).length).toBeGreaterThan(0);
    // A sibling folder's children stay hidden (the pin is local to dir:src).
    expect(childrenOf("dir:docs", ids)).toEqual([]);
  });

  it("collapses again once the pin is cleared (Esc / deselect)", () => {
    const cleared = computeSlice(model, fit, 0.2, DEFAULT_LOD, undefined, undefined, {
      revealLevel: OVERVIEW,
      pinnedIds: new Set(),
    });
    const ids = new Set(cleared.nodes.map((n) => n.id));
    expect(childrenOf("dir:src", ids)).toEqual([]);
  });
});

describe("cold-open hotspot viewport (D10)", () => {
  const resolved = resolveEvent({}, corpus);
  if (!resolved.ok) throw new Error("default event must resolve");
  const p = project(resolved.event, model);
  const litSet = new Set(p.litNodeIds);

  it("frames the densest single region (dir:src), not the union of all lit nodes", () => {
    const hotspot = hotspotViewport(model, litSet);
    const src = model.nodeIndex.get("dir:src")!.rect;
    // Exactly the densest region padded 25% on each side — a single folder frame,
    // not the whole-map lit bbox (which spans to the root region).
    const gx = src.w * 0.25;
    const gy = src.h * 0.25;
    expect(hotspot).toEqual({
      x: src.x - gx,
      y: src.y - gy,
      w: src.w + gx * 2,
      h: src.h + gy * 2,
    });
    // The frame is anchored on ONE region, not the union of all lit nodes: the
    // whole-lit bbox reaches the root origin, the hotspot does not.
    const wholeLit = p.viewport;
    expect(wholeLit.x).toBeLessThan(hotspot.x);
  });

  it("counts lit files per top-level region and picks the winner", () => {
    // Sanity: the winning region really does contain the most lit files.
    const perRegion = new Map<string, number>();
    for (const id of litSet) {
      const n = model.nodeIndex.get(id);
      if (!n || n.kind !== "file") continue;
      for (const a of ancestors(model, id)) {
        if (a.depth === 1) {
          perRegion.set(a.id, (perRegion.get(a.id) ?? 0) + 1);
          break;
        }
      }
    }
    const winner = [...perRegion.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(winner[0]).toBe("dir:src");
  });

  it("fits the repo when there is no code activity", () => {
    const fit = fitViewport(model);
    expect(hotspotViewport(model, undefined)).toEqual(fit);
    expect(hotspotViewport(model, new Set())).toEqual(fit);
    // A lit set with no FILE nodes (folders only) also fits the repo.
    expect(hotspotViewport(model, new Set(["dir:src"]))).toEqual(fit);
  });
});

describe("revealForLevel is stable and clamped", () => {
  it("maps levels 0..2 to the folders -> files ladder (no decl level)", () => {
    expect(revealForLevel(0).showFiles).toBe(false);
    expect(revealForLevel(1).showFiles).toBe(false);
    expect(revealForLevel(2).showFiles).toBe(true);
    // Out-of-range clamps rather than throwing; the top level is files (2).
    expect(revealForLevel(-5)).toEqual(revealForLevel(0));
    expect(revealForLevel(99)).toEqual(revealForLevel(2));
  });
});
