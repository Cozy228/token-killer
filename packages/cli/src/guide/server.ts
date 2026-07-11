/**
 * `ctx guide` loopback server (brief §2 Form B, P40 R12/R13). In-process,
 * READ-ONLY render surface over the same store the MCP serves:
 *   - binds 127.0.0.1 on a random free port (never 0.0.0.0);
 *   - a bearer token gates EVERY route incl. assets (loopback alone does not stop
 *     localhost probing / DNS rebinding — the Host header is allowlisted too);
 *   - R12 auth UX: the printed URL carries the token ONCE as a bootstrap; the first
 *     authorized shell hit sets an HttpOnly/SameSite=Strict session cookie, and the
 *     app strips the token from the address bar. F5, deep links, and new tabs in the
 *     same browser ride the cookie — no token in the URL thereafter;
 *   - R13 lifecycle: NO disconnect/pagehide beacon teardown. The server lives until
 *     the owner closes it (Ctrl-C → graceful `close()`), with a long idle backstop
 *     (default 2 h, `idleMs` override) reset by any authorized request. Closing the
 *     tab never kills the session;
 *   - core is called as in-process functions, never a per-request child process;
 *   - `assertNoEgress` is armed at start; the served shell has ZERO external URLs.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { assertNoEgress, type Store } from "@contexa/core";
import { PROJECTION_ROUTES, type GuideContext } from "./routes.ts";
import { FALLBACK_SHELL } from "./shell.ts";

/** Default idle backstop (R13): a generous 2 h. Not an aggressive teardown — it
 *  only fires after two hours with no authorized request. `.unref()`'d so it never
 *  keeps the process alive on its own (davia lesson). */
export const DEFAULT_IDLE_MS = 2 * 60 * 60_000;

export interface GuideServerOptions {
  store: Store;
  /** Injected clock (fixed-clock tests). Defaults to Date.now. */
  now?: () => number;
  /** Built Vite app dir (index.html + assets). Falls back to the minimal shell. */
  distDir?: string;
  /** Idle backstop in ms (no authorized request within the window → close). Default 2 h. */
  idleMs?: number;
  /** Bind host — always loopback; overridable only for tests. Default 127.0.0.1. */
  host?: string;
  /** Env the egress guard inspects (default process.env). */
  env?: NodeJS.ProcessEnv;
}

export interface GuideServer {
  origin: string;
  /** Bootstrap entry URL: `origin/?token=…` — the token is carried ONCE, then the
   *  app strips it and the cookie takes over (R12). */
  url: string;
  port: number;
  token: string;
  /** Resolves when the server has fully closed (Ctrl-C / idle backstop / explicit). */
  closed: Promise<void>;
  close(): Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Cookie name carrying the bearer token for the requests the browser makes. */
const COOKIE = "ctx_guide_token";

function tokenFromCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Constant-time-ish token compare (lengths differ rarely; avoids early return leak). */
function tokenEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function startGuideServer(opts: GuideServerOptions): Promise<GuideServer> {
  // Hard refusal if an egress-capable model key is present (M14) — never a serve.
  assertNoEgress(opts.env ?? process.env);

  const host = opts.host ?? "127.0.0.1";
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const now = opts.now ?? Date.now;
  const token = randomBytes(24).toString("hex");
  const ctx: GuideContext = { store: opts.store, now };
  const routeMap = new Map(PROJECTION_ROUTES.map((r) => [r.path, r]));

  let closing = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((r) => (resolveClosed = r));

  const server: Server = createServer((req, res) => handle(req, res));

  // R13 idle backstop: reset on every authorized request; `.unref()`'d so it never
  // keeps the process alive by itself. No beacon, no grace-window, no /api/close.
  let idleTimer: NodeJS.Timeout | undefined;
  function bumpIdle(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void doClose(), idleMs);
    idleTimer.unref?.();
  }

  async function doClose(): Promise<void> {
    if (closing) return closed;
    closing = true;
    if (idleTimer) clearTimeout(idleTimer);
    await new Promise<void>((r) => server.close(() => r()));
    resolveClosed();
    return closed;
  }

