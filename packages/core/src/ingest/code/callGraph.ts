/**
 * Call-site resolution → call edges (CONTEXA-IMPL §5.2, slice 2d).
 *
 * 2a extracts a best-effort callee identifier per call site (`CallRecord`);
 * tree-sitter cannot resolve dispatch, so this resolver is CONSERVATIVE BY
 * CONSTRUCTION — an uncertain or ambiguous callee stays `unknown` and produces
 * NO edge (never a guess). Outcomes (per-language registry):
 *
 *   - local    — a symbol DEFINED IN THE SAME FILE, unique by name (this.foo(),
 *                a sibling top-level fn). Highest confidence.
 *   - project  — a symbol defined elsewhere in the project, UNIQUE by name
 *                WITHIN THE CALLER'S LANGUAGE. Ambiguous (2+) → unknown.
 *   - builtin  — a language global/stdlib identifier (parseInt, print, append,
 *                println!). Recorded, but creates NO symbol entity and NO edge.
 *   - unknown  — everything else (external import, unresolved, ambiguous).
 *
 * THE load-bearing correctness rule (§5.2): callee resolution NEVER binds across
 * languages, even on an exact name match. The project index is partitioned by
 * language; a call in a Go file can only ever resolve to a Go symbol. `builtin`
 * / `unknown` callees never fabricate a dangling symbol entity.
 *
 * The resolver is a pure function over a prebuilt index so the {local, project,
 * builtin, unknown} matrix — and the cross-language non-binding case — are
 * directly unit-testable without a store.
 */
import type { LanguageId } from "../../extract/code/languages.ts";
import type { LineSpan, SymbolRecord } from "../../extract/code/symbol.ts";

export type CalleeOutcome = "local" | "project" | "builtin" | "unknown";

export interface CalleeResolution {
  outcome: CalleeOutcome;
  /** The resolved target symbol id — set ONLY for `local` / `project`. */
  targetId?: string;
}

/** A symbol as the resolver sees it (store entity OR freshly-parsed record). */
export interface IndexedSymbol {
  id: string;
  name: string;
  lang: LanguageId;
  path: string;
}

/**
 * The callee-resolution index. `byLangName` partitions by language (the
 * cross-language firewall); `byFileName` gives the same-file local lookup.
 */
export interface CalleeIndex {
  /** lang → (unqualified name → symbol ids of THAT language). */
  byLangName: Map<LanguageId, Map<string, string[]>>;
  /** repo-rel path → (unqualified name → symbol ids in THAT file). */
  byFileName: Map<string, Map<string, string[]>>;
}

/** tsx shares the typescript grammar / global set. */
function baseLang(lang: LanguageId): LanguageId {
  return lang === "tsx" ? "typescript" : lang;
}

function push(index: Map<string, string[]>, key: string, id: string): void {
  const bucket = index.get(key);
  if (bucket) bucket.push(id);
  else index.set(key, [id]);
}

/** Build the resolution index from the project's whole symbol universe. */
export function buildCalleeIndex(symbols: Iterable<IndexedSymbol>): CalleeIndex {
  const byLangName = new Map<LanguageId, Map<string, string[]>>();
  const byFileName = new Map<string, Map<string, string[]>>();
  for (const s of symbols) {
    let langMap = byLangName.get(s.lang);
    if (!langMap) {
      langMap = new Map();
      byLangName.set(s.lang, langMap);
    }
    push(langMap, s.name, s.id);

    let fileMap = byFileName.get(s.path);
    if (!fileMap) {
      fileMap = new Map();
      byFileName.set(s.path, fileMap);
    }
    push(fileMap, s.name, s.id);
  }
  return { byLangName, byFileName };
}

/**
 * Resolve one call site's callee name. Priority: same-file unique (local) →
 * same-language unique (project) → language global (builtin) → unknown. Any
 * ambiguity (a name that matches 2+ candidates at the winning tier) resolves to
 * `unknown` — conservative by construction.
 */
