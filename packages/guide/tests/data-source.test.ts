// Slice 6a — data-state honesty (D33). The FallbackDataSource must SURFACE its
// outcome (via + an error when live failed), never downgrade to snapshot silently.

import { describe, expect, it } from "vitest";
import { FallbackDataSource, type CorpusLoad, type GuideDataSource } from "../src/data/source.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const corpus = makeFixtureCorpus();

function source(load: () => Promise<CorpusLoad>): GuideDataSource {
  return { load };
}

describe("FallbackDataSource data-state honesty (D33)", () => {
  it("reports via:'live' with no error when the live endpoint succeeds", async () => {
    const primary = source(async () => ({ corpus, bytes: 10, via: "live" }));
    const fallback = source(async () => ({ corpus, bytes: 10, via: "snapshot" }));
    const loaded = await new FallbackDataSource(primary, fallback).load();
    expect(loaded.via).toBe("live");
    expect(loaded.error).toBeUndefined();
  });

  it("falls back to the snapshot AND discloses why live failed", async () => {
    const primary = source(async () => {
      throw new Error("HTTP 503 from /api/corpus");
    });
    const fallback = source(async () => ({ corpus, bytes: 10, via: "snapshot" }));
    const loaded = await new FallbackDataSource(primary, fallback).load();
    expect(loaded.via).toBe("snapshot");
    expect(loaded.error).toMatch(/503/);
  });
});
