/**
 * Projection client — the guide is a VIEW; it fetches typed DTOs from the
 * token-gated loopback server (same origin, cookie + bearer). In export mode the
 * server is absent: projections are read from inlined JSON, through the SAME
 * component tree (G-one-render-path). No external origins are ever contacted
 * (G-egress: connect-src 'self').
 */
import type {
  CanvasProjection,
  ChurnLensProjection,
  InspectorProjection,
  SearchProjection,
  SubjectProjection,
  TimeLensProjection,
} from "@contexa/core";

/** Entry token (from the URL the server opened); also set as an HttpOnly cookie. */
function entryToken(): string {
  try {
    return new URLSearchParams(window.location.search).get("token") ?? "";
  } catch {
    return "";
  }
}

/** Export-mode inlined data (set by the exported index.html), when present. */
interface ExportBlob {
  canvas?: CanvasProjection;
  inspector?: InspectorProjection;
  "lens-time"?: TimeLensProjection;
  "lens-churn"?: ChurnLensProjection;
  subjects?: Record<string, SubjectProjection>;
}
function exportBlob(): ExportBlob | undefined {
  return (window as unknown as { __CTX_GUIDE_EXPORT__?: ExportBlob }).__CTX_GUIDE_EXPORT__;
}
export function isExportMode(): boolean {
  return exportBlob() !== undefined;
}

async function fetchJson<T>(path: string): Promise<T> {
  const token = entryToken();
  const res = await fetch(path, {
    credentials: "include",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export class NotFoundError extends Error {}

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
export async function getTimeLens(): Promise<TimeLensProjection> {
  const blob = exportBlob();
  if (blob?.["lens-time"]) return blob["lens-time"]!;
  return fetchJson<TimeLensProjection>("api/lens/time");
}
export async function getChurnLens(): Promise<ChurnLensProjection> {
  const blob = exportBlob();
  if (blob?.["lens-churn"]) return blob["lens-churn"]!;
  return fetchJson<ChurnLensProjection>("api/lens/churn");
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
export async function getSearch(query: string): Promise<SearchProjection> {
  return fetchJson<SearchProjection>(`api/search?q=${encodeURIComponent(query)}`);
}
