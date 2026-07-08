import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  SourceRegistry,
  type Budget,
  type DirtyReport,
  type IngestResult,
  type SourceAdapter,
  type SourceId,
} from "../../src/ingest/adapter.ts";
import { CATCHUP_GATE_MS, RefreshEngine } from "../../src/ingest/refresh.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

/** Fake adapter driven by a manual virtual clock (deterministic, §10). */
function fakeAdapter(opts: {
  id: SourceId;
  cost: number;
  dirty: boolean;
  magnitude?: number;
  ingestTicks?: number; // virtual ms consumed by ingest
  clock: { t: number };
  log: string[];
  failIngest?: boolean;
  failDirty?: boolean;
  completes?: boolean;
}): SourceAdapter {
  return {
    id: opts.id,
    cost: opts.cost,
    async dirtyCheck(): Promise<DirtyReport> {
      if (opts.failDirty) throw new Error(`dirtyCheck exploded: ${opts.id}`);
      return {
        source: opts.id,
        dirty: opts.dirty,
        magnitude: opts.magnitude ?? (opts.dirty ? 1 : 0),
      };
    },
    async ingest(_store: Store, _dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
      opts.log.push(opts.id);
      if (opts.failIngest) throw new Error(`ingest exploded: ${opts.id}`);
      void budget; // real adapters honor budget.deadline cooperatively
      opts.clock.t += opts.ingestTicks ?? 1;
      return { source: opts.id, complete: opts.completes ?? true, entities: 1, claims: 1 };
    },
  };
}

describe("refresh orchestration (§4)", () => {
  let root: string;
  let store: Store;
  let clock: { t: number };
  let log: string[];

  beforeEach(() => {
    root = makeTempDir("ctx-refresh-");
    clock = { t: 0 };
    log = [];
    store = openStore({ projectDir: root, home: join(root, "contexa-home"), now: () => clock.t });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  const engine = (registry: SourceRegistry, opts: { catchupGateMs?: number } = {}) =>
    new RefreshEngine(store, registry, {
      now: () => clock.t,
      holder: "test-engine",
      catchupGateMs: opts.catchupGateMs ?? 10_000,
    });

  test("all clean → fresh, no ingest, no lease traffic", async () => {
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: false, clock, log }));
    reg.register(fakeAdapter({ id: "memory", cost: 0, dirty: false, clock, log }));
    const report = await engine(reg).refresh(100);
    expect(report.status).toBe("fresh");
    expect(report.sources.map((s) => s.state)).toEqual(["clean", "clean"]);
    expect(log).toEqual([]);
    expect(store.currentLease()).toBeUndefined();
  });

  test("dirty sources ingest cheapest-first (cost, then magnitude)", async () => {
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "docs", cost: 2, dirty: true, magnitude: 1, clock, log }));
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: true, magnitude: 9, clock, log }));
    reg.register(fakeAdapter({ id: "memory", cost: 1, dirty: true, magnitude: 2, clock, log }));
    const report = await engine(reg).refresh(1_000);
    expect(log).toEqual(["memory", "git", "docs"]); // cost 1/mag 2 < cost 1/mag 9 < cost 2
    expect(report.status).toBe("fresh");
    expect(report.sources.every((s) => s.state === "complete" || s.state === "clean")).toBe(true);
  });

  test("budget exhausted → later sources deferred + RECONCILING; background finishes them", async () => {
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: true, ingestTicks: 60, clock, log }));
    reg.register(fakeAdapter({ id: "docs", cost: 2, dirty: true, ingestTicks: 60, clock, log }));
    const eng = engine(reg, { catchupGateMs: 50 }); // first call gate: 50 virtual ms
    const report = await eng.refresh(9_999);
    expect(report.status).toBe("reconciling");
    const byId = Object.fromEntries(report.sources.map((s) => [s.source, s.state]));
    expect(byId.git).toBe("complete"); // ran first, finished at t=60 (checked before deadline)
    expect(byId.docs).toBe("deferred"); // deadline hit before it started
    expect(report.pendingSources).toEqual(["docs"]);
    await eng.background; // §4.1: remainder finishes in process-lifetime background
    expect(log).toEqual(["git", "docs"]);
    expect(store.currentLease()).toBeUndefined(); // background released its lease
  });

  test("second call uses the caller budget, not the catch-up gate", async () => {
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: true, ingestTicks: 10, clock, log }));
    const eng = engine(reg, { catchupGateMs: 5 });
    await eng.refresh(1); // first call: gate 5 → git ingests (starts before deadline)
    const second = await eng.refresh(1_000); // now the 1000ms budget applies
    expect(second.sources[0]?.state).toBe("complete");
  });

  test("ingest error → source frozen at previous generation, disclosed", async () => {
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: true, failIngest: true, clock, log }));
    const report = await engine(reg).refresh(1_000);
    expect(report.status).toBe("reconciling");
    expect(report.frozenSources).toEqual(["git"]);
    expect(report.sources[0]).toMatchObject({
      state: "error",
      error: expect.stringContaining("exploded"),
    });
    expect(store.currentLease()).toBeUndefined(); // lease released on failure too
  });

  test("dirtyCheck error → frozen; other sources unaffected", async () => {
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: true, failDirty: true, clock, log }));
    reg.register(fakeAdapter({ id: "docs", cost: 1, dirty: true, clock, log }));
    const report = await engine(reg).refresh(1_000);
    expect(report.frozenSources).toEqual(["git"]);
    expect(report.sources.find((s) => s.source === "docs")?.state).toBe("complete");
  });

  test("lease held by another writer → sources skipped, serve published (§4.5)", async () => {
    store.acquireLease("other-process", 30_000);
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: true, clock, log }));
    const report = await engine(reg).refresh(1_000);
    expect(report.status).toBe("reconciling");
    expect(report.sources[0]?.state).toBe("skipped");
    expect(log).toEqual([]); // never ingested
    expect(store.currentLease()?.holder).toBe("other-process"); // untouched
  });

  test("partial ingest (budget mid-source) is re-run by the background", async () => {
    const reg = new SourceRegistry();
    reg.register(
      fakeAdapter({
        id: "git",
        cost: 1,
        dirty: true,
        ingestTicks: 100,
        completes: false,
        clock,
        log,
      }),
    );
    const eng = engine(reg, { catchupGateMs: 50 });
    const report = await eng.refresh(9_999);
    expect(report.sources[0]?.state).toBe("partial");
    expect(report.pendingSources).toEqual(["git"]);
    await eng.background;
    expect(log).toEqual(["git", "git"]); // resumed in background
  });

  test("registry refuses duplicate adapters; CATCHUP gate constant is 3s", () => {
    const reg = new SourceRegistry();
    reg.register(fakeAdapter({ id: "git", cost: 1, dirty: false, clock, log }));
    expect(() =>
      reg.register(fakeAdapter({ id: "git", cost: 1, dirty: false, clock, log })),
    ).toThrow(/already registered/);
    expect(CATCHUP_GATE_MS).toBe(3000);
  });
});
