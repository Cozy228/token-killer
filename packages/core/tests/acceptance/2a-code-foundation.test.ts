/**
 * Slice 2a — Code source foundation (M2-ACCEPTANCE.md "2a"). Owns
 * B1-symbols · B1-parity · B1-multibyte · B1-worker · B1-dirty and feeds the
 * G-8/G-9 assertions in global-invariants.test.ts.
 *
 * Two tiers (CTX-IMPL §10): the deterministic CI tier uses in-memory / temp-dir
 * fixtures per tier-1 language; the living-repo tier ingests THIS checkout's
 * real `packages/core/src/` sources through the real parse worker.
 *
 * ⚠ verify-at-wiring — recorded against this checkout on 2026-07-05 (Node
 * 22.22.2, Apple M-series):
 *   • B1-symbols: `packages/core/src/store/store.ts` → 49 symbols
 *     ({const:2, class:4, function:5, method:38}); floor asserted at 40.
 *     Exact: sym:…#openStore (function [664,674]), sym:…#scrubToProjectRelative
 *     (function [135,142]), sym:…#SqliteStore.upsertEntity (method [180,207]).
 *   • B1-parity observed symbol counts: ts 4, tsx 4, js 4, python 4, go 4,
 *     java 3, rust 4, csharp 3 (Java/C# have no free functions → 1 class + 2
 *     methods). Each asserted EXACTLY below.
 *   • B1-worker D23 numerics adopted (docs/codemap/impl/D-language-coverage.md
 *     §D4/D5/D6): recycle 250 files / reset 5000 parses /
 *     timeout 10_000ms + 10_000ms per 100 KB / OOM → exit(1) / single worker.
 *   • B1-dirty: warm all-source dirtyCheck (shared scan cache warm) ~11ms; the
 *     first call of a fresh cycle (git rev-parse + one shared ls-files) ~22ms.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { RefreshEngine } from "../../src/ingest/refresh.ts";
import { CodeParserCore } from "../../src/extract/code/runtime.ts";
import {
  CodeParser,
  PARSE_TIMEOUT_BASE_MS,
  PARSE_TIMEOUT_STEP_BYTES,
  PARSE_TIMEOUT_STEP_MS,
  WORKER_RECYCLE_INTERVAL,
} from "../../src/extract/code/codeParser.ts";
import { PARSER_RESET_INTERVAL } from "../../src/extract/code/runtime.ts";
import { POISON_CONTENT, HANG_CONTENT } from "../../src/extract/code/protocol.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { blake2bHex } from "../../src/store/hash.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { createDefaultRegistry } from "../../src/ingest/registry.ts";
import type { LanguageId } from "../../src/extract/code/languages.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

const PKG_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");
const STORE_TS = "packages/core/src/store/store.ts";

// ---------------------------------------------------------------------------
// B1-symbols + B1-dirty — living repo, real parse worker
// ---------------------------------------------------------------------------
describe("acceptance: 2a B1-symbols + B1-dirty (living repo)", () => {
  let root: string;
  let store: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-2a-live-");
    store = openStore({ projectDir: REPO_ROOT, home: `${root}/ctx-home` });
    // Confirm the code source is real + dirty on a cold store, then warm ALL
    // sources (a "warm dirtyCheck" needs every cursor set — git short-circuits
    // only once its tip is stored, §4.2).
    const codeAdapter = new CodeSourceAdapter();
    const codeDirty = await codeAdapter.dirtyCheck(store);
    expect(codeDirty.source).toBe("code");
    expect(codeDirty.dirty).toBe(true); // cold store — every code file is new
    // Slice 4: memory write-through is always-on — sandbox its `.ctx` writer so the
    // cold path never creates `.ctx/` in the real repo (the hard constraint).
    const engine = new RefreshEngine(
      store,
      createDefaultRegistry({ memory: { ctxRoot: `${root}/ctx-mem` } }),
      { catchupGateMs: 600_000 },
    );
    await engine.refresh(600_000);
    await engine.background;
  }, 300_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B1-symbols: sym: entities for store.ts with qualified names, spans, per-symbol hash", () => {
    const db = new DatabaseSync(store.dbPath);
    db.exec("PRAGMA busy_timeout=5000");
    const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;

    const symCount = count(
      `SELECT COUNT(*) n FROM entities WHERE kind='symbol' AND json_extract(locator,'$.path')='${STORE_TS}'`,
    );
    // ⚠ observed 49; assert a floor (store.ts evolves across later slices).
    expect(
      symCount,
      `store.ts symbol count observed ${symCount} (floor 40)`,
    ).toBeGreaterThanOrEqual(40);

    // Three real symbols asserted EXACTLY (names confirmed against the file).
    const openStoreSym = store.getEntity(`sym:${STORE_TS}#openStore`);
    expect(openStoreSym?.kind).toBe("symbol");
    expect(openStoreSym?.name).toBe("openStore");
    expect(openStoreSym?.attrs.symbolKind).toBe("function");

    const scrub = store.getEntity(`sym:${STORE_TS}#scrubToProjectRelative`);
    expect(scrub?.name).toBe("scrubToProjectRelative");
    expect(scrub?.attrs.symbolKind).toBe("function");

    const upsert = store.getEntity(`sym:${STORE_TS}#SqliteStore.upsertEntity`);
    expect(upsert?.name).toBe("upsertEntity");
    expect(upsert?.attrs.symbolKind).toBe("method");
    expect(upsert?.attrs.qualified).toBe("SqliteStore.upsertEntity");

    // Every symbol carries a per-symbol content_hash and a line span in the
    // LOCATOR (never the id) — the §3/G-9 rule the whole slice is built on.
    for (const sym of [openStoreSym, scrub, upsert]) {
      expect(sym?.contentHash, "per-symbol content_hash present").toBeTruthy();
      expect(sym?.locator.t).toBe("file");
      const span = sym?.locator.t === "file" ? sym.locator.span : undefined;
      expect(Array.isArray(span) && span[0] >= 1 && span[1] >= span[0]).toBe(true);
      expect(sym?.id.includes(String(span?.[0]))).toBe(false); // span NOT in the id
    }
    db.close();
  });

  test("B1-dirty: warm all-source dirtyCheck <20ms; .gitignore honored (no ignored files parsed)", async () => {
    const adapters = createDefaultRegistry({ memory: { ctxRoot: `${root}/ctx-mem` } }).list();
    // Warm the shared-scan cache (steady-state serve path), then best-of-N min.
    await Promise.all(adapters.map((a) => a.dirtyCheck(store)));
    let warm = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 16; i++) {
      const t0 = performance.now();
      await Promise.all(adapters.map((a) => a.dirtyCheck(store)));
      warm = Math.min(warm, performance.now() - t0);
    }
    // ⚠ observed ~11ms warm (shared scan cache). CI runners are slower — scale
    // like perf-gates (win 6× / other 2×); the calibrated 20ms holds on dev.
    const factor = process.env.CI ? (process.platform === "win32" ? 6 : 2) : 1;
    expect(
      warm,
      `B1-dirty warm all-source dirtyCheck ${warm.toFixed(2)}ms (target <20ms)`,
    ).toBeLessThan(20 * factor);

    // .gitignore honored: gitignored trees (.research/, node_modules, dist) are
    // never scanned, so no symbol/file entity points into them.
    const db = new DatabaseSync(store.dbPath);
    const leaked = (
      db
        .prepare(
          "SELECT json_extract(locator,'$.path') p FROM entities WHERE json_extract(locator,'$.t')='file' AND (p LIKE '.research/%' OR p LIKE '%/node_modules/%' OR p LIKE 'node_modules/%')",
        )
        .all() as Array<{ p: string }>
    ).map((r) => r.p);
    expect(leaked, "no ignored files indexed").toEqual([]);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// B1-parity — one fixture per tier-1 language (deterministic tier)
// ---------------------------------------------------------------------------
interface ParityCase {
  lang: LanguageId;
  file: string;
  src: string;
  expectSymbols: number;
  expectKinds: Record<string, number>;
  named: string[]; // qualified names that MUST be present
}

const PARITY: ParityCase[] = [
  {
    lang: "typescript",
    file: "p.ts",
    src: `import { readFileSync } from "node:fs";\n/** greet returns a greeting */\nexport function greet(name: string): string { return "hi " + name; }\nexport function shout(name: string): string { return greet(name).toUpperCase(); }\nexport class Greeter { hello(): string { return greet("world"); } }\n`,
    expectSymbols: 4,
    expectKinds: { function: 2, class: 1, method: 1 },
    named: ["greet", "shout", "Greeter", "Greeter.hello"],
  },
  {
    lang: "tsx",
    file: "p.tsx",
    src: `import { readFileSync } from "node:fs";\n/** greet */\nexport function greet(name: string) { return <b>{name}</b>; }\nexport function shout(name: string) { return greet(name); }\nexport class Greeter { hello() { return greet("world"); } }\n`,
    expectSymbols: 4,
    expectKinds: { function: 2, class: 1, method: 1 },
    named: ["greet", "shout", "Greeter", "Greeter.hello"],
  },
  {
    lang: "javascript",
    file: "p.js",
    src: `import { readFileSync } from "node:fs";\n/** greet */\nexport function greet(name) { return "hi " + name; }\nexport function shout(name) { return greet(name).toUpperCase(); }\nexport class Greeter { hello() { return greet("world"); } }\n`,
    expectSymbols: 4,
    expectKinds: { function: 2, class: 1, method: 1 },
    named: ["greet", "shout", "Greeter", "Greeter.hello"],
  },
  {
    lang: "python",
    file: "p.py",
    src: `import os\ndef greet(name):\n    """greet returns a greeting"""\n    return "hi " + name\ndef shout(name):\n    return greet(name).upper()\nclass Greeter:\n    def hello(self):\n        return greet("world")\n`,
    expectSymbols: 4,
    expectKinds: { function: 2, class: 1, method: 1 },
    named: ["greet", "shout", "Greeter", "Greeter.hello"],
  },
  {
    lang: "go",
    file: "p.go",
    src: `package main\nimport "fmt"\n// Greet returns a greeting\nfunc Greet(name string) string { return "hi " + name }\nfunc Shout(name string) string { return fmt.Sprintf("%s", Greet(name)) }\ntype Greeter struct{}\nfunc (g Greeter) Hello() string { return Greet("world") }\n`,
    expectSymbols: 4,
    expectKinds: { function: 2, class: 1, method: 1 },
    named: ["Greet", "Shout", "Greeter", "Greeter.Hello"],
  },
  {
    lang: "java",
    file: "P.java",
    src: `import java.util.List;\n/** parity */\nclass Parity {\n  String greet(String name) { return "hi " + name; }\n  String shout(String name) { return greet(name).toUpperCase(); }\n}\n`,
    expectSymbols: 3,
    expectKinds: { class: 1, method: 2 },
    named: ["Parity", "Parity.greet", "Parity.shout"],
  },
  {
    lang: "rust",
    file: "p.rs",
    src: `use std::fmt;\n/// greet\nfn greet(name: &str) -> String { format!("hi {}", name) }\nfn shout(name: &str) -> String { greet(name).to_uppercase() }\nstruct Greeter;\nimpl Greeter { fn hello(&self) -> String { greet("world") } }\n`,
    expectSymbols: 4,
    expectKinds: { function: 2, class: 1, method: 1 },
    named: ["greet", "shout", "Greeter", "Greeter.hello"],
  },
  {
    lang: "csharp",
    file: "P.cs",
    src: `using System;\nclass Parity {\n  /// <summary>doc</summary>\n  string Greet(string name) { return "hi " + name; }\n  string Shout(string name) { return Greet(name).ToUpper(); }\n}\n`,
    expectSymbols: 3,
    expectKinds: { class: 1, method: 2 },
    named: ["Parity", "Parity.Greet", "Parity.Shout"],
  },
];

