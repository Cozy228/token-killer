/**
 * Tier-1 language registry (CONTEXA-IMPL §5.2). Pure data + lookup — importable from
 * the main thread, the parse worker (native type-stripping), and tests alike.
 *
 * Grammar `.wasm` files are resolved at runtime from the `tree-sitter-wasms`
 * package (a declared runtime dependency of @contexa/core); see `assets.ts`. The
 * per-language `.scm` query files live under `queries/` and ship to `dist/` via
 * the existing copy-assets step. `tsx` reuses the TypeScript query text against
 * its own grammar (JSX nodes don't change the definition/import/call shapes).
 */

/** The 7 tier-1 languages (TS/TSX/JS counted as three grammars). */
export type LanguageId =
  | "typescript"
  | "tsx"
  | "javascript"
  | "python"
  | "go"
  | "java"
  | "rust"
  | "csharp";

export interface LanguageDef {
  id: LanguageId;
  /** File name inside `tree-sitter-wasms/out/`. */
  wasmFile: string;
  /** Query file under `queries/`; `tsx` shares `typescript.scm`. */
  scmFile: string;
  /** Lower-cased file extensions (with leading dot) that select this language. */
  extensions: readonly string[];
}

export const LANGUAGES: Record<LanguageId, LanguageDef> = {
  typescript: {
    id: "typescript",
    wasmFile: "tree-sitter-typescript.wasm",
    scmFile: "typescript.scm",
    extensions: [".ts", ".mts", ".cts"],
  },
  tsx: {
    id: "tsx",
    wasmFile: "tree-sitter-tsx.wasm",
    scmFile: "typescript.scm", // shared query text, own grammar
    extensions: [".tsx"],
  },
  javascript: {
    id: "javascript",
    wasmFile: "tree-sitter-javascript.wasm",
    scmFile: "javascript.scm",
    extensions: [".js", ".mjs", ".cjs", ".jsx"],
  },
  python: {
    id: "python",
    wasmFile: "tree-sitter-python.wasm",
    scmFile: "python.scm",
    extensions: [".py", ".pyi"],
  },
  go: {
    id: "go",
    wasmFile: "tree-sitter-go.wasm",
    scmFile: "go.scm",
    extensions: [".go"],
  },
  java: {
    id: "java",
    wasmFile: "tree-sitter-java.wasm",
    scmFile: "java.scm",
    extensions: [".java"],
  },
  rust: {
    id: "rust",
    wasmFile: "tree-sitter-rust.wasm",
    scmFile: "rust.scm",
    extensions: [".rs"],
  },
  csharp: {
    id: "csharp",
    wasmFile: "tree-sitter-c_sharp.wasm",
    scmFile: "csharp.scm",
    extensions: [".cs"],
  },
};

export const TIER1_LANGUAGE_IDS: readonly LanguageId[] = Object.keys(LANGUAGES) as LanguageId[];

/** Every extension known to the tier-1 set (for the dirty-scan file filter). */
export const CODE_EXTENSIONS: ReadonlySet<string> = new Set(
  TIER1_LANGUAGE_IDS.flatMap((id) => LANGUAGES[id].extensions),
);

const EXT_TO_LANG: ReadonlyMap<string, LanguageId> = new Map(
  TIER1_LANGUAGE_IDS.flatMap((id) => LANGUAGES[id].extensions.map((ext) => [ext, id] as const)),
);

/** Resolve a language from a path's extension, or `undefined` if untracked. */
export function languageForPath(pathOrName: string): LanguageId | undefined {
  const dot = pathOrName.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXT_TO_LANG.get(pathOrName.slice(dot).toLowerCase());
}
