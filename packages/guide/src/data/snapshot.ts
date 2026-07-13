/**
 * `SnapshotDataSource` — the export side of the D17 seam.
 *
 * An exported guide is this same bundle with a JSON blob inlined into the page (the idea,
 * not the code, is taken from `.research/codewiki`'s self-contained HTML — no licence on
 * that clone, so it is rewritten, per the order's copy discipline). It has no server, so
 * a projection it does not carry cannot be computed on demand — and it says so instead of
 * rendering something emptier and quieter than the truth (D25).
 *
 * The export BUILDER lands with the export closer. The reader lands here, with the seam,
 * because a seam introduced after both sides exist is a seam nobody obeys.
 */
import type { BoundedProjection, GuideEvent, GuideStatus, GuideTree } from "./dto.ts";
import {
  GuideNotServableError,
  GuideSourceError,
  type ConnectionsQuery,
  type GuideDataSource,
  type ScopeQuery,
} from "./source.ts";

/** The inlined blob. Written by the export builder, read here. */
export interface GuideSnapshot {
  status: GuideStatus;
  /** The rail's tree. An export without it would ship a guide you cannot navigate. */
  tree: GuideTree;
  overview: BoundedProjection;
  /** Keyed by scope path. */
  scopes: Record<string, BoundedProjection>;
  /** Keyed by subject entity id. */
  connections: Record<string, BoundedProjection>;
  /** Keyed by `eventKey()`. */
  events: Record<string, BoundedProjection>;
}

/** Stable key for an event, so the builder and the reader agree without coordinating. */
export function eventKey(event: GuideEvent): string {
  const commits = [...(event.commits ?? [])].sort().join(",");
  const anchors = [...(event.anchors ?? [])].sort().join(",");
  return `commits=${commits}&anchors=${anchors}`;
}

declare global {
  interface Window {
    __CTX_GUIDE_SNAPSHOT__?: GuideSnapshot;
  }
}

/** The blob the page was exported with, or `undefined` when this is a live page. */
export function readInlinedSnapshot(): GuideSnapshot | undefined {
  return typeof window === "undefined" ? undefined : window.__CTX_GUIDE_SNAPSHOT__;
}

export class SnapshotDataSource implements GuideDataSource {
  readonly mode = "snapshot" as const;
  readonly #snapshot: GuideSnapshot;

  constructor(snapshot: GuideSnapshot) {
    this.#snapshot = snapshot;
  }

  status(): Promise<GuideStatus> {
    return Promise.resolve(this.#snapshot.status);
  }

  tree(): Promise<GuideTree> {
    const status = this.#snapshot.status;
    if (status.generation.state !== "snapshot" && status.generation.state !== "live") {
      return Promise.reject(new GuideNotServableError(status));
    }
    if (!this.#snapshot.tree) {
      return Promise.reject(
        new GuideSourceError(
          "this exported guide does not include the scope tree. Run `ctx guide` on the " +
            "repository to reach it.",
        ),
      );
    }
    return Promise.resolve(this.#snapshot.tree);
  }

  overview(): Promise<BoundedProjection> {
    return this.#serve(this.#snapshot.overview, "the overview");
  }

  scope(query: ScopeQuery): Promise<BoundedProjection> {
    return this.#serve(this.#snapshot.scopes[query.path], `the scope \`${query.path}\``);
  }

  connections(query: ConnectionsQuery): Promise<BoundedProjection> {
    return this.#serve(this.#snapshot.connections[query.id], `connections for \`${query.id}\``);
  }

  event(event: GuideEvent): Promise<BoundedProjection> {
    const key = eventKey(event);
    return this.#serve(this.#snapshot.events[key], `the change trace \`${key}\``);
  }

  /**
   * One gate for every projection: a snapshot that is not servable never hands over a
   * projection, exactly as the live server never does. Same rule, same seam, one product.
   */
  #serve(projection: BoundedProjection | undefined, what: string): Promise<BoundedProjection> {
    const status = this.#snapshot.status;
    if (status.generation.state !== "snapshot" && status.generation.state !== "live") {
      return Promise.reject(new GuideNotServableError(status));
    }
    if (!projection) {
      return Promise.reject(
        new GuideSourceError(
          `this exported guide does not include ${what}. An export carries the projections it ` +
            "was built with; run `ctx guide` on the repository to reach the rest.",
        ),
      );
    }
    return Promise.resolve(projection);
  }
}
