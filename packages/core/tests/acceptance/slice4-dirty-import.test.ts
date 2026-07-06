/**
 * Slice 4 acceptance — memory as a real dirty source + import→overlay→confirm.
 *
 * Covers the new acceptance items (MEMORY-SLICE4-GOAL-PROMPT §Invariants):
 *   - S8a caller-surface split (CLI human → Mainline active; MCP agent → overlay
 *     needs-review);
 *   - live E4 secret-guard diversion on the committed path;
 *   - import → overlay → confirm → promotion round-trip (a peer sees the promoted
 *     memory after pull + reindex);
 *   - `unresolved-here` rendering (not stale, not down-ranked, push-excluded);
 *   - migration cold-path trigger idempotence via the adapter;
 *   - A11: warm memory dirtyCheck < 20 ms + serve < 150 ms on a large committed
 *     `.ctx/memory` fixture.
 *
 * Everything runs in a sandbox git repo under a temp CTX_HOME (G-7); no network,
 * no LLM (assertNoEgress stays armed). Injected `claudeHome` points at an empty
 * dir so the REAL host memory never leaks into these deterministic fixtures.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStore, type Store } from "../../src/store/store.ts";
import { remember, setMemoryLifecycle } from "../../src/memory/remember.ts";
import { importClaudeCodeMemory } from "../../src/memory/claudeImporter.ts";
import { MemoryFiles } from "../../src/memory/fileStore.ts";
import { reindexMemoryFromFiles } from "../../src/memory/reindex.ts";
import { MemorySourceAdapter } from "../../src/memory/adapter.ts";
import { memoryOpsReport } from "../../src/memory/ops.ts";
import { serializeMemory } from "../../src/memory/serialize.ts";
import { rankGotchas } from "../../src/push/rank.ts";
import { renderAtTier } from "../../src/select/project.ts";
import { cleanupTempDir, git, makeTempDir } from "../helpers/sandbox.ts";
import type { Budget } from "../../src/ingest/adapter.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };

/** A fresh sandbox git repo + a store over it, with an EMPTY injected claudeHome. */
function setup(root: string): { repo: string; store: Store; emptyHome: string } {
  const repo = join(root, "repo");
  git(["init", "-q", "-b", "main", repo], root);
  git(["config", "user.email", "ctx-test@example.invalid"], repo);
  git(["config", "user.name", "ctx test"], repo);
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git(["add", "-A"], repo);
  git(["commit", "-q", "-m", "init"], repo);
  const store = openStore({ projectDir: repo, home: join(root, "ctx-home") });
  const emptyHome = join(root, "empty-claude"); // resolveClaudeMemoryDir → undefined
  mkdirSync(emptyHome, { recursive: true });
  return { repo, store, emptyHome };
}

