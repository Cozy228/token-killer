/**
 * Slice 2b — Symbol-level touches + history (M2-ACCEPTANCE.md "2b"). Flips the
 * 2a-wired todos green. Two tiers (CONTEXA-IMPL §10):
 *
 *  • Living-repo tier — THIS checkout's real M1 history over
 *    `packages/core/src/`. The ⚠ verify-at-wiring edges below were confirmed
 *    against the repo on 2026-07-05 (see the header comment on each assertion).
 *  • Deterministic tier — script-generated fixture repos exercising multi-hunk
 *    commits, symbol-level precision, the file-level fallback, and a rename.
 *
 * The git source runs with `symbolTouches: true` (the default registry turns it
 * on for real serve); the bare adapter stays file-level, so 1d / git-extract are
 * untouched.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createGitAdapter } from "../../src/ingest/git/adapter.ts";
import { createDefaultRegistry } from "../../src/ingest/registry.ts";
import { RefreshEngine } from "../../src/ingest/refresh.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import { serveContext } from "../../src/serve/serve.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, git, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");
const STORE_TS = "packages/core/src/store/store.ts";

// ⚠ verify-at-wiring anchors — confirmed against this repo on 2026-07-05:
//   be6c2d4 added store.ts; its @@ -0,0 +1,700 @@ post-image hunk overlaps
//   openStore's span [662,672] there (span-free id → same id at HEAD).
//     git show be6c2d442a3d:packages/core/src/store/store.ts | grep -n 'function openStore'
//   9a2d90e modified store.ts (hunks [72-77],[214],[226-232],[676-690]) — those
//   overlap Store/SqliteStore/getEntity/entitiesByName/entityFromRow but NOT
//   openStore [664,674] at HEAD → symbol-level precision, not whole-file.
//   12dc674 touched CONTEXA-DESIGN.md (a non-code file → file-level touch survives).
const ADD_COMMIT = "commit:be6c2d442a3d";
const MOD_COMMIT = "commit:9a2d90ea8b16";
const DOC_COMMIT = "commit:12dc67446a34";
const OPEN_STORE = `sym:${STORE_TS}#openStore`;
const MOD_SYMBOL = `sym:${STORE_TS}#SqliteStore.entitiesByName`; // a named method 9a2d90e touched

// ---------------------------------------------------------------------------
// Living-repo tier — the ⚠ verify-at-wiring edges
// ---------------------------------------------------------------------------
describe("acceptance: 2b symbol-level touches + history (living repo)", () => {
  let root: string;
  let store: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-2b-live-");
    store = openStore({ projectDir: REPO_ROOT, home: join(root, "contexa-home") });
    // git (symbol-level touches) + code (persists the HEAD sym entities the
    // touch links resolve to). docs/memory off — irrelevant to this scenario.
    const registry = createDefaultRegistry({
      docs: false,
      memory: false,
      code: { inProcess: true },
      git: { symbolTouches: true },
    });
    const engine = new RefreshEngine(store, registry, { catchupGateMs: 600_000 });
    const report = await engine.refresh(600_000);
    await engine.background;
    const git0 = report.sources.find((s) => s.source === "git");
    if (git0?.state !== "complete") {
      throw new Error(`2b living ingest git not complete: ${JSON.stringify(report.sources)}`);
    }
  }, 300_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B2-touches: real M1-era commit → symbol edge; symbol-level precision; file-level fallback", () => {
    // ⚠ THE edge: the commit that introduced store.ts touches openStore AT
    // SYMBOL LEVEL (hunk-range ∩ post-image span), not just the file.
    const addTouches = store.linksFrom(ADD_COMMIT, "touches").map((l) => l.dst);
    expect(addTouches, `${ADD_COMMIT} --touches--> ${OPEN_STORE}`).toContain(OPEN_STORE);
    // No double-count: a symbol-bearing file gets NO file-level touch alongside.
    expect(addTouches, "no file-level touch for a symbol-bearing file").not.toContain(
      `file:${STORE_TS}`,
    );

    // Precision: 9a2d90e modified store.ts but its hunks miss openStore — so it
    // touches OTHER named symbols and NOT openStore (symbol level, not file).
    const modTouches = store.linksFrom(MOD_COMMIT, "touches").map((l) => l.dst);
    expect(modTouches, `${MOD_COMMIT} touched ${MOD_SYMBOL}`).toContain(MOD_SYMBOL);
    expect(modTouches, "9a2d90e did NOT touch openStore (precision)").not.toContain(OPEN_STORE);
    expect(modTouches, "9a2d90e took no file-level touch on store.ts").not.toContain(
      `file:${STORE_TS}`,
    );

    // Fallback kept: a non-code file (no symbols) still gets the file-level link.
    const docTouches = store.linksFrom(DOC_COMMIT, "touches").map((l) => l.dst);
    expect(docTouches, "file-level touch preserves the commit's historical path").toContain(
      "file:CTX-DESIGN.md",
    );
    expect(docTouches.every((d) => d.startsWith("file:") || d.startsWith("sym:"))).toBe(true);

    // Every symbol-level touch is Derived (tree-sitter-attributed), not Observed.
    const openClaims = store
      .claimsFor(ADD_COMMIT, "touches")
      .filter((c) => c.object === OPEN_STORE);
    expect(openClaims.length).toBeGreaterThanOrEqual(1);
    expect(openClaims[0]!.authority).toBe("derived");
    expect(openClaims[0]!.carrier).toBe("git");
  });

  test("B2-history: context(ref:'sym:…') history lists the commits that touched THAT symbol", async () => {
    const res = await serveContext({ store }, { ref: OPEN_STORE });
    expect(res.isError).toBe(false);
    // The subject is openStore itself.
    expect(res.text).toContain("openStore");
    // The history section carries the touching commit (be6c2d4), reachable from
    // the symbol via its symbol-level touch edge — NOT the whole file's history.
    const history = res.diag.sections?.find((s) => s.name === "history");
    expect(history, "history section present").toBeDefined();
    const commitIds = [
      ...history!.items.map((i) => i.entityId),
      ...history!.omitted.map((o) => o.entityId),
    ];
    expect(commitIds, "openStore's history contains its introducing commit").toContain(ADD_COMMIT);
    // Precision at the serve layer: a commit that touched store.ts but NOT
    // openStore (9a2d90e) does not appear in openStore's history.
    expect(commitIds, "history is the symbol's, not the whole file's").not.toContain(MOD_COMMIT);
  });
});

// ---------------------------------------------------------------------------
// Deterministic tier — script-generated fixture repos
// ---------------------------------------------------------------------------
/** A budget that never expires (generous cold path). */
function fullBudget(): Budget {
  return { deadline: Number.MAX_SAFE_INTEGER, now: () => 0 };
}

