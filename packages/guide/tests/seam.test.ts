/**
 * The D17 seam: live and snapshot are ONE contract, and the not-servable refusal is the
 * same refusal on both sides. If these two implementations ever diverge in what they
 * throw, the renderer starts branching on which one it has — and export quietly becomes
 * a second product. That is what this file exists to prevent.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import type { BoundedProjection, GuideStatus, GuideTree } from "../src/data/dto.ts";
import { LiveDataSource } from "../src/data/live.ts";
import { eventKey, SnapshotDataSource, type GuideSnapshot } from "../src/data/snapshot.ts";
import {
  GuideAuthError,
  GuideNotServableError,
  GuideSourceError,
  type GuideDataSource,
} from "../src/data/source.ts";

function status(state: GuideStatus["generation"]["state"], reason: string): GuideStatus {
  return {
    repo: { name: "token-killer", root: "/repo" },
    generation: { state, currentIdentity: "abc123", repoRev: "def456", sources: [], reason },
  };
}

const projection = { kind: "overview", containers: [], edges: [] } as unknown as BoundedProjection;
const tree = { roots: [], attention: { changed: 0, needsReview: 0, conflict: 0 } } as unknown as GuideTree;

function respond(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

/** Await a call that must reject, and hand back the error it rejected with. */
async function rejection<T>(promise: Promise<unknown>): Promise<T> {
  let resolved = false;
  let caught: unknown;
  await promise.then(
    () => {
      resolved = true;
    },
    (error: unknown) => {
      caught = error;
    },
  );
  if (resolved) throw new Error("expected the call to reject, but it resolved");
  return caught as T;
}

afterEach(() => vi.unstubAllGlobals());

describe("LiveDataSource", () => {
  test("carries the cookie and nothing else — it never holds the token", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(respond(status("live", "ok"))),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new LiveDataSource().status();

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("same-origin");
    expect(JSON.stringify(init?.headers)).not.toContain("Bearer");
  });

  test("401 -> auth error", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(respond({ message: "needs the printed link" }, { status: 401 })),
    );
    await expect(new LiveDataSource().overview()).rejects.toBeInstanceOf(GuideAuthError);
  });

  test("409 -> not-servable, carrying the generation view verbatim", async () => {
    const stale = status("stale", "built under generation 60cd4ec3 — run `ctx sync` here");
    vi.stubGlobal("fetch", () =>
      Promise.resolve(respond({ error: "not-servable", status: stale }, { status: 409 })),
    );

    const error = await rejection<GuideNotServableError>(new LiveDataSource().overview());

    expect(error).toBeInstanceOf(GuideNotServableError);
    expect(error.status.generation.state).toBe("stale");
    // The kernel's own words survive the wire untouched.
    expect(error.message).toBe(stale.generation.reason);
  });

  test("a dead server -> source error naming what to do", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const error = await rejection<GuideSourceError>(new LiveDataSource().status());
    expect(error).toBeInstanceOf(GuideSourceError);
    expect(error.message).toContain("ctx guide");
  });
});

describe("SnapshotDataSource", () => {
  const snapshot: GuideSnapshot = {
    status: status("snapshot", "exported snapshot of generation abc123"),
    tree,
    overview: projection,
    scopes: { "packages/core": projection },
    connections: {},
    events: {},
  };

  test("serves the projections it was built with", async () => {
    const source = new SnapshotDataSource(snapshot);
    expect((await source.status()).generation.state).toBe("snapshot");
    expect(await source.overview()).toBe(projection);
    expect(await source.scope({ path: "packages/core" })).toBe(projection);
  });

  test("says what it does not carry instead of rendering something emptier", async () => {
    const source = new SnapshotDataSource(snapshot);
    const error = await rejection<GuideSourceError>(source.connections({ id: "sym:nope" }));
    expect(error).toBeInstanceOf(GuideSourceError);
    expect(error.message).toContain("does not include");
    expect(error.message).toContain("ctx guide");
  });

  test("a snapshot of a stale generation refuses to project, exactly as the server does", async () => {
    const source = new SnapshotDataSource({
      ...snapshot,
      status: status("stale", "built under another generation"),
    });
    await expect(source.overview()).rejects.toBeInstanceOf(GuideNotServableError);
  });

  test("the event key is order-independent, so builder and reader agree without coordinating", () => {
    expect(eventKey({ commits: ["b", "a"] })).toBe(eventKey({ commits: ["a", "b"] }));
    expect(eventKey({ commits: ["a"] })).not.toBe(eventKey({ anchors: ["a"] }));
  });
});

describe("the seam", () => {
  test("both implementations satisfy the one interface the renderer sees", () => {
    const sources: GuideDataSource[] = [
      new LiveDataSource(),
      new SnapshotDataSource({
        status: status("snapshot", "ok"),
        tree,
        overview: projection,
        scopes: {},
        connections: {},
        events: {},
      }),
    ];
    for (const source of sources) {
      for (const method of ["status", "overview", "scope", "connections", "event"] as const) {
        expect(typeof source[method]).toBe("function");
      }
    }
    expect(sources.map((s) => s.mode)).toEqual(["live", "snapshot"]);
  });
});
