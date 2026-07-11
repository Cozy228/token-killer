/**
 * Envelope glyph chip — G-honest-gap + provenance rendering (design §3). Null
 * trust axes render `?` + "unknown" as disclosed gaps (never fabricated); the
 * popover's first line is the EXACT terse string; the aria-label spells out every
 * axis (color is never the only channel).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

afterEach(cleanup);
import type { ClaimEnvelope } from "@contexa/core";
import { EnvelopeChip } from "../src/components/EnvelopeChip.tsx";
import { makeEnvelope, makeEvidence } from "./helpers/evidence.ts";

const env = (o: Partial<ClaimEnvelope> = {}): ClaimEnvelope => makeEnvelope(o);
const evidencePacket = makeEvidence;

describe("EnvelopeChip", () => {
  test("renders the exact terse string verbatim in the popover", () => {
    const pkt = evidencePacket(env({}));
    render(<EnvelopeChip evidence={pkt} />);
    expect(screen.getByRole("tooltip").textContent).toContain(pkt.terse);
  });

  test("G-honest-gap: null derivation + confidence render as disclosed gaps, not values", () => {
    const pkt = evidencePacket(env({ derivation: null, confidence: null }));
    render(<EnvelopeChip evidence={pkt} />);
    const chip = screen.getByRole("button");
    // popover discloses "unknown" for both axes, never a fabricated value
    const pop = screen.getByRole("tooltip");
    expect(pop.textContent).toContain("unknown");
    // the collapsed chip shows a `?` for the null confidence axis
    expect(chip.textContent).toContain("?");
    // and the mark uses the null shape (hollow square), verified via class
    expect(chip.querySelector(".mark-null")).not.toBeNull();
  });

  test("aria-label spells out every axis (color is never the only channel)", () => {
    const pkt = evidencePacket(env({ status: "conflicting", confidence: "LIKELY" }));
    render(<EnvelopeChip evidence={pkt} />);
    const label = screen.getByRole("button").getAttribute("aria-label") ?? "";
    expect(label).toContain("derivation observed");
    expect(label).toContain("confidence likely");
    expect(label).toContain("status conflicting");
  });

  test("restricted disclosure shows a lock affordance", () => {
    const pkt = evidencePacket(env({ disclosure: "restricted" }));
    render(<EnvelopeChip evidence={pkt} />);
    expect(screen.getByRole("button").querySelector(".lock")).not.toBeNull();
  });

  test("compat-shadow gaps are tagged, not hidden", () => {
    const pkt = evidencePacket(env({ derivation: null }));
    render(<EnvelopeChip evidence={pkt} />);
    expect(screen.getByRole("tooltip").textContent).toContain("compat shadow");
  });
});
