import { describe, expect, it } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { project, resolveEvent } from "../src/atlas/event.js";
import type { RailGroup } from "../src/atlas/types.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const corpus = makeFixtureCorpus();
const model = compile(corpus);
const resolved = resolveEvent({}, corpus);
if (!resolved.ok) throw new Error("fixture event must resolve");
const projection = project(resolved.event, model);

describe("evidence rail mechanical order", () => {
  it("orders groups anchors -> contains -> calls -> imports", () => {
    const order: RailGroup[] = ["anchors", "contains", "calls", "imports"];
    const rank = new Map(order.map((g, i) => [g, i]));
    let last = -1;
    for (const step of projection.rail) {
      const r = rank.get(step.group)!;
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it("orders within a group by hop asc then path asc", () => {
    const groups = new Map<RailGroup, typeof projection.rail>();
    for (const step of projection.rail) {
      (groups.get(step.group) ?? groups.set(step.group, []).get(step.group)!).push(step);
    }
    for (const [, steps] of groups) {
      for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1];
        const cur = steps[i];
        const ok = prev.hop < cur.hop || (prev.hop === cur.hop && prev.path <= cur.path);
        expect(ok, `${prev.group} ${prev.path} before ${cur.path}`).toBe(true);
      }
    }
  });

  it("carries edge type and provenance on every step", () => {
    expect(projection.rail.length).toBeGreaterThan(0);
    for (const step of projection.rail) {
      expect(step.edgeKind).toBeTruthy();
      expect(step.provenance).toBeTruthy();
    }
  });

  it("has anchors at hop 0 and includes calls + imports evidence", () => {
    const anchors = projection.rail.filter((s) => s.group === "anchors");
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(a.hop).toBe(0);
    expect(projection.rail.some((s) => s.group === "calls")).toBe(true);
    expect(projection.rail.some((s) => s.group === "imports")).toBe(true);
  });
});
