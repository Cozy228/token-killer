/**
 * `ctx guide` server integration (R12/R13, G-loopback/G-auth-ux/G-readonly):
 *   - refuses a non-loopback bind;
 *   - one-time token → HttpOnly cookie 302 bootstrap, token stripped from the URL;
 *   - every route 401s without the cookie; the token is single-use;
 *   - GET /api/corpus returns the corpus JSON with the cookie;
 *   - a mutating method is rejected (non-mutating surface);
 *   - --fixture serves the fixture corpus over the wire;
 *   - a missing guide build produces the actionable build hint;
 *   - clean-URL print format.
 *
 * Real node:http on an ephemeral loopback port. Fetch carries no cookie jar, so
 * cookie enforcement is exercised explicitly.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { makeFixtureCorpus } from "@contexa/guide/fixture-corpus";
import { startGuide, type GuideHandle } from "../src/guide/server.ts";
import { assertGuideDist } from "../src/guide/assets.ts";

const fixtureCorpus = makeFixtureCorpus();
const CORPUS = {
  corpus: fixtureCorpus,
  json: JSON.stringify(fixtureCorpus),
  stale: false,
};

function makeDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "ctx-guide-dist-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>guide</title><div id=root></div>");
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "assets", "app.js"), "console.log('guide')");
  return dir;
}

describe("ctx guide server", () => {
  let dist: string;
  const open: GuideHandle[] = [];

  beforeEach(() => {
    delete process.env.TK_SHIM_DIR;
    dist = makeDist();
  });
  afterEach(async () => {
    for (const h of open.splice(0)) await h.close();
    rmSync(dist, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  async function start(overrides: Parameters<typeof startGuide>[0] = {}): Promise<GuideHandle> {
    const h = await startGuide({ distDir: dist, corpus: CORPUS, token: "TESTTOKEN", ...overrides });
    open.push(h);
    return h;
  }

  test("refuses a non-loopback bind", async () => {
    await expect(startGuide({ host: "0.0.0.0", distDir: dist, corpus: CORPUS })).rejects.toThrow(
      /non-loopback/,
    );
  });

  test("clean URL prints the token exactly once", async () => {
    const h = await start();
    expect(h.url).toBe(`http://127.0.0.1:${h.port}/?t=TESTTOKEN`);
  });

  test("token → HttpOnly cookie bootstrap, then token-stripped redirect", async () => {
    const h = await start();
    const res = await fetch(h.url, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const setCookie = res.headers.getSetCookie();
    expect(setCookie.length).toBe(1);
    expect(setCookie[0]).toMatch(/ctx_guide=/);
    expect(setCookie[0]).toMatch(/HttpOnly/);
    expect(setCookie[0]).toMatch(/SameSite=Strict/);
  });

  test("every route 401s without a cookie; 200s with it", async () => {
    const h = await start();
    // Bootstrap to obtain the session cookie.
    const boot = await fetch(h.url, { redirect: "manual" });
    const cookie = boot.headers.getSetCookie()[0]!.split(";")[0]!;

    // No cookie -> 401 on both the API and an asset.
    expect((await fetch(`http://127.0.0.1:${h.port}/api/corpus`)).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${h.port}/assets/app.js`)).status).toBe(401);

    // With cookie -> API returns the corpus JSON.
    const api = await fetch(`http://127.0.0.1:${h.port}/api/corpus`, { headers: { cookie } });
    expect(api.status).toBe(200);
    expect(api.headers.get("content-type")).toMatch(/application\/json/);
    expect(await api.text()).toBe(CORPUS.json);

    // With cookie -> the SPA shell is served for a hash-style route.
    const page = await fetch(`http://127.0.0.1:${h.port}/`, { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<div id=root>");
  });

  test("the bootstrap token is single-use", async () => {
    const h = await start();
    // First use consumes it.
    const first = await fetch(h.url, { redirect: "manual" });
    expect(first.status).toBe(302);
    // Second use of the same token, without a cookie, is rejected.
    const second = await fetch(h.url, { redirect: "manual" });
    expect(second.status).toBe(401);
  });

  test("rejects a mutating method (non-mutating surface)", async () => {
    const h = await start();
    const res = await fetch(`http://127.0.0.1:${h.port}/api/corpus`, { method: "POST" });
    expect(res.status).toBe(405);
  });

  test("--fixture serves the fixture corpus over the wire", async () => {
    const h = await start({ corpus: undefined, fixture: true });
    const boot = await fetch(h.url, { redirect: "manual" });
    const cookie = boot.headers.getSetCookie()[0]!.split(";")[0]!;
    const api = await fetch(`http://127.0.0.1:${h.port}/api/corpus`, { headers: { cookie } });
    const body = JSON.parse(await api.text());
    expect(body.repo).toBe("fixture-repo");
  });

  test("a missing guide build gives an actionable hint", () => {
    expect(() => assertGuideDist(join(tmpdir(), "no-such-guide-dist"))).toThrow(
      /pnpm --filter @contexa\/guide build/,
    );
  });
});
