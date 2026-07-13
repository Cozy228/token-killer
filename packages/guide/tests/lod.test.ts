import { describe, expect, it } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { computeSlice, DEFAULT_LOD, fitViewport } from "../src/atlas/lod.js";
import { project, resolveEvent } from "../src/atlas/event.js";
import { expand10x } from "../src/atlas/synthetic.js";
import type { CorpusInput } from "../src/atlas/types.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const model10x = compile(expand10x(makeFixtureCorpus()));

describe("LOD caps", () => {
  it("never sends the renderer more than the cap, across zooms and viewports", () => {
    const fit = fitViewport(model10x);
    const zooms = [0.2, 0.5, 0.9, 1.5, 3];
    for (const zoom of zooms) {
      const slice = computeSlice(model10x, fit, zoom, DEFAULT_LOD);
      expect(slice.nodes.length).toBeLessThanOrEqual(DEFAULT_LOD.maxNodes);
      expect(slice.edges.length).toBeLessThanOrEqual(DEFAULT_LOD.maxEdges);
    }
  });

  it("enforces a tight cap and discloses omissions when capped", () => {
    const fit = fitViewport(model10x);
    const tight = { maxNodes: 50, maxEdges: 30, overscan: 1.5 };
    const slice = computeSlice(model10x, fit, 3, tight);
    expect(slice.nodes.length).toBeLessThanOrEqual(50);
    expect(slice.edges.length).toBeLessThanOrEqual(30);
    expect(slice.omissions.length).toBeGreaterThan(0);
  });

  it("only emits edges whose endpoints are both visible", () => {
    const fit = fitViewport(model10x);
    const slice = computeSlice(model10x, fit, 1.5, DEFAULT_LOD);
    const visible = new Set(slice.nodes.map((n) => n.id));
    for (const e of slice.edges) {
      expect(visible.has(e.src), `src ${e.src}`).toBe(true);
      expect(visible.has(e.dst), `dst ${e.dst}`).toBe(true);
    }
  });

  it("reports logical counts unchanged by the slice", () => {
    const fit = fitViewport(model10x);
    const slice = computeSlice(model10x, fit, 0.5, DEFAULT_LOD);
    expect(slice.counts.logicalNodes).toBe(model10x.nodes.length);
    expect(slice.counts.visibleNodes).toBe(slice.nodes.length);
  });
});

describe("LOD lit protection + aggregation (defect 6)", () => {
  const model = compile(makeFixtureCorpus());
  // A lit decl deep in the tree, plus its file.
  const lit = new Set(["sym:src/util/math.ts#add", "file:src/app.ts"]);

  it("aggregates a lit decl onto a visible ancestor at overview zoom", () => {
    const fit = fitViewport(model);
    // Overview zoom shows folders only (no files/decls).
    const slice = computeSlice(model, fit, 0.2, DEFAULT_LOD, lit);
    expect(slice.litVisibleIds.length).toBeGreaterThan(0);
    // Every reported lit id is actually present in the rendered slice.
    const visible = new Set(slice.nodes.map((n) => n.id));
    for (const id of slice.litVisibleIds) expect(visible.has(id)).toBe(true);
  });

  it("keeps lit nodes alive under a tight cap", () => {
    const fit = fitViewport(model);
    const tight = { maxNodes: 3, maxEdges: 5, overscan: 1.5 };
    const slice = computeSlice(model, fit, 1.5, tight, lit);
    // Even with a 3-node cap, a lit representation survives.
    expect(slice.litVisibleIds.length).toBeGreaterThan(0);
    const visible = new Set(slice.nodes.map((n) => n.id));
    for (const id of slice.litVisibleIds) expect(visible.has(id)).toBe(true);
  });

  it("marks no lit ids when no event lit set is given", () => {
    const fit = fitViewport(model);
    const slice = computeSlice(model, fit, 1.5, DEFAULT_LOD);
    expect(slice.litVisibleIds).toEqual([]);
  });
});

describe("LOD aggregation-aware lit edges (defect 2)", () => {
  const corpus = makeFixtureCorpus();
  const model = compile(corpus);
  const resolved = resolveEvent({}, corpus);
  if (!resolved.ok) throw new Error("event must resolve");
  const p = project(resolved.event, model);
  const litNodes = new Set(p.litNodeIds);
  const litEdgeKeys = new Set(p.litEdges.map((e) => `${e.kind} ${e.src} ${e.dst}`));

  it("lights an aggregated (file-level) edge when a constituent atom edge is lit", () => {
    const fit = fitViewport(model);
    // Zoom 1.0: files are the atoms, decls collapse — sym->sym lit calls
    // aggregate to file->file. The aggregated edge must carry lit.
    const slice = computeSlice(model, fit, 1.0, DEFAULT_LOD, litNodes, litEdgeKeys);
    const litEdges = slice.edges.filter((e) => e.lit === true);
    expect(litEdges.length).toBeGreaterThan(0);
    // And a lit edge is genuinely aggregated (endpoints are files, not the atom syms).
    expect(litEdges.some((e) => e.src.startsWith("file:") && e.dst.startsWith("file:"))).toBe(true);
  });

  it("marks no edge lit when no lit edge set is passed", () => {
    const fit = fitViewport(model);
    const slice = computeSlice(model, fit, 1.0, DEFAULT_LOD, litNodes);
    expect(slice.edges.every((e) => !e.lit)).toBe(true);
  });
});

