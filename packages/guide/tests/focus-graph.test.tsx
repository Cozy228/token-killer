// FocusGraph (Connections view) — light render + derivation test over the
// fixture corpus: three columns, self-describing cards with counts, UA-style
// boundary pills, and re-root. The D24 naming gate is covered by naming-gate.test.

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { buildFocusModel, FocusGraph, packageOf } from "../src/ui/FocusGraph.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

afterEach(cleanup);

const model = compile(makeFixtureCorpus());

describe("buildFocusModel (pure derivation)", () => {
  it("splits a file subject into inbound cards, outbound cards, and boundary pills", () => {
    const focus = buildFocusModel(model, "file:src/app.ts")!;
    expect(focus).toBeTruthy();
    expect(focus.subjectKind).toBe("file");
    // app.ts is imported by index.ts (inbound, same package "src").
    expect(focus.inbound.cards.map((c) => c.name)).toContain("index.ts");
    // router.ts is in-package (src) -> card; math.ts / str.ts are in src/util -> pills.
    expect(focus.outbound.cards.map((c) => c.name)).toContain("router.ts");
    const pillLabels = focus.outbound.pills.map((p) => p.label);
    expect(pillLabels.some((l) => l.includes("math.ts"))).toBe(true);
    expect(pillLabels.some((l) => l.includes("str.ts"))).toBe(true);
  });

  it("aggregates call + import counts on a counterpart card", () => {
    const focus = buildFocusModel(model, "file:src/app.ts")!;
    const index = focus.inbound.cards.find((c) => c.name === "index.ts")!;
    // index.ts -> app.ts: 2 calls (aggregated) + 1 import.
    expect(index.callCount).toBe(2);
    expect(index.importCount).toBe(1);
  });

  it("groups a decl subject's counterparts under their owning file", () => {
    const focus = buildFocusModel(model, "sym:src/util/math.ts#add")!;
    expect(focus.subjectKind).toBe("decl");
    // mul() (same file, in-package) is a card; run() (app.ts) is a boundary pill.
    expect(focus.inbound.cards.map((c) => c.name)).toContain("mul");
    expect(focus.inbound.pills.some((p) => p.label.includes("app.ts"))).toBe(true);
  });

  it("returns null for a folder or unknown id", () => {
    expect(buildFocusModel(model, "dir:src")).toBeNull();
    expect(buildFocusModel(model, "nope")).toBeNull();
  });

  it("packageOf reads a monorepo package, else the parent directory", () => {
    expect(packageOf("packages/core/src/serve.ts")).toBe("packages/core");
    expect(packageOf("src/util/math.ts")).toBe("src/util");
    expect(packageOf("README.md")).toBe("");
  });
});

