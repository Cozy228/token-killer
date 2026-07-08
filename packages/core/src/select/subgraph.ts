/**
 * Stage 2 — subgraph extraction (CONTEXA-IMPL §6.2): frontier expansion over
 * `links` (ALL predicates, both directions — the walk is undirected), depth ≤2,
 * node cap 512, frontier priority = parent score × edge confidence.
 *
 * Selection reads links, never claims (§2). Invisible entities (unpublished
 * generation) are never admitted.
 */
import type { Store } from "../store/store.ts";
import type { Entity, Link } from "../store/types.ts";
import {
  DEFAULT_CONFIDENCE_FLOOR,
  EXPANSION_MAX_DEPTH,
  EXPANSION_NODE_CAP,
  PREDICATE_CONFIDENCE_FLOOR,
} from "./constants.ts";
import type { Seed, Subgraph, SubgraphEdge, SubgraphNode } from "./types.ts";
import type { Visibility } from "./visibility.ts";

/** Effective link confidence: per-predicate floor substitutes a missing value (§6.3). */
export function linkConfidence(link: Pick<Link, "predicate" | "confidence">): number {
  const c = link.confidence;
  if (Number.isFinite(c) && c > 0) return Math.min(c, 1);
  return PREDICATE_CONFIDENCE_FLOOR[link.predicate] ?? DEFAULT_CONFIDENCE_FLOOR;
}

interface FrontierItem {
  entityId: string;
  depth: 0 | 1 | 2;
  priority: number;
  confidence: number;
}

export function expandSubgraph(
  store: Store,
  seeds: Seed[],
  visibility: Visibility,
  entityOf: (id: string) => Entity | undefined,
): Subgraph {
  const nodes = new Map<string, SubgraphNode>();
  const maxSeed = seeds.reduce((m, s) => Math.max(m, s.weight), 0) || 1;

  // Priority frontier (small graphs: sort-on-pop is fine at cap 512).
  const frontier: FrontierItem[] = [];
  for (const seed of seeds) {
    const entity = entityOf(seed.entityId);
    if (!entity || !visibility.isVisible(entity)) continue;
    if (nodes.size >= EXPANSION_NODE_CAP) break;
    const priority = seed.weight / maxSeed; // normalized seed score
    nodes.set(seed.entityId, { entityId: seed.entityId, depth: 0, confidence: 1, priority });
    frontier.push({ entityId: seed.entityId, depth: 0, priority, confidence: 1 });
  }

  while (frontier.length > 0 && nodes.size < EXPANSION_NODE_CAP) {
    // pop the highest-priority frontier entry
    let best = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i]!.priority > frontier[best]!.priority) best = i;
    }
    const cur = frontier.splice(best, 1)[0]!;
    if (cur.depth >= EXPANSION_MAX_DEPTH) continue;
    const nextDepth = (cur.depth + 1) as 1 | 2;

    const neighbors: Array<{ id: string; conf: number }> = [];
    for (const l of store.linksFrom(cur.entityId)) {
      neighbors.push({ id: l.dst, conf: linkConfidence(l) });
    }
    for (const l of store.linksTo(cur.entityId)) {
      neighbors.push({ id: l.src, conf: linkConfidence(l) });
    }

    for (const { id, conf } of neighbors) {
      const priority = cur.priority * conf;
      const known = nodes.get(id);
      if (known) {
        // keep the best inbound confidence/priority seen on any path
        if (conf > known.confidence && known.depth > 0) known.confidence = conf;
        if (priority > known.priority && known.depth > 0) known.priority = priority;
        continue;
      }
      if (nodes.size >= EXPANSION_NODE_CAP) break;
      const entity = entityOf(id);
      if (!entity || !visibility.isVisible(entity)) continue;
      nodes.set(id, { entityId: id, depth: nextDepth, confidence: conf, priority });
      frontier.push({ entityId: id, depth: nextDepth, priority, confidence: conf });
    }
  }

  // Induced edge set: linksFrom over every admitted node catches edges whose
  // endpoints were both discovered but never walked (e.g. two depth-2 nodes).
  const edges: SubgraphEdge[] = [];
  for (const id of nodes.keys()) {
    for (const l of store.linksFrom(id)) {
      if (!nodes.has(l.dst)) continue;
      edges.push({ src: l.src, dst: l.dst, predicate: l.predicate, confidence: linkConfidence(l) });
    }
  }
  return { nodes, edges };
}