  function hostAllowed(req: IncomingMessage): boolean {
    const h = req.headers.host;
    if (!h) return false;
    const name = h.replace(/:\d+$/, "");
    return LOOPBACK_HOSTS.has(name);
  }

  /** Which carrier authorized this request (for the R12 cookie-set decision). */
  function authCarrier(req: IncomingMessage, url: URL): "header" | "query" | "cookie" | undefined {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ") && tokenEq(auth.slice(7), token)) return "header";
    const q = url.searchParams.get("token");
    if (q && tokenEq(q, token)) return "query";
    const c = tokenFromCookie(req.headers.cookie);
    if (c && tokenEq(c, token)) return "cookie";
    return undefined;
  }

  function sendJson(res: ServerResponse, code: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(code, {
      "content-type": "application/json; charset=utf-8",
      // Defense-in-depth: the guide is same-origin only; deny framing + sniffing.
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    });
    res.end(text);
  }

  function serveShell(res: ServerResponse, setCookie: boolean): void {
    let html = FALLBACK_SHELL;
    if (opts.distDir) {
      try {
        html = readFileSync(join(opts.distDir, "index.html"), "utf8");
      } catch {
        html = FALLBACK_SHELL;
      }
    }
    const headers: Record<string, string> = {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      // No external origins may load anything; also blocks any accidental CDN URL.
      "content-security-policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    };
    // R12: swap the one-time bootstrap token for a session cookie. Set it whenever the
    // browser presents a valid token but no valid cookie yet — the app then strips
    // `?token=` from the address bar and every later request rides this cookie.
    if (setCookie) {
      headers["set-cookie"] =
        `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`;
    }
    res.writeHead(200, headers);
    res.end(html);
  }

  function serveStatic(res: ServerResponse, pathname: string): boolean {
    if (!opts.distDir) return false;
    // Path traversal guard: normalize + confine to distDir.
    const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const full = join(opts.distDir, rel);
    if (!full.startsWith(opts.distDir + sep)) return false;
    try {
      if (!statSync(full).isFile()) return false;
    } catch {
      return false;
    }
    const type = CONTENT_TYPES[extname(full)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff" });
    res.end(readFileSync(full));
    return true;
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

    // DNS-rebinding defense: only loopback Host headers resolve.
    if (!hostAllowed(req)) {
      sendJson(res, 403, { error: "host not allowed" });
      return;
    }
    // Bearer token gates EVERY route, including the shell and assets (G-loopback).
    const carrier = authCarrier(req, url);
    if (carrier === undefined) {
      sendJson(res, 401, { error: "unauthorized: bearer token required" });
      return;
    }
    // R13: any authorized request resets the idle backstop.
    bumpIdle();

    const pathname = url.pathname;

    // Projection API (read-only; only GET/HEAD).
    const route = routeMap.get(pathname);
    if (route) {
      if (method !== "GET" && method !== "HEAD") {
        sendJson(res, 405, { error: "method not allowed (guide is read-only)" });
        return;
      }
      const payload = route.build(ctx, url.searchParams);
      if (payload === undefined) {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      sendJson(res, 200, payload);
      return;
    }

    // Gated annex (P37): Impact-Set ships only WITH Artifact 2 — placeholder banner,
    // non-default, reachable but not built.
    if (pathname === "/impact-set") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset=utf-8><title>Impact-Set</title>" +
          "<p>Impact-Set is gated: V1 to V2 requires Artifact 2 (P37). Not built in M3.</p>",
      );
      return;
    }

    // Any non-GET on an unknown path: read-only surface rejects it.
    if (method !== "GET" && method !== "HEAD") {
      sendJson(res, 405, { error: "method not allowed (guide is read-only)" });
      return;
    }

    // Static assets from the built app.
    if (pathname !== "/" && serveStatic(res, pathname)) return;

    // SPA shell (root or client-route fallback). R12: set the cookie when the token
    // arrived by header/query and no valid cookie is present yet (the bootstrap).
    serveShell(res, carrier !== "cookie");
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });
  bumpIdle();

  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const origin = `http://${host}:${port}`;
  return {
    origin,
    url: `${origin}/?token=${token}`,
    port,
    token,
    closed,
    close: doClose,
  };
}
