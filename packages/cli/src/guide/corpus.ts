/**
 * `ctx guide` data pipeline (R10 — data-first).
 *
 * Non-`--fixture`:
 *   1. Startup phase (writable, isolated): open the real store via @contexa/core
 *      and run ONE budgeted RefreshEngine catch-up — the ONE sanctioned ingest
 *      trigger. If the budget is exceeded (reconciling) we serve the current
 *      published generation and disclose staleness; the remainder finishes in the
 *      background over the process lifetime.
 *   2. Serve phase (READ-ONLY): re-open the store read-only via @contexa/core and
 *      project it to a CorpusInput with the SHARED guide mapper (never forked).
 *   An empty/missing store yields an `empty` corpus (files: []) so the frontend
 *      names `ctx sync` (the empty flag is wired through the payload).
 *
 * `--fixture`: serve a self-contained fixture corpus and NEVER open or touch the
 *   real store (the store openers are not called at all — proven by test).
 *
 * No route ever writes the store: the serve phase opens read-only; the catch-up
 * writes through core's own published path (isolated startup phase). All deps are
 * injectable so tests can prove fixture isolation with a store-open spy.
 */

import { basename } from "node:path";
import { createDefaultRegistry, openStore, openStoreReadOnly, RefreshEngine } from "@contexa/core";
import { emptyCorpus, extractCorpusReadOnly } from "@contexa/guide/corpus-source";
import { makeFixtureCorpus } from "@contexa/guide/fixture-corpus";
import type { CorpusInput } from "@contexa/guide/corpus-source";

/** Startup catch-up budget: bounded so a cold repo never hangs first serve. */
export const GUIDE_CATCHUP_BUDGET_MS = 30_000;

const STALE_DISCLOSURE =
  `index catch-up exceeded the ${GUIDE_CATCHUP_BUDGET_MS} ms startup budget; ` +
  "serving the current published generation (reconciling in the background — reload after `ctx sync`)";

export interface GuideCorpusOptions {
  home?: string;
  projectDir?: string;
  fixture?: boolean;
}

/** Injectable seam — real implementations by default; tests pass spies. */
export interface CorpusDeps {
  openStore: typeof openStore;
  openStoreReadOnly: typeof openStoreReadOnly;
  createDefaultRegistry: typeof createDefaultRegistry;
  RefreshEngine: typeof RefreshEngine;
  extractCorpusReadOnly: typeof extractCorpusReadOnly;
  emptyCorpus: typeof emptyCorpus;
  fixtureCorpus: () => CorpusInput;
  catchupBudgetMs: number;
}

export const defaultCorpusDeps: CorpusDeps = {
  openStore,
  openStoreReadOnly,
  createDefaultRegistry,
  RefreshEngine,
  extractCorpusReadOnly,
  emptyCorpus,
  fixtureCorpus: makeFixtureCorpus,
  catchupBudgetMs: GUIDE_CATCHUP_BUDGET_MS,
};

/**
 * Cheap generation metadata (D10) served at GET /api/generation WITHOUT the full
 * corpus body, so the reader can be told a new generation exists without swapping
 * the map. Field names mirror @contexa/guide's `GenerationInfo`.
 */
export interface GuideGenerationInfo {
  generations: CorpusInput["generations"];
  identity: string;
  fileCount: number;
  declCount: number;
}

export interface GuideCorpusResult {
  corpus: CorpusInput;
  json: string;
  stale: boolean;
  /** Pre-serialized generation payload for GET /api/generation. */
  generationJson: string;
}

/** Deterministic identity string for a generation tuple (matches the frontend). */
export function generationIdentity(g: CorpusInput["generations"]): string {
  return `${g.code}.${g.git}.${g.docs}.${g.memory}`;
}

/** Build the cheap generation payload from a loaded corpus. */
export function buildGenerationInfo(corpus: CorpusInput): GuideGenerationInfo {
  let declCount = 0;
  for (const f of corpus.files) declCount += f.declCount;
  return {
    generations: corpus.generations,
    identity: generationIdentity(corpus.generations),
    fileCount: corpus.files.length,
    declCount,
  };
}

