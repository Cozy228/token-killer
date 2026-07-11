/**
 * Projection client — the guide is a VIEW; it fetches typed DTOs from the
 * token-gated loopback server over the SESSION COOKIE (R12: the one-time bootstrap
 * token was already swapped for an HttpOnly cookie and stripped from the URL, so
 * ongoing requests carry no token — `credentials: "same-origin"` sends the cookie).
 * In export mode the server is absent: projections are read from an inlined blob,
 * through the SAME component tree (G-one-render-path). No external origin is ever
 * contacted (G-egress: connect-src 'self').
 */
import type {
  CanvasProjection,
  EntityKind,
  InspectorProjection,
  SearchProjection,
  SubjectProjection,
} from "@contexa/core";

/** Export-mode inlined data (set by the exported index.html), when present. */
interface ExportBlob {
  canvas?: CanvasProjection;
  inspector?: InspectorProjection;
  subjects?: Record<string, SubjectProjection>;
  /** Flat entity index for offline search (name + kind + id). */
  searchIndex?: Array<{ entityId: string; kind: EntityKind; name: string }>;
}
function exportBlob(): ExportBlob | undefined {
  return (window as unknown as { __CTX_GUIDE_EXPORT__?: ExportBlob }).__CTX_GUIDE_EXPORT__;
}
export function isExportMode(): boolean {
  return exportBlob() !== undefined;
}

export class NotFoundError extends Error {}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function getCanvas(): Promise<CanvasProjection> {
  const blob = exportBlob();
  if (blob?.canvas) return blob.canvas;
  return fetchJson<CanvasProjection>("api/canvas");
}

export async function getInspector(): Promise<InspectorProjection> {
  const blob = exportBlob();
  if (blob?.inspector) return blob.inspector;
  return fetchJson<InspectorProjection>("api/inspector");
}

export async function getSubject(ref: string): Promise<SubjectProjection | undefined> {
  const blob = exportBlob();
  if (blob?.subjects) return blob.subjects[ref];
  try {
    return await fetchJson<SubjectProjection>(`api/subject?ref=${encodeURIComponent(ref)}`);
  } catch (e) {
    if (e instanceof NotFoundError) return undefined;
    throw e;
  }
}

export async function getSearch(
  query: string,
  kinds: EntityKind[] | null,
): Promise<SearchProjection> {
  const blob = exportBlob();
  if (blob?.searchIndex) return offlineSearch(blob, query, kinds);
  const kindParam = kinds && kinds.length > 0 ? `&kinds=${kinds.join(",")}` : "";
  return fetchJson<SearchProjection>(`api/search?q=${encodeURIComponent(query)}${kindParam}`);
}

/** Offline substring search over the inlined index (export mode has no FTS server). */
function offlineSearch(
  blob: ExportBlob,
  query: string,
  kinds: EntityKind[] | null,
): SearchProjection {
  const q = query.trim().toLowerCase();
  const kindSet = kinds && kinds.length > 0 ? new Set(kinds) : null;
  const idx = blob.searchIndex ?? [];
  const meta = blob.canvas?.meta ?? { disclosure: "", generatedAt: Date.now() };
  const hits = q
    ? idx
        .filter((e) => (!kindSet || kindSet.has(e.kind)) && e.name.toLowerCase().includes(q))
        .slice(0, 40)
        .map((e) => {
          const subj = blob.subjects?.[e.entityId];
          return {
            entityId: e.entityId,
            kind: e.kind,
            name: e.name,
            handle: e.entityId,
            evidence: subj!.evidence,
          };
        })
        .filter((h) => h.evidence !== undefined)
    : [];
  return {
    kind: "search",
    meta,
    query,
    kinds,
    hits,
    budget: {
      budget: { edgePredicates: [], depth: 0, nodeCap: 40 },
      omitted: 0,
      omittedByReason: {},
    },
  };
}
