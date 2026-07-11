/**
 * C11 — skin switch changes ONLY the design-system layer. The DOM/data structure
 * a surface renders must be identical across skins (design §8: routes, projections,
 * DOM structure, glyph grammar, copy are fixed; only tokens + component-skin CSS
 * differ). We render the SAME component under every skin and assert its innerHTML
 * is byte-identical; only `documentElement[data-skin]` changes.
 */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EnvelopeChip } from "../src/components/EnvelopeChip.tsx";
import { ClaimLegend } from "../src/components/ClaimLegend.tsx";
import { SKINS, applySkin } from "../src/skins.ts";
import { makeEnvelope, makeEvidence } from "./helpers/evidence.ts";

const ENV = makeEnvelope({ confidence: "LIKELY" });
const evidencePacket = makeEvidence;

/** Strip React's incremental useId counter so only design-layer diffs remain. */
const norm = (html: string): string => html.replace(/_r_[0-9a-z]+_/g, "_id_");

describe("skin switch (C11)", () => {
  test("chip DOM is identical across all skins; only data-skin changes", () => {
    const html: string[] = [];
    for (const skin of SKINS) {
      applySkin(skin);
      expect(document.documentElement.getAttribute("data-skin")).toBe(skin);
      const { container, unmount } = render(<EnvelopeChip evidence={evidencePacket(ENV)} />);
      html.push(norm(container.innerHTML));
      unmount();
    }
    for (const h of html) expect(h).toBe(html[0]);
  });

  test("legend DOM (structure + copy + counts) is identical across skins", () => {
    const counts = { resolved: 3, conflicting: 1, stale: 2, unavailable: 0, restricted: 0, unknown: 4 };
    const html: string[] = [];
    for (const skin of SKINS) {
      applySkin(skin);
      const { container, unmount } = render(
        <ClaimLegend counts={counts} active={new Set()} onToggle={() => {}} />,
      );
      html.push(norm(container.innerHTML));
      unmount();
    }
    for (const h of html) expect(h).toBe(html[0]);
  });
});
