/**
 * The layout contract (D34/D37/D41).
 *
 * These are FLOORS, and D41 says so in as many words: routed path arrays differing, label
 * anchors differing, rectangles not intersecting and the result reproducing deterministically
 * are NOT acceptance. The gate is the maintainer looking at a real screenshot. What these
 * tests do is make the specific defects that killed the reference implementation
 * unreachable — no more, and no less.
 *
 * They run against a graph shaped like the real scope graph (a dependent, a shared
 * dependency, and a CYCLE — `src` and `tests` really do call each other), because a layout
 * that only works on a DAG is a layout that does not work on this repository.
 */
import { describe, expect, test } from "vitest";
import { layoutGraph, type LayoutRequest } from "../src/canvas/layout/elk.ts";
import {
  MIN_ZOOM,
  READABLE_SCREEN_PX,
  SMALLEST_CANVAS_FONT_PX,
  screenPx,
} from "../src/canvas/layout/readability.ts";

/** Sizes are the MEASURED box in the app; here they stand in for measured boxes. */
const REQUEST: LayoutRequest = {
  nodes: [
    { id: "scope:packages/cli", width: 236, height: 132 },
    { id: "scope:packages/core", width: 252, height: 132 },
    { id: "scope:src", width: 214, height: 132 },
    { id: "scope:tests", width: 226, height: 132 },
    { id: "scope:(root)", width: 218, height: 132 },
  ],
  edges: [
    { id: "scope:packages/cli->scope:packages/core:calls", source: "scope:packages/cli", target: "scope:packages/core" },
    { id: "scope:src->scope:packages/core:calls", source: "scope:src", target: "scope:packages/core" },
    { id: "scope:src->scope:tests:calls", source: "scope:src", target: "scope:tests" },
    // The cycle. It is real: `tests` calls `src` and `src` calls `tests`.
    { id: "scope:tests->scope:src:calls", source: "scope:tests", target: "scope:src" },
    { id: "scope:packages/cli->scope:src:calls", source: "scope:packages/cli", target: "scope:src" },
  ],
  direction: "DOWN",
};

