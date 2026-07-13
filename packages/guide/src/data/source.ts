/**
 * `GuideDataSource` — the seam (D17).
 *
 * D17 requires live and export to render through ONE path. So the renderer never talks
 * to `fetch`, never reads a global, and never learns which of the two it is looking at:
 * it takes a `GuideDataSource` and asks for projections. Two implementations sit behind
 * this interface and nothing else may:
 *
 *   • `LiveDataSource`     — HTTP to the `ctx guide` loopback server.
 *   • `SnapshotDataSource` — an inlined JSON blob in an exported single file.
 *
 * The moment a component reaches around this seam, export stops being the same product.
 * The seam is built in K2 — before the export closer needs it — precisely so it cannot
 * be retrofitted around later.
 */
import type { BoundedProjection, GuideEvent, GuideStatus, RelationKind } from "./dto.ts";

export interface ScopeQuery {
  path: string;
  /** File ids to expand into their declarations (D27: explicit expand only). */
  expand?: readonly string[];
}

export interface ConnectionsQuery {
  id: string;
  /** Relation kinds to walk. The source's default is the backbone. */
  kinds?: readonly RelationKind[];
}

export interface GuideDataSource {
  /** Which side of the seam this is. The renderer may DISPLAY it; it may not branch on it. */
  readonly mode: "live" | "snapshot";
  /** Current repo + generation. Always answers, including when nothing is servable. */
  status(): Promise<GuideStatus>;
  overview(): Promise<BoundedProjection>;
  scope(query: ScopeQuery): Promise<BoundedProjection>;
  connections(query: ConnectionsQuery): Promise<BoundedProjection>;
  event(event: GuideEvent): Promise<BoundedProjection>;
}

/**
 * The bootstrap credential was missing or rejected. The user reached the server without
 * the token the CLI printed (G-loopback: no route resolves without it).
 */
export class GuideAuthError extends Error {
  readonly kind = "auth" as const;
  constructor(message: string) {
    super(message);
    this.name = "GuideAuthError";
  }
}

/**
 * The store holds no data this checkout may be shown as current — it is `stale` or
 * `empty`. Carries the generation view, whose `reason` explains WHICH and why, in the
 * kernel's own words.
 *
 * This error exists so that "fall back to the mismatched rows and call it live" is not
 * merely discouraged but unreachable: the server refuses to project, and the only thing
 * the renderer can do with the refusal is show the reason.
 */
export class GuideNotServableError extends Error {
  readonly kind = "not-servable" as const;
  readonly status: GuideStatus;
  constructor(status: GuideStatus) {
    super(status.generation.reason);
    this.name = "GuideNotServableError";
    this.status = status;
  }
}

/** The source could not be reached or would not answer (server stopped, transport fault). */
export class GuideSourceError extends Error {
  readonly kind = "source" as const;
  constructor(message: string) {
    super(message);
    this.name = "GuideSourceError";
  }
}
