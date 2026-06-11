// The single token estimator (metrics-ledger Gap A, ADR 0004 Decision 8). Every
// ledger and the telemetry builder import from here so the estimate can never drift
// between what `tk gain` shows and what telemetry sends.
//
// This is a HEURISTIC, not a real tokenizer — Claude's tokenizer is not available
// offline, and the docs warn that approximating it with tiktoken/gpt-tokenizer
// undercounts by ~15-20%. The honest offline ceiling is a calibrated, segmented
// chars-per-token model: walk the text once, bucket each codepoint, and divide each
// bucket by a ratio measured against a real BPE tokenizer on a tool-output corpus
// (scripts/calibrate-tokens.ts — a dev-time tool; nothing it depends on ships at
// runtime). tk's workload is tool OUTPUT (code, logs, JSON, diffs, file trees),
// which tokenizes DENSER than prose — the old flat `other / 4` therefore
// systematically UNDER-counted tk's savings.
//
// Buckets (non-CJK):
//   - letters      ~3.8 chars/token  (code identifiers split on case/underscore)
//   - digits       ~3.0 chars/token  (numbers tokenize as 1-3 digit chunks)
//   - symbols      ~2.2 chars/token  (code punctuation is mostly 1 token each)
//   - whitespace   ~5 chars/token    (a single space is absorbed into the next
//                  token by BPE — near-free — and runs of indentation collapse
//                  into a few cheap whitespace tokens; counted per char, NOT per
//                  run: a per-run minimum would wrongly charge ~1 token for every
//                  single space between words)
// CJK ideographs/kana/hangul stay at ~1 token/char (the L2 fix — do not regress).
// Pure-ASCII prose lands close to the old `chars / 4`; code/logs come out higher,
// which is the correction.

// Calibrated ratios. Defaults below are literature-grounded starting points; run
// `pnpm calibrate-tokens` to refit them against a real tokenizer on the local
// tool-output corpus and update these constants (the script prints the fitted set).
const CHARS_PER_TOKEN = {
  letter: 3.8,
  digit: 3.0,
  symbol: 2.2,
} as const;
const CJK_TOKENS_PER_CHAR = 1.0;
// Whitespace chars per token. Slightly cheaper than content (single spaces are
// largely absorbed by BPE; indentation runs collapse), but counted per char so a
// single space between words never costs a whole token.
const WHITESPACE_CHARS_PER_TOKEN = 5;

function isCjk(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
    (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana + Katakana
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xff00 && cp <= 0xffef) // Fullwidth / halfwidth forms
  );
}

function isWhitespace(cp: number): boolean {
  // space, tab, newline, CR, vertical tab, form feed, NBSP
  return cp === 0x20 || (cp >= 0x09 && cp <= 0x0d) || cp === 0xa0;
}

function isDigit(cp: number): boolean {
  return cp >= 0x30 && cp <= 0x39;
}

function isLetter(cp: number): boolean {
  // ASCII letters plus the Latin-1/Latin-Extended ranges; anything non-letter,
  // non-digit, non-space, non-CJK falls through to the (denser) symbol bucket.
  return (
    (cp >= 0x41 && cp <= 0x5a) || // A-Z
    (cp >= 0x61 && cp <= 0x7a) || // a-z
    (cp >= 0xc0 && cp <= 0x24f) // Latin-1 Supplement + Latin Extended-A/B
  );
}

export function estimateTokens(text: string): number {
  let cjk = 0;
  let letters = 0;
  let digits = 0;
  let symbols = 0;
  let whitespaceChars = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isWhitespace(cp)) whitespaceChars += 1;
    else if (isCjk(cp)) cjk += 1;
    else if (isDigit(cp)) digits += 1;
    else if (isLetter(cp)) letters += ch.length;
    else symbols += ch.length;
  }

  const tokens =
    cjk * CJK_TOKENS_PER_CHAR +
    letters / CHARS_PER_TOKEN.letter +
    digits / CHARS_PER_TOKEN.digit +
    symbols / CHARS_PER_TOKEN.symbol +
    whitespaceChars / WHITESPACE_CHARS_PER_TOKEN;

  return Math.ceil(tokens);
}
