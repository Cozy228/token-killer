/**
 * Stage 3a — personalized PageRank (CONTEXA-IMPL §6.3, codegraph's
 * production-tuned constants): undirected adjacency over the subgraph, restart
 * probability α=0.25, 25 fixed power iterations (deterministic — no early
 * exit), DANGLING NODES KEEP THEIR MASS, teleport vector = normalized seed
 * scores with uniform fallback when no seed landed in the subgraph.
 *
 * Zero-dependency pure function; mass is conserved every iteration
 * (Σ scores = 1), which the §10 property tests pin.
 */
import { PPR_ALPHA, PPR_ITERATIONS } from "./constants.ts";

export interface PprEdge {
  src: string;
  dst: string;
  /** Edge weight (link confidence). Non-positive edges are ignored. */
  weight: number;
}

export interface PprOptions {
  alpha?: number; // restart probability
  iterations?: number;
  /** Teleport bias: entityId → seed mass (unnormalized). Empty → uniform. */
  seeds?: Map<string, number>;
}

export function personalizedPageRank(
  nodeIds: readonly string[],
  edges: readonly PprEdge[],
  opts: PprOptions = {},
): Map<string, number> {
  const alpha = opts.alpha ?? PPR_ALPHA;
  const iterations = opts.iterations ?? PPR_ITERATIONS;
  const n = nodeIds.length;
  if (n === 0) return new Map();

  const idx = new Map<string, number>();
  nodeIds.forEach((id, i) => idx.set(id, i));

  // Undirected adjacency (§6.3): each edge contributes both directions.
  const adjDst: number[][] = Array.from({ length: n }, () => []);
  const adjW: number[][] = Array.from({ length: n }, () => []);
  const outSum = new Float64Array(n);
  const addArc = (s: number, d: number, w: number): void => {
    adjDst[s]!.push(d);
    adjW[s]!.push(w);
    outSum[s]! += w;
  };
  for (const e of edges) {
    const s = idx.get(e.src);
    const d = idx.get(e.dst);
    if (s === undefined || d === undefined || !(e.weight > 0)) continue;
    addArc(s, d, e.weight);
    if (s !== d) addArc(d, s, e.weight);
  }

  // Teleport vector: normalized seed scores; uniform fallback (§6.3).
  const p = new Float64Array(n);
  let pMass = 0;
  if (opts.seeds) {
    for (const [id, mass] of opts.seeds) {
      const i = idx.get(id);
      if (i !== undefined && mass > 0) {
        p[i]! += mass;
        pMass += mass;
      }
    }
  }
  if (pMass > 0) {
    for (let i = 0; i < n; i++) p[i]! /= pMass;
  } else {
    p.fill(1 / n);
  }

  // Start from the teleport distribution (seed-biased start).
  let r = Float64Array.from(p);
  let next = new Float64Array(n);

  for (let it = 0; it < iterations; it++) {
    // teleport share
    for (let i = 0; i < n; i++) next[i] = alpha * p[i]!;
    // walk share; dangling nodes KEEP their walk mass (§6.3)
    for (let s = 0; s < n; s++) {
      const mass = (1 - alpha) * r[s]!;
      if (outSum[s]! === 0) {
        next[s]! += mass;
        continue;
      }
      const dsts = adjDst[s]!;
      const ws = adjW[s]!;
      const share = mass / outSum[s]!;
      for (let k = 0; k < dsts.length; k++) next[dsts[k]!]! += share * ws[k]!;
    }
    [r, next] = [next, r];
  }

  const out = new Map<string, number>();
  nodeIds.forEach((id, i) => out.set(id, r[i]!));
  return out;
}
