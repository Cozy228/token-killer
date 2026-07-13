import { describe, expect, it } from "vitest";
import { compile, footprintFor } from "../src/atlas/compile.js";
import type { AtlasModel, AtlasNode, Rect } from "../src/atlas/types.js";
import { makeFixtureCorpus, shuffledFixtureCorpus } from "./fixtures/corpus.js";

function serialize(model: AtlasModel): string {
  const nodes = [...model.nodes].sort((a, b) => (a.id < b.id ? -1 : 1));
  const regions = [...model.regions].sort((a, b) => (a.id < b.id ? -1 : 1));
  return JSON.stringify({ projectionId: model.projectionId, nodes, regions, edges: model.edges });
}

function interiorOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contains(parent: Rect, child: Rect): boolean {
  return (
    child.x >= parent.x &&
    child.y >= parent.y &&
    child.x + child.w <= parent.x + parent.w &&
    child.y + child.h <= parent.y + parent.h
  );
}

/** True when a and b are separated by >= 1 unit on at least one axis. */
function separatedByOne(a: Rect, b: Rect): boolean {
  return (
    a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y
  );
}

function childrenByParent(model: AtlasModel): Map<string, AtlasNode[]> {
  const map = new Map<string, AtlasNode[]>();
  for (const n of model.nodes) {
    if (n.parent === null) continue;
    (map.get(n.parent) ?? map.set(n.parent, []).get(n.parent)!).push(n);
  }
  return map;
}

describe("compile determinism", () => {
  it("is byte-identical on repeated compiles of the same input", () => {
    expect(serialize(compile(makeFixtureCorpus()))).toBe(serialize(compile(makeFixtureCorpus())));
  });

  it("is byte-identical for shuffled input arrays", () => {
    const a = compile(makeFixtureCorpus());
    const b = compile(shuffledFixtureCorpus(42));
    expect(b.projectionId).toBe(a.projectionId);
    expect(serialize(b)).toBe(serialize(a));
  });
});

describe("footprint buckets", () => {
  it("maps declCount to bucket side length", () => {
    expect(footprintFor(0)).toBe(1);
    expect(footprintFor(4)).toBe(2);
    expect(footprintFor(9)).toBe(3);
    expect(footprintFor(16)).toBe(4);
    expect(footprintFor(25)).toBe(5);
    expect(footprintFor(40)).toBe(6);
  });
});

describe("packing invariants", () => {
  const model = compile(makeFixtureCorpus());

  it("keeps every child fully inside its parent", () => {
    for (const n of model.nodes) {
      if (n.parent === null) continue;
      const parent = model.nodeIndex.get(n.parent)!;
      expect(contains(parent.rect, n.rect), `${n.id} inside ${parent.id}`).toBe(true);
    }
  });

  it("has no interior overlap between siblings", () => {
    for (const [, siblings] of childrenByParent(model)) {
      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          expect(
            interiorOverlap(siblings[i].rect, siblings[j].rect),
            `${siblings[i].id} vs ${siblings[j].id}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps >=1 gutter between file/folder siblings", () => {
    for (const [, siblings] of childrenByParent(model)) {
      const lots = siblings.filter((s) => s.kind !== "decl");
      for (let i = 0; i < lots.length; i++) {
        for (let j = i + 1; j < lots.length; j++) {
          expect(separatedByOne(lots[i].rect, lots[j].rect), `${lots[i].id} | ${lots[j].id}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("packs decls inside their file lot", () => {
    for (const n of model.nodes) {
      if (n.kind !== "decl") continue;
      const file = model.nodeIndex.get(n.parent!)!;
      expect(contains(file.rect, n.rect)).toBe(true);
    }
  });

  it("emits EVERY declaration as a node (D33 kernel completeness — no truncation)", () => {
    // The old MAX_DECLS_SHOWN=34 cap silently deleted decls beyond a lot's grid.
    // Now every declaration is a logical node and there is no overflow.
    const big = model.nodeIndex.get("file:src/big.ts")!;
    expect(big.overflow).toBe(0);
    const declNodes = model.nodes.filter((n) => n.parent === big.id && n.kind === "decl");
    expect(declNodes.length).toBe(40); // all 40 fixture decls present
    // The lot grew to hold them all, so decls still pack inside it (geometry valid).
    for (const d of declNodes) expect(contains(big.rect, d.rect)).toBe(true);
  });
});

describe("parent-local repack stability", () => {
  it("does not change unrelated folders' internal relative layout when a file is added", () => {
    const base = compile(makeFixtureCorpus());
    const withNew = makeFixtureCorpus();
    withNew.files.push({
      path: "docs/new.md",
      declCount: 0,
      decls: [],
      status: "active",
      recency: null,
    });
    const changed = compile(withNew);

    for (const folderId of ["dir:src", "dir:src/util"]) {
      expect(relativeLayout(base, folderId)).toEqual(relativeLayout(changed, folderId));
    }
  });
});

function relativeLayout(model: AtlasModel, folderId: string): Record<string, Rect> {
  const folder = model.nodeIndex.get(folderId)!;
  const ox = folder.rect.x;
  const oy = folder.rect.y;
  const out: Record<string, Rect> = {};
  const collect = (id: string) => {
    for (const n of model.nodes) {
      if (n.parent === id) {
        out[n.id] = { x: n.rect.x - ox, y: n.rect.y - oy, w: n.rect.w, h: n.rect.h };
        collect(n.id);
      }
    }
  };
  collect(folderId);
  return out;
}
