/**
 * Unit coverage for the extractor's subtle rules (CTX-IMPL §5.2/§3): the
 * callable-ancestor local filter, arrow-const de-dup, and overload
 * disambiguation. These are the edge cases the per-language acceptance fixtures
 * do not exercise.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CodeParserCore } from "../../src/extract/code/runtime.ts";
import type { LanguageId } from "../../src/extract/code/languages.ts";

describe("code extractor rules", () => {
  let core: CodeParserCore;
  beforeAll(() => {
    core = new CodeParserCore();
  });
  afterAll(() => core.dispose());

  const parse = (src: string, lang: LanguageId = "typescript") => core.parse("t.ts", src, lang);

  test("locals inside a function body are dropped (no const explosion)", async () => {
    const res = await parse(
      `export function outer() {\n  const local = 1;\n  const arrow = () => 2;\n  function inner() { return 3; }\n  return local + arrow() + inner();\n}\n`,
    );
    // Only `outer` is a symbol — every nested declaration is a local.
    expect(res.symbols.map((s) => s.qualified)).toEqual(["outer"]);
  });

  test("top-level arrow/function-valued const is ONE function symbol (no const double-count)", async () => {
    const res = await parse(
      `export const handler = (x: number) => x + 1;\nexport const CONFIG = { a: 1 };\n`,
    );
    const handler = res.symbols.find((s) => s.name === "handler");
    const config = res.symbols.find((s) => s.name === "CONFIG");
    // The arrow declarator matches both the function and const patterns — kind
    // priority keeps ONE function symbol, not a duplicate.
    expect(res.symbols.filter((s) => s.name === "handler")).toHaveLength(1);
    expect(handler?.kind).toBe("function");
    expect(config?.kind).toBe("const"); // a plain value stays const
  });

  test("class methods qualify by their class; top-level functions do not", async () => {
    const res = await parse(
      `export function free() {}\nexport class Svc {\n  run() {}\n  static make() {}\n}\n`,
    );
    const q = new Set(res.symbols.map((s) => s.qualified));
    expect(q.has("free")).toBe(true);
    expect(q.has("Svc")).toBe(true);
    expect(q.has("Svc.run")).toBe(true);
    expect(q.has("Svc.make")).toBe(true);
    expect(res.symbols.find((s) => s.qualified === "Svc.run")?.kind).toBe("method");
  });

  test("overloaded same-name methods get distinct ids via arity (§3 disambig)", async () => {
    const res = await parse(
      `class C {\n  int foo(int a) { return a; }\n  int foo(int a, int b) { return a + b; }\n}\n`,
      "java",
    );
    const foos = res.symbols.filter((s) => s.name === "foo").map((s) => s.id);
    // Two distinct symbols, disambiguated by arity — never collapsed to one id.
    expect(new Set(foos).size).toBe(2);
    expect(foos.some((id) => id.includes("~1"))).toBe(true);
    expect(foos.some((id) => id.includes("~2"))).toBe(true);
  });

  test("a unique name keeps a bare id (no gratuitous disambig — G-9)", async () => {
    const res = await parse(`export function only() {}\n`);
    expect(res.symbols[0]?.id).toBe("sym:t.ts#only");
  });
});
