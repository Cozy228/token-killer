/**
 * Pure symbol extraction from a parsed tree-sitter tree (CTX-IMPL §5.2, §3).
 *
 * G-8 (day-one regression): source text is read ONLY through `node.text`. We
 * never slice `content` by tree-sitter byte offsets — offsets are UTF-8 byte
 * indices, JS strings are UTF-16, so byte-slicing corrupts on any multibyte
 * character before or inside a definition. Spans are reported as 1-based line
 * numbers (from `node.startPosition`/`endPosition`), never byte ranges.
 *
 * G-9 (identity stability): a symbol id is `sym:<path>#<qualified>[~<disambig>]`;
 * span/hash are attributes, never the id. Whitespace/comment/line-shift edits do
 * not move a symbol's id — only a rename or an arity (signature) change does.
 *
 * Granularity: top-level declarations + type members. Any definition with a
 * callable (function/method/lambda) ancestor is a local/nested implementation
 * detail and is dropped — this is what keeps `const` captures from exploding on
 * every local variable, without per-language top-level anchoring in the `.scm`.
 */
import type { Node, Query } from "web-tree-sitter";
import { blake2bHex } from "../../store/hash.ts";
import { languageForPath, type LanguageId } from "./languages.ts";
import {
  KIND_PRIORITY,
  symbolId,
  type CallRecord,
  type ExtractResult,
  type ImportRecord,
  type LineSpan,
  type SymbolKind,
  type SymbolRecord,
} from "./symbol.ts";

/** tsx shares the typescript node grammar for these structural sets. */
type BaseLang = Exclude<LanguageId, "tsx">;
function baseLang(id: LanguageId): BaseLang {
  return id === "tsx" ? "typescript" : id;
}

const COMMENT_TYPES: ReadonlySet<string> = new Set(["comment", "line_comment", "block_comment"]);

/** Node types that make everything inside them a local (dropped) definition. */
const CALLABLE_TYPES: Record<BaseLang, ReadonlySet<string>> = {
  typescript: new Set([
    "function_declaration",
    "generator_function_declaration",
    "function_expression",
    "generator_function",
    "arrow_function",
    "method_definition",
  ]),
  javascript: new Set([
    "function_declaration",
    "generator_function_declaration",
    "function_expression",
    "generator_function",
    "arrow_function",
    "method_definition",
  ]),
  python: new Set(["function_definition", "lambda"]),
  go: new Set(["function_declaration", "method_declaration", "func_literal"]),
  java: new Set(["method_declaration", "constructor_declaration", "lambda_expression"]),
  rust: new Set(["function_item", "closure_expression"]),
  csharp: new Set([
    "method_declaration",
    "constructor_declaration",
    "local_function_statement",
    "lambda_expression",
    "anonymous_method_expression",
  ]),
};

/** Node types that contribute a qualified-name segment (outermost → innermost). */
const CONTAINER_TYPES: Record<BaseLang, ReadonlySet<string>> = {
  typescript: new Set([
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "internal_module",
    "module",
  ]),
  javascript: new Set(["class_declaration"]),
  python: new Set(["class_definition"]),
  go: new Set(), // Go methods qualify by receiver (handled below), not by nesting
  java: new Set([
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
  ]),
  rust: new Set(["impl_item", "mod_item", "trait_item"]),
  csharp: new Set([
    "class_declaration",
    "struct_declaration",
    "interface_declaration",
    "record_declaration",
    "enum_declaration",
    "namespace_declaration",
  ]),
};

/** Container types that are class-like — a `function` nested directly in one is
 *  reclassified to `method`. */
const CLASS_LIKE_TYPES: Record<BaseLang, ReadonlySet<string>> = {
  typescript: new Set(["class_declaration", "abstract_class_declaration", "interface_declaration"]),
  javascript: new Set(["class_declaration"]),
  python: new Set(["class_definition"]),
  go: new Set(),
  java: new Set([
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
  ]),
  rust: new Set(["impl_item", "trait_item"]),
  csharp: new Set([
    "class_declaration",
    "struct_declaration",
    "interface_declaration",
    "record_declaration",
    "enum_declaration",
  ]),
};

interface RawDef {
  defNode: Node;
  nameNode: Node;
  name: string;
  kind: SymbolKind;
}

