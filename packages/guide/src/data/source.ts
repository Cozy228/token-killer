// Typed GuideDataSource seam (D1): LiveDataSource + SnapshotDataSource.
//
// The app first tries the in-process live endpoint (`/api/corpus`, same-origin,
// cookie-authenticated) served by `ctx guide` (packages/cli, slice 5b), and
// falls back to the static generated snapshot (`./generated/corpus.json`) when
// the endpoint is absent — which keeps the `vite preview` / `pnpm dev` spike
// flows working without a server. Kept deliberately thin.

import type { CorpusInput, GenerationInfo } from "../atlas/types.js";
import { generationIdentity } from "../atlas/types.js";

export interface CorpusLoad {
  corpus: CorpusInput;
  /** Byte size of the transferred JSON (perf recorder input). */
  bytes: number;
  via: "live" | "snapshot";
  /**
   * When the live endpoint was tried and failed, the reason it fell back to the
   * static snapshot — surfaced so the top-bar badge can read "snapshot (live
   * unavailable)" instead of a silent downgrade (D33 data-state honesty).
   */
  error?: string;
}

export interface GuideDataSource {
  load(signal?: AbortSignal): Promise<CorpusLoad>;
  /**
   * Cheap generation-metadata poll (D10). Returns the CURRENTLY served
   * generation without the full corpus body so the reader can be offered a
   * switch prompt without swapping the map. Optional: a source that cannot poll
   * (a static snapshot bundled with the app) simply omits it.
   */
  pollGeneration?(signal?: AbortSignal): Promise<GenerationInfo>;
}

/** Cheap corpus counts (files, decls) — used for the switch-prompt diff line. */
export function corpusCounts(corpus: CorpusInput): { fileCount: number; declCount: number } {
  let declCount = 0;
  for (const f of corpus.files) declCount += f.declCount;
  return { fileCount: corpus.files.length, declCount };
}

/** Derive GenerationInfo from an already-loaded corpus (snapshot fallback). */
export function generationInfoOf(corpus: CorpusInput): GenerationInfo {
  const { fileCount, declCount } = corpusCounts(corpus);
  return {
    generations: corpus.generations,
    identity: generationIdentity(corpus.generations),
    fileCount,
    declCount,
  };
}

async function fetchCorpus(
  url: string,
  via: CorpusLoad["via"],
  init: RequestInit,
  signal?: AbortSignal,
): Promise<CorpusLoad> {
  const res = await fetch(url, { ...init, ...(signal ? { signal } : {}) });
  if (!res.ok) throw new Error(`${via} corpus fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  const corpus = JSON.parse(text) as CorpusInput;
  return { corpus, bytes: new Blob([text]).size, via };
}

/** In-process live endpoint, same-origin with the HttpOnly session cookie. */
export class LiveDataSource implements GuideDataSource {
  readonly #url: string;
  readonly #genUrl: string;
  constructor(url = "/api/corpus", genUrl = "/api/generation") {
    this.#url = url;
    this.#genUrl = genUrl;
  }
  load(signal?: AbortSignal): Promise<CorpusLoad> {
    return fetchCorpus(this.#url, "live", { credentials: "include" }, signal);
  }
  async pollGeneration(signal?: AbortSignal): Promise<GenerationInfo> {
    const res = await fetch(this.#genUrl, {
      credentials: "include",
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`generation poll failed: HTTP ${res.status}`);
    return (await res.json()) as GenerationInfo;
  }
}

/** Static generated snapshot bundled with the app (offline / preview flows). */
export class SnapshotDataSource implements GuideDataSource {
  readonly #url: string;
  constructor(url = "./generated/corpus.json") {
    this.#url = url;
  }
  load(signal?: AbortSignal): Promise<CorpusLoad> {
    return fetchCorpus(this.#url, "snapshot", {}, signal);
  }
}

/** Try `primary`; on any failure (endpoint absent, network) fall back. */
export class FallbackDataSource implements GuideDataSource {
  readonly #primary: GuideDataSource;
  readonly #fallback: GuideDataSource;
  constructor(primary: GuideDataSource, fallback: GuideDataSource) {
    this.#primary = primary;
    this.#fallback = fallback;
  }
  async load(signal?: AbortSignal): Promise<CorpusLoad> {
    try {
      return await this.#primary.load(signal);
    } catch (err) {
      // Live failed: fall back to the snapshot but DISCLOSE why (never silent).
      const reason = err instanceof Error ? err.message : String(err);
      const fallback = await this.#fallback.load(signal);
      return { ...fallback, error: reason };
    }
  }
  async pollGeneration(signal?: AbortSignal): Promise<GenerationInfo> {
    if (this.#primary.pollGeneration) return this.#primary.pollGeneration(signal);
    if (this.#fallback.pollGeneration) return this.#fallback.pollGeneration(signal);
    throw new Error("no pollable source");
  }
}

/** Live first, snapshot fallback — the default the app boots with. */
export function defaultDataSource(): GuideDataSource {
  return new FallbackDataSource(new LiveDataSource(), new SnapshotDataSource());
}
