/**
 * `ctx guide --export <dir>` (R9) — a self-contained offline snapshot rendered
 * through the SAME components as the live server (G-one-render-path / C12):
 *   - every projection JSON is produced through the SAME `PROJECTION_ROUTES`
 *     builders the live server uses, so `live ≡ export` holds by construction;
 *   - when the built `packages/guide` bundle is available, the exported index.html
 *     mounts THAT bundle with the projections inlined as `window.__CTX_GUIDE_EXPORT__`,
 *     so the offline snapshot renders with the real React surfaces (the app's
 *     `api.ts` reads the blob instead of fetching). No external URL is ever emitted
 *     (assets + fonts are copied in, relative — G-egress).
 * Files are written 0600 under a 0700 dir (inherited open.ts discipline).
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_KINDS,
  buildSubjectProjection,
  type EntityKind,
  type Store,
  type SubjectProjection,
} from "@contexa/core";
import { PROJECTION_ROUTES, type GuideContext } from "./routes.ts";

export interface ExportResult {
  dir: string;
  files: string[];
  subjects: number;
  /** True when the built guide bundle was mounted (offline React render). */
  mountedBundle: boolean;
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

export function exportGuide(
  store: Store,
  outDir: string,
  now: () => number,
  distDir?: string,
): ExportResult {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  const ctx: GuideContext = { store, now };
  const files: string[] = [];
  const payloadByStem = new Map<string, unknown>();

  // Parameterless projection routes → one JSON each (canvas/inspector/lenses).
  for (const route of PROJECTION_ROUTES) {
    if (route.path === "/api/search" || route.path === "/api/subject") continue;
    const payload = route.build(ctx, new URLSearchParams());
    if (payload) {
      const stem = stemFor(route.path);
      payloadByStem.set(stem, payload);
      files.push(writeJson(outDir, stem, payload));
    }
  }

  // Subjects: one JSON per entity (bounded), so any Subject page renders offline.
  const subjectsDir = join(outDir, "subjects");
  mkdirSync(subjectsDir, { recursive: true, mode: 0o700 });
  const index: Array<{ entityId: string; kind: EntityKind; name: string }> = [];
  const subjectsBlob: Record<string, SubjectProjection> = {};
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
      subjectsBlob[entity.id] = proj;
      index.push({ entityId: entity.id, kind: entity.kind, name: entity.name });
      count += 1;
    }
    if (count >= EXPORT_SUBJECT_CAP) break;
  }
  files.push(writeJson(outDir, "subjects-index", index));

  // One-render-path: mount the built bundle with the projections inlined, when a
  // build is present. Otherwise emit a minimal offline listing (dev / no build).
  const bundleIndex = distDir ? join(distDir, "index.html") : undefined;
  let mountedBundle = false;
  if (bundleIndex && existsSync(bundleIndex)) {
    // Copy hashed assets (js/css/fonts) next to index.html — relative, offline.
    const assetsSrc = join(distDir!, "assets");
    if (existsSync(assetsSrc)) cpSync(assetsSrc, join(outDir, "assets"), { recursive: true });
    const blob = {
      canvas: payloadByStem.get("canvas"),
      inspector: payloadByStem.get("inspector"),
      subjects: subjectsBlob,
      searchIndex: index,
    };
    const inline = `<script>window.__CTX_GUIDE_EXPORT__=${jsonForScript(blob)};</script>`;
    const shell = readFileSync(bundleIndex, "utf8");
    const html = shell.includes("<head>")
      ? shell.replace("<head>", `<head>${inline}`)
      : inline + shell;
    writeFileSync(join(outDir, "index.html"), html, { mode: 0o600 });
    mountedBundle = true;
  } else {
    writeFileSync(join(outDir, "index.html"), exportListingHtml(files), { mode: 0o600 });
  }
  files.push("index.html");

  return { dir: outDir, files, subjects: count, mountedBundle };
}

/** Serialize JSON safely for inlining inside a <script> tag. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/[\u2028\u2029]/g, "");
}

/** Minimal offline listing page (no build present). Zero external URLs. */
function exportListingHtml(files: string[]): string {
  const manifest = JSON.stringify(files);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>ctx guide (export)</title>
<style>body{margin:0;background:#0e1014;color:#e7e9ee;font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
main{padding:16px;max-width:900px}code{font-family:ui-monospace,monospace}</style></head>
<body><main>
<p style="color:#8b919c;font-size:12px">accelerator, not validated</p>
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
