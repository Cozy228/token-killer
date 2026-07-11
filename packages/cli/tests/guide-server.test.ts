/**
 * `ctx guide` loopback server + export — P40 gates (brief §6 + P40):
 * G-loopback (127.0.0.1 + bearer token on EVERY route), G-egress (no external
 * URLs + egress guard armed), G-auth-ux (R12 cookie bootstrap), G-lifecycle
 * (R13: no beacon teardown; idle backstop reset by any request; graceful close),
 * G-readonly (route sweep + attempted write path), and C12 export-diff
 * (live ≡ export, one-render-path). Deterministic fixture store, fixed clock.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  buildCanvasProjection,
  buildFixtureStore,
  openStore,
  FIXTURE_NOW,
  type Store,
} from "@contexa/core";
import { startGuideServer, type GuideServer } from "../src/guide/server.ts";
import { runGuide } from "../src/guide/command.ts";
import { FALLBACK_SHELL } from "../src/guide/shell.ts";
import { exportGuide } from "../src/guide/export.ts";
import { PROJECTION_PATHS } from "../src/guide/routes.ts";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

interface Res {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Minimal HTTP GET/POST with optional bearer + explicit Host header. */
function http(
  origin: string,
  path: string,
  opts: { token?: string; method?: string; host?: string; cookie?: string } = {},
): Promise<Res> {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.host) headers.host = opts.host;
    if (opts.cookie) headers.cookie = opts.cookie;
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: opts.method ?? "GET",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function makeStore(root: string): Store {
  const project = join(root, "proj");
  mkdirSync(project, { recursive: true });
  const store = openStore({
    projectDir: project,
    home: join(root, "home"),
    now: () => FIXTURE_NOW,
  });
  buildFixtureStore(store);
  return store;
}

describe("ctx guide server — G-loopback / G-egress / G-readonly", () => {
  let root: string;
  let store: Store;
  let server: GuideServer;

  beforeAll(async () => {
    root = makeTempDir("ctx-guide-srv-");
    store = makeStore(root);
    server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 60_000 });
  });

  afterAll(async () => {
    await server.close();
    store.close();
    cleanup(root);
  });

  test("binds loopback (127.0.0.1) only", () => {
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test("G-loopback: EVERY route 401s without the bearer token", async () => {
    for (const path of ["/", "/api/canvas", "/api/inspector", "/assets/app.js", "/anything"]) {
      const res = await http(server.origin, path);
      expect(res.status, `no-token ${path}`).toBe(401);
    }
  });

  test("G-loopback: token via header / query / cookie all resolve", async () => {
    expect((await http(server.origin, "/api/canvas", { token: server.token })).status).toBe(200);
    expect((await http(server.origin, `/api/canvas?token=${server.token}`)).status).toBe(200);
    expect(
      (await http(server.origin, "/api/canvas", { cookie: `ctx_guide_token=${server.token}` }))
        .status,
    ).toBe(200);
  });

  test("G-loopback: non-loopback Host header is rejected (DNS-rebinding defense)", async () => {
    const res = await http(server.origin, "/api/canvas", {
      token: server.token,
      host: "evil.example.com",
    });
    expect(res.status).toBe(403);
  });

  test("serves canvas projection from in-process core", async () => {
    const res = await http(server.origin, "/api/canvas", { token: server.token });
    const canvas = JSON.parse(res.body);
    expect(canvas.kind).toBe("canvas");
    expect(canvas.sources.map((s: { source: string }) => s.source).sort()).toEqual([
      "code",
      "docs",
      "git",
      "memory",
    ]);
  });

  test("G-readonly: projection paths accept GET; a write method → 405; store unchanged", async () => {
    const before = store.entityCount();
    for (const path of PROJECTION_PATHS) {
      // GET works (canvas/inspector/lenses); search/subject need params but still GET-shaped.
      const get = await http(server.origin, path, { token: server.token });
      expect([200, 404], `GET ${path}`).toContain(get.status);
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const res = await http(server.origin, path, { token: server.token, method });
        expect(res.status, `${method} ${path}`).toBe(405);
      }
    }
    expect(store.entityCount(), "no route mutated the store").toBe(before);
  });

  test("G-egress: embedded shell + export html contain no external URLs", () => {
    const external = /https?:\/\/(?!127\.0\.0\.1|localhost)/i;
    const cdnish = /(cdn|googleapis|gstatic|unpkg|jsdelivr|fonts\.google|telemetry|analytics)/i;
    expect(FALLBACK_SHELL).not.toMatch(external);
    expect(FALLBACK_SHELL).not.toMatch(cdnish);
    // R13: the fallback shell carries NO pagehide/beacon teardown.
    expect(FALLBACK_SHELL).not.toMatch(/sendBeacon|pagehide|\/api\/close/);
    const exportRoot = makeTempDir("ctx-guide-exp-html-");
    try {
      exportGuide(store, exportRoot, () => FIXTURE_NOW);
      const html = readFileSync(join(exportRoot, "index.html"), "utf8");
      expect(html).not.toMatch(external);
      expect(html).not.toMatch(cdnish);
    } finally {
      cleanup(exportRoot);
    }
  });

  test("G-egress: served responses carry a strict CSP + no external URLs", async () => {
    const res = await http(server.origin, `/?token=${server.token}`);
    expect(res.status).toBe(200);
    expect(String(res.headers["content-security-policy"])).toContain("default-src 'self'");
    expect(res.body).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)/i);
  });
});

