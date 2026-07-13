/**
 * Relation index (D25) — every store link, stratified, directed, and complete.
 *
 * Two rules the index exists to enforce:
 *
 *  1. EXACTLY ONCE. Every `contains`/`calls`/`imports` link in the store appears in
 *     `all` exactly once. The census test computes both sides from the live store and
 *     asserts equality, so a drop cannot hide behind a hardcoded number.
 *
 *  2. NOTHING FABRICATED. A link whose endpoint has no entity row (measured: 460
 *     `touches` dst, 6 `renamed-to` on both sides) is KEPT and flagged
 *     `srcResolved`/`dstResolved: false`. It is never turned into an invented node
 *     and never quietly discarded.
 *
 * Direction is the link's own `src -> dst` and is never reordered: caller -> callee,
 * importer -> imported, container -> contained, commit -> touched, old -> new. D34
 * makes space express dependency direction, which is only possible if the kernel
 * hands the direction over.
 */
import type { Link } from "../store/types.ts";
import type { Store } from "../store/store.ts";
import {
  RELATION_KINDS,
  RELATION_LAYER,
  type Relation,
  type RelationIndex,
  type RelationKind,
  type RelationLayer,
} from "./types.ts";

/** Store link predicates outside D25's seven kinds — counted, not modelled. */
export const NON_ATLAS_PREDICATES: readonly string[] = ["amends", "supersedes", "defines"];

export function buildRelationIndex(
  store: Store,
  entityIds: ReadonlySet<string>,
): { index: RelationIndex; excluded: { kind: string; count: number }[] } {
  const all: Relation[] = [];
  const byKind = new Map<RelationKind, Relation[]>();
  const byLayer = new Map<RelationLayer, Relation[]>();
  const outgoing = new Map<string, Relation[]>();
  const incoming = new Map<string, Relation[]>();

  for (const kind of RELATION_KINDS) {
    const layer = RELATION_LAYER[kind];
    const bucket: Relation[] = [];
    // Bulk read by predicate: enumerating adjacency per entity would silently miss
    // every link whose SRC has no entity row (6 `renamed-to` today).
    for (const link of store.linksByPredicate(kind)) {
      const relation = toRelation(link, kind, layer, entityIds);
      bucket.push(relation);
      all.push(relation);
      push(outgoing, relation.src, relation);
      push(incoming, relation.dst, relation);
    }
    byKind.set(kind, bucket);
    push(byLayer, layer, ...bucket);
  }

  const excluded: { kind: string; count: number }[] = [];
  for (const predicate of NON_ATLAS_PREDICATES) {
    const count = store.linksByPredicate(predicate).length;
    if (count > 0) excluded.push({ kind: predicate, count });
  }

  return {
    index: { all, byKind, byLayer, outgoing, incoming },
    excluded,
  };
}

function toRelation(
  link: Link,
  kind: RelationKind,
  layer: RelationLayer,
  entityIds: ReadonlySet<string>,
): Relation {
  return {
    src: link.src,
    dst: link.dst,
    kind,
    layer,
    claimId: link.claimId,
    method: link.method,
    linkConfidence: link.confidence,
    stale: link.stale,
    srcResolved: entityIds.has(link.src),
    dstResolved: entityIds.has(link.dst),
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, ...values: V[]): void {
  if (values.length === 0) return;
  const existing = map.get(key);
  if (existing) existing.push(...values);
  else map.set(key, [...values]);
}

/** Relations of `id` in either direction, restricted to `kinds`. */
export function relationsOf(
  index: RelationIndex,
  id: string,
  kinds: readonly RelationKind[],
): { inbound: Relation[]; outbound: Relation[] } {
  const wanted = new Set(kinds);
  return {
    inbound: (index.incoming.get(id) ?? []).filter((r) => wanted.has(r.kind)),
    outbound: (index.outgoing.get(id) ?? []).filter((r) => wanted.has(r.kind)),
  };
}
