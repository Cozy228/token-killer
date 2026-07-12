import { describe, expect, test } from "vitest";
import {
  getStemVariants,
  isDistinctiveIdentifier,
  isIdentifierShaped,
  splitIdentifier,
  STOPWORDS,
  toFtsMatch,
  tokenizeQuery,
} from "../../src/select/tokenize.ts";
import {
  PROJECT_NAME_TOKEN_WEIGHT,
  STEM_VARIANT_WEIGHT,
  SUBTOKEN_WEIGHT,
} from "../../src/select/constants.ts";

// §10: tokenizer table-driven cases (CONTEXA-IMPL §6.1, codegraph query-utils rules).

describe("select/tokenize: identifier shape + distinctiveness", () => {
  const shaped: Array<[string, boolean]> = [
    ["processOrder", true], // camelCase
    ["PageRank", true], // PascalCase ≥2 humps
    ["snake_case", true],
    ["dotted.path", true],
    ["sha256", true], // digit
    ["word", false],
    ["Capitalized", false], // single hump, prose-shaped
    ["kebab-case", false], // '-' breaks the word regex
  ];
  test.each(shaped)("isIdentifierShaped(%s) = %s", (word, want) => {
    expect(isIdentifierShaped(word)).toBe(want);
  });

  test("distinctive gating: shaped AND ≥4 chars AND not a stopword", () => {
    expect(isDistinctiveIdentifier("assertNoEgress")).toBe(true);
    expect(isDistinctiveIdentifier("a_b")).toBe(false); // too short
    expect(isDistinctiveIdentifier("verification")).toBe(false); // prose word
  });
});

describe("select/tokenize: splitting keeps the compound token", () => {
  const cases: Array<[string, string[]]> = [
    ["processOrder", ["process", "order"]],
    ["HTMLParser", ["html", "parser"]],
    ["snake_case_word", ["snake", "case", "word"]],
    ["pkg.module.Fn", ["pkg", "module", "fn"]],
  ];
  test.each(cases)("splitIdentifier(%s)", (word, parts) => {
    expect(splitIdentifier(word)).toEqual(parts);
  });

  test("tokenizeQuery keeps compound AND sub-tokens, sub-tokens down-weighted", () => {
    const tokens = tokenizeQuery("why does processOrder retry");
    const byText = new Map(tokens.map((t) => [t.text, t]));
    expect(byText.has("processorder")).toBe(true); // compound kept (case-folded)
    expect(byText.get("process")?.weight).toBe(SUBTOKEN_WEIGHT);
    expect(byText.get("order")?.weight).toBe(SUBTOKEN_WEIGHT);
    expect(byText.get("processorder")?.distinctive).toBe(true);
    expect(byText.get("process")?.derived).toBe(true);
  });
});

describe("select/tokenize: stem variants", () => {
  test("caching → cach/cache; eviction → evict; entries → entry", () => {
    expect(getStemVariants("caching")).toEqual(expect.arrayContaining(["cach", "cache"]));
    expect(getStemVariants("eviction")).toEqual(expect.arrayContaining(["evict"]));
    expect(getStemVariants("entries")).toEqual(expect.arrayContaining(["entry"]));
    expect(getStemVariants("builder")).toEqual(expect.arrayContaining(["build"]));
    expect(getStemVariants("handled")).toEqual(expect.arrayContaining(["handle"]));
  });

  test("variants join the token set at reduced weight; distinctive identifiers do NOT expand", () => {
    const tokens = tokenizeQuery("caching strategy");
    const cache = tokens.find((t) => t.text === "cache");
    expect(cache?.weight).toBe(STEM_VARIANT_WEIGHT);
    expect(cache?.derived).toBe(true);

    const identTokens = tokenizeQuery("cacheEviction");
    // identifier split, not stem-expanded from the compound
    expect(identTokens.some((t) => t.text === "cacheeviction")).toBe(true);
    expect(identTokens.some((t) => t.text === "eviction")).toBe(true);
  });
});

describe("select/tokenize: stopwords + project-name down-weighting", () => {
  test("stopwords never tokenize", () => {
    const tokens = tokenizeQuery("how does the retry work");
    const texts = tokens.map((t) => t.text);
    for (const stop of ["how", "does", "the", "work"]) expect(texts).not.toContain(stop);
    expect(texts).toContain("retry");
  });

  test("STOPWORDS is lowercase-only and non-trivial", () => {
    expect(STOPWORDS.size).toBeGreaterThan(50);
    for (const w of STOPWORDS) expect(w).toBe(w.toLowerCase());
  });

  test("project-name tokens are down-weighted, never dropped", () => {
    const tokens = tokenizeQuery("token killer retry", "/home/u/token-killer");
    const token = tokens.find((t) => t.text === "token");
    const killer = tokens.find((t) => t.text === "killer");
    const retry = tokens.find((t) => t.text === "retry");
    expect(token?.weight).toBe(PROJECT_NAME_TOKEN_WEIGHT);
    expect(killer?.weight).toBe(PROJECT_NAME_TOKEN_WEIGHT);
    expect(retry?.weight).toBe(1);
  });
});

describe("select/tokenize: path-aware tokens (FIX-2)", () => {
  test("a `/`-path with a :line suffix emits a normalized file-shaped path token", () => {
    const tokens = tokenizeQuery("where is src/hook/rewrite.ts:40 used");
    const path = tokens.find((t) => t.text === "src/hook/rewrite.ts");
    expect(path?.fileShaped).toBe(true);
    expect(path?.derived).toBe(false);
    // the constituent words are still emitted (existing bm25 behavior)
    expect(tokens.some((t) => t.text === "hook")).toBe(true);
    expect(tokens.some((t) => t.text === "rewrite")).toBe(true);
  });

  test("a Windows `\\`-path normalizes to forward slashes", () => {
    const tokens = tokenizeQuery("open src\\hook\\rewrite.ts");
    expect(tokens.some((t) => t.fileShaped && t.text === "src/hook/rewrite.ts")).toBe(true);
  });

  test("a bare basename with an extension is file-shaped", () => {
    const tokens = tokenizeQuery("what calls rewrite.ts");
    const bare = tokens.find((t) => t.text === "rewrite.ts");
    expect(bare?.fileShaped).toBe(true);
  });

  test("a plain identifier is not file-shaped", () => {
    const tokens = tokenizeQuery("processOrder retry");
    expect(tokens.find((t) => t.text === "processorder")?.fileShaped).toBe(false);
  });

  test("path tokens are excluded from the FTS MATCH (not FTS tokenchars)", () => {
    const match = toFtsMatch(tokenizeQuery("read src/hook/rewrite.ts:40"));
    expect(match).not.toContain("/");
    expect(match).toContain('"rewrite.ts"'); // the bare basename still matches
  });
});

describe("select/tokenize: FTS MATCH construction is injection-safe", () => {
  test("tokens are quoted and OR'd", () => {
    const match = toFtsMatch(tokenizeQuery("retry queue"));
    expect(match).toContain('"retry"');
    expect(match).toContain('"queue"');
    expect(match).toMatch(/^("[^"]+")( OR "[^"]+")*$/);
  });

  test("FTS operators in the query cannot escape quoting", () => {
    const match = toFtsMatch(tokenizeQuery('retry" OR x NEAR( AND *'));
    // OR/AND are stopwords; NEAR survives only as a quoted plain token.
    expect(match).toBe('"retry" OR "near"');
  });
});
