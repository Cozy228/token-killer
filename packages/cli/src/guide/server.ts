/**
 * The `ctx guide` loopback server (D1: `node:http`, no framework).
 *
 * G-loopback, in full — these are structural properties, not settings:
 *
 *  • it binds 127.0.0.1 and ONLY 127.0.0.1, on a random free port;
 *  • it mints a bearer token per run and prints it inside the URL;
 *  • that token is exchanged at `/auth` for an `HttpOnly` cookie, and from then on the
 *    cookie is the credential — the SPA never holds the token, so it cannot leak it;
 *  • NO route resolves without one of the two: not `/api/*`, not the SPA, not a single
 *    static asset. There is no unauthenticated surface to find;
 *  • it checks the `Host` header, so a page on another origin cannot reach it by
 *    resolving a hostname to 127.0.0.1;
 *  • it runs in the foreground until Ctrl-C. No daemon, no background, no state left.
 *
 * NON-MUTATING BY CONSTRUCTION: the store is opened READ-ONLY (`openStoreReadOnly`). The
 * server does not choose not to write — it holds a handle that cannot.
 *
 * THE STORE IS RE-OPENED PER REQUEST. Every worktree of a repo shares one store, so a
 * sibling `ctx sync` can supersede this checkout's generation while this server sits
 * running. A handle (or a status) captured at startup would go on cheerfully reporting a
 * world that no longer exists. Re-reading is a few milliseconds; the expensive part — the
 * atlas — is cached under the generation it was built from, and a generation change
 * therefore invalidates it automatically.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, normalize, resolve, sep } from "node:path";
import {
  buildAtlas,
  isServable,
  openStoreReadOnly,
  projectConnections,
  projectEvent,
  projectOverview,
  projectScope,
  resolveGeneration,
  type AtlasModel,
  type BoundedProjection,
  type GenerationView,
  type RelationKind,
  type Store,
} from "@contexa/core";
import { resolveAppDir } from "./assets.ts";

export const HOST = "127.0.0.1";
const COOKIE_NAME = "ctx_guide";

/**
 * Zero egress, stated to the browser as well as honoured by the build: every asset is
 * bundled and served from disk, so `'self'` is the whole world. `style-src` allows inline
 * because Vite injects the stylesheet's critical rules that way.
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; " +
  "object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** What the top bar renders. `/api/generation` recomputes it on EVERY call. */
export interface GuideStatus {
  repo: { name: string; root: string };
  generation: GenerationView;
}

export interface GuideServerOptions {
  projectDir?: string;
  home?: string;
  /** Test seam. Defaults to the resolved SPA bundle (`assets.ts`). */
  appDir?: string;
  /** 0 (default) asks the OS for a free port. */
  port?: number;
}

export interface GuideServer {
  /** The bootstrap URL — the token's ONE appearance. Printing this is the auth handshake. */
  url: string;
  origin: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function startGuideServer(opts: GuideServerOptions = {}): Promise<GuideServer> {
  const token = randomBytes(32).toString("base64url");
  const appDir = opts.appDir ?? resolveAppDir();
  const cache = new AtlasCache();

  const server = createServer((req, res) => {
    try {
      handle(req, res, { ...opts, token, appDir, cache });
    } catch (error: unknown) {
      sendJson(res, 500, { error: "internal", message: String(error) });
    }
  });

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(opts.port ?? 0, HOST, () => {
      server.removeListener("error", fail);
      ok();
    });
  });

  const port = (server.address() as AddressInfo).port;
  const origin = `http://${HOST}:${port}`;
  return {
    url: `${origin}/auth?t=${token}`,
    origin,
    port,
    token,
    close: () => closeServer(server),
  };
}

interface Context extends GuideServerOptions {
  token: string;
  appDir: string | undefined;
  cache: AtlasCache;
}

function handle(req: IncomingMessage, res: ServerResponse, ctx: Context): void {
  const port = (req.socket.address() as AddressInfo).port;

  // A page on another origin cannot talk to us just because its hostname resolves to
  // 127.0.0.1: the Host header has to name the loopback address we actually bound.
  if (!hostAllowed(req.headers.host, port)) {
    sendJson(res, 403, { error: "forbidden", message: "ctx guide serves 127.0.0.1 only" });
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${port}`);

  // The ONLY route that accepts the token in the URL, and the only one that answers
  // without a cookie. It hands back the cookie and sends the browser to the app.
  if (url.pathname === "/auth") {
    const supplied = url.searchParams.get("t") ?? "";
    if (!tokenMatches(supplied, ctx.token)) {
      sendJson(res, 401, { error: "unauthorized", message: UNAUTHORIZED });
      return;
    }
    res.writeHead(302, {
      // HttpOnly: script on the page can never read it, so an XSS in a dependency cannot
      // walk off with a credential. SameSite=Strict: another site cannot ride it.
      "set-cookie": `${COOKIE_NAME}=${ctx.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
      location: "/",
      "content-security-policy": CSP,
    });
    res.end();
    return;
  }

  // Everything else — API, SPA, every static asset — needs the credential.
  if (!authenticated(req, ctx.token)) {
    sendJson(res, 401, { error: "unauthorized", message: UNAUTHORIZED });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    serveApi(url, res, ctx);
    return;
  }
  serveStatic(url.pathname, res, ctx.appDir);
}

const UNAUTHORIZED =
  "ctx guide serves only the one-time link it printed in your terminal. Open that link " +
  "(it sets a session cookie for this run), or start the server again with `ctx guide`.";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function authenticated(req: IncomingMessage, token: string): boolean {
  const cookie = cookieOf(req.headers.cookie, COOKIE_NAME);
  if (cookie !== undefined && tokenMatches(cookie, token)) return true;
  // A bearer header is the same credential by another door — it exists so a script (the
  // test suite, a curl) can reach the API without a cookie jar. It is NOT a second secret.
  const auth = req.headers.authorization ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  return bearer !== "" && tokenMatches(bearer, token);
}

