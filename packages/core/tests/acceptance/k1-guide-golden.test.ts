/**
 * M3 K1 — golden DTO shape.
 *
 * WHY THIS RUNS ON A FIXTURE AND NOT ON THE REAL CORPUS (a declared deviation from the
 * work order's "golden projection JSON on the real corpus"):
 *
 *   A golden frozen against the real corpus invalidates itself at the next `ctx sync` —
 *   every commit to this repo changes the declarations, the calls, and therefore the
 *   projection. The only way to keep it green is to regenerate it, and a golden that is
 *   routinely regenerated is a rubber stamp: it is the SAME failure mode the census gate
 *   was written to prevent ("a hardcoded total would drift at the next `ctx sync` and
 *   start lying").
 *
 *   So the two jobs are split, and NEITHER is weakened:
 *     • CENSUS + COMPLETENESS -> real corpus, both sides computed live, zero frozen
 *       numbers (k1-guide-kernel.test.ts). The work order's rule that "a fixture-only test
 *       may never back a census or completeness claim" is fully honoured: no census or
 *       completeness claim is made here.
 *     • DTO SHAPE -> this file. A byte-stable fixture pins the exact contract K2 and the
 *       SPA will code against, so a field that silently changes name/shape/nesting goes
 *       red. That claim is about the SCHEMA, not about the corpus, and a fixture is the
 *       correct — and the only stable — place to make it.
 *
 *   Real-corpus DETERMINISM (identical data yields an identical DTO, D34) is asserted in
 *   k1-guide-kernel.test.ts by building twice and comparing.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { buildAtlas } from "../../src/guide/atlas.ts";
import {
  projectConnections,
  projectOverview,
  projectScope,
} from "../../src/guide/projections.ts";
import { symbolsInFile } from "../../src/guide/queries.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import type { AtlasModel, BoundedProjection } from "../../src/guide/types.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
const PKG_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const GOLDEN = join(PKG_DIR, "tests/golden/k1-projections.json");

/** `UPDATE_GOLDEN=1 pnpm --filter @contexa/core test` rewrites the file. */
const UPDATE = process.env.UPDATE_GOLDEN === "1";

/**
 * The generation view is environment-dependent (identity digest, repo revision) and would
 * make the golden machine-specific. Its truthfulness is asserted directly, and hard, in
 * the generation-trap tests — not here.
 */
function stable(projection: BoundedProjection): unknown {
  const { generation: _generation, ...rest } = projection;
  return rest;
}

describe("K1 — golden DTO shape (fixture corpus)", () => {
  let root: string;
  let proj: string;
  let store: Store;
  let atlas: AtlasModel;

  beforeAll(async () => {
    root = makeTempDir("ctx-k1-golden-");
    proj = join(root, "proj");
    mkdirSync(join(proj, "core"), { recursive: true });
    mkdirSync(join(proj, "app"), { recursive: true });

    // A deliberately shaped corpus: an intra-file call (the 51% D36 preserves), a
    // cross-file call, an import, a declaration with no visible route, and a file with
    // no visible route.
    writeFileSync(
      join(proj, "core/util.ts"),
      [
        "export function helper() { return 1; }",
        "export function core() { return helper(); }",
        "export function orphan() { return 42; }",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(proj, "app/main.ts"),
      [
        "import { core } from '../core/util.ts';",
        "export function main() { return core(); }",
        "",
      ].join("\n"),
    );
    writeFileSync(join(proj, "app/lonely.ts"), "export function lonely() { return 0; }\n");

    store = openStore({ projectDir: proj, home: join(root, "home") });
    clearScanCache();
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await adapter.ingest(store, await adapter.dirtyCheck(store), MAX_BUDGET);
    atlas = buildAtlas(store);
  }, 60_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("the four projections match the golden DTO", () => {
    const actual = {
      atlas: {
        files: atlas.files.map((f) => ({ ...f, declarationIds: [...f.declarationIds] })),
        declarations: atlas.declarations,
        scopes: atlas.scopes,
        disclosure: atlas.disclosure,
      },
      overview: stable(projectOverview(atlas, store)),
      scope: stable(projectScope(atlas, store, "core", { expand: ["file:core/util.ts"] })),
      connections: stable(projectConnections(atlas, store, "sym:core/util.ts#core")),
    };

    if (UPDATE) {
      mkdirSync(join(PKG_DIR, "tests/golden"), { recursive: true });
      writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(GOLDEN, "utf8"))).toEqual(JSON.parse(JSON.stringify(actual)));
  });

  test("the fixture exercises what the golden is for", () => {
    // Intra-file call survives (D36's 51%): core() -> helper() in one file.
    const intra = (atlas.relations.byKind.get("calls") ?? []).filter(
      (r) => r.src === "sym:core/util.ts#core" && r.dst === "sym:core/util.ts#helper",
    );
    expect(intra.length).toBe(1);

    // A declaration with no visible route collapses into the `+N more` handle...
    const scope = projectScope(atlas, store, "core", { expand: ["file:core/util.ts"] });
    const noRoute = scope.noVisibleRoute.declarations.find(
      (d) => d.containerId === "file:core/util.ts",
    );
    expect(noRoute!.declarationIds).toContain("sym:core/util.ts#orphan");

    // ...and a file with no visible route lands in the labelled periphery, not the centre.
    const app = projectScope(atlas, store, "app");
    expect(app.noVisibleRoute.containerIds).toContain("file:app/lonely.ts");
  });

  test("ADDRESS REUSE: a new file's path does not resurrect the dead symbol that squatted on it", () => {
    // The case that killed the locator-as-containment ruling. On the real store, the dead
    // v4 kernel's `CanvasCluster` is located at `packages/core/src/guide/types.ts` — a path
    // that only exists because a NEW, unrelated file was later created there. A
    // locator-derived Atlas hands the new file its predecessor's ghosts.
    //
    // Reproduce it exactly: retire `core/util.ts`'s symbols (the entities survive, still
    // ADDRESSING that path), then re-ingest so the path is re-populated by different code.
    const ghosts = symbolsInFile(store, "file:core/util.ts").map((e) => e.id);
    expect(ghosts).toContain("sym:core/util.ts#helper");

    store.clearLinks("file:core/util.ts", "contains");
    const haunted = buildAtlas(store);

    // The entities still exist and still name that path...
    for (const id of ghosts) {
      expect(store.getEntity(id)!.locator).toMatchObject({ path: "core/util.ts" });
      expect(haunted.retiredDeclarationIds).toContain(id);
    }
    // ...but the lot at that path disowns every one of them, and no projection draws them.
    expect(haunted.fileById.get("file:core/util.ts")!.declarationIds).toEqual([]);
    const projection = projectScope(haunted, store, "core", { expand: ["file:core/util.ts"] });
    const emitted = new Set(projection.containers.flatMap((c) => c.declarations.map((d) => d.id)));
    for (const id of ghosts) expect(emitted.has(id)).toBe(false);

    // And the call evidence they carried is excluded but COUNTED, never evaporated.
    expect(haunted.disclosure.callsWithRetiredEnd).toBeGreaterThan(0);
    expect(haunted.disclosure.callsInAtlas + haunted.disclosure.callsWithRetiredEnd).toBe(
      store.linksByPredicate("calls").length,
    );
  });
});
