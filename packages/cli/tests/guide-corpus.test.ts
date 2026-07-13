/**
 * Fixture-isolation (R10): `--fixture` serves a self-contained corpus and NEVER
 * opens or touches the real store. Proven by injecting store-opener spies that
 * throw if called, and by pointing CONTEXA_HOME at a nonexistent canary dir.
 */
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";
import { makeFixtureCorpus } from "@contexa/guide/fixture-corpus";
import { loadGuideCorpus, type CorpusDeps } from "../src/guide/corpus.ts";

function spyDeps(): {
  deps: CorpusDeps;
  openStore: ReturnType<typeof vi.fn>;
  openStoreReadOnly: ReturnType<typeof vi.fn>;
} {
  const openStore = vi.fn(() => {
    throw new Error("openStore must NOT be called in --fixture mode");
  });
  const openStoreReadOnly = vi.fn(() => {
    throw new Error("openStoreReadOnly must NOT be called in --fixture mode");
  });
  const extractCorpusReadOnly = vi.fn(() => {
    throw new Error("extractCorpusReadOnly must NOT be called in --fixture mode");
  });
  const deps: CorpusDeps = {
    openStore: openStore as unknown as CorpusDeps["openStore"],
    openStoreReadOnly: openStoreReadOnly as unknown as CorpusDeps["openStoreReadOnly"],
    createDefaultRegistry: vi.fn(() => {
      throw new Error("createDefaultRegistry must NOT be called in --fixture mode");
    }) as unknown as CorpusDeps["createDefaultRegistry"],
    RefreshEngine: vi.fn(() => {
      throw new Error("RefreshEngine must NOT be constructed in --fixture mode");
    }) as unknown as CorpusDeps["RefreshEngine"],
    extractCorpusReadOnly: extractCorpusReadOnly as unknown as CorpusDeps["extractCorpusReadOnly"],
    emptyCorpus: vi.fn(() => {
      throw new Error("emptyCorpus must NOT be called in --fixture mode");
    }) as unknown as CorpusDeps["emptyCorpus"],
    fixtureCorpus: makeFixtureCorpus,
    catchupBudgetMs: 1000,
  };
  return { deps, openStore, openStoreReadOnly };
}

describe("ctx guide --fixture isolation", () => {
  test("serves the fixture corpus without any store access", async () => {
    const { deps, openStore, openStoreReadOnly } = spyDeps();
    // A canary home that does not exist — any real store access would fail loudly.
    const canaryHome = join(tmpdir(), "ctx-guide-canary-does-not-exist");

    const result = await loadGuideCorpus({ fixture: true, home: canaryHome }, deps);

    expect(result.corpus.repo).toBe("fixture-repo");
    expect(result.corpus.files.length).toBeGreaterThan(0);
    expect(result.stale).toBe(false);
    expect(JSON.parse(result.json).repo).toBe("fixture-repo");

    // Zero reads / writes of the real store.
    expect(openStore).not.toHaveBeenCalled();
    expect(openStoreReadOnly).not.toHaveBeenCalled();
  });
});
