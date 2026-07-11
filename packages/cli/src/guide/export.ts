/**
 * `ctx guide --export <dir>` (R9, closer 3f). Renders a self-contained snapshot:
 * every projection JSON is produced through the SAME `PROJECTION_ROUTES` builders
 * the live server uses, so `live ≡ export` holds by construction
 * (G-one-render-path / C12). The index.html inlines a manifest of the written
 * files; the built `packages/guide` app (when present) reads the inlined data in
 * export mode instead of fetching. Files are written 0600 under a 0700 dir
 * (inherited open.ts discipline).
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_KINDS, buildSubjectProjection, type Store } from "@contexa/core";
import { PROJECTION_ROUTES, type GuideContext } from "./routes.ts";

export interface ExportResult {
  dir: string;
  files: string[];
  subjects: number;
}

/** Max subjects materialized into the export (bounded snapshot). */
export const EXPORT_SUBJECT_CAP = 500;

function writeJson(dir: string, stem: string, value: unknown): string {
  const rel = `${stem}.json`;
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2), { mode: 0o600 });
  return rel;
}

/** Stable file stem for a projection route path (`/api/lens/time` → `lens-time`). */
export function stemFor(path: string): string {
  return path.replace(/^\/api\//, "").replace(/\//g, "-");
}

export function exportGuide(store: Store, outDir: string, now: () => number): ExportResult {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  const ctx: GuideContext = { store, now };
  const files: string[] = [];

  // Parameterless projection routes → one JSON each (canvas/inspector/lenses).
  for (const route of PROJECTION_ROUTES) {
    if (route.path === "/api/search" || route.path === "/api/subject") continue;
    const payload = route.build(ctx, new URLSearchParams());
    if (payload) files.push(writeJson(outDir, stemFor(route.path), payload));
  }

  // Subjects: one JSON per entity (bounded), so any Subject page renders offline.
  const subjectsDir = join(outDir, "subjects");
  mkdirSync(subjectsDir, { recursive: true, mode: 0o700 });
  const index: Array<{ entityId: string; kind: string; name: string }> = [];
  let count = 0;
  for (const kind of ALL_KINDS) {
    for (const entity of store.entitiesByKind(kind)) {
      if (count >= EXPORT_SUBJECT_CAP) break;
      const proj = buildSubjectProjection(store, entity.id, now());
      if (!proj) continue;
      const safe = entity.id.replace(/[^a-zA-Z0-9._-]/g, "_");
      writeFileSync(join(subjectsDir, `${safe}.json`), JSON.stringify(proj, null, 2), {
        mode: 0o600,
      });
      index.push({ entityId: entity.id, kind: entity.kind, name: entity.name });
      count += 1;
    }
    if (count >= EXPORT_SUBJECT_CAP) break;
  }
  files.push(writeJson(outDir, "subjects-index", index));

  // Self-contained offline index.html (zero external URLs).
  const html = exportIndexHtml(files);
  writeFileSync(join(outDir, "index.html"), html, { mode: 0o600 });
  files.push("index.html");

  return { dir: outDir, files, subjects: count };
}

function exportIndexHtml(files: string[]): string {
  const manifest = JSON.stringify(files);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>ctx guide (export)</title>
<style>body{margin:0;background:#16181d;color:#e6e8ec;font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
main{padding:16px;max-width:900px}code{font-family:ui-monospace,monospace}</style></head>
<body><main>
<p style="color:#9aa0aa;font-size:12px">accelerator, not validated</p>
<h1>ctx guide — exported snapshot</h1>
<p>Self-contained, offline. Projection JSON files in this directory:</p>
<ul id="files"></ul>
<script>
  const files = ${manifest};
  const ul = document.getElementById("files");
  for (const f of files) { const li=document.createElement("li");
    const a=document.createElement("a"); a.href=f; a.textContent=f;
    a.className="code"; li.appendChild(a); ul.appendChild(li); }
</script>
</main></body></html>
`;
}
