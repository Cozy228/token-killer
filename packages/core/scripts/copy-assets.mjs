// Copy non-TS build assets into dist, mirroring their path under src.
//
// tsdown only emits the JS/DTS graph; runtime assets (SQL migrations, tree-sitter
// `.scm` queries, `.wasm` grammars) must be copied verbatim. The real `.sql`
// migrations arrive in slice 1b — the mechanism is wired now so downstream slices
// only drop files into src/**, no build wiring changes.
//
// Zero dependencies (no glob package, no experimental fs.glob): a plain recursive
// readdir walk works identically across the whole distributed Node field.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_EXTENSIONS = [".sql", ".scm", ".wasm"];

function isAsset(fileName) {
  return ASSET_EXTENSIONS.some((ext) => fileName.endsWith(ext));
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (isAsset(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Copy every asset under `srcDir` into `outDir`, preserving the relative path.
 * @param {{ srcDir: string, outDir: string }} opts
 * @returns {string[]} the list of destination paths written (relative to outDir)
 */
export function copyAssets({ srcDir, outDir }) {
  if (!existsSync(srcDir)) return [];
  const copied = [];
  for (const src of walk(srcDir)) {
    const rel = relative(srcDir, src);
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    copied.push(rel);
  }
  return copied;
}

// Run as a CLI when invoked directly (chained after tsdown in the build script).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const copied = copyAssets({
    srcDir: join(pkgRoot, "src"),
    outDir: join(pkgRoot, "dist"),
  });
  console.log(`copy-assets: copied ${copied.length} asset(s) into dist/`);
}
