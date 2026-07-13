/**
 * D28's shared interaction states, rendered honestly.
 *
 * The assertion that matters: the stale screen prints the kernel's `reason` VERBATIM. A
 * paraphrase would be a vaguer sentence in place of the only text that explains why a
 * store full of rows is showing nothing — and D25 rules that the gap gets named, not
 * smoothed over.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { GuidePage } from "../src/App.tsx";
import { DataSourceProvider } from "../src/data/context.tsx";
import type { BoundedProjection, FreshnessState, GuideStatus } from "../src/data/dto.ts";
import {
  GuideAuthError,
  GuideNotServableError,
  GuideSourceError,
  type GuideDataSource,
} from "../src/data/source.ts";

const STALE_REASON =
  "the store holds data for code, git built under generation 60cd4ec3, not this checkout's " +
  "540c0fe7 — every worktree of this repo shares one store, so a sync elsewhere supersedes " +
  "this one. Run `ctx sync` here to rebuild.";

function status(state: FreshnessState, reason: string): GuideStatus {
  return {
    repo: { name: "token-killer", root: "/Users/x/token-killer" },
    generation: {
      state,
      currentIdentity: "540c0fe7aaaa",
      repoRev: "6ec19819bbbb",
      sources: [
        { source: "code", publishedGen: 0, storedIdentity: "60cd4ec3", matchesCurrentIdentity: false },
      ],
      reason,
    },
  };
}

/** A data source that answers exactly as the server would in one situation. */
function fake(over: Partial<GuideDataSource>): GuideDataSource {
  const reject = (): Promise<never> => Promise.reject(new Error("not used in this test"));
  return {
    mode: "live",
    status: reject,
    overview: reject,
    scope: reject,
    connections: reject,
    event: reject,
    ...over,
  } as GuideDataSource;
}

function draw(source: GuideDataSource): void {
  render(
    <DataSourceProvider source={source}>
      <GuidePage />
    </DataSourceProvider>,
  );
}

// Vitest runs without globals here, so RTL cannot self-register its cleanup.
afterEach(cleanup);

describe("shared interaction states", () => {
  test("loading while the store is being read", () => {
    draw(fake({ status: () => new Promise(() => {}) }));
    expect(screen.getByTestId("state-loading")).toBeTruthy();
  });

  test("stale — the kernel's reason is rendered VERBATIM, not paraphrased", async () => {
    const stale = status("stale", STALE_REASON);
    draw(
      fake({
        status: () => Promise.resolve(stale),
        overview: () => Promise.reject(new GuideNotServableError(stale)),
      }),
    );

    await waitFor(() => expect(screen.getByTestId("state-stale")).toBeTruthy());
    expect(screen.getByTestId("stale-reason").textContent).toBe(STALE_REASON);
    // The badge agrees with the store, and does not say `live` or `empty`.
    expect(screen.getByTestId("freshness-badge").textContent).toBe("stale");
    // Nothing was rendered from the mismatched rows.
    expect(screen.queryByTestId("state-ready")).toBeNull();
  });

  test("empty store — names `ctx sync` and what it will do", async () => {
    const empty = status("empty", "no generation has been published for this repository — run `ctx sync`");
    draw(
      fake({
        status: () => Promise.resolve(empty),
        overview: () => Promise.reject(new GuideNotServableError(empty)),
      }),
    );

    await waitFor(() => expect(screen.getByTestId("state-empty")).toBeTruthy());
    expect(screen.getByTestId("state-empty").textContent).toContain("ctx sync");
    expect(screen.getByTestId("freshness-badge").textContent).toBe("empty");
  });

  test("auth failure — points at the link ctx printed", async () => {
    draw(fake({ status: () => Promise.reject(new GuideAuthError("needs the printed link")) }));
    await waitFor(() => expect(screen.getByTestId("state-auth")).toBeTruthy());
    expect(screen.getByTestId("state-auth").textContent).toContain("ctx guide");
  });

  test("source unavailable — the server was stopped", async () => {
    draw(
      fake({
        status: () => Promise.reject(new GuideSourceError("the ctx guide server did not answer")),
      }),
    );
    await waitFor(() => expect(screen.getByTestId("state-source")).toBeTruthy());
    expect(screen.getByTestId("state-source").textContent).toContain("did not answer");
  });

  test("live — the badge says live and the projection crossed the seam", async () => {
    const live = status("live", "built under the current generation 540c0fe7");
    const overview = {
      kind: "overview",
      containers: [{ id: "scope:packages/core", fileCount: 3 }],
      edges: [{ id: "e1" }],
    } as unknown as BoundedProjection;

    draw(
      fake({ status: () => Promise.resolve(live), overview: () => Promise.resolve(overview) }),
    );

    await waitFor(() => expect(screen.getByTestId("state-ready")).toBeTruthy());
    expect(screen.getByTestId("freshness-badge").textContent).toBe("live");
    expect(screen.getByTestId("state-ready").textContent).toContain("1 scopes");
  });
});
