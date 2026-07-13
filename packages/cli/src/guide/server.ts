/**
 * `ctx guide` — loopback-only node:http server (D1: local server = node:http in
 * packages/cli). Serves the built @contexa/guide SPA + GET /api/corpus, behind a
 * one-time-token → HttpOnly-cookie bootstrap (R12), with zero egress and a
 * server-until-Ctrl-C / idle-backstop lifecycle (R13). No route writes the store.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { assertNoEgress } from "@contexa/core";
import {
  assertLoopbackHost,
  formatGuideUrl,
  GuideAuth,
  isLoopbackRequestHost,
  sessionCookie,
} from "./auth.js";
import { assertGuideDist, readAsset, readIndex, resolveGuideDist } from "./assets.js";
import { DEFAULT_IDLE_MS, IdleBackstop } from "./idle.js";
import {
  defaultCorpusDeps,
  loadGuideCorpus,
  readGuideGeneration,
  type CorpusDeps,
  type GuideCorpusResult,
  type GuideGenerationInfo,
} from "./corpus.js";

/** Default memo window for the per-request generation re-read (D33). */
export const GENERATION_MEMO_MS = 2_000;

export interface StartGuideOptions {
  home?: string;
  projectDir?: string;
  fixture?: boolean;
  /** Idle backstop (ms of no authenticated request). Default 2 h. */
  idleMs?: number;
  /** Bind host — validated loopback-only. Default 127.0.0.1. */
  host?: string;
  /** Bind port. Default 0 (ephemeral). */
  port?: number;
  /** Guide dist dir. Default: resolve the installed @contexa/guide build. */
  distDir?: string;
  /** Test seam: a pre-loaded corpus (skips the store pipeline entirely). */
  corpus?: GuideCorpusResult;
  /** Test seam: corpus pipeline deps (fixture-isolation spy). */
  corpusDeps?: CorpusDeps;
  /** Test seam: fixed bootstrap token. */
  token?: string;
  /**
   * Current-generation provider for GET /api/generation (D33 data-state honesty):
   * re-read per request (memoized) instead of serving the startup snapshot. The
   * real server wires a cheap read-only store read; tests inject a stub. When
   * absent (fixture / injected corpus), the startup snapshot payload is served.
   */
  generationProvider?: () => GuideGenerationInfo;
  /** Memo window (ms) for the generation provider. Default GENERATION_MEMO_MS. */
  generationMemoMs?: number;
}

export interface GuideHandle {
  url: string;
  token: string;
  host: string;
  port: number;
  server: Server;
  stale: boolean;
  /** Resolves once the server has fully shut down. */
  closed: Promise<void>;
  close(): Promise<void>;
}

function send(
  res: ServerResponse,
  status: number,
  headers: Record<string, string>,
  body: Buffer | string,
  headOnly: boolean,
): void {
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  res.writeHead(status, { ...headers, "Content-Length": String(buf.length) });
  if (headOnly) res.end();
  else res.end(buf);
}

/**
 * Start the loopback guide server. Runs the R10 startup catch-up BEFORE it
 * begins serving. Resolves once bound; the returned handle prints its clean URL.
 */
