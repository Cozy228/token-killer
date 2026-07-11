/**
 * `ctx guide` loopback server + export — slice 3a gates (brief §6):
 * G-loopback (127.0.0.1 + bearer token on EVERY route), G-egress (no external
 * URLs + egress guard armed), G-shutdown (idle + disconnect teardown),
 * G-readonly (route sweep + attempted write path), and C12 export-diff
 * (live ≡ export, one-render-path). Deterministic fixture store, fixed clock.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  buildCanvasProjection,
  buildFixtureStore,
  openStore,
  FIXTURE_NOW,
  type Store,
} from "@contexa/core";
import { startGuideServer, type GuideServer } from "../src/guide/server.ts";
import { EMBEDDED_SHELL } from "../src/guide/shell.ts";
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
    expect(EMBEDDED_SHELL).not.toMatch(external);
    expect(EMBEDDED_SHELL).not.toMatch(cdnish);
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

describe("ctx guide server — G-shutdown", () => {
  test("idle timeout tears the server down", async () => {
    const root = makeTempDir("ctx-guide-idle-");
    const store = makeStore(root);
    const server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 120 });
    await server.closed; // resolves when the idle timer fires
    store.close();
    cleanup(root);
    expect(true).toBe(true);
  });

  test("disconnect beacon (/api/close) tears the server down", async () => {
    const root = makeTempDir("ctx-guide-disc-");
    const store = makeStore(root);
    const server = await startGuideServer({ store, now: () => FIXTURE_NOW, idleMs: 60_000 });
    const res = await http(server.origin, "/api/close", { token: server.token, method: "POST" });
    expect(res.status).toBe(204);
    await server.closed;
    store.close();
    cleanup(root);
    expect(true).toBe(true);
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
