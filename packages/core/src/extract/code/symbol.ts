/**
 * Extraction record types (CONTEXA-IMPL §3 identity, §5.2). Everything here is plain
 * serializable data: the records cross the `worker_threads` boundary as JSON, so
 * NO tree-sitter nodes, class instances, or functions may appear on them.
 *
 * Symbol identity (§3): `sym:<repo-rel-path>#<qualified.name>[~<arity/disambig>]`.
 * Span and content hash are MUTABLE ATTRIBUTES, never part of the id — a symbol's
 * id survives whitespace/comment edits and line shifts (G-9). Only a rename or a
 * signature (arity) change produces a different id.
 */

/** The four definition kinds the tier-1 `.scm` queries capture. */
export type SymbolKind = "function" | "method" | "class" | "const";

/** 1-based inclusive line span, matching the docs source's file locators. */
export type LineSpan = [number, number];

export interface SymbolRecord {
  /** `sym:<repo-rel-path>#<qualified>[~<disambig>]` (§3). */
  id: string;
  /** Unqualified identifier — the searchable/name-index token (§6.1). */
  name: string;
  /** Dotted qualified name (enclosing class/impl/namespace chain + name). */
  qualified: string;
  kind: SymbolKind;
  /** 1-based inclusive line span of the whole definition node. */
  span: LineSpan;
  /** blake2b of the definition span text (`node.text`) — §5.2 per-symbol hash. */
  contentHash: string;
  /** First line of the attached doc comment / docstring, if any (≤200 chars). */
  doc?: string;
  /** Parameter count when determinable (arity disambiguation input). */
  arity?: number;
}

export interface ImportRecord {
  /** Raw module specifier text (quotes stripped where trivial), best-effort. */
  source: string;
  line: number;
}

export interface CallRecord {
  /** Best-effort callee identifier (never resolved across languages here). */
  name: string;
  line: number;
}

export interface ExtractResult {
  language: string;
  symbols: SymbolRecord[];
  imports: ImportRecord[];
  calls: CallRecord[];
  /** Set when the file parsed with a syntax error at the root (best-effort still returned). */
  hadError: boolean;
}

/** Build a symbol id from repo-relative path + qualified name (+ optional disambig). */
export function symbolId(relPath: string, qualified: string, disambig?: string): string {
  const base = `sym:${relPath}#${qualified}`;
  return disambig ? `${base}~${disambig}` : base;
}

/** Priority for id de-dup when two query patterns capture the same node/name
 *  (e.g. an arrow-valued const matches both the function and const patterns):
 *  the more specific kind wins. Lower number = higher priority. */
export const KIND_PRIORITY: Record<SymbolKind, number> = {
  method: 0,
  function: 1,
  class: 2,
  const: 3,
};