export function resolveCallee(
  index: CalleeIndex,
  callerLang: LanguageId,
  callerPath: string,
  name: string,
): CalleeResolution {
  // Tier 1 — local: a definition in the SAME file, unique by name.
  const local = index.byFileName.get(callerPath)?.get(name);
  if (local && local.length === 1) return { outcome: "local", targetId: local[0]! };
  if (local && local.length > 1) return { outcome: "unknown" }; // ambiguous even locally

  // Tier 2 — project: a definition ANYWHERE in the caller's language, unique.
  // (byLangName is language-partitioned → NEVER binds across languages, §5.2.)
  const project = index.byLangName.get(callerLang)?.get(name);
  if (project && project.length === 1) return { outcome: "project", targetId: project[0]! };
  if (project && project.length > 1) return { outcome: "unknown" }; // ambiguous → no guess

  // Tier 3 — builtin: a language global/stdlib identifier (no edge, no entity).
  if (BUILTINS[baseLang(callerLang)]?.has(name)) return { outcome: "builtin" };

  // Tier 4 — unknown: external / unresolved.
  return { outcome: "unknown" };
}

/**
 * The innermost symbol whose span contains `line` (the caller of a call site).
 * Smallest containing span wins so a call inside a method attributes to the
 * method, not its enclosing class. Returns `undefined` for a top-level call site
 * outside every symbol (unattributed → conservatively no caller edge).
 */
export function enclosingSymbol(
  symbols: readonly SymbolRecord[],
  line: number,
): string | undefined {
  let best: { id: string; span: LineSpan } | undefined;
  for (const s of symbols) {
    const [start, end] = s.span;
    if (line < start || line > end) continue;
    if (!best || end - start < best.span[1] - best.span[0]) best = { id: s.id, span: s.span };
  }
  return best?.id;
}

/**
 * Per-language builtin / stdlib identifiers that a bare-name call resolves to.
 * Member-call captures yield only the property (`console.log` → `log`), so this
 * set is intentionally the unambiguous bare-identifier globals — enough to
 * classify a builtin without ever shadowing a plausible project symbol name.
 */
export const BUILTINS: Partial<Record<LanguageId, ReadonlySet<string>>> = {
  typescript: new Set([
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "String",
    "Number",
    "Boolean",
    "Array",
    "Object",
    "Symbol",
    "BigInt",
    "Promise",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Date",
    "RegExp",
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "Proxy",
    "Reflect",
    "require",
    "structuredClone",
    "fetch",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "queueMicrotask",
    "encodeURIComponent",
    "decodeURIComponent",
    "encodeURI",
    "decodeURI",
  ]),
  javascript: new Set([
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "String",
    "Number",
    "Boolean",
    "Array",
    "Object",
    "Symbol",
    "BigInt",
    "Promise",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Date",
    "RegExp",
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "Proxy",
    "Reflect",
    "require",
    "structuredClone",
    "fetch",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "queueMicrotask",
    "encodeURIComponent",
    "decodeURIComponent",
    "encodeURI",
    "decodeURI",
  ]),
  python: new Set([
    "print",
    "len",
    "range",
    "open",
    "str",
    "int",
    "float",
    "bool",
    "list",
    "dict",
    "set",
    "tuple",
    "frozenset",
    "type",
    "isinstance",
    "issubclass",
    "super",
    "enumerate",
    "zip",
    "map",
    "filter",
    "sorted",
    "reversed",
    "sum",
    "min",
    "max",
    "abs",
    "round",
    "format",
    "repr",
    "hash",
    "id",
    "input",
    "iter",
    "next",
    "getattr",
    "setattr",
    "hasattr",
    "delattr",
    "vars",
    "dir",
    "globals",
    "locals",
    "callable",
    "bytes",
    "bytearray",
    "hex",
    "oct",
    "bin",
  ]),
  go: new Set([
    "make",
    "new",
    "len",
    "cap",
    "append",
    "copy",
    "delete",
    "panic",
    "recover",
    "print",
    "println",
    "close",
    "complex",
    "real",
    "imag",
    "min",
    "max",
    "clear",
  ]),
  rust: new Set([
    "println",
    "print",
    "eprintln",
    "eprint",
    "format",
    "vec",
    "panic",
    "assert",
    "assert_eq",
    "assert_ne",
    "write",
    "writeln",
    "dbg",
    "todo",
    "unimplemented",
    "unreachable",
    "matches",
    "Some",
    "None",
    "Ok",
    "Err",
    "String",
    "Box",
    "Vec",
    "drop",
  ]),
  java: new Set([
    "println",
    "print",
    "printf",
    "valueOf",
    "toString",
    "equals",
    "hashCode",
    "getClass",
  ]),
  csharp: new Set([
    "WriteLine",
    "Write",
    "ToString",
    "Equals",
    "GetHashCode",
    "Parse",
    "TryParse",
    "Format",
    "nameof",
    "typeof",
  ]),
};
