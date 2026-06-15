// Dev-time calibration for src/core/tokens.ts — NOT shipped, NOT imported at
// runtime. It fits the per-class chars-per-token constants used by the runtime
// heuristic against a REAL BPE tokenizer (gpt-tokenizer, o200k_base — the
// tokenizer matching the GPT-5.5 / Copilot world) over a corpus of real
// tool-output-shaped text. This is the "wrap real tools, never fabricate"
// justification for the constants: they come from measurement, even though the
// runtime stays zero-dependency.
//
//   pnpm add -D gpt-tokenizer
//   pnpm tsx scripts/calibrate-tokens.ts [corpusDir ...]
//
// Paste the printed CHARS_PER_TOKEN / WHITESPACE_CHARS_PER_TOKEN values back into
// src/core/tokens.ts and record the corpus + date in the ADR.
//
// Method: each text contributes its raw per-class feature counts (letters, digits,
// symbols, cjk, whitespace runs, whitespace chars) and its ground-truth token
// count. A non-negative least-squares fit gives a tokens-per-unit weight per
// feature; chars/token = 1/weight. Single tokenizer family by design — Claude's
// tokenizer is not available offline, so we calibrate to the GPT family and treat
// the result as an honest cross-family estimate (the runtime labels it heuristic).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type Encoder = { encode: (s: string) => number[] };

async function loadEncoder(): Promise<Encoder> {
  try {
    // o200k_base — GPT-5.x / GPT-4o family.
    const mod = await import("gpt-tokenizer/encoding/o200k_base");
    return mod as unknown as Encoder;
  } catch {
    console.error(
      "Missing dev dependency. Run:  pnpm add -D gpt-tokenizer\n" +
        "(gpt-tokenizer is dev-only — nothing it provides ships at runtime.)",
    );
    process.exit(1);
  }
}

// Mirror the classification in src/core/tokens.ts so the fit targets the same
// feature buckets the runtime accumulates.
function isCjk(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xffef)
  );
}
const isWs = (cp: number) => cp === 0x20 || (cp >= 0x09 && cp <= 0x0d) || cp === 0xa0;
const isDigit = (cp: number) => cp >= 0x30 && cp <= 0x39;
const isLetter = (cp: number) =>
  (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f);

type Features = { letters: number; digits: number; symbols: number; cjk: number; wsChars: number };

function featurize(text: string): Features {
  const f: Features = { letters: 0, digits: 0, symbols: 0, cjk: 0, wsChars: 0 };
  // Keep this bucketing byte-for-byte identical to src/core/tokens.ts:estimateTokens
  // (index loop over UTF-16 units; `units` reproduces the old `ch.length`) so a refit
  // computes ratios on the same bucketing the runtime estimator uses.
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.codePointAt(i) ?? 0;
    const units = cp > 0xffff ? 2 : 1;
    if (units === 2) i += 1;
    if (isWs(cp)) f.wsChars += 1;
    else if (isCjk(cp)) f.cjk += 1;
    else if (isDigit(cp)) f.digits += 1;
    else if (isLetter(cp)) f.letters += units;
    else f.symbols += units;
  }
  return f;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|js|json|md|txt|log|diff|patch|yml|yaml)$/.test(name) && st.size < 200_000)
      out.push(p);
  }
}

// Tiny non-negative least squares via projected gradient — enough for a 6-feature
// dev fit, no matrix library needed.
function nnls(X: number[][], y: number[], iters = 5000, lr = 1e-9): number[] {
  const cols = X[0].length;
  const w = new Array(cols).fill(0.25);
  for (let it = 0; it < iters; it++) {
    const grad = new Array(cols).fill(0);
    for (let r = 0; r < X.length; r++) {
      let pred = 0;
      for (let c = 0; c < cols; c++) pred += w[c] * X[r][c];
      const err = pred - y[r];
      for (let c = 0; c < cols; c++) grad[c] += err * X[r][c];
    }
    for (let c = 0; c < cols; c++) w[c] = Math.max(1e-6, w[c] - lr * grad[c]);
  }
  return w;
}

async function main(): Promise<void> {
  const enc = await loadEncoder();
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) dirs.push(join(process.cwd(), "src"), join(process.cwd(), "tests"));

  const files: string[] = [];
  for (const d of dirs) {
    try {
      walk(d, files);
    } catch {
      /* skip missing */
    }
  }
  if (files.length === 0) {
    console.error("No corpus files found under:", dirs.join(", "));
    process.exit(1);
  }

  const X: number[][] = [];
  const y: number[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!text.trim()) continue;
    const f = featurize(text);
    X.push([f.letters, f.digits, f.symbols, f.cjk, f.wsChars]);
    y.push(enc.encode(text).length);
  }

  const w = nnls(X, y);
  const [wLetter, wDigit, wSymbol, wCjk, wWsChars] = w;
  const cpt = (x: number) => (x > 1e-6 ? (1 / x).toFixed(2) : "∞");

  console.log(`corpus: ${X.length} files (o200k_base ground truth)\n`);
  console.log("Suggested src/core/tokens.ts constants:");
  console.log("const CHARS_PER_TOKEN = {");
  console.log(`  letter: ${cpt(wLetter)},`);
  console.log(`  digit: ${cpt(wDigit)},`);
  console.log(`  symbol: ${cpt(wSymbol)},`);
  console.log("} as const;");
  console.log(`const CJK_TOKENS_PER_CHAR = ${wCjk.toFixed(2)};`);
  console.log(`const WHITESPACE_CHARS_PER_TOKEN = ${cpt(wWsChars)};`);
}

void main();
