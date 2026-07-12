import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { select } from "../../src/select/engine.ts";
import { gatherSeeds } from "../../src/select/seeds.ts";
import { snapshotVisibility } from "../../src/select/visibility.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// FIX-2 (R-A): a task query naming a file must reach the CODE for that file,
// and the prose sections that merely MENTION the file must not flood it out.

const NOW = Date.UTC(2026, 6, 12);

describe("select: path-aware named seeding + doc-mention flood control (FIX-2)", () => {
  let root: string;
  let store: Store;

  beforeAll(() => {
    root = makeTempDir("ctx-path-seed-");
    const project = join(root, "project");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "placeholder.md"), "# placeholder\n");
    store = openStore({ projectDir: project, home: join(root, "home"), now: () => NOW });

    // --- the real code file + a contained symbol ---
    const codeGen = store.beginGeneration("code");
    store.upsertEntity({
      id: "file:src/hook/rewrite.ts",
      kind: "file",
      name: "src/hook/rewrite.ts",
      locator: { t: "file", path: "src/hook/rewrite.ts" },
      gen: codeGen,
    });
    store.ftsIndex("file:src/hook/rewrite.ts", {
      name: "src/hook/rewrite.ts",
      text: "rewrite hook module",
      kind: "file",
    });
    store.upsertEntity({
      id: "sym:src/hook/rewrite.ts#rewriteHook",
      kind: "symbol",
      name: "rewriteHook",
      locator: { t: "file", path: "src/hook/rewrite.ts", span: [1, 20] },
      attrs: { lang: "typescript" },
      gen: codeGen,
    });
    store.ftsIndex("sym:src/hook/rewrite.ts#rewriteHook", {
      name: "rewriteHook",
      text: "function rewriteHook applies the command rewrite",
      kind: "symbol",
    });
    store.setLink({
      src: "file:src/hook/rewrite.ts",
      dst: "sym:src/hook/rewrite.ts#rewriteHook",
      predicate: "contains",
      method: "structural",
      confidence: 1,
    });

    // --- the flood: many doc sections that MENTION rewrite.ts verbatim ---
    const docGen = store.beginGeneration("docs");
    for (let i = 0; i < 31; i++) {
      const id = `doc:notes.md#s${i}`;
      store.upsertEntity({
        id,
        kind: "doc_section",
        name: `Note ${i}`,
        locator: { t: "file", path: "notes.md", span: [i + 1, i + 1] },
        gen: docGen,
      });
      store.ftsIndex(id, {
        name: `Note ${i}`,
        text: `This note discusses rewrite.ts and how the rewrite path behaves.`,
        kind: "doc_section",
      });
    }

    store.publishGeneration("code");
    store.publishGeneration("docs");
  });

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("gatherSeeds resolves the basename to the file entity as a named seed", () => {
    const stage = gatherSeeds(store, "how does rewrite.ts work", snapshotVisibility(store));
    const fileSeed = stage.seeds.find((s) => s.entityId === "file:src/hook/rewrite.ts");
    expect(fileSeed).toBeDefined();
    expect(fileSeed?.named).toBe(true);
    // flood control: the 31 mentioning doc sections are NOT each force-injected
    // as named seeds at NAMED_SEED_WEIGHT.
    const namedDocs = stage.seeds.filter((s) => s.named && s.entityId.startsWith("doc:"));
    expect(namedDocs.length).toBe(0);
  });

  test("select() serves the file (or its symbol) in the code section; the flood does not evict it", () => {
    const r = select(store, { task: "how does rewrite.ts work", now: () => NOW });
    if (!r.ok || r.mode === "facet") throw new Error("expected a composite SelectResult");
    const code = r.sections.find((s) => s.name === "code")!;
    const codeIds = new Set(code.items.map((i) => i.entityId));
    expect(
      codeIds.has("file:src/hook/rewrite.ts") || codeIds.has("sym:src/hook/rewrite.ts#rewriteHook"),
    ).toBe(true);
    // the named file leads the ranking — the subject is code, not a prose mention
    expect(r.subject?.entityId).not.toMatch(/^doc:/);
  });

  test("a path token with a :line suffix resolves the same file", () => {
    const stage = gatherSeeds(
      store,
      "trace src/hook/rewrite.ts:40 behavior",
      snapshotVisibility(store),
    );
    expect(stage.seeds.some((s) => s.named && s.entityId === "file:src/hook/rewrite.ts")).toBe(
      true,
    );
  });
});
