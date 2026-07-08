/**
 * Unit — the per-language callee-resolution registry (2d, CONTEXA-IMPL §5.2). The
 * {local, project, builtin, unknown} outcome matrix and THE load-bearing rule
 * (callee resolution NEVER binds across languages) are pinned here as pure
 * functions, no store required.
 */
import { describe, expect, test } from "vitest";
import {
  BUILTINS,
  buildCalleeIndex,
  enclosingSymbol,
  resolveCallee,
  type IndexedSymbol,
} from "../../src/ingest/code/callGraph.ts";
import type { SymbolRecord } from "../../src/extract/code/symbol.ts";

const SYMBOLS: IndexedSymbol[] = [
  // a.ts defines `helper` locally; b.ts ALSO defines `helper` (project-ambiguous).
  { id: "sym:a.ts#helper", name: "helper", lang: "typescript", path: "a.ts" },
  { id: "sym:a.ts#caller", name: "caller", lang: "typescript", path: "a.ts" },
  { id: "sym:b.ts#helper", name: "helper", lang: "typescript", path: "b.ts" },
  // uniqueFn is defined once across the whole TS project.
  { id: "sym:u.ts#uniqueFn", name: "uniqueFn", lang: "typescript", path: "u.ts" },
  // `shared` exists in BOTH python and go — the cross-language firewall case.
  { id: "sym:x.py#shared", name: "shared", lang: "python", path: "x.py" },
  { id: "sym:y.go#shared", name: "shared", lang: "go", path: "y.go" },
  { id: "sym:y.go#goOnly", name: "goOnly", lang: "go", path: "y.go" },
];
const INDEX = buildCalleeIndex(SYMBOLS);

describe("unit: callee-resolution registry (2d)", () => {
  test("local — a same-file definition wins, even when the name is project-ambiguous", () => {
    // `helper` appears in a.ts AND b.ts, but a call from a.ts binds to a.ts's.
    expect(resolveCallee(INDEX, "typescript", "a.ts", "helper")).toEqual({
      outcome: "local",
      targetId: "sym:a.ts#helper",
    });
  });

  test("project — a unique same-language definition elsewhere resolves", () => {
    expect(resolveCallee(INDEX, "typescript", "a.ts", "uniqueFn")).toEqual({
      outcome: "project",
      targetId: "sym:u.ts#uniqueFn",
    });
  });

  test("builtin — a language global resolves to builtin, no target", () => {
    expect(resolveCallee(INDEX, "typescript", "a.ts", "parseInt").outcome).toBe("builtin");
    expect(resolveCallee(INDEX, "python", "x.py", "print").outcome).toBe("builtin");
    expect(resolveCallee(INDEX, "go", "y.go", "append").outcome).toBe("builtin");
    // a builtin never carries a targetId (no symbol entity is fabricated).
    expect(resolveCallee(INDEX, "typescript", "a.ts", "parseInt").targetId).toBeUndefined();
  });

  test("unknown — an ambiguous same-language name is NEVER guessed", () => {
    // `helper` from u.ts (no local helper) → 2 project candidates → unknown.
    expect(resolveCallee(INDEX, "typescript", "u.ts", "helper")).toEqual({ outcome: "unknown" });
    // an entirely unresolved name → unknown.
    expect(resolveCallee(INDEX, "typescript", "a.ts", "nope")).toEqual({ outcome: "unknown" });
  });

  test("NEVER binds across languages — same name, different language stays partitioned", () => {
    // `shared` exists in python AND go; each language resolves ONLY to its own.
    expect(resolveCallee(INDEX, "python", "z.py", "shared")).toEqual({
      outcome: "project",
      targetId: "sym:x.py#shared",
    });
    expect(resolveCallee(INDEX, "go", "z.go", "shared")).toEqual({
      outcome: "project",
      targetId: "sym:y.go#shared",
    });
    // a python call to a GO-ONLY name never binds — it is unknown, not go's symbol.
    expect(resolveCallee(INDEX, "python", "z.py", "goOnly")).toEqual({ outcome: "unknown" });
  });

  test("tsx shares the typescript builtin + symbol partition", () => {
    expect(resolveCallee(INDEX, "tsx", "a.ts", "parseInt").outcome).toBe("builtin");
  });

  test("builtin sets cover every tier-1 base language", () => {
    for (const lang of ["typescript", "javascript", "python", "go", "rust", "java", "csharp"]) {
      expect(BUILTINS[lang as keyof typeof BUILTINS]!.size).toBeGreaterThan(0);
    }
  });
});

describe("unit: enclosing-symbol attribution (2d)", () => {
  function sym(id: string, span: [number, number]): SymbolRecord {
    return { id, name: id, qualified: id, kind: "function", span, contentHash: "h" };
  }
  const RECS = [sym("cls", [1, 20]), sym("method", [5, 10]), sym("top", [22, 24])];

  test("the innermost (smallest) containing span is the caller", () => {
    expect(enclosingSymbol(RECS, 7)).toBe("method"); // inside method ⊂ cls
    expect(enclosingSymbol(RECS, 2)).toBe("cls"); // in cls but outside method
    expect(enclosingSymbol(RECS, 23)).toBe("top");
  });

  test("a call outside every symbol is unattributed (no caller edge)", () => {
    expect(enclosingSymbol(RECS, 21)).toBeUndefined();
    expect(enclosingSymbol(RECS, 99)).toBeUndefined();
  });
});
