/**
 * Identifier-aware query tokenization (CONTEXA-IMPL §6.1; reference: codegraph
 * `query-utils.ts` — camel/snake/dot splitting that KEEPS the compound token,
 * English-suffix stem variants, project-name down-weighting,
 * `isDistinctiveIdentifier` exact-match gating, tuned stopword list).
 *
 * Pure string rules, zero dependencies, deterministic.
 */
import { PROJECT_NAME_TOKEN_WEIGHT, STEM_VARIANT_WEIGHT, SUBTOKEN_WEIGHT } from "./constants.ts";

/** Tuned stopword list: English function words + query chatter around code. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "should",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  // query chatter (codegraph's tuning: words agents pad questions with)
  "about",
  "all",
  "any",
  "code",
  "codebase",
  "explain",
  "find",
  "get",
  "happen",
  "happens",
  "here",
  "just",
  "like",
  "look",
  "make",
  "mean",
  "means",
  "need",
  "please",
  "show",
  "some",
  "tell",
  "thing",
  "things",
  "use",
  "used",
  "uses",
  "using",
  "want",
  "way",
  "work",
  "works",
]);

export interface QueryToken {
  /** Lowercased token text (FTS is case-folded by unicode61). */
  text: string;
  /** Original-case form (named-seed lookups keep the author's casing). */
  raw: string;
  /** Relative weight in seed scoring. */
  weight: number;
  /** Identifier-shaped and specific enough to gate on exact matches (§6.1). */
  distinctive: boolean;
  /** True for split sub-tokens / stem variants (never named-seed candidates). */
  derived: boolean;
  /**
   * File-path-shaped (FIX-2): a path fragment (carries `/` — a normalized
   * project-relative suffix) or a bare basename with a file extension
   * (`rewrite.ts`). Seeds resolve these to FILE entities by path suffix before
   * the exact-FTS named-seed pass. Detection is liberal — a token that resolves
   * to no file entity simply falls through to normal seeding.
   */
  fileShaped: boolean;
}

/**
 * A bare basename carrying a file extension (`rewrite.ts`, `config.json`,
 * `README.md`) — exactly one dot, a 1–5 char lowercase-shaped extension, no
 * path separator (FIX-2). Deliberately liberal: a token that matches but names
 * no real file (`dotted.path`) resolves to nothing in the store and falls
 * through to ordinary seeding, so a false positive is harmless.
 */
export function isFileBasename(word: string): boolean {
  const m = /^[^.\s/\\]+\.([A-Za-z][A-Za-z0-9]{0,4})$/.exec(word);
  const ext = m?.[1];
  return ext !== undefined && ext === ext.toLowerCase();
}

/**
 * Normalize a path-shaped raw fragment to its project-relative-suffix form
 * (FIX-2): `\` → `/`, surrounding quotes/brackets/trailing punctuation trimmed,
 * a trailing `:line[:col]` stripped, and a leading absolute / drive / `./`
 * prefix removed. Returns "" when nothing path-like survives. Deterministic.
 */
