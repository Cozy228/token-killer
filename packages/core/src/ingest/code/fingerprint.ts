/**
 * Structural fingerprint (CTX-IMPL §4 — dirty classification; reference:
 * understand-anything `fingerprint.ts`, dependency-free TS). Slice 2c.
 *
 * A content-hash mismatch on a code file is classified NONE / COSMETIC /
 * STRUCTURAL. We reach this only when the raw bytes already differ, so the job
 * is: did the STRUCTURE change, or only whitespace / comments?
 *
 *   - COSMETIC  → reformat or comment-only edit: the normalized token stream is
 *                 identical → update the stored hash, SKIP all downstream
 *                 re-linking / invalidation (memory anchors untouched).
 *   - STRUCTURAL→ the normalized stream differs → full re-extract + cascade.
 *   - NONE      → identical bytes; never reached from the adapter (the byte hash
 *                 already filtered it out) but returned for a general caller.
 *
 * The classifier is CONSERVATIVE by construction: it only says COSMETIC when the
 * comment-stripped, whitespace-normalized text is byte-identical to the prior
 * generation's. A wrong STRUCTURAL is merely extra work; a wrong COSMETIC would
 * strand stale derived data, so every ambiguity (no baseline, unknown language,
 * extractor upgrade) resolves to STRUCTURAL.
 *
 * The normalizer is a single-pass lexical scanner — NOT a parser. It runs inside
 * `dirtyCheck` (the <20ms budget forbids a re-parse of every changed file). It
 * is language-approximate but only ever over-reports STRUCTURAL: the comparison
 * is old-normalized vs new-normalized, both run through the SAME normalizer, so
 * an imperfect scan still detects any real structural change.
 */
import { blake2bHex } from "../../store/hash.ts";
import type { LanguageId } from "../../extract/code/languages.ts";

/**
 * Bumped when the extractor's symbol/edge semantics change: folding it into the
 * fingerprint means a stored (old-version) fingerprint can never equal a new one,
 * so the next change to any file force-invalidates to STRUCTURAL (§4). Unchanged
 * files still ride the (size,mtime) fast path — the same accepted blind spot.
 */
export const EXTRACTOR_VERSION = 1;

export type ChangeClass = "none" | "cosmetic" | "structural";

/** Python is the only tier-1 language whose line comment is `#`; everything else
 *  in the set is C-family (`//` + block). `#` elsewhere is a private field
 *  (JS/TS), an attribute (Rust `#[...]`) or a preprocessor directive (C#) — all
 *  STRUCTURAL, never a comment. */
function usesHashComments(lang: LanguageId): boolean {
  return lang === "python";
}

/**
 * Deterministic structural signature of source text: comments stripped,
 * whitespace normalized (a run of whitespace survives as ONE space only when it
 * separates two word characters, else it is removed), string/char/template
 * literal contents preserved verbatim (string content is structure). The
 * extractor version and language are folded in so a version bump or a language
 * change is always STRUCTURAL.
 */
export function structuralFingerprint(text: string, lang: LanguageId): string {
  const normalized = normalizeStructure(text, usesHashComments(lang));
  return blake2bHex(`v${EXTRACTOR_VERSION}${lang}${normalized}`);
}

/**
 * Classify a byte-level change given the prior generation's stored fingerprint.
 * No baseline (first sight, or a pre-2c cursor without a fingerprint) →
 * STRUCTURAL (conservative). Equal fingerprints → COSMETIC. Otherwise STRUCTURAL.
 */
export function classifyContentChange(
  prevFingerprint: string | undefined,
  nextFingerprint: string,
): ChangeClass {
  if (prevFingerprint === undefined) return "structural";
  return prevFingerprint === nextFingerprint ? "cosmetic" : "structural";
}

const WHITESPACE: ReadonlySet<string> = new Set([" ", "\t", "\n", "\r", "\f", "\v"]);

function isWordChar(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_" ||
    ch === "$"
  );
}

/**
 * Single-pass normalizer. Emits significant characters; collapses whitespace per
 * the word-boundary rule above; strips comments; copies string literal contents
 * verbatim (so `"a b"` stays distinct from `"ab"`). Triple-quoted strings
 * (Python) and back-tick strings (JS templates, Go raw strings) are handled so a
 * comment marker inside a string is never mistaken for a comment.
 */
function normalizeStructure(text: string, hashComments: boolean): string {
  const out: string[] = [];
  let last = ""; // last non-whitespace char actually emitted
  let pendingWs = false;
  const n = text.length;
  let i = 0;

  const flushBoundary = (next: string): void => {
    // A whitespace run only survives when it keeps two word tokens apart.
    if (pendingWs) {
      if (last !== "" && isWordChar(last) && isWordChar(next)) out.push(" ");
      pendingWs = false;
    }
  };
  const emit = (ch: string): void => {
    flushBoundary(ch);
    out.push(ch);
    last = ch;
  };
  const emitVerbatim = (ch: string): void => {
    // Inside a string literal: no whitespace collapsing, but a pending boundary
    // from before the opening delimiter still resolves against the delimiter
    // (handled when the delimiter was emitted), so just append.
    out.push(ch);
    last = ch;
  };

  const scanSingleString = (quote: string): void => {
    emit(quote);
    i++;
    while (i < n && text[i] !== quote) {
      if (text[i] === "\\" && i + 1 < n) {
        emitVerbatim(text[i]!);
        emitVerbatim(text[i + 1]!);
        i += 2;
        continue;
      }
      emitVerbatim(text[i]!);
      i++;
    }
    if (i < n) {
      emitVerbatim(quote);
      i++;
    }
  };

  const scanTripleString = (quote: string): void => {
    emit(quote);
    emitVerbatim(quote);
    emitVerbatim(quote);
    i += 3;
    while (i < n && !(text[i] === quote && text[i + 1] === quote && text[i + 2] === quote)) {
      emitVerbatim(text[i]!);
      i++;
    }
    if (i < n) {
      emitVerbatim(quote);
      emitVerbatim(quote);
      emitVerbatim(quote);
      i += 3;
    }
  };

  while (i < n) {
    const ch = text[i]!;

    if (WHITESPACE.has(ch)) {
      pendingWs = true;
      i++;
      continue;
    }

    // Comments (stripped; a stripped comment acts as a whitespace boundary).
    if (!hashComments && ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i++;
      pendingWs = true;
      continue;
    }
    if (!hashComments && ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      if (i < n) i += 2; // consume the closing */
      pendingWs = true;
      continue;
    }
    if (hashComments && ch === "#") {
      i++;
      while (i < n && text[i] !== "\n") i++;
      pendingWs = true;
      continue;
    }

    // String / char / template literals.
    if (ch === '"' || ch === "'") {
      if (text[i + 1] === ch && text[i + 2] === ch) scanTripleString(ch);
      else scanSingleString(ch);
      continue;
    }
    if (ch === "`") {
      scanSingleString("`");
      continue;
    }

    emit(ch);
    i++;
  }

  return out.join("");
}