export async function startGuide(opts: StartGuideOptions = {}): Promise<GuideHandle> {
  const host = opts.host ?? "127.0.0.1";
  assertLoopbackHost(host); // refuse a non-loopback bind (before we touch anything else)

  const distDir = opts.distDir ?? resolveGuideDist();
  assertGuideDist(distDir);

  // Startup catch-up + read-only projection happen BEFORE first serve (R10).
  const corpus =
    opts.corpus ??
    (await loadGuideCorpus(
      { home: opts.home, projectDir: opts.projectDir, fixture: opts.fixture },
      opts.corpusDeps ?? defaultCorpusDeps,
    ));

  const auth = new GuideAuth(opts.token);

  // Per-request current-generation re-read (D33): serve the CURRENT store state,
  // not the frozen startup snapshot. Memoized so a reload storm can't hammer the
  // store. Falls back to the startup payload when no provider is wired (fixture /
  // injected corpus) or when the read throws (store transiently unavailable).
  const corpusDeps = opts.corpusDeps ?? defaultCorpusDeps;
  const generationProvider: (() => GuideGenerationInfo) | undefined =
    opts.generationProvider ??
    (!opts.corpus && !opts.fixture
      ? () => readGuideGeneration({ home: opts.home, projectDir: opts.projectDir }, corpusDeps)
      : undefined);
  const generationMemoMs = opts.generationMemoMs ?? GENERATION_MEMO_MS;
  let genCache: { json: string; at: number } | null = null;
  const currentGenerationJson = (): string => {
    if (!generationProvider) return corpus.generationJson;
    const now = Date.now();
    if (genCache && now - genCache.at < generationMemoMs) return genCache.json;
    try {
      const json = JSON.stringify(generationProvider());
      genCache = { json, at: now };
      return json;
    } catch {
      // Store unavailable this instant: serve the startup snapshot, do not cache.
      return corpus.generationJson;
    }
  };

  let closeResolve!: () => void;
  const closed = new Promise<void>((r) => {
    closeResolve = r;
  });
  let closing = false;

  const idle = new IdleBackstop(opts.idleMs ?? DEFAULT_IDLE_MS, () => {
    void doClose();
  });

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    const headOnly = req.method === "HEAD";
    // Non-mutating surface: only GET/HEAD are accepted (G-readonly).
    if (req.method !== "GET" && !headOnly) {
      send(res, 405, { Allow: "GET, HEAD" }, "method not allowed", headOnly);
      return;
    }
    // DNS-rebinding guard: the Host header must be loopback too.
    if (!isLoopbackRequestHost(req.headers.host)) {
      send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "forbidden host", headOnly);
      return;
    }

    const url = new URL(req.url ?? "/", `http://${host}`);
    const hasCookie = auth.hasValidCookie(req.headers.cookie);

    if (!hasCookie) {
      // Bootstrap: redeem the one-time token, set the session cookie, and 302 to
      // the clean URL so the token leaves the address bar (R12).
      const session = auth.redeemToken(url.searchParams.get("t"));
      if (session !== null) {
        idle.touch();
        send(res, 302, { "Set-Cookie": sessionCookie(session), Location: "/" }, "", headOnly);
        return;
      }
      send(
        res,
        401,
        { "Content-Type": "text/plain; charset=utf-8", "WWW-Authenticate": "ctx-guide-token" },
        "unauthorized — open the one-time URL printed by `ctx guide`",
        headOnly,
      );
      return;
    }

    // Authenticated request.
    idle.touch();

    // A token still on an authenticated URL (reload of the bootstrap link) —
    // strip it with a clean redirect.
    if (url.searchParams.has("t")) {
      send(res, 302, { Location: url.pathname === "" ? "/" : url.pathname }, "", headOnly);
      return;
    }

    if (url.pathname === "/api/corpus") {
      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        corpus.json,
        headOnly,
      );
      return;
    }

    // Cheap generation metadata (D10/D33): identity + counts, never the full
    // corpus. Re-read per request (memoized) so a new generation is reported
    // truthfully instead of the frozen startup snapshot.
    if (url.pathname === "/api/generation") {
      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        currentGenerationJson(),
        headOnly,
      );
      return;
    }

    // Static asset, else the SPA shell (hash routes → one page, D13).
    const asset = readAsset(distDir, url.pathname);
    if (asset) {
      send(res, 200, { "Content-Type": asset.contentType }, asset.body, headOnly);
      return;
    }
    const index = readIndex(distDir);
    send(res, 200, { "Content-Type": index.contentType }, index.body, headOnly);
  };

  const server = createServer(handler);

  async function doClose(): Promise<void> {
    if (closing) return closed;
    closing = true;
    idle.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // Do not let keep-alive sockets hold the process open on Ctrl-C.
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    });
    closeResolve();
    return closed;
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  idle.start();

  const port = (server.address() as AddressInfo).port;
  return {
    url: formatGuideUrl(port, auth.token, host),
    token: auth.token,
    host,
    port,
    server,
    stale: corpus.stale,
    closed,
    close: doClose,
  };
}

// ---------------------------------------------------------------------------
// CLI entry (`ctx guide`). Signal wiring lives here (not in startGuide) so the
// server stays testable without touching process-global handlers.
// ---------------------------------------------------------------------------

export interface GuideIo {
  out(line: string): void;
  home?: string;
  projectDir?: string;
}

export interface RunGuideOptions {
  fixture?: boolean;
  idleMs?: number;
}

export async function runGuide(io: GuideIo, opts: RunGuideOptions = {}): Promise<number> {
  // Zero egress: refuse to run alongside a model API key (M14 guard).
  assertNoEgress();

  let handle: GuideHandle;
  try {
    handle = await startGuide({
      home: io.home,
      projectDir: io.projectDir,
      fixture: opts.fixture ?? false,
      ...(opts.idleMs !== undefined ? { idleMs: opts.idleMs } : {}),
    });
  } catch (err) {
    io.out(`ctx guide: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  io.out(`ctx guide serving on ${handle.url}`);
  io.out("  loopback-only · one-time token → HttpOnly cookie · zero egress");
  if (opts.fixture) io.out("  --fixture: self-contained demo corpus (the real store is untouched)");
  if (handle.stale) io.out("  note: index catch-up exceeded its budget — serving current data");
  io.out(`  Ctrl-C to stop · idle backstop ${Math.round(idleMs / 60000)} min`);

  const onSignal = (): void => {
    void handle.close();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    await handle.closed;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  io.out("ctx guide: stopped");
  return 0;
}