/** Commit a set of {path: contents}; return the new commit's 12-char id. */
function commit(repo: string, files: Record<string, string>, message: string): string {
  for (const [path, contents] of Object.entries(files)) {
    writeFileSync(join(repo, path), contents);
    git(["add", path], repo);
  }
  git(["commit", "-q", "-m", message], repo);
  return `commit:${git(["rev-parse", "HEAD"], repo).slice(0, 12)}`;
}

const MATH_V1 = `export function add(a: number, b: number): number {
  return a + b;
}

export function sub(a: number, b: number): number {
  return a - b;
}
`;
const MATH_V2 = `export function add(a: number, b: number): number {
  const s = a + b;
  return s;
}

export function sub(a: number, b: number): number {
  const d = a - b;
  return d;
}
`;
const MATH_V3 = `export function add(a: number, b: number): number {
  const s = a + b;
  return s;
}

export function sub(a: number, b: number): number {
  const d = a - b;
  return d + 0;
}
`;
// A tier-1 code file that defines nothing (import + top-level call) → 0 symbols.
const BARREL = `import { add } from "./math.ts";\nadd(1, 2);\n`;

describe("acceptance: 2b symbol-level touches + history (deterministic fixtures)", () => {
  let root: string;
  let repo: string;
  let store: Store;
  let c1: string;
  let c2: string;
  let c3: string;
  let c4: string;

  beforeEach(async () => {
    root = makeTempDir("ctx-2b-fix-");
    repo = makeGitFixture(root); // one prior commit: README.md
    store = openStore({ projectDir: repo, home: join(root, "contexa-home") });

    c1 = commit(
      repo,
      { "math.ts": MATH_V1, "notes.txt": "just notes\n", "barrel.ts": BARREL },
      "add math",
    );
    c2 = commit(repo, { "math.ts": MATH_V2 }, "edit add and sub"); // multi-hunk (both bodies)
    c3 = commit(repo, { "math.ts": MATH_V3 }, "edit only sub"); // one hunk, in sub
    git(["mv", "math.ts", "calc.ts"], repo);
    git(["commit", "-q", "-m", "rename math to calc"], repo);
    c4 = `commit:${git(["rev-parse", "HEAD"], repo).slice(0, 12)}`;

    const adapter = createGitAdapter({ symbolTouches: true, cochangeMinSupport: 99 });
    await adapter.ingest(store, { source: "git", dirty: true, magnitude: 5 }, fullBudget());
  });

  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B2-touches: a multi-hunk commit joins each touched symbol; an unchanged symbol stays untouched", () => {
    // c2 edited BOTH function bodies → symbol-level touches to add AND sub.
    const c2Touches = store.linksFrom(c2, "touches").map((l) => l.dst);
    expect(c2Touches).toContain("sym:math.ts#add");
    expect(c2Touches).toContain("sym:math.ts#sub");
    expect(c2Touches, "symbol-bearing file → no file-level touch").not.toContain("file:math.ts");

    // c3 edited ONLY sub's body → touches sub, not add (range-overlap precision).
    const c3Touches = store.linksFrom(c3, "touches").map((l) => l.dst);
    expect(c3Touches).toContain("sym:math.ts#sub");
    expect(c3Touches, "unchanged symbol is not touched").not.toContain("sym:math.ts#add");
  });

  test("B2-touches: files without symbols keep the file-level touch (non-code + symbol-free code)", () => {
    const c1Touches = store.linksFrom(c1, "touches").map((l) => l.dst);
    // The symbol-bearing file yields symbol-level touches...
    expect(c1Touches).toContain("sym:math.ts#add");
    expect(c1Touches).toContain("sym:math.ts#sub");
    expect(c1Touches).not.toContain("file:math.ts");
    // ...while a non-code file and a symbol-free code file fall back to file-level.
    expect(c1Touches, "non-code file → file-level").toContain("file:notes.txt");
    expect(c1Touches, "symbol-free code file → file-level fallback").toContain("file:barrel.ts");
    expect(
      store.linksFrom(c1, "touches").find((l) => l.dst === "sym:math.ts#add")?.confidence,
    ).toBe(1.0);
  });

  test("B2-touches: symbol-level touches are resumable across a budget interruption (no double-append)", async () => {
    // A fresh store: split the 5-commit history into two batches, trip the budget
    // after the first, then resume — the touches must not double-append.
    const store2 = openStore({ projectDir: repo, home: join(root, "contexa-home-2") });
    try {
      const adapter = createGitAdapter({
        symbolTouches: true,
        cochangeMinSupport: 99,
        batchSize: 2,
      });
      let call = 0;
      const partial: Budget = { deadline: 100, now: () => (call++ === 0 ? 0 : 100) };
      const first = await adapter.ingest(
        store2,
        { source: "git", dirty: true, magnitude: 5 },
        partial,
      );
      expect(first.complete).toBe(false); // budget tripped mid-walk
      const second = await adapter.ingest(
        store2,
        { source: "git", dirty: true, magnitude: 5 },
        fullBudget(),
      );
      expect(second.complete).toBe(true);

      // The same symbol-level edges land, exactly once each (idempotency guard).
      expect(store2.linksFrom(c2, "touches").map((l) => l.dst)).toContain("sym:math.ts#sub");
      const dupes = store2.claimsFor(c2, "touches").filter((cl) => cl.object === "sym:math.ts#sub");
      expect(dupes.length, "no double-appended touches claim").toBe(1);
    } finally {
      store2.close();
    }
  });

  test("B2-history: a rename chain keeps pre-rename symbol history reachable (F1)", () => {
    // The rename (math.ts → calc.ts) bridges each symbol id via a renamed-to link.
    const subChain = store.linksTo("sym:calc.ts#sub", "renamed-to").map((l) => l.src);
    expect(subChain, "sym:calc.ts#sub ← renamed-to ← sym:math.ts#sub").toContain("sym:math.ts#sub");
    const renameLink = store
      .linksTo("sym:calc.ts#sub", "renamed-to")
      .find((l) => l.src === "sym:math.ts#sub");
    expect(renameLink!.method).toBe("rename-tracked");

    // Pre-rename history is reachable: hop across the chain to the old id, then
    // read its own `touches` history — the commits that edited sub before the
    // rename (c1 add, c2 edit both, c3 edit sub) are all there.
    const oldHistory = store.linksTo("sym:math.ts#sub", "touches").map((l) => l.src);
    for (const c of [c1, c2, c3]) {
      expect(oldHistory, `pre-rename commit ${c} reachable from the renamed symbol`).toContain(c);
    }
    // Every hop back is a commit (provenance intact).
    for (const src of oldHistory) expect(src.startsWith("commit:")).toBe(true);
  });
});