describe("ctx guide server — G-egress guard (refuses model key)", () => {
  test("startGuideServer throws when an egress-capable key is present", async () => {
    const root = makeTempDir("ctx-guide-egress-");
    const store = makeStore(root);
    try {
      await expect(
        startGuideServer({ store, env: { ...process.env, ANTHROPIC_API_KEY: "sk-test" } }),
      ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      store.close();
      cleanup(root);
    }
  });
});

describe("ctx guide server — G-lifecycle (R13: no beacon; idle backstop; graceful)", () => {
  test("idle backstop fires when the server sits idle", async () => {
    const root = makeTempDir("ctx-guide-idle-");
    const store = makeStore(root);
    const server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 120 });
    await server.closed; // resolves once the idle backstop elapses with no request
    store.close();
    cleanup(root);
    expect(true).toBe(true);
  });

  test("any authorized request resets the idle backstop (session survives activity)", async () => {
    const root = makeTempDir("ctx-guide-idle-reset-");
    const store = makeStore(root);
    const server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 200 });
    let closed = false;
    void server.closed.then(() => (closed = true));
    // Keep the session alive by requesting within the backstop window three times.
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 120));
      expect((await http(server.origin, "/api/canvas", { token: server.token })).status).toBe(200);
    }
    expect(closed, "requests within the window kept the backstop from firing").toBe(false);
    await server.close();
    store.close();
    cleanup(root);
  });

  test("no beacon teardown: closing the tab (POST /api/close) does NOT kill the session", async () => {
    const root = makeTempDir("ctx-guide-nobeacon-");
    const store = makeStore(root);
    const server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 60_000 });
    let closed = false;
    void server.closed.then(() => (closed = true));
    // The v2 beacon route is gone: a POST to /api/close is just an unknown write → 405.
    const res = await http(server.origin, "/api/close", { token: server.token, method: "POST" });
    expect(res.status).toBe(405);
    await new Promise((r) => setTimeout(r, 200));
    expect(closed, "no teardown was scheduled").toBe(false);
    expect((await http(server.origin, "/api/canvas", { token: server.token })).status).toBe(200);
    await server.close();
    store.close();
    cleanup(root);
  });

  test("close() resolves the closed promise (graceful Ctrl-C path)", async () => {
    const root = makeTempDir("ctx-guide-close-");
    const store = makeStore(root);
    const server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 60_000 });
    await server.close();
    await server.closed; // already resolved — must not hang
    store.close();
    cleanup(root);
    expect(true).toBe(true);
  });
});

describe("ctx guide server — G-auth-ux (R12 cookie bootstrap)", () => {
  let root: string;
  let store: Store;
  let server: GuideServer;
  beforeAll(async () => {
    root = makeTempDir("ctx-guide-authux-");
    store = makeStore(root);
    server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 60_000 });
  });
  afterAll(async () => {
    await server.close();
    store.close();
    cleanup(root);
  });

  test("the bootstrap shell hit sets the HttpOnly/SameSite cookie", async () => {
    const shell = await http(server.origin, `/?token=${server.token}`);
    expect(shell.status).toBe(200);
    const setCookie = String(shell.headers["set-cookie"] ?? "");
    expect(setCookie).toContain(`ctx_guide_token=${server.token}`);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
  });

  test("after bootstrap, a cookie-only request (no token in URL) is authorized — F5/new-tab", async () => {
    // F5 / deep link / new tab: the browser resends the cookie, the URL has no token.
    const cookie = `ctx_guide_token=${server.token}`;
    expect((await http(server.origin, "/", { cookie })).status).toBe(200);
    expect(
      (await http(server.origin, "/api/subject?ref=anything", { cookie })).status,
    ).toBeLessThan(500);
    expect((await http(server.origin, "/api/canvas", { cookie })).status).toBe(200);
  });

  test("a tokenless, cookieless request 401s (every route stays gated)", async () => {
    expect((await http(server.origin, "/")).status).toBe(401);
    expect((await http(server.origin, "/api/canvas")).status).toBe(401);
  });

  test("a cookie-authorized shell response does NOT reset the cookie (bootstrap only)", async () => {
    const cookie = `ctx_guide_token=${server.token}`;
    const shell = await http(server.origin, "/", { cookie });
    expect(shell.status).toBe(200);
    expect(shell.headers["set-cookie"]).toBeUndefined();
  });
});

