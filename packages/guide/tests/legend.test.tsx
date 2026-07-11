/**
 * D3 — Claim Legend count determinism + pinned semantic. The legend counts
 * ENTITIES whose claim envelope has each status ON THE CURRENT projection
 * (derived via `statusCounts`), NOT store conflict-rows (`badges.openConflicts`,
 * the drifting source of the reviewer-found 1→3 bug). Same projection in → same
 * counts out, across fresh mounts and repeated calls; the conflicting count equals
 * the number of conflicting envelopes in the projection it claims to count.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { statusCounts } from "../src/util.ts";
import { ClaimLegend } from "../src/components/ClaimLegend.tsx";
import { makeEnvelope, makeEvidence } from "./helpers/evidence.ts";

afterEach(cleanup);

/** A canvas-shaped projection with a known status distribution across its members. */
function fixtureProjection() {
  const member = (id: string, status: string) => ({
    entityId: id,
    name: id,
    handle: id,
    evidence: makeEvidence(makeEnvelope({ status: status as never })),
  });
  return {
    kind: "canvas",
    clusters: [
      { id: "c:memory", members: [member("mem:a", "conflicting"), member("mem:b", "resolved")] },
      { id: "c:symbol", members: [member("sym:x", "resolved"), member("sym:y", "stale")] },
    ],
    // an intentionally repeated status elsewhere in the payload must still be counted once-per-packet
    hotAreas: [{ entityId: "sym:x", name: "x", handle: "sym:x", heat: 3 }],
    badges: { needsReview: 1, openConflicts: 99, e8StaleSources: [], perSource: [] },
  };
}

const norm = (html: string): string => html.replace(/_r_[0-9a-z]+_/g, "_id_");

describe("Claim Legend counts (D3)", () => {
  test("statusCounts is deterministic across repeated calls on the same projection", () => {
    const proj = fixtureProjection();
    const a = statusCounts(proj);
    const b = statusCounts(proj);
    expect(a).toEqual(b);
    expect(a).toEqual({ conflicting: 1, resolved: 2, stale: 1 });
  });

  test("count equals the number of conflicting envelopes in the projection (NOT openConflicts rows)", () => {
    const proj = fixtureProjection();
    const counts = statusCounts(proj);
    // ground truth: exactly one conflicting envelope in the projection
    expect(counts.conflicting).toBe(1);
    // and it is decoupled from the store conflict-row badge (99) that caused the drift
    expect(counts.conflicting).not.toBe(proj.badges.openConflicts);
  });

  test("legend renders identical counts across two fresh mounts (no accumulation)", () => {
    const proj = fixtureProjection();
    const renderOnce = () => {
      const counts = statusCounts(proj);
      const { container, unmount } = render(
        <ClaimLegend counts={counts} active={new Set()} onToggle={() => {}} />,
      );
      const html = norm(container.innerHTML);
      unmount();
      return html;
    };
    const first = renderOnce();
    const second = renderOnce();
    expect(second).toBe(first);
    // the conflicting row shows exactly 1
    expect(first).toMatch(/conflicting<\/span><span class="count mono">1</);
  });
});
