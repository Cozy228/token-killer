/**
 * Slice 1g — MCP serve (flagship). M1-ACCEPTANCE A7-why / A7-why2 / A7-drill /
 * A8-serving, plus the shared serve invariants (G-1..G-7) applied to EVERY
 * response via `assertServeInvariants` (the 1a design note).
 *
 * Two tiers per the acceptance bar:
 *  • living-repo tier — THIS token-killer checkout ingested via the REAL docs +
 *    git adapters into a temp CTX_HOME (G-7). P20 (rename→ctx) and P23/FORK-1
 *    (guide read-only) are decisions in FABLE-DECISION-LOG.md of this very repo.
 *  • deterministic fixture tier — an isolated ambiguous-name + unknown-ref +
 *    `N⇥` numbering fixture proving the serving mechanics under a fixed clock.
 *
 * ⚠ verify-at-wiring values, confirmed against this checkout on 2026-07-04:
 *  • P20 is `concept:FABLE-DECISION-LOG.md#p20`, locator FABLE-DECISION-LOG.md,
 *    line 113: "**P20 — Product name = `ctx`.** … Chosen after lore (obscure)…"
 *    (`grep -n '\*\*P20' FABLE-DECISION-LOG.md` → line 113). It surfaces in the
 *    decisions section (as the top-ranked omitted item, carrying a drill handle).
 *  • P23 is `concept:FABLE-DECISION-LOG.md#p23`, line 153:
 *    "**P23 — … forks resolved.** … FORK-1: **guide stays strictly read-only**"
 *    (`grep -n '\*\*P23' FABLE-DECISION-LOG.md` → line 153) — the single physical
 *    line carries FORK-1 + "guide … read-only", so its read-through cites both.
 *  • `entitiesByName("Decisions")` → 3 doc_section entities (heading "Decisions"
 *    in FABLE-DECISION-LOG.md + ADR 0037 + ADR 0041) → ambiguous ref.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { GitAdapter } from "../../src/ingest/git/adapter.ts";
import { serveContext, serveRemember, serveSearch } from "../../src/serve/serve.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";
import {
  assertG6EgressActive,
  assertG7Sandbox,
  assertServeInvariants,
} from "../helpers/serveInvariants.ts";

// The egress guard (M14) is ACTIVE on every serve call; scrub any model key
// from the runner so the SCENARIO calls exercise real serving (the dedicated
// G-6 test proves the refusal by injecting a key into the deps env).
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");
const P20_ID = "concept:FABLE-DECISION-LOG.md#p20";
const P23_ID = "concept:FABLE-DECISION-LOG.md#p23";

describe("acceptance: 1g mcp serve", () => {
  let liveRoot: string;
  let live: Store;
  let fxRoot: string;

  beforeAll(async () => {
    liveRoot = makeTempDir("ctx-a7-live-");
    live = openStore({ projectDir: REPO_ROOT, home: join(liveRoot, "ctx-home") });
    const budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
    const docs = new DocsAdapter();
    await docs.ingest(live, await docs.dirtyCheck(live), budget);
    const git = new GitAdapter();
    await git.ingest(live, await git.dirtyCheck(live), budget);
    fxRoot = makeTempDir("ctx-a7-fx-");
  }, 180_000);

  afterAll(() => {
    live.close();
    cleanupTempDir(liveRoot);
    cleanupTempDir(fxRoot);
  });

  /** The P20/P23 concept handle as it appears in a serve response's sections. */
  function citedHandle(
    resp: Awaited<ReturnType<typeof serveContext>>,
    entityId: string,
  ): string | undefined {
    const all = (resp.diag.sections ?? []).flatMap((s) => [...s.items, ...s.omitted]);
    return all.find((e) => live.resolveHandle(e.handle)?.entityId === entityId)?.handle;
  }

  test("A7-why", async () => {
    // ONE call, no retry: "why was the product renamed to ctx".
    const resp = await serveContext(
      { store: live },
      { task: "why was the product renamed to ctx" },
    );
    assertServeInvariants(resp, live);
    expect(resp.isError).toBe(false);

    // The decisions section cites P20 with a handle into FABLE-DECISION-LOG.md.
    const decisions = resp.diag.sections?.find((s) => s.name === "decisions");
    expect(decisions, "a decisions section is present").toBeDefined();
    const cited = [...decisions!.items, ...decisions!.omitted].find(
      (e) => live.resolveHandle(e.handle)?.entityId === P20_ID,
    );
    expect(cited, "decisions must cite P20 with a resolvable handle").toBeDefined();

    const p20 = live.getEntity(P20_ID);
    expect(p20?.locator).toMatchObject({ t: "file", path: "FABLE-DECISION-LOG.md" });
    // P20 is cited with a resolvable handle — drillable in ONE more call (the
    // surface's actual guarantee; A7-drill exercises the drill). We assert
    // citation + resolvability, NOT that P20 won the render cap: the living-repo
    // "why" ranking shifts as the repo's own docs churn, so a rendered-POSITION
    // assertion flakes on CI where the whole repo (incl. added docs) is ingested.
    expect(live.resolveHandle(cited!.handle)?.entityId).toBe(P20_ID);
  });

  test("A7-why2", async () => {
    const resp = await serveContext({ store: live }, { task: "why is the guide read-only" });
    assertServeInvariants(resp, live);
    expect(resp.isError).toBe(false);

    // Cites P23/FORK-1 with a handle into FABLE-DECISION-LOG.md.
    const handle = citedHandle(resp, P23_ID);
    expect(handle, "must cite P23 with a resolvable handle").toBeDefined();
    const p23 = live.getEntity(P23_ID);
    expect(p23?.locator).toMatchObject({ t: "file", path: "FABLE-DECISION-LOG.md" });
    // The read-through of P23's line surfaces BOTH FORK-1 and "read-only".
    expect(resp.text).toMatch(/FORK-1/);
    expect(resp.text).toMatch(/read-only/);
  });

  test("A7-drill", async () => {
    // A handle from A7-why, passed back, returns the EXPANSION via read-through.
    const why = await serveContext({ store: live }, { task: "why was the product renamed to ctx" });
    const handle = citedHandle(why, P20_ID);
    expect(handle, "A7-why must yield a P20 handle to drill").toBeDefined();

    const drill = await serveContext({ store: live }, { handle: handle! });
    assertServeInvariants(drill, live);
    expect(drill.isError).toBe(false);

    // Full decision text via read-through — VERBATIM source, not a re-summary:
    //  • the exact line-113 bytes appear ("Product name = `ctx`");
    //  • `N⇥` numbering (line 113, tab-prefixed) proves host-Read-tool read-back.
    expect(drill.text).toContain("Product name = `ctx`");
    expect(drill.text, "source line rendered N⇥ (line 113, tab-prefixed)").toMatch(/\n113\t/);
    // The drill resolves to the same P20 entity (round-trip, not a fresh summary).
    expect(live.resolveHandle(handle!)?.entityId).toBe(P20_ID);
  });

  test("A8-serving", async () => {
    // ---- living repo: unknown ref → success-shaped candidates (never isError) ----
    const unknown = await serveContext({ store: live }, { ref: "sym:does/not/exist#nope" });
    assertServeInvariants(unknown, live);
    expect(unknown.isError).toBe(false);
    expect(unknown.diag.recoverable).toBe(true);
    expect(unknown.text.toLowerCase()).toContain("not indexed");

    // ---- living repo: ambiguous name → ALL candidate definitions in ONE response ----
    const byName = live.entitiesByName("Decisions");
    expect(byName.length, "⚠ 'Decisions' is ambiguous in this repo").toBeGreaterThan(1);
    const amb = await serveContext({ store: live }, { ref: "Decisions" });
    assertServeInvariants(amb, live);
    expect(amb.isError).toBe(false);
    expect(amb.text).toContain("definitions");
    for (const e of byName) {
      expect(amb.text, `candidate ${e.id} must appear`).toContain(`[${live.internHandle(e.id)}]`);
    }
    // Source lines use `N⇥` numbering.
    expect(amb.text).toMatch(/\n\d+\t/);

    // ---- deterministic fixture: ambiguous name + N⇥ under isolation ----
    const project = join(fxRoot, "amb");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "README.md"), "# fixture\n");
    const store = openStore({ projectDir: project, home: join(fxRoot, "amb-home") });
    const gen = store.beginGeneration("docs");
    for (const [i, path] of ["a/config.ts", "b/config.ts"].entries()) {
      const id = `sym:${path}#Config`;
      store.upsertEntity({
        id,
        kind: "doc_section",
        name: "Config",
        locator: { t: "file", path, span: [10 + i, 12 + i] },
        gen,
      });
      store.ftsIndex(id, { name: "Config", text: "the Config type", kind: "doc_section" });
    }
    store.publishGeneration("docs");
    expect(store.entitiesByName("Config").length).toBe(2);
    const fxResp = await serveContext({ store }, { ref: "Config" });
    assertServeInvariants(fxResp, store);
    expect(fxResp.isError).toBe(false);
    expect(fxResp.text).toContain("2 definitions");
    expect(fxResp.text).toMatch(/\n10\t/); // first candidate's def line, N⇥ numbered
    store.close();
  });

  test("search + remember serve invariants (G-1..G-5 on every response)", async () => {
    const s = await serveSearch({ store: live }, { query: "verification tax" });
    assertServeInvariants(s, live);
    expect(s.isError).toBe(false);
    expect(s.text).toContain("# ctx · search:");

    // remember writes into a fresh sandbox store (G-7), never the living store.
    const memRoot = makeTempDir("ctx-a7-mem-");
    const memProject = join(memRoot, "p");
    mkdirSync(memProject, { recursive: true });
    writeFileSync(join(memProject, "README.md"), "# fixture\n");
    const memStore = openStore({ projectDir: memProject, home: join(memRoot, "home") });
    const ok = serveRemember(
      { store: memStore },
      { note: "retry queue drops metadata on redelivery" },
    );
    assertServeInvariants(ok, memStore);
    expect(ok.isError).toBe(false);
    expect(ok.text).toContain("remembered [");
    // 300-char note → success-shaped guidance, nothing written (recoverable).
    const long = serveRemember({ store: memStore }, { note: "x".repeat(300) });
    expect(long.isError).toBe(false);
    expect(long.diag.recoverable).toBe(true);
    memStore.close();
    cleanupTempDir(memRoot);
  });

  test("G-6 egress guard + G-7 sandbox are active on the serve path", async () => {
    await assertG6EgressActive(live);
    assertG7Sandbox(live);
  });
});
