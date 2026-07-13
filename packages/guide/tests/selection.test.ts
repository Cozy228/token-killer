import { describe, expect, it } from "vitest";
import { fileRecencyClassName, nodeSelectionClassName } from "../src/ui/GraphRenderer.js";
import type { AtlasNode } from "../src/atlas/types.js";

describe("nodeSelectionClassName (R4-1)", () => {
  const neighbors = new Set(["b", "c"]);

  it("returns no class when nothing is selected", () => {
    expect(nodeSelectionClassName("a", null, neighbors)).toBe("");
  });

  it("marks the selected node, its neighbors, and fades the rest", () => {
    expect(nodeSelectionClassName("a", "a", neighbors)).toBe("node-selected");
    expect(nodeSelectionClassName("b", "a", neighbors)).toBe("node-neighbor");
    expect(nodeSelectionClassName("z", "a", neighbors)).toBe("node-faded");
  });
});

describe("fileRecencyClassName (Recent lens, D11)", () => {
  const file = (id: string): AtlasNode => ({
    id,
    kind: "file",
    name: "x",
    path: "x",
    parent: "dir:src",
    depth: 2,
    rect: { x: 0, y: 0, w: 2, h: 2 },
    footprint: 2,
    status: "active",
    overflow: 0,
  });
  const folder: AtlasNode = { ...file("dir:src"), kind: "folder" };

  it("stamps the bucket class onto a file lot", () => {
    const buckets = new Map([
      ["file:a", 0],
      ["file:b", 3],
    ]);
    expect(fileRecencyClassName(file("file:a"), buckets)).toBe("recency-0");
    expect(fileRecencyClassName(file("file:b"), buckets)).toBe("recency-3");
  });

  it("never stamps on folders/decls or on un-bucketed / missing input", () => {
    const buckets = new Map([["dir:src", 0]]);
    expect(fileRecencyClassName(folder, buckets)).toBe("");
    expect(fileRecencyClassName(file("file:unknown"), buckets)).toBe("");
    expect(fileRecencyClassName(file("file:a"), undefined)).toBe("");
  });
});
