/**
 * M3 guide — projection kernel public surface (brief §2). Core owns the query
 * truth; the guide server (packages/cli) and the React app (packages/guide) are
 * VIEWS that consume these DTOs. Perf-wrapped builders record per-projection
 * numbers (G-perf-recorded) without asserting a threshold.
 */
import type { Store } from "../store/store.ts";
import type { EntityKind } from "../store/types.ts";
import { recordProjection, type ProjectionPerf } from "./perf.ts";
import {
  buildCanvasProjection,
  buildChurnLensProjection,
  buildInspectorProjection,
  buildSearchProjection,
  buildSubjectProjection,
  buildTimeLensProjection,
} from "./builders.ts";
import type {
  CanvasProjection,
  ChurnLensProjection,
  InspectorProjection,
  SearchProjection,
  SubjectProjection,
  TimeLensProjection,
} from "./types.ts";

export * from "./types.ts";
export * from "./glyphs.ts";
export { recordProjection, formatPerf } from "./perf.ts";
export type { ProjectionPerf, PerfCounts } from "./perf.ts";
export {
  ALL_KINDS,
  GUIDE_SOURCES,
  resolveSubject,
  buildCanvasProjection,
  buildTimeLensProjection,
  buildChurnLensProjection,
  buildSubjectProjection,
  buildInspectorProjection,
  buildSearchProjection,
} from "./builders.ts";

export interface Perfed<T> {
  value: T;
  perf: ProjectionPerf;
}

export function canvasWithPerf(store: Store, now: number): Perfed<CanvasProjection> {
  return recordProjection(
    "canvas",
    () => buildCanvasProjection(store, now),
    (v) => ({
      nodeCount: v.clusters.reduce((a, c) => a + c.members.length, 0) + v.hotAreas.length,
      linkCount: v.hotAreas.reduce((a, h) => a + h.heat, 0),
      omittedCount: v.budget.omitted,
    }),
  );
}

export function timeLensWithPerf(store: Store, now: number): Perfed<TimeLensProjection> {
  return recordProjection(
    "time-lens",
    () => buildTimeLensProjection(store, now),
    (v) => ({
      nodeCount: v.chains.length,
      linkCount: v.chains.length,
      omittedCount: v.budget.omitted,
    }),
  );
}

export function churnLensWithPerf(store: Store, now: number): Perfed<ChurnLensProjection> {
  return recordProjection(
    "churn-lens",
    () => buildChurnLensProjection(store, now),
    (v) => ({
      nodeCount: v.clusters.reduce((a, c) => a + c.members.length, 0),
      linkCount: v.clusters.length,
      omittedCount: v.budget.omitted,
    }),
  );
}

export function subjectWithPerf(
  store: Store,
  ref: string,
  now: number,
): Perfed<SubjectProjection | undefined> {
  return recordProjection(
    "subject",
    () => buildSubjectProjection(store, ref, now),
    (v) => ({
      nodeCount: v ? v.neighborhood.nodes.length : 0,
      linkCount: v ? v.neighborhood.edges.length : 0,
      omittedCount: v ? v.budget.omitted : 0,
    }),
  );
}

export function inspectorWithPerf(store: Store, now: number): Perfed<InspectorProjection> {
  return recordProjection(
    "inspector",
    () => buildInspectorProjection(store, now),
    (v) => ({
      nodeCount: v.reviewQueue.length + v.memoryBrowser.entries.length + v.health.sources.length,
      linkCount: v.conflicts.reduce((a, g) => a + g.items.length, 0),
      omittedCount: v.budget.omitted,
    }),
  );
}

export function searchWithPerf(
  store: Store,
  query: string,
  kinds: EntityKind[] | null,
  now: number,
): Perfed<SearchProjection> {
  return recordProjection(
    "search",
    () => buildSearchProjection(store, query, kinds, now),
    (v) => ({
      nodeCount: v.hits.length,
      linkCount: 0,
      omittedCount: v.budget.omitted,
    }),
  );
}
