import { describe, expect, it } from "vitest";
import { compile } from "../src/atlas/compile.js";
import {
  MONTH_MS,
  newestRecency,
  recencyBucket,
  recencyBuckets,
  recentFileSet,
} from "../src/atlas/lens.js";
import type { CorpusInput } from "../src/atlas/types.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const NOW = 1_700_000_000_000;

describe("Recent-lens recency bucket classification (D11)", () => {
  it("classifies null recency as 'never' (bucket 3)", () => {
    expect(recencyBucket(null, false, NOW)).toBe(3);
    expect(recencyBucket(undefined, true, NOW)).toBe(3);
  });

  it("classifies an in-window file as most-recent (bucket 0), overriding age", () => {
    // Even an OLD timestamp is bucket 0 when it is in the event window.
    expect(recencyBucket(NOW - 5 * MONTH_MS, true, NOW)).toBe(0);
  });

  it("classifies recent-but-not-in-window as 'this month' (bucket 1)", () => {
    expect(recencyBucket(NOW - 3 * 24 * 60 * 60 * 1000, false, NOW)).toBe(1);
  });

  it("classifies an older timestamp as 'older' (bucket 2)", () => {
    expect(recencyBucket(NOW - 4 * MONTH_MS, false, NOW)).toBe(2);
  });

  it("only ever returns 0..3", () => {
    for (const r of [null, NOW, NOW - MONTH_MS, NOW - 10 * MONTH_MS]) {
      for (const w of [true, false]) {
        const b = recencyBucket(r, w, NOW);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("recentFileSet resolves the event window (D11)", () => {
  const corpus = makeFixtureCorpus();
  it("includes anchor files and touch targets resolved to their file lot", () => {
    const set = recentFileSet(corpus);
    expect(set.has("file:src/app.ts")).toBe(true); // anchor file + touched
    expect(set.has("file:src/util/math.ts")).toBe(true); // sym touch -> file lot
  });
});

describe("recencyBuckets over a compiled model", () => {
  it("buckets file lots only — never folders or decls", () => {
    // A corpus with mixed recency + null so all four buckets are reachable.
    const corpus: CorpusInput = {
      ...makeFixtureCorpus(),
      files: [
        {
          path: "src/fresh.ts",
          declCount: 1,
          decls: [{ id: "sym:src/fresh.ts#a", name: "a", kind: "function", order: 0 }],
          status: "active",
          recency: NOW,
        },
        {
          path: "src/month.ts",
          declCount: 1,
          decls: [{ id: "sym:src/month.ts#b", name: "b", kind: "function", order: 0 }],
          status: "active",
          recency: NOW - 5 * 24 * 60 * 60 * 1000,
        },
        {
          path: "src/old.ts",
          declCount: 1,
          decls: [{ id: "sym:src/old.ts#c", name: "c", kind: "function", order: 0 }],
          status: "active",
          recency: NOW - 6 * MONTH_MS,
        },
        {
          path: "docs/never.md",
          declCount: 0,
          decls: [],
          status: "active",
          recency: null,
        },
      ],
      edges: { calls: [], imports: [], touches: [] },
      event: {
        kind: "diff",
        label: "e",
        range: { from: "aaaaaaa", to: "bbbbbbb" },
        commitIds: [],
        anchorFiles: ["file:src/fresh.ts"],
        anchorSyms: [],
      },
    };
    const model = compile(corpus);
    const buckets = recencyBuckets(model, corpus);

    // Only files present.
    for (const id of buckets.keys()) {
      expect(model.nodeIndex.get(id)?.kind).toBe("file");
    }
    expect(buckets.get("file:src/fresh.ts")).toBe(0); // in the event window
    expect(buckets.get("file:src/month.ts")).toBe(1);
    expect(buckets.get("file:src/old.ts")).toBe(2);
    expect(buckets.get("file:docs/never.md")).toBe(3);
    // Folders / decls are never in the map.
    expect(buckets.has("dir:src")).toBe(false);
    expect(buckets.has("sym:src/fresh.ts#a")).toBe(false);
  });

  it("reports the newest recency across the model", () => {
    const corpus = makeFixtureCorpus();
    const withDates: CorpusInput = {
      ...corpus,
      files: corpus.files.map((f, i) => ({ ...f, recency: i === 0 ? NOW : NOW - MONTH_MS })),
    };
    const model = compile(withDates);
    expect(newestRecency(model)).toBe(NOW);
  });
});
