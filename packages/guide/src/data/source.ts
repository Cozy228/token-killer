// Typed GuideDataSource seam (D1): LiveDataSource + SnapshotDataSource.
//
// The app first tries the in-process live endpoint (`/api/corpus`, same-origin,
// cookie-authenticated) served by `ctx guide` (packages/cli, slice 5b), and
// falls back to the static generated snapshot (`./generated/corpus.json`) when
// the endpoint is absent — which keeps the `vite preview` / `pnpm dev` spike
// flows working without a server. Kept deliberately thin.

import type { CorpusInput } from "../atlas/types.js";

export interface CorpusLoad {
  corpus: CorpusInput;
  /** Byte size of the transferred JSON (perf recorder input). */
  bytes: number;
  via: "live" | "snapshot";
}

export interface GuideDataSource {
  load(signal?: AbortSignal): Promise<CorpusLoad>;
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
  constructor(url = "/api/corpus") {
    this.#url = url;
  }
  load(signal?: AbortSignal): Promise<CorpusLoad> {
    return fetchCorpus(this.#url, "live", { credentials: "include" }, signal);
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
    } catch {
      return this.#fallback.load(signal);
    }
  }
}

/** Live first, snapshot fallback — the default the app boots with. */
export function defaultDataSource(): GuideDataSource {
  return new FallbackDataSource(new LiveDataSource(), new SnapshotDataSource());
}