describe("acceptance: 2a B1-parity (per-language fixtures)", () => {
  let core: CodeParserCore;
  beforeAll(() => {
    core = new CodeParserCore();
  });
  afterAll(() => core.dispose());

  for (const c of PARITY) {
    test(`B1-parity: ${c.lang} extracts the expected entity table`, async () => {
      const res = await core.parse(c.file, c.src, c.lang);
      expect(res.hadError, `${c.lang} parses without error`).toBe(false);
      // ⚠ exact per-language count (recorded at wiring; exact, never a bound).
      expect(res.symbols.length, `${c.lang} symbol count`).toBe(c.expectSymbols);
      const kinds: Record<string, number> = {};
      for (const s of res.symbols) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
      expect(kinds).toEqual(c.expectKinds);
      const qualified = new Set(res.symbols.map((s) => s.qualified));
      for (const name of c.named) expect(qualified.has(name), `${c.lang} has ${name}`).toBe(true);
      // The query captured the import and at least one call site (best-effort).
      expect(res.imports.length, `${c.lang} import captured`).toBeGreaterThanOrEqual(1);
      expect(res.calls.length, `${c.lang} call captured`).toBeGreaterThanOrEqual(1);
      // Every symbol carries a per-symbol content hash of its node.text span.
      for (const s of res.symbols) expect(s.contentHash.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// B1-multibyte — G-8 span integrity (never byte-slice source text)
// ---------------------------------------------------------------------------
describe("acceptance: 2a B1-multibyte (G-8 span integrity)", () => {
  let core: CodeParserCore;
  beforeAll(() => {
    core = new CodeParserCore();
  });
  afterAll(() => core.dispose());

  // CJK + emoji BEFORE (comment) and INSIDE (string) each definition. The
  // preceding multibyte shifts every UTF-8 byte offset off the UTF-16 string
  // index — a byte-slice would corrupt the name/text; node.text stays correct.
  const MB_STRING = "日本語🍣テスト";
  const mbId: Array<{ lang: LanguageId; file: string; src: string; name: string; line: number }> = [
    {
      lang: "typescript",
      file: "m.ts",
      name: "问候",
      line: 2,
      src: `// 你好世界🎉\nexport function 问候() { return "${MB_STRING}"; }\n`,
    },
    {
      lang: "tsx",
      file: "m.tsx",
      name: "问候",
      line: 2,
      src: `// 你好🎉\nexport function 问候() { return <b>{"${MB_STRING}"}</b>; }\n`,
    },
    {
      lang: "javascript",
      file: "m.js",
      name: "问候",
      line: 2,
      src: `// 你好世界🎉\nexport function 问候() { return "${MB_STRING}"; }\n`,
    },
    {
      lang: "python",
      file: "m.py",
      name: "问候",
      line: 2,
      src: `# 你好世界🎉\ndef 问候():\n    return "${MB_STRING}"\n`,
    },
    {
      lang: "go",
      file: "m.go",
      name: "问候",
      line: 3,
      src: `package p\n// 你好🎉\nfunc 问候() string { return "${MB_STRING}" }\n`,
    },
    {
      lang: "rust",
      file: "m.rs",
      name: "问候",
      line: 2,
      src: `// 你好🎉\nfn 问候() -> String { format!("${MB_STRING}") }\n`,
    },
  ];

  for (const c of mbId) {
    test(`B1-multibyte: ${c.lang} multibyte identifier + span stay correct`, async () => {
      const res = await core.parse(c.file, c.src, c.lang);
      expect(res.hadError).toBe(false);
      const sym = res.symbols.find((s) => s.name === c.name);
      // Sharpest G-8 proof: the multibyte identifier survives verbatim (a byte
      // slice would mangle it) and the span points at the right LINE despite the
      // preceding multibyte comment shifting byte offsets.
      expect(sym, `${c.lang} multibyte identifier extracted`).toBeDefined();
      expect(sym?.name).toBe(c.name);
      expect(sym?.span[0]).toBe(c.line);
      // content_hash is over node.text (which contains the multibyte string).
      expect(sym?.contentHash.length).toBeGreaterThan(0);
    });
  }

  // Java / C# older grammars reject non-ASCII identifiers; prove G-8 there with
  // multibyte comment + string around an ASCII-named definition.
  const mbBody: Array<{ lang: LanguageId; file: string; src: string; q: string; line: number }> = [
    {
      lang: "java",
      file: "M.java",
      q: "C.greet",
      line: 4,
      src: `class C {\n  // 你好🎉\n  /** doc */\n  String greet() { return "${MB_STRING}"; }\n}\n`,
    },
    {
      lang: "csharp",
      file: "M.cs",
      q: "C.Greet",
      line: 3,
      src: `class C {\n  // 你好🎉\n  string Greet() { return "${MB_STRING}"; }\n}\n`,
    },
  ];
  for (const c of mbBody) {
    test(`B1-multibyte: ${c.lang} multibyte body + span stay correct`, async () => {
      const res = await core.parse(c.file, c.src, c.lang);
      expect(res.hadError).toBe(false);
      const sym = res.symbols.find((s) => s.qualified === c.q);
      expect(sym, `${c.lang} symbol extracted past the multibyte comment`).toBeDefined();
      expect(sym?.span[0]).toBe(c.line);
      expect(sym?.contentHash.length).toBeGreaterThan(0);
    });
  }

  test("B1-multibyte: rendered read-through text preserves multibyte (end-to-end)", async () => {
    // Ingest a multibyte fixture through the real adapter and read it back — the
    // locator span is line-based, so the rendered text keeps the CJK/emoji.
    const dir = makeTempDir("ctx-2a-mb-");
    try {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(`${dir}/proj`, { recursive: true });
      const src = `// 你好世界🎉\nexport function 问候() {\n  return "${MB_STRING}";\n}\n`;
      writeFileSync(`${dir}/proj/mb.ts`, src, "utf8");
      const store = openStore({ projectDir: `${dir}/proj`, home: `${dir}/home` });
      const adapter = new CodeSourceAdapter();
      const dirty = await adapter.dirtyCheck(store);
      await adapter.ingest(store, dirty, { deadline: Number.MAX_SAFE_INTEGER, now: Date.now });
      const sym = store.getEntity("sym:mb.ts#问候");
      expect(sym?.name).toBe("问候");
      const read = store.readThrough("sym:mb.ts#问候");
      expect(read.ok).toBe(true);
      if (read.ok) expect(read.text.includes(MB_STRING)).toBe(true);
      store.close();
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// B1-worker — worker isolation, respawn, laziness, D23 recycle
// ---------------------------------------------------------------------------
describe("acceptance: 2a B1-worker (isolation + respawn + D23)", () => {
  test("D23 numerics adopted verbatim (recorded)", () => {
    // ⚠ read back from docs/codemap/impl/D-language-coverage.md §D4/D5/D6.
    expect(WORKER_RECYCLE_INTERVAL).toBe(250);
    expect(PARSER_RESET_INTERVAL).toBe(5000);
    expect(PARSE_TIMEOUT_BASE_MS).toBe(10_000);
    expect(PARSE_TIMEOUT_STEP_BYTES).toBe(100_000);
    expect(PARSE_TIMEOUT_STEP_MS).toBe(10_000);
  });

  test("parsing runs in a worker; corrupted-WASM sim kills it and it respawns cleanly", async () => {
    const cp = new CodeParser();
    try {
      const first = await cp.parse("a.ts", "export function ok() { return 1; }", "typescript");
      expect(first.symbols.map((s) => s.name)).toContain("ok");
      expect(cp.spawnCount, "a real worker was spawned (not the in-process fallback)").toBe(1);

      // Corrupted-WASM simulation → worker exit(1) → the pending parse rejects.
      await expect(cp.parse("bad.ts", POISON_CONTENT, "typescript")).rejects.toThrow();

      // Next parse succeeds against a freshly respawned isolate.
      const after = await cp.parse("b.ts", "export function ok2() { return 2; }", "typescript");
      expect(after.symbols.map((s) => s.name)).toContain("ok2");
      expect(cp.spawnCount, "worker respawned after the crash").toBe(2);
    } finally {
      await cp.close();
    }
  }, 30_000);

  test("grammars load sequentially + lazily — no grammar loads for absent languages", async () => {
    const core = new CodeParserCore();
    try {
      await core.parse("only.ts", "export function a() {}", "typescript");
      expect(core.loadedLanguages()).toEqual(["typescript"]); // lazy: nothing else loaded
      await core.parse("only.py", "def b():\n    pass", "python");
      // Sequential loads accumulate in call order; still ONLY the two touched.
      expect(new Set(core.loadedLanguages())).toEqual(new Set(["typescript", "python"]));
      for (const absent of ["go", "java", "rust", "csharp", "javascript"]) {
        expect(core.loadedLanguages()).not.toContain(absent);
      }
    } finally {
      core.dispose();
    }
  });

  test("parser isolate recycles per the recycle interval (D23)", async () => {
    // Mechanism test with a small override; the real 250 constant is pinned above.
    const cp = new CodeParser({ recycleInterval: 5 });
    try {
      for (let i = 0; i < 12; i++) {
        await cp.parse(`f${i}.ts`, `export const c${i} = ${i};`, "typescript");
      }
      expect(
        cp.recycleCount,
        "recycled at least twice over 12 parses / interval 5",
      ).toBeGreaterThanOrEqual(2);
      expect(cp.spawnCount, "each recycle respawns a fresh isolate").toBeGreaterThanOrEqual(3);
    } finally {
      await cp.close();
    }
  }, 30_000);

  test("a hung parse rejects at the timeout, then the worker is replaced (D23 reject-first)", async () => {
    // A fresh CI runner pays a cold WASM re-init after the respawn, so a 200ms
    // parse timeout that is fine on dev hardware makes the post-respawn `ok.ts`
    // parse flake there. Keep it tight locally, generous on CI (still far under
    // the 30s budget); HANG_CONTENT never returns, so it times out regardless.
    const parseTimeoutMs = process.env.CI ? 3000 : 200;
    const cp = new CodeParser({ parseTimeoutMs });
    try {
      const t0 = performance.now();
      await expect(cp.parse("hang.ts", HANG_CONTENT, "typescript")).rejects.toThrow(/timed out/);
      expect(performance.now() - t0, "rejected near the timeout").toBeLessThan(
        parseTimeoutMs + 2000,
      );
      // Worker replaced → a normal parse succeeds afterwards.
      const ok = await cp.parse("ok.ts", "export function z() {}", "typescript");
      expect(ok.symbols.map((s) => s.name)).toContain("z");
    } finally {
      await cp.close();
    }
  }, 30_000);
});
