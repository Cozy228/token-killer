/**
 * Published-generation visibility (CONTEXA-IMPL §2: "Selection reads links, never
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
      // Generation gate (CONTEXA-IMPL §2).
      const genOk =
        entity.kind === "file"
          ? entity.gen <= Math.max(published("git"), published("docs"), published("memory"))
          : (() => {
              const source = KIND_SOURCE[entity.kind];
              if (source === undefined) return true; // unmapped kind: fail open (M1 has none)
              return entity.gen <= published(source);
            })();
      if (!genOk) return false;
      // A1 status gate: `retired` memory is hard-excluded from default pull.
      // superseded / needs-review stay VISIBLE (down-ranked in rank.ts + flagged
      // in project.ts) so "what did we believe before" and drifted-but-relevant
      // gotchas remain answerable; only `retired` disappears. recall() bypasses
      // visibility entirely, so a retired entry stays recoverable by handle.
      if (entity.kind === "memory" && store.getMemory(entity.id)?.status === "retired") {
        return false;
      }
      return true;
    },
  };
}
