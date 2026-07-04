/**
 * Published-generation visibility (CTX-IMPL §2: "Selection reads links, never
 * claims; reads are `gen <= published_gen` filtered").
 *
 * Generations are per-source counters; an entity's `gen` was stamped by the
 * source that wrote it, so visibility compares against that source's
 * published_gen. Kind → source is unambiguous except `file`, which both git
 * and docs write — a file entity is visible when EITHER source has published
 * that far (recorded assumption; all-published stores are unaffected).
 */
import type { Store } from "../store/store.ts";
import type { Entity, EntityKind } from "../store/types.ts";
import type { SourceId } from "../ingest/adapter.ts";

const KIND_SOURCE: Readonly<Partial<Record<EntityKind, SourceId>>> = {
  commit: "git",
  decision: "docs",
  doc_section: "docs",
  concept: "docs",
  memory: "memory",
  symbol: "code",
  module: "code",
  pr: "github",
  issue: "github",
  story: "jira",
  meeting: "confluence",
};

export interface Visibility {
  isVisible(entity: Entity): boolean;
}

/** Snapshot the per-source published gens once per selection call. */
export function snapshotVisibility(store: Store): Visibility {
  const cache = new Map<string, number>();
  const published = (source: SourceId): number => {
    let g = cache.get(source);
    if (g === undefined) {
      g = store.publishedGen(source);
      cache.set(source, g);
    }
    return g;
  };
  return {
    isVisible(entity: Entity): boolean {
      if (entity.kind === "file") {
        return entity.gen <= Math.max(published("git"), published("docs"), published("memory"));
      }
      const source = KIND_SOURCE[entity.kind];
      if (source === undefined) return true; // unmapped kind: fail open (M1 has none)
      return entity.gen <= published(source);
    },
  };
}
