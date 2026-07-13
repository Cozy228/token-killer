/**
 * Where the SPA bundle lives — the DISTRIBUTED case first, this machine second.
 *
 * `tsdown` emits only the JS graph, so the built SPA is copied into the CLI package's
 * `dist/` after the bundle (`scripts/copy-guide-assets.mjs`, following the
 * `packages/core/scripts/copy-assets.mjs` precedent). A user who installs `ctx` from a
 * registry therefore receives `dist/cli.js` and `dist/guide-app/` side by side, and the
 * server finds the app NEXT TO ITSELF — no workspace, no `packages/`, no node_modules
 * lookup, nothing that only exists in a checkout.
 *
 * In development the CLI runs from `src/`, where no copy has happened; there the app is
 * the guide package's own `dist/`. Both are resolved from `import.meta.url`, so neither
 * depends on the process's cwd.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Candidate app roots, most-distributed first. */
export function appDirCandidates(): string[] {
  return [
    // Published/bundled: HERE is `<pkg>/dist` (this module is bundled into dist/cli.js).
    join(HERE, "guide-app"),
    // Development from source: HERE is `<repo>/packages/cli/src/guide`.
    join(HERE, "..", "..", "..", "guide", "dist"),
  ];
}

/**
 * The app root, or `undefined` when the SPA has not been built. The caller turns that
 * into an actionable message rather than serving a blank page — a guide with no UI is a
 * condition to name, not to paper over.
 */
export function resolveAppDir(): string | undefined {
  return appDirCandidates().find((dir) => existsSync(join(dir, "index.html")));
}

export const APP_MISSING_MESSAGE =
  "ctx guide: the guide UI is not built. From the repository root run:\n" +
  "  pnpm --filter @contexa/guide build";
