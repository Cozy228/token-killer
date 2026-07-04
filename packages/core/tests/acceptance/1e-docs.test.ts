import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// Slice 1e — Docs/decisions source (M1-ACCEPTANCE.md). The token-killer repo is
// the living acceptance fixture; the store lives under a temp CTX_HOME (G-7) and
// only READS this checkout. Ingest runs once and all four scenarios read it.
//
// ⚠ verify-at-wiring values, confirmed against this checkout on 2026-07-04:
//   • docs/adr/ holds 41 files → 41 `decision` entities (H1) + 132 `doc_section`
//     (H2+) = 173 decision/doc_section entities under docs/adr/ (≥40).
//   • ADR frontmatter carries `status:` on 12/41 files (ALL = "accepted"), plus
//     `amends:` on 2; there is NO `date:` field anywhere. So A5-adr asserts the
//     `status` field (12, all "accepted"), NO `date`, and heading-derived titles.
//   • A5-stale concrete dead reference: `codemap-contract.md` (renamed to
//     docs/codemap/DESIGN.md on 2026-07-04) is still backticked in
//     docs/design/PROJECT-CONTEXT-PACK.md lines 283 & 290:
//       $ grep -n '`codemap-contract.md' docs/design/PROJECT-CONTEXT-PACK.md
//     The file no longer exists on disk → reason class `never-resolved`.
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");

const MENTION_SRC = "file:CTX-IMPL.md";
const MENTION_DST = "file:docs/codemap/impl/D-language-coverage.md";

describe("acceptance: 1e docs/decisions source", () => {
  let root: string;
  let store: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-a5-");
    store = openStore({ projectDir: REPO_ROOT, home: join(root, "ctx-home") });
    const adapter = new DocsAdapter();
    const dirty = await adapter.dirtyCheck(store);
    expect(dirty.source).toBe("docs");
    expect(dirty.dirty).toBe(true); // cold store — everything is new
    await adapter.ingest(store, dirty, { deadline: Number.MAX_SAFE_INTEGER, now: Date.now });
  });

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("A5-adr", () => {
    const db = new DatabaseSync(store.dbPath);
    db.exec("PRAGMA busy_timeout=5000");
    const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;

    const decisions = count(
      "SELECT COUNT(*) n FROM entities WHERE kind='decision' AND json_extract(locator,'$.path') LIKE 'docs/adr/%'",
    );
    const decisionOrSection = count(
      "SELECT COUNT(*) n FROM entities WHERE kind IN ('decision','doc_section') AND json_extract(locator,'$.path') LIKE 'docs/adr/%'",
    );
    // Observed 2026-07-04: 41 decisions, 173 decision/doc_section.
    expect(decisions).toBe(41);
    expect(decisionOrSection).toBeGreaterThanOrEqual(40);

    // Frontmatter fields THAT ACTUALLY EXIST: `status` on 12 files, all "accepted";
    // NO `date` field. (⚠ verify-at-wiring — asserted, not guessed.)
    const withStatus = count(
      "SELECT COUNT(*) n FROM entities WHERE kind='decision' AND json_extract(locator,'$.path') LIKE 'docs/adr/%' AND json_extract(attrs,'$.\"fm:status\"') IS NOT NULL",
    );
    const withDate = count(
      "SELECT COUNT(*) n FROM entities WHERE kind='decision' AND json_extract(locator,'$.path') LIKE 'docs/adr/%' AND json_extract(attrs,'$.\"fm:date\"') IS NOT NULL",
    );
    const statuses = db
      .prepare(
        "SELECT DISTINCT json_extract(attrs,'$.\"fm:status\"') s FROM entities WHERE kind='decision' AND json_extract(attrs,'$.\"fm:status\"') IS NOT NULL",
      )
      .all() as Array<{ s: string }>;
    expect(withStatus).toBe(12);
    expect(withDate).toBe(0);
    expect(statuses.map((r) => r.s)).toEqual(["accepted"]);

    // Every ADR decision carries a heading-derived title and the disclosed
    // classification rule (P28 provenance): path-convention for docs/adr/.
    const untitled = count(
      "SELECT COUNT(*) n FROM entities WHERE kind='decision' AND json_extract(locator,'$.path') LIKE 'docs/adr/%' AND (name IS NULL OR name='')",
    );
    const badRule = count(
      "SELECT COUNT(*) n FROM entities WHERE kind='decision' AND json_extract(locator,'$.path') LIKE 'docs/adr/%' AND json_extract(attrs,'$.classifiedBy') <> 'path-convention'",
    );
    expect(untitled).toBe(0);
    expect(badRule).toBe(0);
    db.close();
  });

  test("A5-mention", () => {
    // CTX-IMPL.md's backticked `docs/codemap/impl/D-language-coverage.md` (with a
    // trailing `:618` and a bare form) resolves by exact path-match to the file
    // entity, producing a Derived `references` link.
    const links = store.linksFrom(MENTION_SRC, "references");
    const link = links.find((l) => l.dst === MENTION_DST);
    expect(link, "expected a references link CTX-IMPL.md → D-language-coverage.md").toBeDefined();
    expect(link?.method).toBe("path-match");
    expect(link?.confidence).toBe(1.0); // exact relative path = tier-1

    // Provenance: the backing claim is Derived (path-match), not Observed.
    const claim = link?.claimId !== undefined ? store.getClaim(link.claimId) : undefined;
    expect(claim?.authority).toBe("derived");
    expect(claim?.method).toBe("path-match");
    expect(claim?.predicate).toBe("references");
  });

  test("A5-stale", () => {
    const stale = store
      .conflicts("open")
      .filter((c) => c.kind === "stale-suspect")
      .map((c) => ({
        mention: store.getClaim(c.a),
        reason: store.getClaim(c.b),
      }));
    expect(stale.length).toBeGreaterThanOrEqual(1);

    // Every stale-suspect reason class is one M1 can produce (P28): a single
    // extraction pass yields `never-resolved`; target-removed/referencer-changed
    // need cross-generation / incremental history (M2+), not attempted here.
    const reasons = new Set(stale.map((s) => s.reason?.object));
    for (const r of reasons) expect(["target-removed", "never-resolved"]).toContain(r);

    // The concrete dead reference: `codemap-contract.md` (renamed 2026-07-04),
    // still cited in docs/design/PROJECT-CONTEXT-PACK.md. Evidence recorded in
    // the file header comment (grep hit + rename origin).
    const dead = stale.find((s) => s.mention?.object === "codemap-contract.md");
    expect(dead, "expected a stale-suspect for the renamed codemap-contract.md").toBeDefined();
    expect(dead?.reason?.object).toBe("never-resolved");
    expect(dead?.mention?.locus).toMatch(/PROJECT-CONTEXT-PACK\.md#L\d+/);
    expect(dead?.mention?.method).toBe("path-match");
  });

  test("A5-decision-log", () => {
    // FABLE-DECISION-LOG.md's `**P20 — …**` glossary-pattern entries become
    // `concept` entities (P-log em-dash-inside-bold form) and are FTS-indexed —
    // searchable = an FTS row exists (full ranked search() is 1f).
    for (const term of ["p20", "p27"] as const) {
      const id = `concept:FABLE-DECISION-LOG.md#${term}`;
      const entity = store.getEntity(id);
      expect(entity, `expected glossary concept entity ${id}`).toBeDefined();
      expect(entity?.kind).toBe("concept");
      expect(entity?.name.toLowerCase()).toBe(term);

      const hits = store.ftsSearch(term, 50);
      expect(
        hits.some((h) => h.entityId === id),
        `FTS should surface ${id}`,
      ).toBe(true);
    }
  });
});
