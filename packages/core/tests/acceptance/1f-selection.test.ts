import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { GitAdapter } from "../../src/ingest/git/adapter.ts";
import { search } from "../../src/select/engine.ts";
import { FTS_SEED_LIMIT } from "../../src/select/constants.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// Slice 1f — Selection engine (M1-ACCEPTANCE.md A6-*). Each scenario combines:
//  • the living-repo tier — the token-killer repo ingested via the REAL git +
//    docs adapters into a temp CTX_HOME (G-7: no real host state touched);
//  • a deterministic fixture tier where the MECHANISM needs isolation
//    (named-seed force-inclusion beyond bm25 cutoffs; decay direction under a
//    fixed injected clock).
//
// ⚠ verify-at-wiring values, confirmed against this checkout on 2026-07-04:
//  • "verification tax" (the phrase) occurs in docs/design/FABLE-DORA-REVIEW.md
//    and docs/build/M1-ACCEPTANCE.md only:
//      $ grep -rli "verification tax" --include="*.md" .
//  • "RRF" occurs in CTX-IMPL.md (§6, twice) + ADR 0025 + codemap docs/archive
//    research files; the §6 section entity is
//    doc:CTX-IMPL.md#…/6-selection-engine-coresrcselect (asserted by locator
//    path + name match, not a hardcoded slug).
//  • `assertNoEgress` appears in DOC TEXT of CTX-IMPL.md (§7, §12 table) and
//    docs/build/M1-ACCEPTANCE.md (G-6, A6-named-seed). The FUNCTION does not
//    exist in code yet (it lands with 1g), so the living-repo assertion targets
//    those doc sections via the named-seed index — the fixture tier proves the
//    force-inclusion mechanism itself. Both recorded per the assignment.

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");

