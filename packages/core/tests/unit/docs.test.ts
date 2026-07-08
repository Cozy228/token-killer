import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import { cleanupTempDir, git, makeTempDir } from "../helpers/sandbox.ts";

const BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: () => Date.now() };

/** Write a file, creating parent dirs; returns the absolute path. */
function put(root: string, rel: string, body: string): string {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
  return abs;
}

async function ingestOnce(store: Store): Promise<void> {
  const adapter = new DocsAdapter();
  const dirty = await adapter.dirtyCheck(store);
  await adapter.ingest(store, dirty, BUDGET);
}

describe("DocsAdapter (fixture tree)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-docs-");
    repo = join(root, "repo");
    mkdirSync(repo, { recursive: true });
    // git-init so shard resolution pins projectRoot to exactly this fixture
    // (no commits needed — the docs source scans the working tree, not git).
    git(["init", "-q", "-b", "main", repo], root);
    home = join(root, "contexa-home");
    store = openStore({ projectDir: repo, home });
  });

  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("classification precedence: frontmatter type → path convention → heading → default", async () => {
    put(repo, "docs/adr/0001-alpha.md", "---\nstatus: accepted\n---\n# Alpha decision\nbody\n");
    put(repo, "notes/rfc.md", "# RFC: shape of the thing\nbody\n"); // heading heuristic
    put(repo, "notes/typed.md", "---\ntype: decision\n---\n# Typed by frontmatter\n"); // fm wins
    put(repo, "notes/plain.md", "# Just a doc\ntext\n"); // default doc
    await ingestOnce(store);

    const db = new DatabaseSync(store.dbPath);
    db.exec("PRAGMA busy_timeout=5000");
    const rule = (id: string): string | undefined =>
      (
        db
          .prepare("SELECT json_extract(attrs,'$.classifiedBy') r FROM entities WHERE id=?")
          .get(id) as { r: string } | undefined
      )?.r;
    expect(store.getEntity("adr:docs/adr/0001-alpha.md#alpha-decision")?.kind).toBe("decision");
    expect(rule("adr:docs/adr/0001-alpha.md#alpha-decision")).toBe("path-convention");
    expect(rule("adr:notes/typed.md#typed-by-frontmatter")).toBe("frontmatter-type");
    expect(rule("adr:notes/rfc.md#rfc-shape-of-the-thing")).toBe("heading-heuristic");
    // A plain doc has no decision entity — its H1 is a doc_section.
    expect(store.getEntity("doc:notes/plain.md#just-a-doc")?.kind).toBe("doc_section");
    db.close();
  });

  test("two-tier mention resolution: exact (1.0) + unique basename (0.6); ambiguous declines", async () => {
    put(repo, "target.md", "# Target\n");
    put(repo, "deep/unique-name.md", "# Unique\n");
    put(repo, "a/dup.md", "# Dup A\n");
    put(repo, "b/dup.md", "# Dup B\n");
    put(
      repo,
      "guide.md",
      ["# Guide", "exact: `target.md`", "basename: `unique-name.md`", "ambiguous: `dup.md`"].join(
        "\n",
      ) + "\n",
    );
    await ingestOnce(store);

    const links = store.linksFrom("file:guide.md", "references");
    const byDst = new Map(links.map((l) => [l.dst, l]));
    expect(byDst.get("file:target.md")?.confidence).toBe(1.0);
    expect(byDst.get("file:deep/unique-name.md")?.confidence).toBe(0.6);
    // Ambiguous basename resolves to NEITHER candidate.
    expect(byDst.has("file:a/dup.md")).toBe(false);
    expect(byDst.has("file:b/dup.md")).toBe(false);
  });

  test("stale reason classification: dead doc-target = never-resolved; code-target on disk = deferred", async () => {
    put(repo, "present.ts", "export const x = 1;\n"); // a real code file, not a doc entity
    put(
      repo,
      "doc.md",
      [
        "# Doc",
        "dead doc: `ghost.md`", // doc-ext, absent on disk → never-resolved stale-suspect
        "present code: `present.ts`", // non-doc ext → deferred; the code source (M2) owns it
        "absent code: `nowhere.ts`", // non-doc ext → deferred, no stale verdict either
      ].join("\n") + "\n",
    );
    await ingestOnce(store);

    const stale = store
      .conflicts("open")
      .filter((c) => c.kind === "stale-suspect")
      .map((c) => ({ mention: store.getClaim(c.a)?.object, reason: store.getClaim(c.b)?.object }));
    expect(stale).toEqual([{ mention: "ghost.md", reason: "never-resolved" }]);
    // No references link and no stale-suspect for either code-target.
    expect(store.linksFrom("file:doc.md", "references")).toHaveLength(0);
  });

  test("ignore-set honored: node_modules excluded, docs/ included", async () => {
    put(repo, "node_modules/pkg/readme.md", "# Should be skipped\n");
    put(repo, "docs/kept.md", "# Kept\n");
    await ingestOnce(store);
    expect(store.getEntity("file:docs/kept.md")).toBeDefined();
    expect(store.getEntity("file:node_modules/pkg/readme.md")).toBeUndefined();
  });

  test("glossary concepts are searchable; amends/supersedes are explicit-key links", async () => {
    put(repo, "docs/adr/0001-base.md", "# Base decision\n");
    put(repo, "docs/adr/0002-next.md", "---\namends: 0001\n---\n# Next decision\n");
    put(
      repo,
      "glossary.md",
      ["# Glossary", "**Widget** — a small gadget.", "**P9 — a P-entry.**"].join("\n") + "\n",
    );
    await ingestOnce(store);

    // Glossary → concept entities, FTS-indexed.
    expect(store.getEntity("concept:glossary.md#widget")?.kind).toBe("concept");
    expect(
      store.ftsSearch("Widget", 20).some((h) => h.entityId === "concept:glossary.md#widget"),
    ).toBe(true);
    expect(store.ftsSearch("P9", 20).some((h) => h.entityId === "concept:glossary.md#p9")).toBe(
      true,
    );

    // amends frontmatter → explicit-key link between the two decision entities.
    const amends = store.linksFrom("adr:docs/adr/0002-next.md#next-decision", "amends");
    expect(amends).toHaveLength(1);
    expect(amends[0]).toMatchObject({
      dst: "adr:docs/adr/0001-base.md#base-decision",
      method: "explicit-key",
    });
  });

  test("dirtyCheck: warm re-check is clean; cosmetic mtime touch is not dirty; byte change is dirty", async () => {
    const f = put(repo, "docs/note.md", "# Note\noriginal\n");
    const adapter = new DocsAdapter();
    await adapter.ingest(store, await adapter.dirtyCheck(store), BUDGET);

    // Warm: no changes → clean, and fast (perf gate lives in perf-gates.test.ts).
    expect((await adapter.dirtyCheck(store)).dirty).toBe(false);

    // Cosmetic touch: same bytes, newer mtime → content-hash confirms NOT dirty.
    const future = new Date(Date.now() + 60_000);
    utimesSync(f, future, future);
    expect((await adapter.dirtyCheck(store)).dirty).toBe(false);

    // Real byte change → dirty, magnitude 1.
    writeFileSync(f, "# Note\nedited\n");
    const dirty = await adapter.dirtyCheck(store);
    expect(dirty.dirty).toBe(true);
    expect(dirty.magnitude).toBe(1);
  });

  test("scan honors .gitignore: ignored local material is not indexed", async () => {
    put(repo, ".gitignore", "junk/\n");
    put(repo, "junk/secret.md", "# Local research dump\n");
    put(repo, "docs/kept.md", "# Kept\n");

    await ingestOnce(store);

    expect(store.getEntity("file:docs/kept.md")).toBeDefined();
    // Untracked but NOT ignored → indexed (a fresh doc counts before its first commit).
    expect(store.getEntity("file:.gitignore")).toBeUndefined(); // not markdown, sanity
    expect(store.getEntity("file:junk/secret.md")).toBeUndefined();
  });
});
