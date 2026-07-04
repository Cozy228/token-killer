/**
 * Asset resolution for the tree-sitter engine (CTX-IMPL §5.2 grammar packaging).
 *
 * Grammar `.wasm`: RESOLVED FROM THE `tree-sitter-wasms` PACKAGE at runtime (not
 * vendor-copied). Rationale documented for the reviewer: `tree-sitter-wasms` is a
 * declared runtime dependency, so its `out/*.wasm` are always installed beside
 * `@ctx/core`; referencing them avoids duplicating ~15 MB of grammars into the
 * repo, and matches codegraph's default. web-tree-sitter is PINNED to `^0.25`
 * (0.26 cannot load these grammars' module format — verified at wiring); the
 * §5.2 "vendored overrides where the npm build is broken" escape hatch is unused
 * because all 7 tier-1 grammars load and parse cleanly under 0.25 (ABI 13–14).
 *
 * `.scm` query files: shipped under `src/**` and copied to `dist/` by the
 * existing copy-assets step; resolved relative to THIS module's URL so the same
 * code path works whether core runs from source (native type-stripping) or dist.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LANGUAGES, type LanguageId } from "./languages.ts";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path to a language's grammar `.wasm` inside `tree-sitter-wasms`. */
export function grammarWasmPath(id: LanguageId): string {
  return require.resolve(`tree-sitter-wasms/out/${LANGUAGES[id].wasmFile}`);
}

const scmCache = new Map<string, string>();

/** Read (and cache) a language's `.scm` query source. */
export function readQuerySource(id: LanguageId): string {
  const file = LANGUAGES[id].scmFile;
  const cached = scmCache.get(file);
  if (cached !== undefined) return cached;
  const src = readFileSync(join(HERE, "queries", file), "utf8");
  scmCache.set(file, src);
  return src;
}
