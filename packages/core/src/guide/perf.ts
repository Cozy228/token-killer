/**
 * M3 guide — per-projection perf recorder (brief §7, G-perf-recorded).
 *
 * Records latency, node/link/omitted counts and serialized JSON bytes for every
 * projection build. RECORDED, never asserted as a threshold (goal prompt): the
 * deterministic tier records fixture numbers, the living-repo tier records the
 * real repo's numbers — both are deliverables, neither gates.
 */

export interface ProjectionPerf {
  projection: string;
  latencyMs: number;
  nodeCount: number;
  linkCount: number;
  omittedCount: number;
  jsonBytes: number;
}

export interface PerfCounts {
  nodeCount: number;
  linkCount: number;
  omittedCount: number;
}

/**
 * Build a projection while recording its perf. `count` extracts node/link/omitted
 * counts from the built payload; JSON bytes are measured from the serialized DTO
 * (the exact wire size the server would send).
 */
export function recordProjection<T>(
  projection: string,
  build: () => T,
  count: (value: T) => PerfCounts,
): { value: T; perf: ProjectionPerf } {
  const start = performance.now();
  const value = build();
  const latencyMs = performance.now() - start;
  const counts = count(value);
  const jsonBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  return {
    value,
    perf: { projection, latencyMs, ...counts, jsonBytes },
  };
}

/** Format a perf line for the deviation-log deliverable (stable, greppable). */
export function formatPerf(p: ProjectionPerf): string {
  return (
    `${p.projection}: ${p.latencyMs.toFixed(2)}ms · nodes=${p.nodeCount} · ` +
    `links=${p.linkCount} · omitted=${p.omittedCount} · bytes=${p.jsonBytes}`
  );
}