export function extractFromTree(
  relPath: string,
  root: Node,
  query: Query,
  langId: LanguageId,
): ExtractResult {
  const base = baseLang(langId);
  const rawByNameNode = new Map<number, RawDef>();
  const imports: ImportRecord[] = [];
  const calls: CallRecord[] = [];

  for (const match of query.matches(root)) {
    const caps = match.captures;
    const defCap = caps.find((c) => c.name.startsWith("def."));
    if (defCap) {
      const nameCap = caps.find((c) => c.name === "name");
      if (!nameCap) continue;
      const kind = defCap.name.slice("def.".length) as SymbolKind;
      // De-dup double-captures (e.g. an arrow-valued const matches both the
      // function and const patterns) by the shared @name node; keep the
      // higher-priority kind and its definition node.
      const key = nameCap.node.id;
      const existing = rawByNameNode.get(key);
      if (existing && KIND_PRIORITY[existing.kind] <= KIND_PRIORITY[kind]) continue;
      rawByNameNode.set(key, {
        defNode: defCap.node,
        nameNode: nameCap.node,
        name: nameCap.node.text,
        kind,
      });
      continue;
    }
    const importCap = caps.find((c) => c.name === "import");
    if (importCap) {
      const srcCap = caps.find((c) => c.name === "import.source");
      imports.push({
        source: importSource(importCap.node, srcCap?.node),
        line: importCap.node.startPosition.row + 1,
      });
      continue;
    }
    const callCap = caps.find((c) => c.name === "call");
    if (callCap) {
      const nameCap = caps.find((c) => c.name === "call.name");
      if (nameCap)
        calls.push({ name: nameCap.node.text, line: callCap.node.startPosition.row + 1 });
    }
  }

  // Filter locals, reclassify, qualify.
  interface Built {
    defNode: Node;
    name: string;
    qualified: string;
    kind: SymbolKind;
    arity: number | undefined;
    sig: string;
    startIndex: number;
  }
  const built: Built[] = [];
  for (const raw of rawByNameNode.values()) {
    if (hasCallableAncestor(raw.defNode, base)) continue;
    const qualified = qualify(raw.defNode, raw.name, base);
    const kind = reclassify(raw.kind, raw.defNode, base);
    built.push({
      defNode: raw.defNode,
      name: raw.name,
      qualified,
      kind,
      arity: arityOf(raw.defNode),
      sig: paramSignature(raw.defNode),
      startIndex: raw.defNode.startIndex,
    });
  }

  // Disambiguate genuine same-qualified-name collisions (overloads): unique
  // arity stays a bare `~<arity>`; a shared arity splits by an order-INDEPENDENT
  // parameter-signature hash (`~<arity>~<sighash>`), so inserting/reordering a
  // same-arity overload never re-keys an existing symbol (G-9). Only genuinely
  // identical signatures — an unavoidable ambiguity — fall back to a source-order
  // ordinal. The unique common case stays a bare id.
  const byQualified = new Map<string, Built[]>();
  for (const b of built) {
    const group = byQualified.get(b.qualified);
    if (group) group.push(b);
    else byQualified.set(b.qualified, [b]);
  }
  const symbols: SymbolRecord[] = [];
  for (const group of byQualified.values()) {
    const disambiguate = group.length > 1;
    // Stable source order so the identical-signature last resort is deterministic.
    group.sort((x, y) => x.startIndex - y.startIndex);
    const arityTotals = new Map<number, number>();
    const sigTotals = new Map<string, number>();
    if (disambiguate) {
      for (const b of group) {
        const arity = b.arity ?? 0;
        arityTotals.set(arity, (arityTotals.get(arity) ?? 0) + 1);
      }
      for (const b of group) {
        const arity = b.arity ?? 0;
        if ((arityTotals.get(arity) ?? 0) > 1) {
          const key = `${arity}~${sigHash(b.sig)}`;
          sigTotals.set(key, (sigTotals.get(key) ?? 0) + 1);
        }
      }
    }
    const sigOrdinals = new Map<string, number>();
    for (const b of group) {
      let disambig: string | undefined;
      if (disambiguate) {
        const arity = b.arity ?? 0;
        if ((arityTotals.get(arity) ?? 0) === 1) {
          disambig = String(arity); // arity alone is unique in this overload set
        } else {
          const sh = sigHash(b.sig);
          const key = `${arity}~${sh}`;
          if ((sigTotals.get(key) ?? 0) > 1) {
            // Identical signature (degenerate redeclaration): source-order ordinal.
            const ord = sigOrdinals.get(key) ?? 0;
            sigOrdinals.set(key, ord + 1);
            disambig = `${arity}~${sh}~${ord}`;
          } else {
            disambig = key;
          }
        }
      }
      symbols.push(buildSymbol(relPath, b.defNode, b.name, b.qualified, b.kind, b.arity, disambig));
    }
  }

  return { language: langId, symbols, imports, calls, hadError: root.hasError };
}

function buildSymbol(
  relPath: string,
  defNode: Node,
  name: string,
  qualified: string,
  kind: SymbolKind,
  arity: number | undefined,
  disambig: string | undefined,
): SymbolRecord {
  const text = defNode.text; // G-8: the ONLY way we read span text
  const span: LineSpan = lineSpan(defNode);
  const rec: SymbolRecord = {
    id: symbolId(relPath, qualified, disambig),
    name,
    qualified,
    kind,
    span,
    contentHash: blake2bHex(text),
  };
  const doc = docFor(defNode);
  if (doc) rec.doc = doc;
  if (arity !== undefined) rec.arity = arity;
  return rec;
}

function hasCallableAncestor(node: Node, base: BaseLang): boolean {
  const callable = CALLABLE_TYPES[base];
  let a = node.parent;
  while (a) {
    if (callable.has(a.type)) return true;
    a = a.parent;
  }
  return false;
}

