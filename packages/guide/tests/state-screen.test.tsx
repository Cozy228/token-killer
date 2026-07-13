import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StateScreen } from "../src/ui/StateScreen.js";

afterEach(cleanup);

describe("StateScreen", () => {
  it("names ctx sync in the empty state", () => {
    render(<StateScreen state={{ kind: "empty" }} />);
    expect(screen.getByText("ctx sync")).toBeTruthy();
  });

  it("renders the error detail", () => {
    render(<StateScreen state={{ kind: "error", detail: "corpus fetch failed: HTTP 500" }} />);
    expect(screen.getByText(/corpus fetch failed: HTTP 500/)).toBeTruthy();
  });

  it("renders a distinct loading state", () => {
    render(<StateScreen state={{ kind: "loading" }} />);
    expect(screen.getByText(/Loading Atlas projection/)).toBeTruthy();
  });
});