describe("acceptance: 1f selection engine", () => {
  let liveRoot: string;
  let live: Store; // living-repo store (real adapters, this checkout)
  let fxRoot: string;

  beforeAll(async () => {
    liveRoot = makeTempDir("ctx-a6-live-");
    live = openStore({ projectDir: REPO_ROOT, home: join(liveRoot, "ctx-home") });
    const budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
    const docs = new DocsAdapter();
    await docs.ingest(live, await docs.dirtyCheck(live), budget);
    const git = new GitAdapter();
    await git.ingest(live, await git.dirtyCheck(live), budget);
    fxRoot = makeTempDir("ctx-a6-fx-");
  }, 180_000);

  afterAll(() => {
    live.close();
    cleanupTempDir(liveRoot);
    cleanupTempDir(fxRoot);
  });

  function fixtureStore(name: string, clock: () => number): Store {
    const project = join(fxRoot, name);
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "README.md"), "# fixture\n");
    return openStore({ projectDir: project, home: join(fxRoot, `${name}-home`), now: clock });
  }

  test("A6-search", () => {
    // search("verification tax") → a docs/design/FABLE-DORA-REVIEW.md section
    // in the top-5.
    const tax = search(live, { query: "verification tax" });
    const taxTop5 = tax.items.slice(0, 5);
    expect(
      taxTop5.some(
        (i) =>
          (i.kind === "doc_section" || i.kind === "file") &&
          i.locator?.startsWith("docs/design/FABLE-DORA-REVIEW.md"),
      ),
      `top-5 for "verification tax" was:\n${taxTop5
        .map((i) => `  ${i.kind} ${i.locator ?? i.entityId}`)
        .join("\n")}`,
    ).toBe(true);

    // search("RRF") → the CTX-IMPL section entity covering §6 in the top-5.
    const rrf = search(live, { query: "RRF" });
    const rrfTop5 = rrf.items.slice(0, 5);
    expect(
      rrfTop5.some(
        (i) =>
          i.kind === "doc_section" &&
          i.locator?.startsWith("CTX-IMPL.md") &&
          /selection engine/i.test(i.name),
      ),
      `top-5 for "RRF" was:\n${rrfTop5
        .map((i) => `  ${i.kind} "${i.name}" ${i.locator ?? ""}`)
        .join("\n")}`,
    ).toBe(true);

    // Every rendered item carries a resolvable handle (G-5, struct level).
    for (const i of [...tax.items, ...rrf.items]) {
      expect(live.resolveHandle(i.handle)?.entityId).toBe(i.entityId);
    }
  });

  test("A6-named-seed", () => {
    // ---- deterministic fixture: force-inclusion beyond bm25 cutoffs ----
    const store = fixtureStore("named", () => Date.UTC(2026, 6, 4));
    const gen = store.beginGeneration("docs");

    // Target: an entity NAMED `assertNoEgress` whose FTS text shares NO token
    // with the query — bm25 can never return it; only the name index can.
    store.upsertEntity({
      id: "concept:guard.md#assertnoegress",
      kind: "concept",
      name: "assertNoEgress",
      locator: { t: "file", path: "guard.md", span: [1, 1] },
      gen,
    });
    // The FTS row deliberately carries NEITHER the token, NOR its camel-split
    // sub-tokens (assert/egress), NOR any other query word — bm25 can NEVER
    // return this entity; only the entities.name index can.
    store.ftsIndex("concept:guard.md#assertnoegress", {
      name: "network guard",
      text: "guard refuses outbound keys",
      kind: "concept",
    });

    // 70 decoys (> FTS_SEED_LIMIT=64) all matching the query token "fetch"
    // hard — they saturate the bm25 top-64 AND the flat render cap.
    expect(70).toBeGreaterThan(FTS_SEED_LIMIT);
    for (let i = 0; i < 70; i++) {
      const id = `doc:decoy-${i}.md#d${i}`;
      store.upsertEntity({
        id,
        kind: "doc_section",
        name: `decoy ${i}`,
        // one file per decoy so top-3-per-file cannot thin the flood
        locator: { t: "file", path: `decoy-${i}.md`, span: [1, 1] },
        gen,
      });
      store.ftsIndex(id, {
        name: `decoy ${i}`,
        text: "fetch fetch fetch calls block block fetch",
        kind: "doc_section",
      });
    }
    store.publishGeneration("docs");

    const result = search(store, { query: "why does assertNoEgress block fetch calls" });
    const target = result.items.find((i) => i.entityId === "concept:guard.md#assertnoegress");
    expect(target, "named-seed target must be rendered, never cut").toBeDefined();
    expect(target?.named).toBe(true);
    expect(result.omitted.some((o) => o.entityId === "concept:guard.md#assertnoegress")).toBe(
      false,
    );
    // the decoy flood really did exceed the bm25 cutoff (honest fixture)
    expect(result.considered).toBeGreaterThan(FTS_SEED_LIMIT);

    // Control: without the named token, the target cannot appear at all —
    // the mechanism (not bm25) put it there.
    const control = search(store, { query: "why does something block fetch calls" });
    expect(control.items.some((i) => i.entityId === "concept:guard.md#assertnoegress")).toBe(false);
    store.close();

    // ---- living repo: the token's doc-section carriers surface as named ----
    const liveResult = search(live, {
      query: "how does the store handle memory generations assertNoEgress",
    });
    const carriers = liveResult.items.filter(
      (i) =>
        i.named &&
        (i.locator?.startsWith("CTX-IMPL.md") === true ||
          i.locator?.startsWith("docs/build/M1-ACCEPTANCE.md") === true),
    );
    expect(
      carriers.length,
      `expected named-seed hits from CTX-IMPL.md / M1-ACCEPTANCE.md; got:\n${liveResult.items
        .map((i) => `  named=${i.named} ${i.kind} ${i.locator ?? i.entityId}`)
        .join("\n")}`,
    ).toBeGreaterThanOrEqual(1);
  });

  test("A6-decay", () => {
    const NOW = Date.UTC(2026, 6, 4);
    const DAY = 86_400_000;
    let clock = NOW;
    const store = fixtureStore("decay", () => clock);
    const gen = store.beginGeneration("memory");

    // Two otherwise-EQUAL memory entities: same gist, same authority, same
    // anchor target — only the anchoring time differs (fixed clock injection).
    const writeMem = (id: string, at: number): void => {
      clock = at;
      store.upsertEntity({
        id,
        kind: "memory",
        name: "retry queue note",
        locator: { t: "store" },
        gen,
      });
      store.writeMemory({
        entityId: id,
        gist: "retry queue drops metadata on redelivery",
        origin: "remember",
        authority: "inferred",
      });
      store.addClaim({
        subject: id,
        predicate: "anchoredTo",
        object: "file:README.md",
        carrier: "remember",
        method: "explicit-key",
        authority: "confirmed",
        gen,
      });
      store.ftsIndex(id, {
        name: "retry queue note",
        text: "retry queue drops metadata on redelivery",
        kind: "memory",
      });
    };
    writeMem("mem:old", NOW - 80 * DAY); // anchored 80 days ago
    writeMem("mem:new", NOW - 1 * DAY); // anchored yesterday

    // Two otherwise-equal CODE entities written at the same two times.
    const writeFileEntity = (id: string, path: string, at: number): void => {
      clock = at;
      store.upsertEntity({ id, kind: "file", name: path, locator: { t: "file", path }, gen });
      store.ftsIndex(id, { name: path, text: "retry queue module", kind: "file" });
    };
    writeFileEntity("file:old-retry.ts", "old-retry.ts", NOW - 80 * DAY);
    writeFileEntity("file:new-retry.ts", "new-retry.ts", NOW - 1 * DAY);

    clock = NOW;
    store.publishGeneration("memory");

    const result = search(store, { query: "retry queue metadata", now: () => NOW });
    const at = (id: string): number => result.items.findIndex((i) => i.entityId === id);
    const score = (id: string): number => result.items[at(id)]!.score;

    // memory: the more recently-anchored entry ranks strictly higher
    expect(at("mem:new")).toBeGreaterThanOrEqual(0);
    expect(at("mem:old")).toBeGreaterThanOrEqual(0);
    expect(at("mem:new")).toBeLessThan(at("mem:old"));
    expect(score("mem:new")).toBeGreaterThan(score("mem:old"));

    // code: NO time decay — equal lexical standing → equal scores (fixed clock)
    expect(at("file:old-retry.ts")).toBeGreaterThanOrEqual(0);
    expect(at("file:new-retry.ts")).toBeGreaterThanOrEqual(0);
    expect(score("file:old-retry.ts")).toBeCloseTo(score("file:new-retry.ts"), 9);
    store.close();
  });
});