function qualify(defNode: Node, name: string, base: BaseLang): string {
  const containers = CONTAINER_TYPES[base];
  const segments: string[] = [];
  let a = defNode.parent;
  while (a) {
    if (containers.has(a.type)) {
      const seg = containerName(a, base);
      if (seg) segments.unshift(seg);
    }
    a = a.parent;
  }
  if (base === "go" && defNode.type === "method_declaration") {
    const recv = goReceiver(defNode);
    if (recv) segments.push(recv);
  }
  segments.push(name);
  return segments.join(".");
}

function containerName(node: Node, base: BaseLang): string | undefined {
  if (base === "rust" && node.type === "impl_item") {
    return node.childForFieldName("type")?.text;
  }
  return node.childForFieldName("name")?.text ?? undefined;
}

function reclassify(kind: SymbolKind, defNode: Node, base: BaseLang): SymbolKind {
  if (kind !== "function") return kind;
  const classLike = CLASS_LIKE_TYPES[base];
  let a = defNode.parent;
  while (a) {
    if (CONTAINER_TYPES[base].has(a.type)) return classLike.has(a.type) ? "method" : kind;
    a = a.parent;
  }
  return kind;
}

function goReceiver(node: Node): string | undefined {
  const recv = node.childForFieldName("receiver");
  if (!recv) return undefined;
  for (const child of recv.namedChildren) {
    if (child?.type === "parameter_declaration") {
      const t = child.childForFieldName("type");
      const m = t?.text.replace(/^\*/, "").match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (m) return m[0];
    }
  }
  return undefined;
}

function paramsNode(defNode: Node): Node | null {
  return (
    defNode.childForFieldName("parameters") ??
    defNode.childForFieldName("parameter_list") ??
    // arrow/function-valued declarators wrap the callable
    defNode.namedChildren
      .find((c) => c && (c.type === "arrow_function" || c.type === "function_expression"))
      ?.childForFieldName("parameters") ??
    null
  );
}

function arityOf(defNode: Node): number | undefined {
  const params = paramsNode(defNode);
  if (!params) return undefined;
  return params.namedChildren.filter((c) => c && c.type !== "comment").length;
}

/**
 * An order-INDEPENDENT disambiguator for same-name/same-arity overloads (G-9):
 * a short hash of the normalized parameter-list text. Two overloads that differ
 * only by parameter TYPES (the only legal same-arity overload in a typed
 * language) get distinct, position-free ids, so inserting or reordering a third
 * overload never shifts an existing symbol's id (the old source-order ordinal
 * did). Whitespace is collapsed so a reformat is not a signature change; the
 * text is read via `node.text` only (G-8). Empty when there is no parameter list.
 */
function paramSignature(defNode: Node): string {
  const params = paramsNode(defNode);
  return params ? params.text.replace(/\s+/g, " ").trim() : "";
}

function sigHash(signature: string): string {
  return blake2bHex(signature).slice(0, 8);
}

function lineSpan(node: Node): LineSpan {
  const start = node.startPosition.row + 1;
  const end = node.endPosition;
  // A node ending at column 0 finished at the previous line's newline.
  const endLine = end.column === 0 && end.row > node.startPosition.row ? end.row : end.row + 1;
  return [start, endLine];
}

function docFor(defNode: Node): string | undefined {
  // Python docstring: first string statement inside the body block.
  const body = defNode.childForFieldName("body");
  if (body) {
    const first = body.namedChildren.find((c) => c && c.type !== "comment");
    if (first?.type === "expression_statement") {
      const str = first.namedChildren.find((c) => c && c.type === "string");
      if (str) return cleanDoc(str.text);
    }
  }
  // C-like: the immediately preceding comment sibling.
  const prev = defNode.previousNamedSibling;
  if (prev && COMMENT_TYPES.has(prev.type)) return cleanDoc(prev.text);
  return undefined;
}

function cleanDoc(text: string): string {
  for (const line of text.split("\n")) {
    const cleaned = line
      .replace(/^\s*['"]{1,3}/, "")
      .replace(/['"]{1,3}\s*$/, "")
      .replace(/^\s*(\/\*\*|\/\/\/|\/\/|\/\*|\*\/|\*|#)\s?/, "")
      .trim();
    if (cleaned) return cleaned.slice(0, 200);
  }
  return "";
}

function importSource(importNode: Node, sourceNode: Node | undefined): string {
  if (sourceNode) return stripQuotes(sourceNode.text);
  // C# using directives (and anything with no captured source): best-effort.
  return importNode.text
    .replace(/^\s*(using|import|use)\s+/, "")
    .replace(/;?\s*$/, "")
    .trim();
}

function stripQuotes(text: string): string {
  return text.replace(/^["'`]/, "").replace(/["'`]$/, "");
}

/** Convenience for tests / the in-process path: derive the language then extract. */
export function languageOf(relPath: string): LanguageId | undefined {
  return languageForPath(relPath);
}
