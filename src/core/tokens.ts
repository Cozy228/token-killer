// The single token estimator (metrics-ledger Gap A, ADR 0004 Decision 8). Every
// ledger and the telemetry builder import from here so the estimate can never drift
// between what `tk gain` shows and what telemetry sends. A rough heuristic, not a real
// tokenizer.
//
// ASCII/Latin averages ~4 chars/token, but a CJK ideograph is typically ~1 token EACH.
// The old flat `chars / 4` therefore under-counted CJK text (and its savings) ~4× (L2).
// We count CJK/Japanese/Korean codepoints as 1 token and bucket the rest at ~4 chars/
// token, so pure-ASCII input is identical to the old heuristic.
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

export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (isCjk(ch.codePointAt(0) ?? 0)) cjk += 1;
    else other += ch.length;
  }
  return Math.ceil(cjk + other / 4);
}
