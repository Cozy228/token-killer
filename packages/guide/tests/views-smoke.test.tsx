/**
 * Views smoke — render Subject / Review / CommandPalette against mocked
 * projections and assert they mount with real-shaped data (no runtime crash) and
 * surface the load-bearing bits: a subject's facts + neighborhood budget, the
 * review queue's exact CLI command, and a search hit. React Flow is stubbed
 * (happy-dom has no layout engine); the projection wiring is what we exercise.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { InspectorProjection, SubjectProjection, SearchProjection } from "@contexa/core";
import { AppContext, type AppState } from "../src/appContext.ts";
import { makeEvidence, makeEnvelope } from "./helpers/evidence.ts";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="rf">{children}</div>,
  Background: () => null,
}));

const ev = () => makeEvidence(makeEnvelope({ status: "resolved" }));

const subject: SubjectProjection = {
  kind: "subject",
  meta: { disclosure: "accelerator", generatedAt: 0 },
  subject: { entityId: "sym:x", kind: "symbol", name: "claimEnvelopeFor", handle: "sym:x" },
  evidence: ev(),
  facts: [{ label: "calls", value: "hasStaleEdge", handle: "sym:y", entityId: "sym:y", evidence: ev() }],
  decisionChain: [],
  history: [],
  neighborhood: {
    nodes: [{ entityId: "sym:x", name: "claimEnvelopeFor", kind: "symbol", handle: "sym:x", depth: 0 }],
    edges: [],
  },
  budget: { budget: { edgePredicates: ["calls"], depth: 1, nodeCap: 24 }, omitted: 0, omittedByReason: {} },
};

const inspector: InspectorProjection = {
  kind: "inspector",
  meta: { disclosure: "accelerator", generatedAt: 0 },
  reviewQueue: [{ entityId: "mem:1", handle: "m6c601", gist: "a note to confirm", cliCommand: "ctx memory confirm m6c601", evidence: ev() }],
  conflicts: [{ reasonClass: "stale-suspect", items: [{ a: 1, b: 2, subjectA: "A", subjectB: "B", cliCommand: "ctx memory confirm A" }] }],
  pushPreview: { digestText: "<!-- ctx:managed -->", bytes: 205, budgetBytes: 1024, pins: [], vetoes: [], omittedGotchas: 0 },
  memoryBrowser: { zones: { mainline: 0, overlay: 103, unknown: 0 }, entries: [] },
  health: { sources: [{ source: "code", publishedGen: 3, stale: false, cursorPosition: "abc" }], needsReview: 103, openConflicts: 7 },
  budget: { budget: { edgePredicates: [], depth: 0, nodeCap: 500 }, omitted: 0, omittedByReason: {} },
};

const searchProj: SearchProjection = {
  kind: "search",
  meta: { disclosure: "accelerator", generatedAt: 0 },
  query: "envelope",
  kinds: null,
  hits: [{ entityId: "sym:e", kind: "symbol", name: "envelope", handle: "sym:e", evidence: ev() }],
  budget: { budget: { edgePredicates: [], depth: 0, nodeCap: 40 }, omitted: 492, omittedByReason: { "node-cap": 492 } },
};

vi.mock("../src/api.ts", () => ({
  getSubject: async () => subject,
  getInspector: async () => inspector,
  getSearch: async () => searchProj,
  getCanvas: async () => ({}),
  isExportMode: () => false,
  NotFoundError: class extends Error {},
}));

const app: AppState = { openEvidence: () => {}, focus: null, toggleFocus: () => {}, setScope: () => {} };
const wrap = (node: React.ReactElement) => <AppContext.Provider value={app}>{node}</AppContext.Provider>;

afterEach(cleanup);

describe("views smoke", () => {
  test("Subject renders facts + bounded neighborhood budget", async () => {
    const { Subject } = await import("../src/views/Subject.tsx");
    render(wrap(<Subject refId="claimEnvelopeFor" />));
    await waitFor(() => expect(screen.getByText("claimEnvelopeFor")).toBeTruthy());
    expect(screen.getByText("hasStaleEdge")).toBeTruthy();
    expect(screen.getByText(/depth 1/)).toBeTruthy();
  });

  test("Review queue shows the exact copyable CLI command (never executed)", async () => {
    const { Review } = await import("../src/views/Review.tsx");
    render(wrap(<Review tab="queue" />));
    await waitFor(() => expect(screen.getByText("ctx memory confirm m6c601")).toBeTruthy());
  });

  test("CommandPalette returns a real hit and offers subjects", async () => {
    const { CommandPalette } = await import("../src/components/CommandPalette.tsx");
    render(wrap(<CommandPalette onClose={() => {}} />));
    const input = screen.getByLabelText("Search query") as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "envelope" } });
    await waitFor(() => expect(screen.getByText("envelope")).toBeTruthy());
  });
});