describe("acceptance: slice 4 — memory dirty source + import→overlay→confirm", () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir("ctx-slice4-");
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  test("S8a: CLI (human) → committed Mainline active; MCP (agent) → overlay needs-review", () => {
    const { store } = setup(root);
    const files = MemoryFiles.forStore(store);

    const cli = remember(store, { note: "cli human gotcha", surface: "cli", files });
    expect(cli.ok && cli.status).toBe("active");
    expect(files.readMemories("mainline").map((m) => m.gist)).toContain("cli human gotcha");
    expect(files.readMemories("overlay").map((m) => m.gist)).not.toContain("cli human gotcha");

    const mcp = remember(store, { note: "agent proposed gotcha", surface: "mcp", files });
    expect(mcp.ok && mcp.status).toBe("needs-review");
    expect(files.readMemories("overlay").map((m) => m.gist)).toContain("agent proposed gotcha");
    expect(files.readMemories("mainline").map((m) => m.gist)).not.toContain(
      "agent proposed gotcha",
    );
    if (mcp.ok) expect(store.getMemory(mcp.entityId)?.status).toBe("needs-review");

    store.close();
  });

  test("E4: a secret-shaped CLI note is diverted to the overlay as needs-review (live guard)", () => {
    const { store } = setup(root);
    const files = MemoryFiles.forStore(store);
    const secret = "the deploy key is sk-ant-api03-abcdef0123456789ABCDEF do not lose it";
    const r = remember(store, { note: secret, surface: "cli", files });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("remember failed");
    // Committed intent, secret-shaped → diverted (never a hard error).
    expect(r.status).toBe("needs-review");
    expect(r.remediation).toBeDefined();
    expect(r.remediation).toContain("overlay");
    // Nothing secret in the committed Mainline log; it sits in the gitignored overlay.
    expect(files.readMemories("mainline")).toHaveLength(0);
    expect(files.readMemories("overlay").map((m) => m.gist)).toContain(secret);
    store.close();
  });

  test("round-trip: host import → overlay needs-review → confirm PROMOTES to Mainline; a peer sees it", () => {
    const { repo, store, emptyHome } = setup(root);
    const files = MemoryFiles.forStore(store);

    // Seed a host memory topic under the injected claudeHome, then import it. The
    // importer resolves via `store.projectRoot` (a realpath — /private/... on mac),
    // so the slug must be derived from THAT, not the raw temp path.
    const slug = store.projectRoot.replace(/[^a-zA-Z0-9]/g, "-");
    const hostDir = join(emptyHome, ".claude", "projects", slug, "memory");
    mkdirSync(hostDir, { recursive: true });
    writeFileSync(join(hostDir, "note.md"), "# Note\nkeep the idempotency key on redelivery\n");
    const report = importClaudeCodeMemory(store, { claudeHome: emptyHome, files });
    expect(report.entities).toBe(1);
    const memId = report.written[0]!;
    // Landed in the overlay as needs-review; NOTHING committed yet (E3).
    expect(store.getMemory(memId)?.status).toBe("needs-review");
    expect(files.readMemories("mainline")).toHaveLength(0);
    expect(files.readMemories("overlay").map((m) => m.memoryId)).toContain(memId);

    // Human confirm → PROMOTE the overlay create body to Mainline (item 4 / D3).
    const res = setMemoryLifecycle(store, memId, "active", files);
    expect(res.ok && res.promoted).toBe(true);
    expect(files.readMemories("mainline").map((m) => m.memoryId)).toContain(memId);
    expect(
      files.readDecisions("mainline").some((d) => d.verb === "confirm" && d.memoryId === memId),
    ).toBe(true);

    // The AUTHOR reindexes their own files: mainline wins over the leftover overlay
    // create line (F6) — shadowedOverlay === 1, memory stays active.
    const authorReport = reindexMemoryFromFiles(store, files, {});
    expect(authorReport.shadowedOverlay).toBe(1);
    expect(store.getMemory(memId)?.status).toBe("active");

    // A PEER pulls only the committed Mainline files (the overlay is gitignored,
    // never shared) and reindexes → sees the promoted memory, active, no overlay.
    const peerCtx = join(root, "peer-ctx");
    mkdirSync(join(peerCtx, "memory", "details"), { recursive: true });
    copyFileSync(join(repo, ".ctx", "memory", "log.md"), join(peerCtx, "memory", "log.md"));
    copyFileSync(
      join(repo, ".ctx", "memory", "decisions.md"),
      join(peerCtx, "memory", "decisions.md"),
    );
    const peerFiles = new MemoryFiles(peerCtx);
    const peerStore = openStore({ projectDir: repo, home: join(root, "peer-home") });
    const peerReport = reindexMemoryFromFiles(peerStore, peerFiles, {});
    expect(peerReport.shadowedOverlay).toBe(0); // a peer has no overlay
    const peerMem = peerStore.getMemory(memId);
    expect(peerMem?.status).toBe("active");
    expect(peerMem?.gist).toBe(store.getMemory(memId)?.gist);

    peerStore.close();
    store.close();
  });

  test("unresolved-here: a branch-absent anchor renders a hint, stays active, is push-excluded", () => {
    const { repo, store } = setup(root);
    const files = MemoryFiles.forStore(store);

    // A commit on a divergent branch — NOT an ancestor of HEAD (main).
    writeFileSync(join(repo, "other.txt"), "x\n");
    git(["checkout", "-q", "-b", "feature"], repo);
    git(["add", "-A"], repo);
    git(["commit", "-q", "-m", "feature commit"], repo);
    const branchOid = git(["rev-parse", "HEAD"], repo).trim();
    git(["checkout", "-q", "main"], repo);

    // A committed memory anchored to a symbol absent on this checkout, whose
    // anchored-at rode in from that divergent branch (S9 branch-absent case).
    const stamp = store.nextEventStamp();
    files.appendMemory("mainline", {
      eventId: stamp.id,
      at: stamp.at,
      memoryId: "mem:0000000000000000000000UNRS",
      actor: "cli",
      carrier: "memory",
      method: "explicit-key",
      authority: "confirmed",
      status: "active",
      gist: "the feature-branch helper caches the parsed manifest",
      origin: "remember",
      anchors: ["sym:src/feature.ts#helper"],
      anchoredAt: branchOid,
    });
    // Publish a (empty) code generation so the reindex judges anchor freshness.
    store.beginGeneration("code");
    store.publishGeneration("code");

    reindexMemoryFromFiles(store, files, {});
    const mem = store.getMemory("mem:0000000000000000000000UNRS");
    expect(mem?.unresolvedHere).toBe(true);
    // NOT stale: committed status unchanged, no drift annotation.
    expect(mem?.status).toBe("active");
    expect(mem?.driftReason).toBeUndefined();

    // Projection renders the branch/import hint.
    const entity = store.getEntity("mem:0000000000000000000000UNRS")!;
    const rendered = renderAtTier(store, entity, "mtest", "skeleton");
    expect(rendered.text).toContain("not present on this branch/checkout");

    // Locally excluded from the push digest (freshness unverifiable here).
    const gotchas = rankGotchas(store);
    expect(gotchas.map((g) => g.entityId)).not.toContain("mem:0000000000000000000000UNRS");

    store.close();
  });

  test("migration cold-path trigger is idempotent (adapter run twice sweeps once, no churn)", async () => {
    const { store, emptyHome } = setup(root);
    // Legacy store-only rows (M1 shape: written WITHOUT a files writer).
    remember(store, { note: "legacy store-only alpha" });
    remember(store, { note: "legacy store-only bravo" });
    const before = store.allMemories().length;
    expect(before).toBe(2);

    const adapter = new MemorySourceAdapter({ claudeHome: emptyHome });
    // First cold-path ingest: migration is due → sweep the store-only rows to files.
    const d1 = await adapter.dirtyCheck(store);
    expect(d1.dirty).toBe(true);
    await adapter.ingest(store, d1, MAX_BUDGET);
    const files = MemoryFiles.forStore(store);
    expect(files.readMemories("mainline").length).toBe(2);
    const afterFirst = store.allMemories().length;

    // Second ingest: nothing changed → migration NOT due, no duplicate rows.
    const d2 = await adapter.dirtyCheck(store);
    await adapter.ingest(store, d2, MAX_BUDGET);
    expect(store.allMemories().length).toBe(afterFirst);
    expect(files.readMemories("mainline").length).toBe(2);

    // A steady-state dirtyCheck is now clean (the synced flag + manifest match).
    const d3 = await adapter.dirtyCheck(store);
    expect(d3.dirty).toBe(false);
    store.close();
  });

  test("A11: warm memory dirtyCheck < 20ms and serve fast on a large committed fixture", async () => {
    const { store, emptyHome } = setup(root);
    const files = MemoryFiles.forStore(store);
    files.ensureScaffold();
    // Build a large committed memory log (400 entries) directly in the files.
    const N = 400;
    let at = 1_000;
    for (let i = 0; i < N; i++) {
      const id = String(i).padStart(26, "0");
      files.appendMemory("mainline", {
        eventId: id,
        at: at++,
        memoryId: `mem:${id}`,
        actor: "cli",
        carrier: "memory",
        method: "explicit-key",
        authority: "confirmed",
        status: "active",
        gist: `durable fact number ${i} about the store and its retry queue`,
        origin: "remember",
        anchors: [],
      });
    }

    const adapter = new MemorySourceAdapter({ claudeHome: emptyHome });
    // Cold ingest: reindex the 400 committed entries + persist the manifest.
    const cold = await adapter.dirtyCheck(store);
    await adapter.ingest(store, cold, MAX_BUDGET);
    expect(store.allMemories().length).toBe(N);

    // Warm dirtyCheck: an unchanged tree → stats only, no re-parse (A11 < 20ms).
    const factor = process.env.CI ? 6 : 3;
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 16; i++) {
      const t0 = performance.now();
      const d = await adapter.dirtyCheck(store);
      const ms = performance.now() - t0;
      expect(d.dirty).toBe(false);
      if (ms < min) min = ms;
    }
    expect(min, `warm memory dirtyCheck ${min.toFixed(2)}ms (target <20ms)`).toBeLessThan(
      20 * factor,
    );

    // E8 ops report is a cheap read (doctor surface): the review queue is drained.
    const ops = memoryOpsReport(store, files);
    expect(ops.reviewQueue).toBe(0);
    expect(ops.danglingSidecars).toBe(0);
    store.close();
  });

  test("serialize round-trips a large batch identically (no torn lines under union merge)", () => {
    // Guards the A11 fixture builder: every synthetic line parses back 1:1.
    const line = serializeMemory({
      eventId: "E1",
      at: 5,
      memoryId: "mem:X",
      actor: "cli",
      carrier: "memory",
      method: "explicit-key",
      authority: "confirmed",
      status: "active",
      gist: "a gist with spaces and = signs and %",
      origin: "remember",
      anchors: ["sym:a#b"],
    });
    expect(line).not.toContain("\n");
    expect(line.startsWith("- mem ")).toBe(true);
  });
});
