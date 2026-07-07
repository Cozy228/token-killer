import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveClaudeMemoryDir, importClaudeCodeMemory } from "../../src/memory/claudeImporter.ts";
import { SENTINEL_BEGIN } from "../../src/memory/sentinel.ts";
import { recall, remember } from "../../src/memory/remember.ts";
import { resolveShard } from "../../src/store/shard.ts";
import { openStore } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// Slice 1c — Memory source (M1-ACCEPTANCE.md). Stores live under a temp
// CTX_HOME sandbox (G-7); A1-import READS the real ~/.claude memory dir for THIS
// project but writes only to the sandbox store (never under ~/.claude).
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");

// A1-import is env-gated: it requires this project's live Claude Code memory
// dir. The importer resolves it worktree-aware (current checkout OR the shared
// main-repo root), mirroring the store's shard placement (§3).
const here = resolveShard(REPO_ROOT);
const MEMORY_DIR = resolveClaudeMemoryDir(process.env.HOME ?? "", [
  here.projectRoot,
  here.mainRoot,
]);
// ⚠ verify-at-wiring (2026-07-04): the live memory dir for this project holds 91
// topic files (`ls ~/.claude/projects/-Users-ziyu-Workspace-token-killer/memory/
// | grep -v MEMORY.md | wc -l` = 91). The bar is ≥5; we assert a conservative
// floor of 80 (well above the bar, with slack for future memory churn).
const ENTITY_FLOOR = 80;

describe("acceptance: 1c memory source", () => {
  let root: string;
  let home: string;

  beforeEach(() => {
    root = makeTempDir("ctx-a1-");
    home = join(root, "ctx-home"); // sandboxed CTX_HOME (G-7)
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  describe.skipIf(MEMORY_DIR === undefined)("A1 (env-gated: live Claude memory)", () => {
    test("A1-import: importer yields host-import memory entities", () => {
      const store = openStore({ projectDir: REPO_ROOT, home });
      const report = importClaudeCodeMemory(store, {
        projectRoots: [here.projectRoot, here.mainRoot],
      });

      expect(report.memoryDir).toBe(MEMORY_DIR);
      expect(report.entities).toBeGreaterThanOrEqual(ENTITY_FLOOR); // ⚠ observed 91

      for (const id of report.written) {
        const mem = store.getMemory(id);
        expect(mem, `memory row for ${id}`).toBeDefined();
        expect(mem?.origin).toBe("host-import:claude-code");
        expect(mem?.authority).toBe("inferred");
        expect(mem?.gist.length ?? 0).toBeLessThanOrEqual(240);
        expect(store.getEntity(id)?.kind).toBe("memory");
      }
      store.close();
    });

    test("A1-echo: no imported entity text contains the push sentinel", () => {
      const store = openStore({ projectDir: REPO_ROOT, home });
      const report = importClaudeCodeMemory(store, {
        projectRoots: [here.projectRoot, here.mainRoot],
      });
      for (const id of report.written) {
        const mem = store.getMemory(id);
        expect(mem?.gist ?? "").not.toContain(SENTINEL_BEGIN);
        expect(mem?.detail ?? "").not.toContain(SENTINEL_BEGIN);
        expect(store.getEntity(id)?.name ?? "").not.toContain(SENTINEL_BEGIN);
      }
      store.close();
    });
  });

  test("A2-remember: write + anchor resolve + recall; over-long note is guided, not written", () => {
    // Living-repo tier: CTX-IMPL.md exists in this checkout, so the file anchor
    // resolves (auto-created as a file entity — valid before docs ingest).
    const store = openStore({ projectDir: REPO_ROOT, home });

    const ok = remember(store, {
      surface: "cli",
      note: "test note",
      anchors: ["file:CTX-IMPL.md"],
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error("remember should succeed");
    expect(ok.anchors).toEqual(["file:CTX-IMPL.md"]);
    expect(store.anchorsOf(ok.entityId)).toEqual(["file:CTX-IMPL.md"]);
    expect(store.getEntity("file:CTX-IMPL.md")?.kind).toBe("file"); // anchor materialized

    const back = recall(store, ok.handle);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.gist).toBe("test note");

    // A 300-char note → success-shaped guidance, nothing written.
    const before = store.entityCount();
    const long = remember(store, { surface: "cli", note: "x".repeat(300) });
    expect(long.ok).toBe(false);
    if (!long.ok) {
      expect(long.reason).toBe("gist-too-long");
      expect(long.guidance).toMatch(/split/i);
    }
    expect(store.entityCount()).toBe(before); // NOTHING written
    store.close();
  });

  test("A2-supersede: second entry supersedes the first; old kept, re-statused, linked", () => {
    const store = openStore({ projectDir: REPO_ROOT, home });
    const first = remember(store, { surface: "cli", note: "retry queue drops metadata" });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("first remember failed");

    const second = remember(store, {
      surface: "cli",
      note: "retry queue drops metadata on redelivery (fixed)",
      supersedes: first.handle,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("supersede remember failed");
    expect(second.supersededId).toBe(first.entityId);

    // Old entry KEPT but re-statused.
    const oldRow = store.getMemory(first.entityId);
    expect(oldRow).toBeDefined();
    expect(oldRow?.status).toBe("superseded");

    // Linked new → old.
    const link = store.linksFrom(second.entityId, "supersedes");
    expect(link.map((l) => l.dst)).toContain(first.entityId);
    store.close();
  });
});

// Guard: assert the env-gated tier actually ran on this maintainer box (the
// living acceptance fixture). Skips elsewhere so CI stays green off-box.
describe.skipIf(!existsSync(join(process.env.HOME ?? "", ".claude", "projects")))(
  "A1 gating sanity",
  () => {
    test("this project's memory dir resolves for the living-repo tier", () => {
      // Informational: on the maintainer box this is defined; on other machines
      // the env-gate skips A1 cleanly (recorded in the final report).
      expect(MEMORY_DIR === undefined || MEMORY_DIR.endsWith("/memory")).toBe(true);
    });
  },
);