describe("ctx guide — G-fixture-isolation (R10: --fixture never touches the real store)", () => {
  test("running --fixture leaves the real store byte-identical", async () => {
    const root = makeTempDir("ctx-guide-fixiso-");
    const realHome = join(root, "real-home");
    const project = join(root, "proj");
    mkdirSync(project, { recursive: true });
    // Seed a real store (empty is fine — the point is it must not change).
    const real = openStore({ projectDir: project, home: realHome, now: () => FIXTURE_NOW });
    const realDb = real.dbPath;
    real.close();
    const before = statSync(realDb);
    const beforeBytes = readFileSync(realDb);

    // Run --fixture via the command path (export mode so it does not block on serving).
    const exportDir = join(root, "out");
    const code = await runGuide(
      {
        out: () => {},
        err: () => {},
        home: realHome,
        projectDir: project,
        now: () => FIXTURE_NOW,
        env: { ...process.env, CTX_NO_OPEN: "1" },
      },
      { fixture: true, exportDir },
    );
    expect(code).toBe(0);

    const after = statSync(realDb);
    const afterBytes = readFileSync(realDb);
    expect(after.size, "real store size unchanged").toBe(before.size);
    expect(afterBytes.equals(beforeBytes), "real store bytes unchanged").toBe(true);
    cleanup(root);
  });
});

describe("ctx guide server — serves the built Vite app (when present)", () => {
  test("serves dist/index.html + a JS asset, token-gated, with strict CSP", async () => {
    const distDir = join(THIS_DIR, "..", "..", "guide", "dist");
    if (!existsSync(join(distDir, "index.html"))) {
      // dist is a build artifact; CI builds the guide before this tier runs.
      expect(true).toBe(true);
      return;
    }
    const root = makeTempDir("ctx-guide-built-");
    const store = makeStore(root);
    const server = await startGuideServer({
      store,
      now: () => FIXTURE_NOW,
      idleMs: 60_000,
      distDir,
    });
    try {
      // no token → 401 even for the built shell
      expect((await http(server.origin, "/")).status).toBe(401);
      const shell = await http(server.origin, `/?token=${server.token}`);
      expect(shell.status).toBe(200);
      expect(shell.body).toContain('<div id="root">');
      expect(shell.body).toMatch(/<script[^>]+type="module"/);
      // a hashed JS asset resolves (token via cookie the shell would carry)
      const asset = shell.body.match(/\/?assets\/[A-Za-z0-9._-]+\.js/);
      expect(asset, "index.html references a JS asset").not.toBeNull();
      const assetPath = asset![0].startsWith("/") ? asset![0] : `/${asset![0]}`;
      const js = await http(server.origin, assetPath, { token: server.token });
      expect(js.status).toBe(200);
    } finally {
      await server.close();
      store.close();
      cleanup(root);
    }
  });
});

describe("ctx guide export — C12 one-render-path (live ≡ export)", () => {
  test("exported canvas.json deep-equals the live projection", async () => {
    const root = makeTempDir("ctx-guide-c12-");
    const store = makeStore(root);
    const server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 60_000 });
    const exportDir = join(root, "out");
    try {
      exportGuide(store, exportDir, () => FIXTURE_NOW);
      const exported = JSON.parse(readFileSync(join(exportDir, "canvas.json"), "utf8"));
      const live = JSON.parse(
        (await http(server.origin, "/api/canvas", { token: server.token })).body,
      );
      const direct = JSON.parse(JSON.stringify(buildCanvasProjection(store, FIXTURE_NOW)));
      expect(exported).toEqual(direct);
      expect(live).toEqual(direct);
    } finally {
      await server.close();
      store.close();
      cleanup(root);
    }
  });
});