describe("map slim-down: declarations never reach the renderer (Option A)", () => {
  const modelCurrent = compile(makeFixtureCorpus());

  it("emits only folders + files across every zoom (current scale)", () => {
    const fit = fitViewport(modelCurrent);
    // The old ladder had a decls level at zoom >= 1.2; assert it is gone at high
    // zoom too — decls are structurally not a map grain anymore.
    for (const zoom of [0.2, 0.5, 0.7, 1.0, 1.5, 3, 4]) {
      const slice = computeSlice(modelCurrent, fit, zoom, DEFAULT_LOD);
      expect(slice.nodes.every((n) => n.kind !== "decl")).toBe(true);
    }
  });

  it("still emits no decl nodes at 10x scale and any zoom", () => {
    const fit10 = fitViewport(model10x);
    for (const zoom of [0.2, 0.9, 1.5, 3, 4]) {
      const slice = computeSlice(model10x, fit10, zoom, DEFAULT_LOD);
      expect(slice.nodes.some((n) => n.kind === "decl")).toBe(false);
    }
  });

  it("keeps a lit decl legible by aggregating it onto its FILE lot, not a decl cell", () => {
    const lit = new Set(["sym:src/util/math.ts#add"]);
    const fit = fitViewport(modelCurrent);
    // Files revealed: the lit decl's nearest revealed ancestor is its file lot.
    const slice = computeSlice(modelCurrent, fit, 1.5, DEFAULT_LOD, lit);
    expect(slice.litVisibleIds.length).toBeGreaterThan(0);
    const visible = new Set(slice.nodes.map((n) => n.id));
    for (const id of slice.litVisibleIds) {
      expect(visible.has(id)).toBe(true);
      expect(modelCurrent.nodeIndex.get(id)?.kind).not.toBe("decl");
    }
  });
});

describe("quiet map: aggregated edges stay in the slice (render decides what to draw)", () => {
  // Two folders, one single-occurrence cross-folder import.
  const corpus: CorpusInput = {
    schemaVersion: 1,
    repo: "nf",
    sourceRevision: "x",
    generations: { code: 1, git: 1, docs: 1, memory: 1 },
    files: [
      {
        path: "a/x.ts",
        declCount: 1,
        decls: [{ id: "sym:a/x.ts#f", name: "f", kind: "function", order: 0 }],
        status: "active",
        recency: null,
      },
      {
        path: "b/y.ts",
        declCount: 1,
        decls: [{ id: "sym:b/y.ts#g", name: "g", kind: "function", order: 0 }],
        status: "active",
        recency: null,
      },
    ],
    edges: {
      calls: [],
      imports: [{ src: "file:a/x.ts", dst: "file:b/y.ts", count: 1, claimId: 1 }],
      touches: [],
    },
    event: {
      kind: "diff",
      label: "e",
      range: { from: "aaaaaaa", to: "bbbbbbb" },
      commitIds: [],
      anchorFiles: [],
      anchorSyms: [],
    },
    disclosures: [],
  };
  const model = compile(corpus);

  it("keeps a single-occurrence aggregated edge in the slice at folder zoom (no noise floor)", () => {
    const fit = fitViewport(model);
    const slice = computeSlice(model, fit, 0.2, DEFAULT_LOD); // folder LOD
    // The import file:a/x.ts -> file:b/y.ts aggregates to dir:a -> dir:b (count 1)
    // and is present in the slice; the renderer decides not to draw it at rest.
    const agg = slice.edges.filter((e) => e.count === 1);
    expect(agg.length).toBeGreaterThan(0);
    // There is no slice-level noise-floor omission anymore.
    expect(slice.omissions.some((o) => /de-emphasized at folder zoom/.test(o))).toBe(false);
  });

  it("no longer carries a belowFloor concept on any slice edge", () => {
    const fit = fitViewport(model);
    for (const zoom of [0.2, 1.5]) {
      const slice = computeSlice(model, fit, zoom, DEFAULT_LOD);
      expect(slice.edges.every((e) => !("belowFloor" in e))).toBe(true);
    }
  });
});
