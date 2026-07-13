// Copy the built guide SPA into the CLI's dist, so a published `ctx` ships its UI.
//
// Same precedent as `packages/core/scripts/copy-assets.mjs`: tsdown only emits the JS
// graph, so anything that is not JS has to be copied after it. Here the asset is a whole
// directory — the Vite build output — and it lands NEXT TO the bundle:
//
//   dist/cli.js        the CLI
//   dist/guide-app/    index.html + assets/*  <- what the server serves at `/`
//
// That adjacency is the point. A user installing `ctx` from a registry has no workspace,
// no `packages/`, and no guide package on disk; the server resolves the app from its own
// `import.meta.url` and finds it inside the same published tree (see src/guide/assets.ts).
//
// Zero dependencies, plain `cpSync` recursion — identical behaviour across the whole
// distributed Node field.

import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const guideDist = join(pkgRoot, "..", "guide", "dist");
const outDir = join(pkgRoot, "dist", "guide-app");

if (!existsSync(join(guideDist, "index.html"))) {
  // Loud, not silent: shipping a CLI whose `ctx guide` serves 503 is worse than not
  // shipping. `@contexa/guide` is a workspace devDependency of this package, so
  // `pnpm -r build` orders it first — reaching this line means the order was broken.
  console.error(
    `copy-guide-assets: no guide build at ${guideDist}\n` +
      "  run `pnpm --filter @contexa/guide build` first (or `pnpm -r build`, which orders it).",
  );
  process.exit(1);
}

cpSync(guideDist, outDir, { recursive: true });
console.log(`copy-guide-assets: copied the guide SPA into ${outDir}`);
