/**
 * `ctx guide` loopback server (brief §2 Form B, R1/R6). Ephemeral, in-process,
 * READ-ONLY render surface over the same store the MCP serves:
 *   - binds 127.0.0.1 on a random free port (never 0.0.0.0);
 *   - a bearer token gates EVERY route incl. assets (loopback alone does not stop
 *     localhost probing / DNS rebinding — the Host header is allowlisted too);
 *   - core is called as in-process functions, never a per-request child process;
 *   - idle timeout + browser-disconnect beacon tear the server down ("on demand,
 *     not a standing destination" is mechanical);
 *   - `assertNoEgress` is armed at start; the served shell has ZERO external URLs.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { assertNoEgress, type Store } from "@contexa/core";
import { PROJECTION_ROUTES, type GuideContext } from "./routes.ts";
import { EMBEDDED_SHELL } from "./shell.ts";

export interface GuideServerOptions {
  store: Store;
  /** Injected clock (fixed-clock tests). Defaults to Date.now. */
  now?: () => number;
  /** Built Vite app dir (index.html + assets). Falls back to the embedded shell. */
  distDir?: string;
  /** Idle auto-shutdown in ms (no request within the window → close). Default 10 min. */
  idleMs?: number;
  /** Grace window (ms) after a disconnect beacon before teardown; any token-authorized
   *  request within it cancels the pending close (so an F5 reload / `?skin=` navigation
   *  survives). Default 4s. */
  graceMs?: number;
  /** Bind host — always loopback; overridable only for tests. Default 127.0.0.1. */
  host?: string;
  /** Env the egress guard inspects (default process.env). */
  env?: NodeJS.ProcessEnv;
}

export interface GuideServer {
  origin: string;
  /** Full entry URL incl. the one-time token query the browser opens. */
  url: string;
  port: number;
  token: string;
  /** Resolves when the server has fully closed (idle / disconnect / explicit). */
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

/** Cookie name carrying the bearer token for asset/API requests the browser makes. */
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
  const idleMs = opts.idleMs ?? 10 * 60_000;
  const graceMs = opts.graceMs ?? 4_000;
  const now = opts.now ?? Date.now;
  const token = randomBytes(24).toString("hex");
  const ctx: GuideContext = { store: opts.store, now };
  const routeMap = new Map(PROJECTION_ROUTES.map((r) => [r.path, r]));

  let closing = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((r) => (resolveClosed = r));

  const server: Server = createServer((req, res) => handle(req, res));

  let idleTimer: NodeJS.Timeout | undefined;
  function bumpIdle(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void doClose(), idleMs);
    idleTimer.unref?.();
  }

  // Deferred disconnect teardown: `pagehide` fires on EVERY navigation (F5 reload,
  // `?skin=` switch), not just a real tab close, so the beacon must not close
  // synchronously. It schedules a grace-window close that ANY subsequent
  // token-authorized request cancels — a reload reconnects and survives; a real
  // close (nothing reconnects) still tears down within the window.
  let pendingClose: NodeJS.Timeout | undefined;
  function scheduleClose(): void {
    if (pendingClose) clearTimeout(pendingClose);
    pendingClose = setTimeout(() => void doClose(), graceMs);
    pendingClose.unref?.();
  }
  function cancelPendingClose(): void {
    if (pendingClose) {
      clearTimeout(pendingClose);
      pendingClose = undefined;
    }
  }

  async function doClose(): Promise<void> {
    if (closing) return closed;
    closing = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (pendingClose) clearTimeout(pendingClose);
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

  function authorized(req: IncomingMessage, url: URL): boolean {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ") && tokenEq(auth.slice(7), token)) return true;
    const q = url.searchParams.get("token");
    if (q && tokenEq(q, token)) return true;
    const c = tokenFromCookie(req.headers.cookie);
    if (c && tokenEq(c, token)) return true;
    return false;
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

  function serveShell(res: ServerResponse, setCookieToken: string | undefined): void {
    let html = EMBEDDED_SHELL;
    if (opts.distDir) {
      try {
        html = readFileSync(join(opts.distDir, "index.html"), "utf8");
      } catch {
        html = EMBEDDED_SHELL;
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
    if (setCookieToken) {
      headers["set-cookie"] =
        `${COOKIE}=${encodeURIComponent(setCookieToken)}; HttpOnly; SameSite=Strict; Path=/`;
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
    bumpIdle();
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

    // DNS-rebinding defense: only loopback Host headers resolve.
    if (!hostAllowed(req)) {
      sendJson(res, 403, { error: "host not allowed" });
      return;
    }
    // Bearer token gates EVERY route, including the shell and assets (G-loopback).
    if (!authorized(req, url)) {
      sendJson(res, 401, { error: "unauthorized: bearer token required" });
      return;
    }

    const pathname = url.pathname;

    // Any token-authorized request cancels a pending disconnect teardown: a reload
    // or `?skin=` navigation reconnects within the grace window and survives. (The
    // beacon route re-arms it below, so repeated beacons just reschedule.)
    if (pathname !== "/api/close") cancelPendingClose();

    // Disconnect beacon — the page fires this on EVERY unload (incl. reload). Defer
    // teardown by the grace window instead of closing now; a reconnect cancels it.
    if (pathname === "/api/close") {
      res.writeHead(204).end();
      scheduleClose();
      return;
    }

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

    // SPA shell (root or client-route fallback). Set the cookie from the entry token.
    const entryToken = url.searchParams.get("token");
    serveShell(res, entryToken && tokenEq(entryToken, token) ? entryToken : undefined);
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
