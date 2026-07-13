import { describe, expect, it } from "vitest";
import { nodeSelectionClassName } from "../src/ui/GraphRenderer.js";

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