function cookieOf(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Constant-time compare — a length-agnostic guard, so no oracle in either dimension. */
function tokenMatches(supplied: string, token: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hostAllowed(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return (
    host === `${HOST}:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`
  );
}

// ---------------------------------------------------------------------------
// API — K1's projection DTOs
// ---------------------------------------------------------------------------

function serveApi(url: URL, res: ServerResponse, ctx: Context): void {
  let store: Store;
  try {
    store = openStoreReadOnly({
      ...(ctx.projectDir !== undefined ? { projectDir: ctx.projectDir } : {}),
      ...(ctx.home !== undefined ? { home: ctx.home } : {}),
    });
  } catch {
    // No store file at all. There is no generation to resolve because nothing was ever
    // built — and the honest screen for that is the empty one, naming the exact command.
    if (url.pathname === "/api/generation") {
      sendJson(res, 200, noStoreStatus(ctx.projectDir ?? process.cwd()));
      return;
    }
    sendJson(res, 409, {
      error: "not-servable",
      message: NO_STORE_REASON,
      status: noStoreStatus(ctx.projectDir ?? process.cwd()),
    });
    return;
  }

  try {
    const generation = resolveGeneration(store);
    const status: GuideStatus = { repo: repoOf(store), generation };

    if (url.pathname === "/api/generation") {
      sendJson(res, 200, status);
      return;
    }

    // THE GATE. A generation that is not servable never becomes a projection — the
    // refusal is structural, so "quietly fall back to the mismatched rows" is not a
    // behaviour anyone can reach from here. The client gets the reason and renders it.
    if (!isServable(generation)) {
      sendJson(res, 409, {
        error: "not-servable",
        message: generation.reason,
        status,
      });
      return;
    }

    const atlas = ctx.cache.get(store, generation);
    const projection = project(url, atlas, store);
    if (!projection) {
      sendJson(res, 404, { error: "no-route", message: `no API route ${url.pathname}` });
      return;
    }
    sendJson(res, 200, projection);
  } finally {
    store.close();
  }
}

function project(url: URL, atlas: AtlasModel, store: Store): BoundedProjection | undefined {
  const list = (name: string): string[] =>
    (url.searchParams.get(name) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");

  switch (url.pathname) {
    case "/api/overview":
      return projectOverview(atlas, store);
    case "/api/scope":
      return projectScope(atlas, store, url.searchParams.get("path") ?? "", {
        expand: list("expand"),
      });
    case "/api/connections": {
      const kinds = list("kinds") as RelationKind[];
      return projectConnections(atlas, store, url.searchParams.get("id") ?? "", {
        ...(kinds.length > 0 ? { kinds } : {}),
      });
    }
    case "/api/event":
      return projectEvent(atlas, store, {
        commits: list("commits"),
        anchors: list("anchors"),
      });
    default:
      return undefined;
  }
}

function repoOf(store: Store): { name: string; root: string } {
  return { name: basename(store.projectRoot), root: store.projectRoot };
}

const NO_STORE_REASON =
  "no context store exists for this repository yet — run `ctx sync`";

function noStoreStatus(root: string): GuideStatus {
  return {
    repo: { name: basename(root), root },
    generation: {
      state: "empty",
      currentIdentity: "",
      repoRev: "",
      sources: [],
      reason: NO_STORE_REASON,
    },
  };
}

/**
 * The atlas is expensive and the generation is cheap. Cache the first under the second:
 * the key carries the checkout's identity AND each source's published generation, so a
 * `ctx sync` — which moves a published generation — invalidates it without anyone having
 * to remember to.
 */
class AtlasCache {
  #key = "";
  #atlas: AtlasModel | undefined;

  get(store: Store, generation: GenerationView): AtlasModel {
    const key = [
      generation.state,
      generation.currentIdentity,
      ...generation.sources.map((s) => `${s.source}:${s.publishedGen}`),
    ].join("|");
    if (this.#atlas && this.#key === key) return this.#atlas;
    const atlas = buildAtlas(store);
    this.#key = key;
    this.#atlas = atlas;
    return atlas;
  }
}

// ---------------------------------------------------------------------------
// Static (the SPA bundle)
// ---------------------------------------------------------------------------

function serveStatic(pathname: string, res: ServerResponse, appDir: string | undefined): void {
  if (appDir === undefined) {
    sendJson(res, 503, {
      error: "no-app",
      message: "the guide UI is not built — run `pnpm --filter @contexa/guide build`",
    });
    return;
  }

  // Hash router: every in-app route lives after the `#`, which never reaches us. So the
  // only document is index.html and everything else is a real file — no SPA fallback,
  // and therefore no path that quietly answers 200 for something that does not exist.
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = resolve(appDir, normalize(rel));
  if (target !== resolve(appDir) && !target.startsWith(resolve(appDir) + sep)) {
    sendJson(res, 403, { error: "forbidden", message: "path outside the app bundle" });
    return;
  }

  let body: Buffer;
  try {
    if (!statSync(target).isFile()) throw new Error("not a file");
    body = readFileSync(target);
  } catch {
    sendJson(res, 404, { error: "not-found", message: `no such asset ${pathname}` });
    return;
  }

  const dot = target.lastIndexOf(".");
  const type = CONTENT_TYPES[target.slice(dot)] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": body.byteLength,
    "content-security-policy": CSP,
    // The store can move under a running server; nothing here may be cached.
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "content-security-policy": CSP,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(text);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((ok) => {
    server.closeAllConnections();
    server.close(() => ok());
  });
}