describe("FocusGraph overlay", () => {
  function renderGraph(rootId: string, overrides: Partial<Parameters<typeof FocusGraph>[0]> = {}) {
    return render(
      <FocusGraph
        model={model}
        rootId={rootId}
        onClose={overrides.onClose ?? (() => {})}
        onOpenOnMap={overrides.onOpenOnMap ?? (() => {})}
        litIds={overrides.litIds}
      />,
    );
  }

  it("renders three columns, cards with counts, and boundary pills", () => {
    const { container } = renderGraph("file:src/app.ts");
    expect(container.querySelector(".fg-col-inbound")).toBeTruthy();
    expect(container.querySelector(".fg-col-outbound")).toBeTruthy();
    expect(container.querySelector(".fg-col-center")).toBeTruthy();

    expect(container.querySelectorAll(".fg-card").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".fg-count").length).toBeGreaterThan(0);
    expect(/\d+\s+(call|import)/.test(container.textContent ?? "")).toBe(true);

    // Boundary pills for the cross-directory counterparts (math.ts / str.ts).
    expect(container.querySelectorAll(".fg-pill").length).toBeGreaterThan(0);

    // Subject card names the file.
    expect(container.querySelector(".fg-subject-name")?.textContent).toBe("app.ts");
  });

  it("re-roots the view when a card is clicked (breadcrumb hop)", () => {
    const { container } = renderGraph("file:src/app.ts");
    const inbound = container.querySelector(".fg-col-inbound")!;
    const card = within(inbound as HTMLElement).getByText("index.ts").closest("button")!;
    fireEvent.click(card);
    expect(container.querySelector(".fg-subject-name")?.textContent).toBe("index.ts");
    // Breadcrumb records the hop and back-navigation is available.
    expect(container.querySelectorAll(".fg-crumb").length).toBe(2);
    expect(container.querySelector(".fg-back")).toBeTruthy();
  });

  it("re-roots when a boundary pill is clicked", () => {
    const { container } = renderGraph("file:src/app.ts");
    const pill = container.querySelector(".fg-pill") as HTMLButtonElement;
    const label = pill.querySelector(".fg-pill-label")?.textContent ?? "";
    fireEvent.click(pill);
    const subject = container.querySelector(".fg-subject-name")?.textContent ?? "";
    expect(label).toContain(subject);
  });

  it("marks a lit-in-trace counterpart", () => {
    const { container } = renderGraph("file:src/app.ts", {
      litIds: new Set(["file:src/index.ts"]),
    });
    expect(container.querySelector(".fg-lit-tick")).toBeTruthy();
  });

  it("fires onClose from the close button and onOpenOnMap from the header", () => {
    const onClose = vi.fn();
    const onOpenOnMap = vi.fn();
    const { container } = renderGraph("file:src/app.ts", { onClose, onOpenOnMap });
    fireEvent.click(container.querySelector(".fg-open-map") as HTMLButtonElement);
    expect(onOpenOnMap).toHaveBeenCalledWith("file:src/app.ts");
    fireEvent.click(container.querySelector(".fg-close") as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("FocusGraph first-class surface (keyboard, cycle, edge cases)", () => {
  function renderGraph(rootId: string) {
    return render(<FocusGraph model={model} rootId={rootId} onClose={() => {}} onOpenOnMap={() => {}} />);
  }

  it("arrow keys move card focus and Enter re-roots the focused card", () => {
    const { container } = renderGraph("file:src/app.ts");
    // ArrowDown focuses the first inbound entry (index.ts); Enter re-roots on it.
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(container.querySelector(".fg-subject-name")?.textContent).toBe("index.ts");
    expect(container.querySelectorAll(".fg-crumb").length).toBe(2);
  });

  it("Backspace pops the breadcrumb back one hop", () => {
    const { container } = renderGraph("file:src/app.ts");
    const inbound = container.querySelector(".fg-col-inbound")!;
    fireEvent.click(within(inbound as HTMLElement).getByText("index.ts").closest("button")!);
    expect(container.querySelector(".fg-subject-name")?.textContent).toBe("index.ts");
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(container.querySelector(".fg-subject-name")?.textContent).toBe("app.ts");
  });

  it("revisiting a node already on the trail truncates forward history (cycle-safe)", () => {
    const { container } = renderGraph("file:src/app.ts");
    // app -> index (index.ts is an inbound card of app.ts).
    const inbound = container.querySelector(".fg-col-inbound")!;
    fireEvent.click(within(inbound as HTMLElement).getByText("index.ts").closest("button")!);
    expect(container.querySelectorAll(".fg-crumb").length).toBe(2);
    // From index, app.ts is an outbound card. Re-rooting on it revisits trail[0]
    // and truncates back to a single crumb instead of growing app/index/app.
    const outbound = container.querySelector(".fg-col-outbound")!;
    fireEvent.click(within(outbound as HTMLElement).getByText("app.ts").closest("button")!);
    expect(container.querySelector(".fg-subject-name")?.textContent).toBe("app.ts");
    expect(container.querySelectorAll(".fg-crumb").length).toBe(1);
  });

  it("renders an explicit zero-connection line + the decl list for a node with no edges", () => {
    // config.ts has declarations but no calls/imports in the fixture.
    const { container } = renderGraph("file:src/config.ts");
    expect(container.querySelector(".fg-zero")).toBeTruthy();
    expect(container.textContent).toContain("No observed calls or imports");
    const declText = container.querySelector(".fg-zero-decl-list")?.textContent ?? "";
    expect(declText).toContain("load");
    expect(declText).toContain("DEFAULTS");
  });

  it("carries decl-pair provenance (claim_id) on a counterpart card", () => {
    const { container } = renderGraph("file:src/app.ts");
    const inbound = container.querySelector(".fg-col-inbound")!;
    const card = within(inbound as HTMLElement).getByText("index.ts").closest("li")!;
    const expand = card.querySelector(".fg-expand") as HTMLButtonElement;
    expect(expand).toBeTruthy();
    fireEvent.click(expand);
    expect(card.querySelector(".fg-pair-prov")?.textContent).toMatch(/claim_id=/);
  });

  it("solidly roots a decl subject (grouped counterparts)", () => {
    const { container } = render(
      <FocusGraph model={model} rootId="sym:src/util/math.ts#add" onClose={() => {}} onOpenOnMap={() => {}} />,
    );
    expect(container.querySelector(".fg-subject-name")?.textContent).toBe("add");
    // mul() is a same-file in-package card; run() (app.ts) is a boundary pill.
    expect(container.textContent).toContain("mul");
    expect(container.querySelectorAll(".fg-card").length).toBeGreaterThan(0);
  });

  it("renders a store-absent counterpart as a 'not in index' pill, not a broken card", () => {
    const m = compile(makeFixtureCorpus());
    // Inject a dangling edge to a file that is not in the corpus index.
    m.edges.file.push({
      src: "file:src/app.ts",
      dst: "file:src/ghost.ts",
      kind: "imports",
      count: 1,
      claimId: null,
    });
    const focus = buildFocusModel(m, "file:src/app.ts")!;
    const absent = focus.outbound.pills.find((p) => p.notInIndex);
    expect(absent).toBeTruthy();
    expect(absent!.label).toContain("ghost.ts");

    const { container } = render(
      <FocusGraph model={m} rootId="file:src/app.ts" onClose={() => {}} onOpenOnMap={() => {}} />,
    );
    expect(container.querySelector(".fg-pill-absent")).toBeTruthy();
    expect(container.textContent).toContain("not in index");
  });
});
