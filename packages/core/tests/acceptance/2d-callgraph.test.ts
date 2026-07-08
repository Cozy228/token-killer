/**
 * Slice 2d — Call edges, facets, mention→symbol (M2-ACCEPTANCE.md "2d"). Flips
 * the 2a-wired B4 todos green. Two tiers (CONTEXA-IMPL §10):
 *
 *  • Deterministic tier — script-generated fixtures for the full
 *    {local, project, builtin, unknown} resolution matrix, the ~800-token facet
 *    budget, THE cross-language non-binding case, and two-tier mention→symbol.
 *  • Living-repo tier — a REAL doc mention of a REAL M1 symbol in this repo
 *    (`docs/build/M2-ACCEPTANCE.md` mentions `openStore` → symbol-match link).
 *
 * ⚠ verify-at-wiring is recorded per assertion (the producing command in the
 * slice report). The B6 flagship lives in 2d-biography.test.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { serveContext } from "../../src/serve/serve.ts";
import { estimateTokens } from "../../src/select/project.ts";
import { FACET_BUDGET_TOKENS } from "../../src/select/constants.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

// ---------------------------------------------------------------------------
// Deterministic tier
// ---------------------------------------------------------------------------
describe("acceptance: 2d call edges + facets + mention→symbol (deterministic)", () => {
  let root: string;
  let proj: string;
  let store: Store;

  const write = (rel: string, content: string): void =>
    writeFileSync(join(proj, rel), content, "utf8");

  async function ingestCode(): Promise<void> {
    clearScanCache();
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await adapter.ingest(store, await adapter.dirtyCheck(store), MAX_BUDGET);
  }
  async function ingestDocs(): Promise<void> {
    clearScanCache();
    const adapter = new DocsAdapter();
    await adapter.ingest(store, await adapter.dirtyCheck(store), MAX_BUDGET);
  }
  const callees = (id: string): string[] =>
    store
      .linksFrom(id, "calls")
      .map((l) => l.dst)
      .sort();
  const callers = (id: string): string[] =>
    store
      .linksTo(id, "calls")
      .map((l) => l.src)
      .sort();

  beforeEach(() => {
    root = makeTempDir("ctx-2d-");
    proj = join(root, "proj");
    mkdirSync(proj, { recursive: true });
    store = openStore({ projectDir: proj, home: join(root, "home") });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B4-resolution: {local, project, builtin, unknown} outcomes; ambiguous → unknown; NEVER binds cross-language", async () => {
    // local — a same-file callee.
    write(
      "local.ts",
      `export function add(a: number, b: number): number { return a + b; }\n` +
        `export function calc(a: number, b: number): number { return add(a, b); }\n`,
    );
    // project — a unique cross-file callee (+ a builtin call that makes NO edge).
    write("util.ts", `export function helper(): number { return 1; }\n`);
    write(
      "project.ts",
      `import { helper } from "./util.ts";\n` +
        `export function run(): number { return helper() + parseInt("2", 10); }\n`,
    );
    // ambiguous — `dup` is defined in two files → a call resolves to NEITHER.
    write("dupA.ts", `export function dup(): void {}\n`);
    write("dupB.ts", `export function dup(): void {}\n`);
    write("useDup.ts", `export function useDup(): void { dup(); }\n`);
    // cross-language — `shared` exists in TS AND Python; the Python call binds
    // ONLY to the Python `shared`, never the TS one (the load-bearing rule).
    write("xlang.ts", `export function shared(): number { return 1; }\n`);
    write("xlang.py", `def shared():\n    return 1\n\n\ndef borrows():\n    return shared()\n`);
    await ingestCode();

    // local: calc → add, confidence 1.0.
    expect(callees("sym:local.ts#calc")).toContain("sym:local.ts#add");
    expect(
      store.linksFrom("sym:local.ts#calc", "calls").find((l) => l.dst === "sym:local.ts#add")
        ?.confidence,
    ).toBe(1.0);

    // project: run → util.ts#helper. parseInt is a builtin → NO edge, NO entity.
    expect(callees("sym:project.ts#run")).toEqual(["sym:util.ts#helper"]);
    expect(store.getEntity("sym:project.ts#parseInt")).toBeUndefined();
    expect(store.entitiesByName("parseInt").length).toBe(0);

    // ambiguous → unknown: useDup resolves to NEITHER dup (no guess).
    expect(callees("sym:useDup.ts#useDup")).toEqual([]);

    // ⚠ cross-language non-binding: xlang.py#borrows calls `shared` — binds to
    // the PYTHON shared, and NEVER to the same-named TS symbol.
    expect(callees("sym:xlang.py#borrows")).toEqual(["sym:xlang.py#shared"]);
    expect(callees("sym:xlang.py#borrows")).not.toContain("sym:xlang.ts#shared");

    // Every call edge is a Derived, tree-sitter-carried structural claim.
    const claim = store
      .claimsFor("sym:local.ts#calc", "calls")
      .find((c) => c.object === "sym:local.ts#add");
    expect(claim?.authority).toBe("derived");
    expect(claim?.carrier).toBe("tree-sitter");
    expect(claim?.method).toBe("structural");
  });

  test("B4-facets: [handle]!callers / !callees round-trip through serve within the ~800-token budget; the M1 'lands at M2' notice is gone", async () => {
    write("util.ts", `export function helper(): number { return 1; }\n`);
    write(
      "project.ts",
      `import { helper } from "./util.ts";\n` +
        `export function run(): number { return helper(); }\n`,
    );
    await ingestCode();

    // callers of helper = run (round-trips, no M1 notice).
    const cr = await serveContext({ store }, { ref: "sym:util.ts#helper!callers" });
    expect(cr.isError).toBe(false);
    expect(cr.text).toContain("run");
    expect(cr.text).not.toContain("lands at M2");
    // callees of run = helper.
    const ce = await serveContext({ store }, { ref: "sym:project.ts#run!callees" });
    expect(ce.isError).toBe(false);
    expect(ce.text).toContain("helper");
    expect(ce.text).not.toContain("lands at M2");

    // Budget: a hub with 150 callers caps the callers facet at ~800 tokens and
    // discloses the truncation (never a silent drop).
    let hub = `export function hub(): void {}\n`;
    for (let i = 0; i < 150; i++) hub += `export function c${i}(): void { hub(); }\n`;
    write("hub.ts", hub);
    await ingestCode();
    const big = await serveContext({ store }, { ref: "sym:hub.ts#hub!callers" });
    expect(big.isError).toBe(false);
    expect(estimateTokens(big.text)).toBeLessThanOrEqual(FACET_BUDGET_TOKENS + 80); // + header
    expect(big.text).toContain("truncated");
    expect(big.text).not.toContain("lands at M2");
  });

  test("B4-mention: backticked identifiers → references links, symbol-match method (Derived), two-tier confidence", async () => {
    write("lib.ts", `export function fetchOrder(id: string): string { return id; }\n`);
    write("svc.ts", `export class Service {\n  persist(): void {}\n}\n`);
    write("acct.ts", `export class Account {\n  balance(): number { return 0; }\n}\n`);
    // exact QUALIFIED mentions (1.0 — `fetchOrder`, `Service.persist`), a bare
    // basename mention (0.6 — `balance`, matched by unqualified name only), and a
    // bare word that matches NOTHING (stays unresolved — no false link).
    write(
      "guide.md",
      `# Guide\n\nCall \`fetchOrder\`, then \`Service.persist\`; read \`balance\`. Ignore \`nonexistent\`.\n`,
    );
    await ingestCode(); // code FIRST (mention resolution reads published symbols)
    await ingestDocs();

    const refs = store.linksFrom("file:guide.md", "references");
    const byDst = new Map(refs.map((l) => [l.dst, l]));

    // exact qualified match → 1.0 (a top-level function's qualified === its name).
    const fetch = byDst.get("sym:lib.ts#fetchOrder");
    expect(fetch, "`fetchOrder` resolved").toBeDefined();
    expect(fetch!.method).toBe("symbol-match");
    expect(fetch!.confidence).toBe(1.0);

    // exact qualified `Service.persist` → 1.0.
    expect(byDst.get("sym:svc.ts#Service.persist")?.confidence).toBe(1.0);

    // basename fallback: bare `balance` (unqualified name, unique) → 0.6.
    const balance = byDst.get("sym:acct.ts#Account.balance");
    expect(balance, "`balance` resolved by basename fallback").toBeDefined();
    expect(balance!.method).toBe("symbol-match");
    expect(balance!.confidence).toBe(0.6);
    const balClaim = store
      .claimsFor("file:guide.md", "references")
      .find((c) => c.object === "sym:acct.ts#Account.balance");
    expect(balClaim?.authority).toBe("derived");
    expect(balClaim?.method).toBe("symbol-match");

    // an unresolved word never fabricates a link.
    expect(refs.some((l) => l.dst.includes("nonexistent"))).toBe(false);
  });

  test("B4-mention: an AMBIGUOUS symbol name never resolves (conservative)", async () => {
    write("a.ts", `export function shared(): void {}\n`);
    write("b.ts", `export function shared(): void {}\n`);
    write("doc.md", `# D\n\nSee \`shared\` for details.\n`);
    await ingestCode();
    await ingestDocs();
    // two symbols named `shared` → the prose mention resolves to neither.
    const refs = store.linksFrom("file:doc.md", "references").map((l) => l.dst);
    expect(refs).not.toContain("sym:a.ts#shared");
    expect(refs).not.toContain("sym:b.ts#shared");
  });
});

// ---------------------------------------------------------------------------
// Living-repo tier — a REAL doc mention of a REAL M1 symbol
// ---------------------------------------------------------------------------
describe("acceptance: 2d mention→symbol (living repo)", () => {
  let root: string;
  let store: Store;
  // ⚠ CONTEXA-IMPL.md §5.1 mentions `parseDiffHunks` in backticks; it is a REAL M1
  // symbol in packages/core/src/ingest/git/diffHunks.ts (unique → exact tier).
  //   grep -n '`parseDiffHunks`' CONTEXA-IMPL.md
  //   grep -n 'function parseDiffHunks' packages/core/src/ingest/git/diffHunks.ts
  const TARGET_SYM = "sym:packages/core/src/ingest/git/diffHunks.ts#parseDiffHunks";
  const MENTION_DOC = "file:CONTEXA-IMPL.md";

  beforeAll(async () => {
    root = makeTempDir("ctx-2d-live-");
    store = openStore({ projectDir: REPO_ROOT, home: join(root, "contexa-home") });
    // Code FIRST so the symbols are published, THEN docs resolves the backticked
    // mentions against them (the cold-sync order the cost model gives).
    clearScanCache();
    const code = new CodeSourceAdapter({ inProcess: true });
    await code.ingest(store, await code.dirtyCheck(store), MAX_BUDGET);
    clearScanCache();
    const docs = new DocsAdapter();
    await docs.ingest(store, await docs.dirtyCheck(store), MAX_BUDGET);
  }, 300_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B4-mention: `parseDiffHunks` in CONTEXA-IMPL.md → symbol-match references link (Derived)", () => {
    // ⚠ the symbol exists at HEAD (span-free stable id).
    expect(store.getEntity(TARGET_SYM)?.kind, "parseDiffHunks is a real M1 symbol").toBe("symbol");
    // ⚠ THE edge: the design doc's backticked `parseDiffHunks` resolves to it.
    const link = store.linksFrom(MENTION_DOC, "references").find((l) => l.dst === TARGET_SYM);
    expect(link, `${MENTION_DOC} --references--> ${TARGET_SYM}`).toBeDefined();
    expect(link!.method).toBe("symbol-match");
    expect(link!.confidence).toBe(1.0); // parseDiffHunks's qualified name is unique → exact tier
    const claim = store.claimsFor(MENTION_DOC, "references").find((c) => c.object === TARGET_SYM);
    expect(claim?.authority).toBe("derived");
    expect(claim?.carrier).toBe("files");
    expect(claim?.method).toBe("symbol-match");
  });
});
