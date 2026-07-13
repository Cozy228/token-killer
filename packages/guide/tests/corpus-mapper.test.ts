// Slice 6a — SQL dedup at the mapper layer collects the FULL claim set for an
// aggregated src->dst pair (D33 aggregate trust), not just the first claim id.

import { describe, expect, it } from "vitest";
import { buildCorpus, type ExtractInput } from "../tools/corpus-mapper.js";

function baseInput(overrides: Partial<ExtractInput> = {}): ExtractInput {
  return {
    repo: "t",
    sourceRevision: "abc123",
    generations: { code: 1, git: 1, docs: 0, memory: 0 },
    files: [
      { id: "file:a.ts", locator: JSON.stringify({ path: "a.ts" }) },
      { id: "file:b.ts", locator: JSON.stringify({ path: "b.ts" }) },
    ],
    symbols: [
      {
        id: "sym:a.ts#f",
        name: "f",
        attrs: "{}",
        locator: JSON.stringify({ path: "a.ts", span: [0] }),
      },
      {
        id: "sym:b.ts#g",
        name: "g",
        attrs: "{}",
        locator: JSON.stringify({ path: "b.ts", span: [0] }),
      },
    ],
    contains: [
      { src: "file:a.ts", dst: "sym:a.ts#f", claim_id: 1 },
      { src: "file:b.ts", dst: "sym:b.ts#g", claim_id: 2 },
    ],
    calls: [],
    imports: [],
    commits: [],
    allTouches: [],
    eventCommitIds: [],
    eventRange: { from: "", to: "" },
    eventLabel: "e",
    openConflictEntityIds: [],
    needsReviewAnchorEntityIds: [],
    disclosures: [],
    ...overrides,
  };
}

describe("corpus mapper SQL dedup (D33)", () => {
  it("collects EVERY distinct claim id backing a deduped src->dst call", () => {
    // Three raw call links for the SAME pair, each with its own claim id.
    const corpus = buildCorpus(
      baseInput({
        calls: [
          { src: "sym:a.ts#f", dst: "sym:b.ts#g", claim_id: 100 },
          { src: "sym:a.ts#f", dst: "sym:b.ts#g", claim_id: 101 },
          { src: "sym:a.ts#f", dst: "sym:b.ts#g", claim_id: 102 },
        ],
      }),
    );
    expect(corpus.edges.calls.length).toBe(1);
    const e = corpus.edges.calls[0]!;
    expect(e.count).toBe(3);
    // Back-compat single id stays (first observed)…
    expect(e.claimId).toBe(100);
    // …and the honest set carries ALL distinct backing ids, ascending.
    expect(e.claimIds).toEqual([100, 101, 102]);
  });

  it("carries a single-element claim set for a lone edge", () => {
    const corpus = buildCorpus(
      baseInput({ imports: [{ src: "file:a.ts", dst: "file:b.ts", claim_id: 55 }] }),
    );
    const e = corpus.edges.imports[0]!;
    expect(e.claimIds).toEqual([55]);
  });
});