/**
 * Read the CURRENT published generation cheaply through the read-only store path
 * (D33 data-state honesty): published_gen per source + entity counts, WITHOUT a
 * full corpus projection. Never writes. Throws if no store is on disk (caller
 * falls back to the startup snapshot).
 */
export function readGuideGeneration(
  opts: GuideCorpusOptions,
  deps: CorpusDeps = defaultCorpusDeps,
): GuideGenerationInfo {
  const ro = deps.openStoreReadOnly({ projectDir: opts.projectDir, home: opts.home });
  try {
    const generations = {
      code: ro.publishedGen("code"),
      git: ro.publishedGen("git"),
      docs: ro.publishedGen("docs"),
      memory: ro.publishedGen("memory"),
    };
    return {
      generations,
      identity: generationIdentity(generations),
      fileCount: ro.countByKind("file"),
      declCount: ro.countByKind("symbol"),
    };
  } finally {
    ro.close();
  }
}

/**
 * Startup phase: budgeted RefreshEngine catch-up (writable, isolated). Returns
 * whether the payload should disclose staleness (budget exceeded / reconciling).
 */
async function runCatchup(opts: GuideCorpusOptions, deps: CorpusDeps): Promise<boolean> {
  const store = deps.openStore({ projectDir: opts.projectDir, home: opts.home });
  const engine = new deps.RefreshEngine(store, deps.createDefaultRegistry(), {
    catchupGateMs: deps.catchupBudgetMs,
  });
  let closed = false;
  try {
    const report = await engine.refresh(deps.catchupBudgetMs);
    if (report.status === "fresh") {
      await engine.background; // finish any budget-deferred remainder, then close
      store.close();
      closed = true;
      return false;
    }
    // Reconciling: do not block first serve. Let the background remainder finish
    // over the process lifetime and close the writable store when it settles.
    void engine.background.catch(() => {}).finally(() => store.close());
    closed = true;
    return true;
  } finally {
    if (!closed) store.close();
  }
}

/** Serve phase: read-only projection to a CorpusInput (never writes). */
function loadRealCorpus(opts: GuideCorpusOptions, deps: CorpusDeps, stale: boolean): CorpusInput {
  const extra = stale ? [STALE_DISCLOSURE] : [];
  const fallbackRepo = basename(opts.projectDir ?? process.cwd()) || "repo";
  let ro;
  try {
    ro = deps.openStoreReadOnly({ projectDir: opts.projectDir, home: opts.home });
  } catch {
    // No store on disk — empty state (names `ctx sync`).
    return deps.emptyCorpus(fallbackRepo, extra);
  }
  const dbPath = ro.dbPath;
  const repo = basename(ro.projectRoot) || fallbackRepo;
  const fileCount = ro.countByKind("file");
  ro.close();
  if (fileCount === 0) return deps.emptyCorpus(repo, extra);
  return deps.extractCorpusReadOnly(dbPath, { repo, extraDisclosures: extra });
}

/** Build the CorpusInput served at GET /api/corpus. */
export async function loadGuideCorpus(
  opts: GuideCorpusOptions,
  deps: CorpusDeps = defaultCorpusDeps,
): Promise<GuideCorpusResult> {
  if (opts.fixture) {
    // NEVER touches the real store: no opener is called on this path.
    const corpus = deps.fixtureCorpus();
    return {
      corpus,
      json: JSON.stringify(corpus),
      stale: false,
      generationJson: JSON.stringify(buildGenerationInfo(corpus)),
    };
  }
  const stale = await runCatchup(opts, deps);
  const corpus = loadRealCorpus(opts, deps, stale);
  return {
    corpus,
    json: JSON.stringify(corpus),
    stale,
    generationJson: JSON.stringify(buildGenerationInfo(corpus)),
  };
}