describe("ELK layered layout", () => {
  test("every edge is drawn from ELK's ROUTED SECTION — never centre to centre", async () => {
    const result = await layoutGraph(REQUEST);

    const centreOf = (id: string): { x: number; y: number } => {
      const node = result.nodes.find((n) => n.id === id)!;
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    };

    expect(result.edges.length).toBe(REQUEST.edges.length);

    for (const edge of result.edges) {
      // ELK routed it, and we kept what it returned. `routed === false` is the reference's
      // defect; it would mean we asked for orthogonal routing and then threw it away.
      expect(edge.routed).toBe(true);
      expect(edge.points.length).toBeGreaterThanOrEqual(2);

      const start = edge.points[0]!;
      const end = edge.points[edge.points.length - 1]!;
      const src = centreOf(edge.source);
      const dst = centreOf(edge.target);

      // The endpoints are PORTS ON THE BORDER, not the nodes' centres. A centre-to-centre
      // line would have both of these distances at 0.
      expect(distance(start, src)).toBeGreaterThan(1);
      expect(distance(end, dst)).toBeGreaterThan(1);
    }
  });

  test("ports fan out: two routes leaving one node leave from DIFFERENT points", async () => {
    const result = await layoutGraph(REQUEST);
    const fromCli = result.edges.filter((e) => e.source === "scope:packages/cli");
    expect(fromCli.length).toBe(2);

    const [a, b] = fromCli;
    const startA = a!.points[0]!;
    const startB = b!.points[0]!;
    // D37: edges fan out from the source as separate approaches, not as one merged trunk.
    expect(distance(startA, startB)).toBeGreaterThan(1);
  });

  test("dependency direction IS spatial direction — the dependent sits above", async () => {
    const result = await layoutGraph(REQUEST);
    const y = (id: string): number => result.nodes.find((n) => n.id === id)!.y;

    // `packages/cli` depends on `packages/core`, so cli is UPSTREAM: smaller y.
    expect(y("scope:packages/cli")).toBeLessThan(y("scope:packages/core"));
    // This is the E1 claim in one line: the fact lives in the position, not in a number.
    //
    // ...and it is NOT a universal claim. See the `direction` block below: on a cyclic graph
    // no placement can make it universal, which is why position may never be the only carrier.
  });

  // -------------------------------------------------------------------------
  // Direction is DRAWN, not implied (D34's cycle clause, D37's "direction always explicit").
  // -------------------------------------------------------------------------

  test("every routed section starts on its SOURCE and ends on its TARGET — cycle routes too", async () => {
    // THE INVARIANT THE ARROWHEAD RESTS ON. The renderer puts `markerEnd` at the last point of
    // ELK's polyline and calls that "the dependency". That is only true if ELK hands back a
    // section that runs from the declared source to the declared target — including for the
    // edges it had to REVERSE internally to layer the graph. It does (elkjs restores them),
    // and this test is what keeps that from being an assumption: if a future elkjs ever
    // returned a reversed section, every arrowhead on a cycle route would point at the
    // dependent, and this goes red instead of the map quietly lying.
    const result = await layoutGraph(REQUEST);
    const box = new Map(result.nodes.map((n) => [n.id, n]));

    const onBorder = (p: { x: number; y: number }, id: string): boolean => {
      const n = box.get(id)!;
      const e = 1.5;
      const inX = p.x >= n.x - e && p.x <= n.x + n.width + e;
      const inY = p.y >= n.y - e && p.y <= n.y + n.height + e;
      const onVertical = inY && (Math.abs(p.x - n.x) <= e || Math.abs(p.x - (n.x + n.width)) <= e);
      const onHorizontal =
        inX && (Math.abs(p.y - n.y) <= e || Math.abs(p.y - (n.y + n.height)) <= e);
      return onVertical || onHorizontal;
    };

    expect(result.edges.some((e) => e.backEdge)).toBe(true); // the fixture really is cyclic
    for (const edge of result.edges) {
      const start = edge.points[0]!;
      const end = edge.points[edge.points.length - 1]!;
      expect(onBorder(start, edge.source), `${edge.id} does not start on its source`).toBe(true);
      expect(onBorder(end, edge.target), `${edge.id} does not end on its target`).toBe(true);
    }
  });

  test("a cycle route is FLAGGED: its target sits above its source, so 'above' means the reverse", async () => {
    const result = await layoutGraph(REQUEST);
    const y = (id: string): number => result.nodes.find((n) => n.id === id)!.y;

    // `backEdge` is read off the layout — never guessed, never a hardcoded id list. It is
    // exactly the set of edges the engine had to run against its own axis.
    for (const edge of result.edges) {
      expect(edge.backEdge, `${edge.id}`).toBe(y(edge.target) < y(edge.source));
    }

    const back = result.edges.filter((e) => e.backEdge);
    expect(back.length).toBeGreaterThan(0);

    // And the point of the whole round, stated as an assertion: for a back edge the spatial
    // convention says the OPPOSITE of the truth. `src -> tests` and `tests -> src` are both
    // real, so no vertical order can be right for both — which is why the axis strip may not
    // print "above = depends on" as a universal, and why the arrowhead has to carry it.
    for (const edge of back) {
      expect(y(edge.target)).toBeLessThan(y(edge.source));
    }
  });

  test("the cycle is reported as ONE block, so no false ordering is fabricated for it (D34)", async () => {
    const result = await layoutGraph(REQUEST);

    expect(result.cycles.length).toBe(1);
    const block = result.cycles[0]!;
    // `src` and `tests` call each other; both are in the one block, and every back edge lies
    // inside it. The block is the set of scopes whose top-to-bottom stacking means nothing.
    expect(block).toContain("scope:src");
    expect(block).toContain("scope:tests");
    for (const edge of result.edges.filter((e) => e.backEdge)) {
      expect(block).toContain(edge.source);
      expect(block).toContain(edge.target);
    }
  });

  test("an ACYCLIC graph has no back edges and no cycles — the universal rule is then true", async () => {
    // The other half of the honesty rule: the map only claims "a card above another one
    // depends on it" without exception when there IS no exception. Drop the one edge that
    // closes the cycle and both disclosures go silent.
    const acyclic: LayoutRequest = {
      ...REQUEST,
      edges: REQUEST.edges.filter((e) => e.source !== "scope:tests"),
    };
    const result = await layoutGraph(acyclic);

    expect(result.edges.some((e) => e.backEdge)).toBe(false);
    expect(result.cycles).toEqual([]);
  });

  test("no two node rectangles intersect (a floor, never a gate — D41)", async () => {
    const result = await layoutGraph(REQUEST);
    for (const a of result.nodes) {
      for (const b of result.nodes) {
        if (a.id >= b.id) continue;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  test("deterministic: input array order never changes the result (D34)", async () => {
    const shuffled: LayoutRequest = {
      ...REQUEST,
      nodes: [...REQUEST.nodes].reverse(),
      edges: [...REQUEST.edges].reverse(),
    };
    const a = await layoutGraph(REQUEST);
    const b = await layoutGraph(shuffled);

    expect(b.nodes).toEqual(a.nodes);
    expect(b.edges.map((e) => ({ id: e.id, points: e.points }))).toEqual(
      a.edges.map((e) => ({ id: e.id, points: e.points })),
    );
  });

  test("the box ELK lays out is the box it was given — no fixed-size substitution", async () => {
    const result = await layoutGraph(REQUEST);
    for (const input of REQUEST.nodes) {
      const output = result.nodes.find((n) => n.id === input.id)!;
      expect(output.width).toBe(input.width);
      expect(output.height).toBe(input.height);
    }
  });

  test("an unmeasured node is DROPPED and disclosed, never laid out at a guessed size", async () => {
    const result = await layoutGraph({
      nodes: [...REQUEST.nodes, { id: "scope:unmeasured", width: 0, height: 0 }],
      edges: REQUEST.edges,
    });
    expect(result.nodes.some((n) => n.id === "scope:unmeasured")).toBe(false);
    expect(result.issues.some((i) => i.category === "elk-missing-dimensions")).toBe(true);
  });
});

describe("readability floor", () => {
  test("minZoom is the arithmetic solution of the screen-px floor, not a taste setting", () => {
    // The floor is computed in SCREEN px — font size x zoom — never in world units.
    expect(screenPx(SMALLEST_CANVAS_FONT_PX, MIN_ZOOM)).toBeGreaterThanOrEqual(
      READABLE_SCREEN_PX,
    );
    // And one notch below the floor really is below it — the constant is tight, not padded.
    expect(screenPx(SMALLEST_CANVAS_FONT_PX, MIN_ZOOM - 0.02)).toBeLessThan(READABLE_SCREEN_PX);
  });
});

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
