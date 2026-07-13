// Generation switch (D10): a new generation detected WHILE READING raises a
// dismissible prompt and does NOT swap the map. The corpus is reloaded only on an
// explicit "Switch", which preserves a still-existing selection.

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFixtureCorpus } from "./fixtures/corpus.js";
import { generationInfoOf } from "../src/data/source.js";
import type { CorpusInput, GenerationInfo } from "../src/atlas/types.js";
import type { GuideDataSource } from "../src/data/source.js";

interface Cap {
  onFocus: null | ((id: string) => void);
}
const h = vi.hoisted(() => ({ cap: { onFocus: null } as Cap }));

vi.mock("../src/ui/ReactFlowRenderer.js", async () => {
  const React = await import("react");
  const MockRenderer = (props: {
    onFocus: (id: string) => void;
    onApiReady?: (api: unknown) => void;
  }) => {
    h.cap.onFocus = props.onFocus;
    React.useEffect(() => {
      props.onApiReady?.({
        setViewport() {},
        fitView() {},
        revealNode: () => false,
        centerOn() {},
        runSweep: async () => {},
      });
    }, []);
    return React.createElement("div", { className: "mock-canvas" });
  };
  return { ReactFlowRenderer: MockRenderer };
});

const { SpikeApp } = await import("../src/ui/SpikeApp.js");

// v1 = fixture (generations.code=3); v2 = same files, a NEW generation (code=99).
const v1: CorpusInput = makeFixtureCorpus();
const v2: CorpusInput = { ...makeFixtureCorpus(), generations: { code: 99, git: 2, docs: 1, memory: 4 } };
const genV2: GenerationInfo = generationInfoOf(v2);

function makeSource(): { source: GuideDataSource; loadCount: () => number } {
  let count = 0;
  const source: GuideDataSource = {
    async load() {
      count++;
      const corpus = count === 1 ? v1 : v2;
      return { corpus, bytes: JSON.stringify(corpus).length, via: "live" as const };
    },
    async pollGeneration() {
      return genV2;
    },
  };
  return { source, loadCount: () => count };
}

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  cleanup();
  h.cap.onFocus = null;
});

describe("generation switch prompt (D10)", () => {
  it("prompts on a new generation without swapping the map, and switches on confirm", async () => {
    const { source, loadCount } = makeSource();
    const { container, getByText } = render(<SpikeApp dataSource={source} pollMs={5} />);

    // Initial generation loaded and shell mounted.
    await waitFor(() => expect(container.querySelector(".spike-shell")).toBeTruthy());
    expect(loadCount()).toBe(1);

    // Select a node that exists in BOTH generations.
    await waitFor(() => expect(h.cap.onFocus).toBeTruthy());
    await act(async () => {
      h.cap.onFocus!("file:src/app.ts");
    });
    expect(container.querySelector(".focused-evidence")).toBeTruthy();

    // The poll detects a new generation -> a prompt appears. The map is NOT
    // reloaded (load still called exactly once).
    await waitFor(() => expect(container.querySelector(".gen-prompt")).toBeTruthy());
    expect(getByText(/New generation 99 available/)).toBeTruthy();
    expect(loadCount()).toBe(1);

    // Confirm the switch -> corpus reloaded (v2) and the prompt clears.
    await act(async () => {
      (container.querySelector(".gen-prompt-switch") as HTMLButtonElement).click();
    });
    await waitFor(() => expect(loadCount()).toBe(2));
    await waitFor(() => expect(container.querySelector(".gen-prompt")).toBeNull());

    // Selection is preserved because the id still exists in v2.
    await waitFor(() => expect(container.querySelector(".spike-shell")).toBeTruthy());
    expect(container.querySelector(".focused-evidence")).toBeTruthy();
  });

  it("dismiss hides the prompt and does not re-prompt for the same generation", async () => {
    const { source, loadCount } = makeSource();
    const { container } = render(<SpikeApp dataSource={source} pollMs={5} />);
    await waitFor(() => expect(container.querySelector(".gen-prompt")).toBeTruthy());

    await act(async () => {
      (container.querySelector(".gen-prompt-dismiss") as HTMLButtonElement).click();
    });
    expect(container.querySelector(".gen-prompt")).toBeNull();

    // Give the poll several more cycles — the same identity must not re-prompt.
    await new Promise((r) => setTimeout(r, 40));
    expect(container.querySelector(".gen-prompt")).toBeNull();
    expect(loadCount()).toBe(1); // never reloaded
  });
});
