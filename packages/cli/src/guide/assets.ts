/**
 * Static asset serving for `ctx guide` — the built `@contexa/guide` SPA.
 *
 * The dist directory is resolved relative to the INSTALLED `@contexa/guide`
 * package (not repo-relative cwd), so it works from a packed install. All assets
 * are served from disk; nothing is fetched over the network (zero egress).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

export function contentTypeFor(pathname: string): string {
  return CONTENT_TYPES[extname(pathname).toLowerCase()] ?? "application/octet-stream";
}

export const GUIDE_BUILD_HINT =
  "the built guide is missing — run `pnpm --filter @contexa/guide build` first";

/**
 * Resolve the installed `@contexa/guide` package's `dist/` directory. Throws a
 * clear, actionable error when the build output is absent.
 */
export function resolveGuideDist(): string {
  let pkgJsonPath: string;
  try {
    pkgJsonPath = fileURLToPath(import.meta.resolve("@contexa/guide/package.json"));
  } catch {
    throw new Error(`cannot locate the @contexa/guide package — ${GUIDE_BUILD_HINT}`);
  }
  const dist = join(dirname(pkgJsonPath), "dist");
  assertGuideDist(dist);
  return dist;
}

/** Validate that a dist directory holds a built SPA (index.html present). */
export function assertGuideDist(distDir: string): void {
  const index = join(distDir, "index.html");
  if (!existsSync(index)) {
    throw new Error(`no guide build at ${distDir} — ${GUIDE_BUILD_HINT}`);
  }
}

export interface Asset {
  body: Buffer;
  contentType: string;
}

/**
 * Read a static asset for `pathname` from `distDir`, guarding against path
 * traversal. Returns null when the path resolves outside dist or is not a
 * regular file (the caller then falls back to index.html for SPA routes).
 */
export function readAsset(distDir: string, pathname: string): Asset | null {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = resolve(distDir, "." + sep + rel);
  const root = resolve(distDir);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null; // traversal
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return { body: readFileSync(candidate), contentType: contentTypeFor(candidate) };
}

/** The SPA shell (index.html) served for `/` and hash routes (D13: one page). */
export function readIndex(distDir: string): Asset {
  const index = join(distDir, "index.html");
  return { body: readFileSync(index), contentType: "text/html; charset=utf-8" };
}