export function normalizePathSuffix(fragment: string): string {
  let s = fragment.split("\\").join("/").trim();
  s = s.replace(/^[('"`[<]+/, "").replace(/[)'"`\]>.,;!?]+$/, "");
  s = s.replace(/:\d+(?::\d+)?$/, ""); // drop :line[:col]
  s = s
    .replace(/^[A-Za-z]:\//, "") // windows drive
    .replace(/^\.?\//, "") // leading absolute or ./
    .replace(/\/+$/, "");
  return s;
}

/**
 * Path fragments in the RAW query, recognized BEFORE word tokenization (FIX-2):
 * any whitespace-separated chunk carrying `/` or `\` (agents run on Windows
 * too). Each is returned as its normalized project-relative suffix. The word
 * tokenizer still runs over the whole query, so the constituent words are also
 * emitted — this only ADDS the path tokens.
 */
export function extractPathTokens(query: string): string[] {
  const out: string[] = [];
  for (const chunk of query.split(/\s+/)) {
    if (!/[/\\]/.test(chunk)) continue;
    const norm = normalizePathSuffix(chunk);
    if (norm.length >= 2 && /[/]/.test(norm)) out.push(norm);
  }
  return out;
}

/** camelCase / PascalCase / snake_case / dotted.path / has-digit → identifier-shaped. */
export function isIdentifierShaped(word: string): boolean {
  if (!/^[A-Za-z_$][\w$.]*$/.test(word)) return false;
  return (
    /[a-z][A-Z]/.test(word) || // camelCase boundary
    /^[A-Z][a-z]+[A-Z]/.test(word) || // PascalCase with ≥2 humps
    word.includes("_") ||
    word.includes(".") ||
    /\d/.test(word)
  );
}

/**
 * Distinctive-identifier gating (codegraph): identifier-shaped AND long enough
 * that an exact match is meaningful — these are force-included as named seeds
 * and never stem-expanded.
 */
export function isDistinctiveIdentifier(word: string): boolean {
  return word.length >= 4 && isIdentifierShaped(word) && !STOPWORDS.has(word.toLowerCase());
}

/** Split camelCase / snake_case / dotted.path into sub-words (compound NOT included). */
export function splitIdentifier(word: string): string[] {
  const parts = word
    .split(/[._$]+/)
    .flatMap((p) => p.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/))
    .map((p) => p.toLowerCase())
    .filter((p) => p.length > 1);
  return [...new Set(parts)];
}

/**
 * Light English morphological variants (reference: codegraph `getStemVariants`
 * query-utils.ts:85–142): -ing/-tion/-ment/-ies/-es/-s/-ed/-er families.
 * Returns lowercase variants EXCLUDING the word itself.
 */
export function getStemVariants(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set<string>();
  const add = (v: string): void => {
    if (v.length >= 3 && v !== w) out.add(v);
  };
  if (w.endsWith("ies")) add(`${w.slice(0, -3)}y`);
  if (w.endsWith("ing") && w.length > 5) {
    const stem = w.slice(0, -3);
    add(stem); // caching → cach
    add(`${stem}e`); // caching → cache
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      add(stem.slice(0, -1)); // running → run
    }
  }
  if (w.endsWith("tion")) {
    const stem = w.slice(0, -3); // eviction → evict
    add(stem);
    add(`${stem}e`); // creation → create
  }
  if (w.endsWith("ment") && w.length > 6) add(w.slice(0, -4)); // management → manage
  if (w.endsWith("ed") && w.length > 4) {
    add(w.slice(0, -2)); // handled → handl
    add(`${w.slice(0, -2)}e`); // handled → handle
    add(w.slice(0, -1)); // planned → planne (harmless)
  }
  if (w.endsWith("er") && w.length > 4) {
    add(w.slice(0, -2)); // builder → build
    add(w.slice(0, -1)); // builder → builde (harmless)
  }
  if (w.endsWith("es") && w.length > 4) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) add(w.slice(0, -1));
  return [...out];
}

/** Project-name sub-tokens (basename split on separators) get down-weighted (§6.1). */
export function projectNameTokens(projectRoot: string): Set<string> {
  const base = projectRoot.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const parts = base
    .split(/[^A-Za-z0-9_$.]+/) // kebab/space separators first, then identifier splits
    .flatMap((p) => splitIdentifier(p).concat(p.toLowerCase()));
  return new Set(parts.concat(base.toLowerCase()).filter((t) => t.length > 1));
}

const WORD_RE = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;

/**
 * Tokenize a natural-language / mixed query (§6.1):
 * - identifier-shaped words keep the COMPOUND token and add split sub-tokens;
 * - non-identifier words add stem variants (distinctive identifiers do not —
 *   exact-match gating);
 * - stopwords dropped; project-name tokens down-weighted, never dropped.
 */
export function tokenizeQuery(query: string, projectRoot = ""): QueryToken[] {
  const projectTokens = projectNameTokens(projectRoot);
  const seen = new Map<string, QueryToken>();
  const push = (raw: string, weight: number, derived: boolean, fileShaped = false): void => {
    const text = raw.toLowerCase();
    if (text.length < 2 || STOPWORDS.has(text)) return;
    const w = projectTokens.has(text) ? weight * PROJECT_NAME_TOKEN_WEIGHT : weight;
    const existing = seen.get(text);
    if (existing) {
      if (w > existing.weight) existing.weight = w;
      if (!derived) existing.derived = false;
      if (fileShaped) existing.fileShaped = true;
      return;
    }
    seen.set(text, {
      text,
      raw,
      weight: w,
      distinctive: !derived && isDistinctiveIdentifier(raw),
      derived,
      fileShaped,
    });
  };

  for (const raw of query.match(WORD_RE) ?? []) {
    push(raw, 1, false, isFileBasename(raw));
    if (isIdentifierShaped(raw)) {
      // keep the compound token (pushed above) AND its parts
      for (const part of splitIdentifier(raw)) push(part, SUBTOKEN_WEIGHT, true);
    } else if (!isDistinctiveIdentifier(raw)) {
      for (const v of getStemVariants(raw)) push(v, STEM_VARIANT_WEIGHT, true);
    }
  }
  // Path fragments (contain a separator, so WORD_RE alone would shatter them):
  // emit the normalized project-relative suffix as a distinctive, non-derived,
  // file-shaped token. The constituent words were already emitted above.
  for (const p of extractPathTokens(query)) push(p, 1, false, true);
  return [...seen.values()];
}

/** Is this query about tests? (suspends test-file demotion, §6.1) */
export function queryMentionsTests(tokens: QueryToken[]): boolean {
  return tokens.some((t) => /^(tests?|spec|specs|testing)$/.test(t.text));
}

/** Escape tokens into an FTS5 MATCH string (OR of quoted tokens; injection-safe). */
export function toFtsMatch(tokens: QueryToken[]): string {
  const quoted = tokens
    // path tokens carry `/` (not an FTS tokenchar) — they seed via file
    // resolution, never the bm25 pass (FIX-2); their words are already present.
    .filter((t) => !t.text.includes("/"))
    .map((t) => t.text.replace(/"/g, "").trim())
    .filter((t) => t.length > 0)
    // dotted compounds are not single FTS tokens (tokenchars only _$) — quote
    // them as phrases, which FTS treats as adjacent-token sequences.
    .map((t) => `"${t}"`);
  return quoted.join(" OR ");
}
