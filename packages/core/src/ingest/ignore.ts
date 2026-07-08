/**
 * D13 default ignore-set (CONTEXA-IMPL §4.4, seeded from
 * `docs/codemap/impl/D-language-coverage.md:618`, itself lifted VERBATIM from
 * codegraph's `src/extraction/index.ts:117-158`).
 *
 * ~50 curated dependency / build / cache directory names that are ignored
 * whether or not a `.gitignore` exists. First-party ambiguous names
 * (`src/lib/app/bin/packages/deps/env/tmp/...`) are DELIBERATELY absent so real
 * source is never hidden. `docs/` is explicitly NOT excluded — docs are a
 * first-class source for ctx (the wiki cohort's docs-exclusion is REVERSED).
 */
export const DEFAULT_IGNORE_DIRS: ReadonlySet<string> = new Set([
  // JS / TS dependencies
  "node_modules",
  "bower_components",
  "jspm_packages",
  "web_modules",
  ".yarn",
  ".pnpm-store",
  // JS / TS framework build / cache / deploy artifacts
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vite",
  ".parcel-cache",
  ".angular",
  ".docusaurus",
  "storybook-static",
  ".vinxi",
  ".nitro",
  "out-tsc",
  ".vercel",
  ".netlify",
  ".wrangler",
  // Generic build output
  "dist",
  "build",
  "out",
  ".output",
  // Test / coverage
  "coverage",
  ".nyc_output",
  // Python
  "__pycache__",
  "__pypackages__",
  ".venv",
  "venv",
  ".pixi",
  ".pdm-build",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".hypothesis",
  ".ipynb_checkpoints",
  ".eggs",
  // Rust / JVM
  "target",
  ".gradle",
  // .NET
  "obj",
  // Go / PHP / Ruby vendored
  "vendor",
  // Swift / iOS
  ".build",
  "Pods",
  "Carthage",
  "DerivedData",
  ".swiftpm",
  // Dart / Flutter
  ".dart_tool",
  ".pub-cache",
  // Native
  ".cxx",
  ".externalNativeBuild",
  "vcpkg_installed",
  // Scala
  ".bloop",
  ".metals",
  // Lua / Luau
  "lua_modules",
  ".luarocks",
  // Delphi IDE backups (duplicate .pas sources, would double-count)
  "__history",
  "__recovery",
  // Generic cache
  ".cache",
]);

/** Glob-shaped ignores that a bare dir-name set cannot express (D13). */
const IGNORE_DIR_PATTERNS: readonly RegExp[] = [
  /\.egg-info$/, // Python packaging metadata
  /^cmake-build-.*$/, // CLion / CMake build trees
];

/** D4 per-file size ceiling: files larger than this are skipped (§4.4). */
export const MAX_FILE_SIZE = 1024 * 1024; // 1 MiB

/**
 * Is this a directory name we always skip when scanning a source tree?
 * `.git` and any dotfile-directory that is not first-party are covered by the
 * explicit set above plus the always-skip of the VCS dir handled by the caller.
 */
export function isIgnoredDir(name: string): boolean {
  if (DEFAULT_IGNORE_DIRS.has(name)) return true;
  for (const re of IGNORE_DIR_PATTERNS) if (re.test(name)) return true;
  return false;
}
