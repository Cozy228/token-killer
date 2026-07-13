import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { FocusedEvidence } from "../src/ui/FocusedEvidence.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

afterEach(cleanup);

const model = compile(makeFixtureCorpus());

describe("FocusedEvidence panel (R4-3)", () => {
  it("lists declarations and directional connections for a file", () => {
    const { container } = render(<FocusedEvidence model={model} selectedId="file:src/app.ts" onFocus={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Declared here");
    expect(text).toContain("Connections");
    // app.ts imports math.ts + router.ts and is imported by index.ts.
    expect(text).toContain("imports →");
    expect(text).toContain("← imported by");
  });

  it("shows call verbs for a declaration and click-focuses the other endpoint", () => {
    const onFocus = vi.fn();
    const { container } = render(
      <FocusedEvidence model={model} selectedId="sym:src/app.ts#run" onFocus={onFocus} />,
    );
    const text = container.textContent ?? "";
    expect(/calls →|← called by/.test(text)).toBe(true);

    const rows = within(container).getAllByRole("button");
    fireEvent.click(rows[0]);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(typeof onFocus.mock.calls[0][0]).toBe("string");
  });

  it("renders provenance (claim_id) on connection rows", () => {
    const { container } = render(
      <FocusedEvidence model={model} selectedId="sym:src/app.ts#run" onFocus={() => {}} />,
    );
    expect(container.querySelector(".fe-row-prov")?.textContent).toMatch(/claim_id=/);
  });

  it("renders nothing for an unknown id", () => {
    const { container } = render(<FocusedEvidence model={model} selectedId="sym:nope#x" onFocus={() => {}} />);
    expect(container.querySelector(".focused-evidence")).toBeNull();
  });

  it("surfaces a primary Connections button and a per-row 'view' reverse affordance", () => {
    const onOpenConnections = vi.fn();
    const { container } = render(
      <FocusedEvidence
        model={model}
        selectedId="file:src/app.ts"
        onFocus={() => {}}
        onOpenConnections={onOpenConnections}
      />,
    );
    // Primary entry button opens the Connections view on the subject itself.
    const primary = container.querySelector(".fe-connections") as HTMLButtonElement;
    expect(primary).toBeTruthy();
    fireEvent.click(primary);
    expect(onOpenConnections).toHaveBeenCalledWith("file:src/app.ts");

    // Each connection row gets a "view" affordance opening Connections rooted on
    // the OTHER endpoint (the reverse of "Open on map").
    const view = container.querySelector(".fe-row-view") as HTMLButtonElement;
    expect(view).toBeTruthy();
    fireEvent.click(view);
    expect(onOpenConnections).toHaveBeenCalledTimes(2);
    expect(typeof onOpenConnections.mock.calls[1][0]).toBe("string");
    expect(onOpenConnections.mock.calls[1][0]).not.toBe("file:src/app.ts");
  });
});
