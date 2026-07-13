/**
 * `ctx guide` server tests (M3 K2).
 *
 * Two things are load-bearing here and the rest is scaffolding around them:
 *
 *  1. G-loopback: NO route resolves without the token — not the SPA, not `/api/*`, not a
 *     static asset. Absence of an unauthenticated surface is asserted route by route.
 *  2. THE GENERATION TRAP: a store built under another generation identity is `stale`,
 *     never `live` and never `empty`, and the server REFUSES to project it rather than
 *     quietly serving its rows. The trap is reproduced the way it really happens — the
 *     checkout's revision moves and the published generation no longer matches.
 *
 * Sandboxed per G-7: CONTEXA_HOME lives in a temp dir, git config is neutralised, and no
 * real host state is read or written.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStoreReadOnly } from "@contexa/core";
import { runSync } from "../src/cli.ts";
import { appDirCandidates } from "../src/guide/assets.ts";
import { cmdGuide } from "../src/guide/command.ts";
import { startGuideServer, type GuideServer } from "../src/guide/server.ts";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 15_000,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(tmpdir(), "ctx-guide-no-gitconfig"),
      GIT_CONFIG_SYSTEM: join(tmpdir(), "ctx-guide-no-gitconfig"),
    },
  });
}

/** A GET that can set headers `fetch` forbids (notably `Host`). Returns the status. */
function rawGet(port: number, path: string, headers: Record<string, string>): Promise<number> {
  return new Promise((ok, fail) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", headers }, (res) => {
      res.resume();
      res.on("end", () => ok(res.statusCode ?? 0));
    });
    req.on("error", fail);
    req.end();
  });
}

/** A stand-in for the built SPA — the CLI suite must not depend on a Vite build. */
function fakeAppDir(root: string): string {
  const dir = join(root, "app");
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>ctx guide</title>");
  writeFileSync(join(dir, "assets", "index.js"), "export const x = 1;\n");
  return dir;
}

