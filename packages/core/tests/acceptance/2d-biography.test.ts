/**
 * Flagship B6 — symbol biography (M2-ACCEPTANCE.md "Flagship"). Closes M2, owned
 * by slice 2d, composes 2a (definition) + 2b (history) + 2c (drift) + 2d (call
 * preview). Two tiers (CTX-IMPL §10):
 *
 *  • Deterministic tier — a scripted symbol with a caller, an anchored memory,
 *    and a structural edit → the biography is DRIFT-HONEST (the anchored memory
 *    surfaces flagged `needs-review` in the served answer, never as clean).
 *  • Living-repo tier — the ⚠ exact symbol + anchored note:
 *      symbol: `sym:packages/core/src/store/store.ts#openStore`
 *      note:   "openStore migrates the schema then seeds project_root on first open"
 *    ONE `context(ref)` call returns definition (N⇥ numbered) · symbol history
 *    (its introducing commit) · the anchored memory · a callers preview.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { createDefaultRegistry } from "../../src/ingest/registry.ts";
import { RefreshEngine } from "../../src/ingest/refresh.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { remember } from "../../src/memory/remember.ts";
import { serveContext } from "../../src/serve/serve.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

// ---------------------------------------------------------------------------
// Deterministic tier — drift-honest biography
// ---------------------------------------------------------------------------
describe("acceptance: 2d flagship biography (deterministic, drift-honest)", () => {
  let root: string;
  let proj: string;
  let store: Store;
  const TARGET = "sym:bio.ts#target";

  const write = (content: string): void => writeFileSync(join(proj, "bio.ts"), content, "utf8");
  async function ingest(): Promise<void> {
    clearScanCache();
    const adapter = new CodeSourceAdapter({ inProcess: true });
    await adapter.ingest(store, await adapter.dirtyCheck(store), MAX_BUDGET);
  }

  beforeEach(() => {
    root = makeTempDir("ctx-2d-bio-");
    proj = join(root, "proj");
    mkdirSync(proj, { recursive: true });
    store = openStore({ projectDir: proj, home: join(root, "home") });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B6: definition (N⇥) + callers preview + anchored memory in ONE call; drift flips the memory to needs-review, honestly, in the served answer", async () => {
    write(
      `export function target(x: number): number {\n` +
        `  return x + 1;\n` +
        `}\n` +
        `export function usesTarget(): number {\n` +
        `  return target(1);\n` +
        `}\n`,
    );
    await ingest();
    const mem = remember(store, {
      note: "target adds one to its argument",
      anchors: [TARGET],
    });
    expect(mem.ok).toBe(true);
    if (!mem.ok) throw new Error("anchor setup failed");

    // ONE call → the whole biography.
    const before = await serveContext({ store }, { ref: TARGET });
    expect(before.isError).toBe(false);
    // definition, N⇥ numbered (G-8: symbol span is file-backed, numbered like Read).
    expect(before.text).toMatch(/\n\d+\texport function target/);
    // callers preview with a drill handle (← usesTarget [handle]).
    expect(before.text).toMatch(/\n← .*usesTarget \[/);
    // the anchored memory surfaces, and while active it is NOT flagged.
    expect(before.text).toContain("target adds one to its argument");
    expect(before.text).not.toContain("⚠ needs-review");

    // ---- Structural edit to target's body → 2c drift → memory needs-review.
    write(
      `export function target(x: number): number {\n` +
        `  const doubled = (x + 1) * 2;\n` +
        `  return doubled;\n` +
        `}\n` +
        `export function usesTarget(): number {\n` +
        `  return target(1);\n` +
        `}\n`,
    );
    await ingest();
    expect(store.getMemory(mem.entityId)?.status).toBe("needs-review");

    // The biography is DRIFT-HONEST: the same memory now surfaces flagged.
    const after = await serveContext({ store }, { ref: TARGET });
    expect(after.isError).toBe(false);
    expect(after.text).toContain("⚠ needs-review");
    expect(after.text).toContain("target adds one to its argument");
    // The reason class is recorded (2c): a body edit → body-changed.
    expect(store.claimsFor(mem.entityId, "stale-reason").map((c) => c.object)).toContain(
      "body-changed",
    );
  });
});

// ---------------------------------------------------------------------------
// Living-repo tier — the ⚠ exact symbol + anchored note
// ---------------------------------------------------------------------------
describe("acceptance: 2d flagship biography (living repo — openStore)", () => {
  let root: string;
  let store: Store;
  const OPEN_STORE = "sym:packages/core/src/store/store.ts#openStore";
  // ⚠ from 2b: be6c2d4 introduced store.ts and touches openStore at symbol level.
  const ADD_COMMIT = "commit:be6c2d442a3d";
  const NOTE = "openStore migrates the schema then seeds project_root on first open";
  let memId: string;
  let biography: string;
  let historyIds: string[] = [];

  beforeAll(async () => {
    root = makeTempDir("ctx-2d-bio-live-");
    store = openStore({ projectDir: REPO_ROOT, home: join(root, "ctx-home") });
    // git (symbol-level touches → openStore history) + code (symbols + call
    // edges → openStore callers). docs/memory off; the anchor is set below.
    clearScanCache();
    const registry = createDefaultRegistry({
      docs: false,
      memory: false,
      code: { inProcess: true },
      git: { symbolTouches: true },
    });
    const engine = new RefreshEngine(store, registry, { catchupGateMs: 600_000 });
    const report = await engine.refresh(600_000);
    await engine.background;
    for (const s of report.sources) {
      if (s.source !== "memory" && s.state !== "complete" && s.state !== "clean") {
        throw new Error(
          `2d living ingest ${s.source} not complete: ${JSON.stringify(report.sources)}`,
        );
      }
    }
    const mem = remember(store, { note: NOTE, anchors: [OPEN_STORE] });
    if (!mem.ok) throw new Error(`anchor setup failed: ${JSON.stringify(mem)}`);
    memId = mem.entityId;
    const res = await serveContext({ store }, { ref: OPEN_STORE });
    biography = res.text;
    const history = res.diag.sections?.find((s) => s.name === "history");
    historyIds = [
      ...(history?.items.map((i) => i.entityId) ?? []),
      ...(history?.omitted.map((o) => o.entityId) ?? []),
    ];
  }, 300_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B6: one context(ref) returns definition (N⇥) + symbol history + anchored memory + callers preview", () => {
    // definition, N⇥ numbered like the host Read tool (G-8 span integrity).
    expect(biography).toContain("openStore");
    expect(biography, "N⇥-numbered definition").toMatch(/\n\d+\texport function openStore/);

    // symbol-level history (2b): openStore's introducing commit is present.
    expect(historyIds, "openStore history carries its introducing commit").toContain(ADD_COMMIT);

    // the anchored memory surfaces, and drift-honest: active → not flagged.
    expect(biography, "anchored note surfaces").toContain(NOTE);
    expect(store.getMemory(memId)?.status).toBe("active");
    expect(biography).not.toContain("⚠ needs-review");

    // callers preview with drill handles (← caller [handle] …).
    expect(biography, "callers preview line").toMatch(/\n← /);
    expect(biography).toMatch(/← .*\[/);
    // the preview resolves REAL callers: openStore has ≥1 caller symbol.
    expect(store.linksTo(OPEN_STORE, "calls").length).toBeGreaterThan(0);
  });
});
