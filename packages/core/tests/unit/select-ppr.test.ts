import { describe, expect, test } from "vitest";
import { personalizedPageRank, type PprEdge } from "../../src/select/ppr.ts";
import { PPR_ALPHA, PPR_ITERATIONS } from "../../src/select/constants.ts";

// §10: PPR convergence / dangling-mass properties (CTX-IMPL §6.3).

const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);

describe("select/ppr", () => {
  // A→D, B→D, C→D, A→B: D is the most-referenced node.
  const nodes = ["A", "B", "C", "D"];
  const edges: PprEdge[] = [
    { src: "A", dst: "D", weight: 1 },
    { src: "B", dst: "D", weight: 1 },
    { src: "C", dst: "D", weight: 1 },
    { src: "A", dst: "B", weight: 1 },
  ];

  test("pinned constants: α=0.25, 25 iterations", () => {
    expect(PPR_ALPHA).toBe(0.25);
    expect(PPR_ITERATIONS).toBe(25);
  });

  test("mass is conserved (Σ = 1) — dangling nodes keep their mass", () => {
    // The adjacency is undirected here (§6.3), so build a truly dangling node
    // via an isolated one: E has no edges at all.
    const r = personalizedPageRank([...nodes, "E"], edges);
    expect(sum(r)).toBeCloseTo(1, 9);
    // isolated node E: keeps its uniform share exactly (teleport + kept walk mass)
    expect(r.get("E")!).toBeCloseTo(1 / 5, 9);
  });

  test("most-connected node ranks highest under uniform teleport", () => {
    const r = personalizedPageRank(nodes, edges);
    const top = [...r.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(top).toBe("D");
  });

  test("teleport = normalized seeds lifts the seeded node vs uniform", () => {
    const base = personalizedPageRank(nodes, edges);
    const seeded = personalizedPageRank(nodes, edges, { seeds: new Map([["A", 100]]) });
    expect(seeded.get("A")!).toBeGreaterThan(base.get("A")!);
    expect(sum(seeded)).toBeCloseTo(1, 9);
  });

  test("uniform fallback when no seed landed in the subgraph", () => {
    const withMissingSeed = personalizedPageRank(nodes, edges, {
      seeds: new Map([["ZZZ", 100]]), // not in the node set
    });
    const uniform = personalizedPageRank(nodes, edges);
    for (const id of nodes) {
      expect(withMissingSeed.get(id)!).toBeCloseTo(uniform.get(id)!, 12);
    }
  });

  test("deterministic: same input twice → identical scores", () => {
    const a = personalizedPageRank(nodes, edges, { seeds: new Map([["B", 3]]) });
    const b = personalizedPageRank(nodes, edges, { seeds: new Map([["B", 3]]) });
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  test("25 iterations is effectively converged (vs 100 iterations)", () => {
    const at25 = personalizedPageRank(nodes, edges, { iterations: 25 });
    const at100 = personalizedPageRank(nodes, edges, { iterations: 100 });
    for (const id of nodes) {
      expect(Math.abs(at25.get(id)! - at100.get(id)!)).toBeLessThan(1e-3);
    }
  });

  test("empty graph returns an empty map; non-positive weights ignored", () => {
    expect(personalizedPageRank([], []).size).toBe(0);
    const r = personalizedPageRank(["A", "B"], [{ src: "A", dst: "B", weight: 0 }]);
    expect(sum(r)).toBeCloseTo(1, 9);
    expect(r.get("A")!).toBeCloseTo(0.5, 9); // both isolated
  });
});