describe("ctx guide server", () => {
  let root: string;
  let repo: string;
  let home: string;
  let appDir: string;
  let server: GuideServer | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-guide-"));
    repo = join(root, "repo");
    git(["init", "-q", "-b", "main", repo], root);
    git(["config", "user.email", "t@t.invalid"], repo);
    git(["config", "user.name", "t"], repo);
    writeFileSync(join(repo, "a.ts"), "export function alpha(): number {\n  return 1;\n}\n");
    git(["add", "a.ts"], repo);
    git(["commit", "-q", "-m", "feat: add alpha"], repo);
    home = join(root, "contexa-home");
    appDir = fakeAppDir(root);
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  async function sync(): Promise<void> {
    await runSync([], { out: () => {}, err: () => {} }, { projectDir: repo, home });
  }

  async function start(): Promise<GuideServer> {
    server = await startGuideServer({ projectDir: repo, home, appDir });
    return server;
  }

  const bearer = (s: GuideServer): Record<string, string> => ({
    authorization: `Bearer ${s.token}`,
  });

  // -------------------------------------------------------------------------
  // G-loopback
  // -------------------------------------------------------------------------

  test("binds 127.0.0.1 on a random free port, and prints the token in the URL", async () => {
    const s = await start();
    expect(s.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(s.port).toBeGreaterThan(0);
    expect(s.url).toBe(`${s.origin}/auth?t=${s.token}`);
    expect(s.token).toHaveLength(43); // 32 random bytes, base64url
  });

  test("NO route resolves without the token — SPA, api and static asset alike", async () => {
    const s = await start();
    for (const path of ["/", "/index.html", "/assets/index.js", "/api/generation", "/api/overview"]) {
      const res = await fetch(`${s.origin}${path}`);
      expect(res.status, `unauthenticated ${path}`).toBe(401);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("unauthorized");
      // The refusal never leaks the credential it is refusing over.
      expect(JSON.stringify(body)).not.toContain(s.token);
    }
  });

  test("a wrong token is refused (at /auth and as a bearer)", async () => {
    const s = await start();
    const bad = "x".repeat(43);
    expect((await fetch(`${s.origin}/auth?t=${bad}`, { redirect: "manual" })).status).toBe(401);
    expect(
      (await fetch(`${s.origin}/api/generation`, { headers: { authorization: `Bearer ${bad}` } }))
        .status,
    ).toBe(401);
  });

  test("the token is exchanged once at /auth for an HttpOnly cookie, which then carries every route", async () => {
    await sync();
    const s = await start();

    const auth = await fetch(s.url, { redirect: "manual" });
    expect(auth.status).toBe(302);
    expect(auth.headers.get("location")).toBe("/");
    const cookie = auth.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`ctx_guide=${s.token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    // The cookie alone now resolves the SPA and the API.
    const jar = { cookie: `ctx_guide=${s.token}` };
    const page = await fetch(`${s.origin}/`, { headers: jar });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("ctx guide");

    const api = await fetch(`${s.origin}/api/generation`, { headers: jar });
    expect(api.status).toBe(200);
  });

  test("a Host header that is not the bound loopback address is refused (DNS rebinding)", async () => {
    const s = await start();
    // `fetch` refuses to set `host` (a forbidden header), so it cannot express this
    // request at all — a raw client can, and an attacker's would.
    const status = await rawGet(s.port, "/api/generation", {
      host: "evil.example.com",
      authorization: `Bearer ${s.token}`,
    });
    expect(status).toBe(403);

    // The same request with the real loopback Host is fine — it is the Host that is
    // refused, not the route.
    expect(
      await rawGet(s.port, "/api/generation", {
        host: `127.0.0.1:${s.port}`,
        authorization: `Bearer ${s.token}`,
      }),
    ).toBe(200);
  });

  test("the server sends a zero-egress content security policy", async () => {
    await sync();
    const s = await start();
    const res = await fetch(`${s.origin}/api/generation`, { headers: bearer(s) });
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
  });

  test("path traversal out of the app bundle is refused", async () => {
    const s = await start();
    const res = await fetch(`${s.origin}/../../../etc/passwd`, { headers: bearer(s) });
    expect([403, 404]).toContain(res.status);
  });

  // -------------------------------------------------------------------------
  // The badge tells the truth (E5)
  // -------------------------------------------------------------------------

  test("no store at all -> empty, and the reason names the exact command", async () => {
    const s = await start();
    const res = await fetch(`${s.origin}/api/generation`, { headers: bearer(s) });
    expect(res.status).toBe(200);
    const status = (await res.json()) as { generation: { state: string; reason: string } };
    expect(status.generation.state).toBe("empty");
    expect(status.generation.reason).toContain("ctx sync");

    // And no projection is served for a store that does not exist.
    const overview = await fetch(`${s.origin}/api/overview`, { headers: bearer(s) });
    expect(overview.status).toBe(409);
  });

  test("after ctx sync -> live, and the projections serve", async () => {
    await sync();
    const s = await start();

    const status = (await (
      await fetch(`${s.origin}/api/generation`, { headers: bearer(s) })
    ).json()) as { repo: { name: string }; generation: { state: string; repoRev: string } };
    expect(status.generation.state).toBe("live");
    expect(status.repo.name).toBe("repo");
    expect(status.generation.repoRev).not.toBe("");

    const overview = await fetch(`${s.origin}/api/overview`, { headers: bearer(s) });
    expect(overview.status).toBe(200);
    const projection = (await overview.json()) as { kind: string; generation: { state: string } };
    expect(projection.kind).toBe("overview");
    expect(projection.generation.state).toBe("live");
  });

  test("THE TRAP: a generation built under another identity is stale — never live, never empty, and never projected", async () => {
    await sync();

    // Move the checkout's revision. `repoRev` is part of the generation identity tuple, so
    // the published generation no longer matches this checkout and `publishedGen()` drops
    // to 0 — the store LOOKS empty while its rows sit right there. Exactly what a sibling
    // worktree's `ctx sync` does to this one, since all worktrees share one shard.
    writeFileSync(join(repo, "b.ts"), "export function beta(): number {\n  return 2;\n}\n");
    git(["add", "b.ts"], repo);
    git(["commit", "-q", "-m", "feat: add beta"], repo);

    const s = await start();
    const status = (await (
      await fetch(`${s.origin}/api/generation`, { headers: bearer(s) })
    ).json()) as { generation: { state: string; reason: string; currentIdentity: string } };

    expect(status.generation.state).toBe("stale");
    // The reason explains the shared-shard situation in plain English and names the fix.
    expect(status.generation.reason).toContain("every worktree of this repo shares one store");
    expect(status.generation.reason).toContain("ctx sync");

    // THE REFUSAL. The rows are there; the server will not present them as this checkout's.
    const overview = await fetch(`${s.origin}/api/overview`, { headers: bearer(s) });
    expect(overview.status).toBe(409);
    const body = (await overview.json()) as {
      error: string;
      status: { generation: { state: string; reason: string } };
    };
    expect(body.error).toBe("not-servable");
    expect(body.status.generation.state).toBe("stale");
    expect(body.status.generation.reason).toBe(status.generation.reason);
    // No projection leaked alongside the refusal.
    expect(body).not.toHaveProperty("containers");
  });

  test("/api/generation reports the CURRENT state on every call, not a startup snapshot", async () => {
    const s = await start(); // started against a repo with NO store

    const before = (await (
      await fetch(`${s.origin}/api/generation`, { headers: bearer(s) })
    ).json()) as { generation: { state: string } };
    expect(before.generation.state).toBe("empty");

    // The store is built while the server is running. Nothing restarts.
    await sync();

    const after = (await (
      await fetch(`${s.origin}/api/generation`, { headers: bearer(s) })
    ).json()) as { generation: { state: string } };
    expect(after.generation.state).toBe("live");

    // ...and the projections that were refused a moment ago now serve.
    expect((await fetch(`${s.origin}/api/overview`, { headers: bearer(s) })).status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Non-mutating
  // -------------------------------------------------------------------------

  test("the store the server opens is structurally incapable of writing", async () => {
    await sync();
    const store = openStoreReadOnly({ projectDir: repo, home });
    try {
      expect(() =>
        store.upsertEntity({
          id: "file:written-by-the-guide.ts",
          kind: "file",
          name: "written-by-the-guide.ts",
          locator: { t: "file", path: "written-by-the-guide.ts" },
          attrs: {},
          gen: 1,
        }),
      ).toThrow();
    } finally {
      store.close();
    }
  });

  // -------------------------------------------------------------------------
  // Command + asset shipping
  // -------------------------------------------------------------------------

  test("cmdGuide prints the one-time link and serves until shutdown", async () => {
    await sync();
    const lines: string[] = [];
    let served: string | undefined;

    const code = await cmdGuide(
      { out: (l) => lines.push(l), projectDir: repo, home },
      {
        noOpen: true,
        appDir,
        waitForShutdown: async (s) => {
          const url = lines.find((l) => l.includes("/auth?t="))?.trim() ?? "";
          const res = await fetch(url, { redirect: "manual" });
          served = res.headers.get("set-cookie") ?? "";
          await s.close();
        },
      },
    );

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("127.0.0.1 only");
    expect(lines.join("\n")).toContain("Ctrl-C");
    expect(served).toContain("HttpOnly");
  });

  test("cmdGuide names the exact command when the SPA has not been built", async () => {
    const errors: string[] = [];
    const code = await cmdGuide(
      { out: () => {}, err: (l) => errors.push(l), projectDir: repo, home },
      { noOpen: true, appDir: join(root, "not-built") },
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("pnpm --filter @contexa/guide build");
  });

  test("the SPA is looked for next to the published bundle FIRST, and in the guide package in dev", async () => {
    const [published, dev] = appDirCandidates();
    // A registry install has no workspace: the app must be found inside the CLI's own tree.
    expect(published).toMatch(/[\\/]guide-app$/);
    // ...and a dev run from source falls back to the guide package's Vite output.
    expect(dev).toMatch(/packages[\\/]guide[\\/]dist$/);
  });
});
