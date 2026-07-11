/**
 * Guide route table — the SINGLE place every guide response is produced, from the
 * in-process core projection kernel (never a child process). Used by BOTH the live
 * loopback server and the `--export` renderer, so live ≡ export by construction
 * (G-one-render-path). Every handler is READ-ONLY (G-readonly): it calls only
 * projection builders (store reads) and returns JSON — no route writes the store.
 */
import {
  buildCanvasProjection,
  buildChurnLensProjection,
  buildInspectorProjection,
  buildSearchProjection,
  buildSubjectProjection,
  buildTimeLensProjection,
  type AnyProjection,
} from "@contexa/core";
import type { EntityKind, Store } from "@contexa/core";

export interface GuideContext {
  store: Store;
  now: () => number;
}

/** A read-only projection route: name → JSON payload built from the store. */
export interface ProjectionRoute {
  /** URL path under the server root (also the export file stem). */
  path: string;
  build: (ctx: GuideContext, params: URLSearchParams) => AnyProjection | undefined;
}

/** The fixed projection route table (both live API and export iterate it). */
export const PROJECTION_ROUTES: ProjectionRoute[] = [
  { path: "/api/canvas", build: (c) => buildCanvasProjection(c.store, c.now()) },
  { path: "/api/inspector", build: (c) => buildInspectorProjection(c.store, c.now()) },
  { path: "/api/lens/time", build: (c) => buildTimeLensProjection(c.store, c.now()) },
  { path: "/api/lens/churn", build: (c) => buildChurnLensProjection(c.store, c.now()) },
  {
    path: "/api/search",
    build: (c, p) => {
      const query = p.get("q") ?? "";
      const kindsRaw = p.get("kinds");
      const kinds = kindsRaw ? (kindsRaw.split(",").filter(Boolean) as EntityKind[]) : null;
      return buildSearchProjection(c.store, query, kinds, c.now());
    },
  },
  {
    path: "/api/subject",
    build: (c, p) => {
      const ref = p.get("ref");
      if (!ref) return undefined;
      return buildSubjectProjection(c.store, ref, c.now());
    },
  },
];

export const PROJECTION_PATHS = PROJECTION_ROUTES.map((r) => r.path);

/** Mutating HTTP methods that the guide NEVER accepts on a store route (G-readonly). */
export const READONLY_METHODS = ["GET", "HEAD"] as const;
