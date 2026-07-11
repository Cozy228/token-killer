/**
 * G-empty-state — a genuinely empty store (total entities 0) renders the exact
 * `ctx sync` instruction, never a blank. Orient takes the canvas projection as a
 * prop, so we drive it directly with an empty-store projection.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { CanvasProjection } from "@contexa/core";
import { AppContext, type AppState } from "../src/appContext.ts";
import type { AsyncState } from "../src/util.ts";
import { Orient } from "../src/views/Orient.tsx";

afterEach(cleanup);

const app: AppState = {
  openEvidence: () => {},
  focus: null,
  toggleFocus: () => {},
  setScope: () => {},
};

function emptyCanvas(): CanvasProjection {
  return {
    kind: "canvas",
    meta: { disclosure: "accelerator, not validated", generatedAt: 0 },
    sources: [
      { source: "code", entityCount: 0, publishedGen: 0, coverage: 0 },
      { source: "git", entityCount: 0, publishedGen: 0, coverage: 0 },
    ],
    clusters: [],
    hotAreas: [],
    badges: { needsReview: 0, openConflicts: 0, e8StaleSources: [], perSource: [] },
    budget: { budget: { edgePredicates: [], depth: 1, nodeCap: 12 }, omitted: 0, omittedByReason: {} },
  };
}

function state(data: CanvasProjection): AsyncState<CanvasProjection> {
  return { data, error: undefined, loading: false };
}

describe("Orient empty state (G-empty-state)", () => {
  test("an empty store renders the exact `ctx sync` command", () => {
    render(
      <AppContext.Provider value={app}>
        <Orient canvas={state(emptyCanvas())} />
      </AppContext.Provider>,
    );
    expect(screen.getAllByText("ctx sync").length).toBeGreaterThan(0);
    expect(screen.getByText(/No index yet/i)).toBeTruthy();
  });

  test("a populated store does NOT show the empty state", () => {
    const c = emptyCanvas();
    c.sources[0]!.entityCount = 9588;
    render(
      <AppContext.Provider value={app}>
        <Orient canvas={state(c)} />
      </AppContext.Provider>,
    );
    expect(screen.queryByText("ctx sync")).toBeNull();
    expect(screen.getByText(/What is in this repo/i)).toBeTruthy();
  });
});
