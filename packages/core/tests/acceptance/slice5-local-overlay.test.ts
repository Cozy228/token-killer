/**
 * Slice 5 acceptance — personal overlay + three-tier scope (`--local`).
 *
 * Covers the E-series additions (MEMORY-SLICE5-GOAL-PROMPT §Invariants):
 *   - `remember --local` (surface `local`) → overlay + `active`; the note never
 *     appears in a committed file nor in a peer's push digest;
 *   - `surface` required behaves across all callers (cli/mcp/local routing);
 *   - three-tier push config: same shared committed config + different personal
 *     overlays → SAME shared/placed digest, DIFFERENT local views;
 *   - E4 per-repo opt-out → zero committed-zone writes across
 *     remember/confirm/migration/import, fully functional locally;
 *   - doctor surfaces the opt-out mode + a shallow-clone advisory (warn, never fail).
 *
 * Sandbox git repo under a temp CTX_HOME (G-7); no network, no LLM. Writers are
 * injected at a sandbox `.ctx` — the token-killer repo is never touched.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStore, type Store } from "../../src/store/store.ts";
import { remember, setMemoryLifecycle, listMemories, recall } from "../../src/memory/remember.ts";
import { importClaudeCodeMemory } from "../../src/memory/claudeImporter.ts";
import { MemoryFiles } from "../../src/memory/fileStore.ts";
import { reindexMemoryFromFiles } from "../../src/memory/reindex.ts";
import { migrateStoreMemoryToFiles } from "../../src/memory/exportMigration.ts";
import { buildPushBlock } from "../../src/push/block.ts";
import { rankGotchas } from "../../src/push/rank.ts";
import { readPushConfig, readMergedPushConfig } from "../../src/push/push.ts";
import { runDoctor } from "../../src/install/doctor.ts";
import { cleanupTempDir, git, makeTempDir } from "../helpers/sandbox.ts";

function setup(root: string): { repo: string; store: Store; home: string; emptyHome: string } {
  const repo = join(root, "repo");
  git(["init", "-q", "-b", "main", repo], root);
  git(["config", "user.email", "ctx-test@example.invalid"], repo);
  git(["config", "user.name", "ctx test"], repo);
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git(["add", "-A"], repo);
  git(["commit", "-q", "-m", "init"], repo);
  const home = join(root, "ctx-home");
  const store = openStore({ projectDir: repo, home });
  const emptyHome = join(root, "empty-claude");
  mkdirSync(emptyHome, { recursive: true });
  return { repo, store, home, emptyHome };
}

/** Write the SHARED committed push config (`.ctx/push.jsonc`). */
function writeSharedConfig(repo: string, json: string): void {
  mkdirSync(join(repo, ".ctx"), { recursive: true });
  writeFileSync(join(repo, ".ctx", "push.jsonc"), json);
}
/** Write the PERSONAL overlay push config (`.ctx/push.local.jsonc`). */
function writeLocalConfig(repo: string, json: string): void {
  mkdirSync(join(repo, ".ctx"), { recursive: true });
  writeFileSync(join(repo, ".ctx", "push.local.jsonc"), json);
}

describe("acceptance: slice 5 — personal overlay + three-tier scope", () => {
  let root: string;
  beforeEach(() => {
    root = makeTempDir("ctx-slice5-");
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  test("surface routing: cli→mainline active, mcp→overlay needs-review, local→overlay active", () => {
    const { store } = setup(root);
    const files = MemoryFiles.forStore(store);

    const cli = remember(store, { note: "cli committed gotcha", surface: "cli", files });
    expect(cli.ok && cli.status).toBe("active");
    expect(cli.ok && cli.localOnly).toBeUndefined();

    const mcp = remember(store, { note: "agent proposed gotcha", surface: "mcp", files });
    expect(mcp.ok && mcp.status).toBe("needs-review");

    const loc = remember(store, { note: "my private local note", surface: "local", files });
    expect(loc.ok && loc.status).toBe("active"); // human-authored → active, no review queue
    expect(loc.ok && loc.localOnly).toBe(true);
    expect(loc.ok && loc.committedZoneDisabled).toBeUndefined(); // chosen, not opt-out-forced

    // Committed mainline holds ONLY the plain-cli note; overlay holds mcp + local.
    expect(files.readMemories("mainline").map((m) => m.gist)).toEqual(["cli committed gotcha"]);
    const overlayGists = files.readMemories("overlay").map((m) => m.gist);
    expect(overlayGists).toContain("agent proposed gotcha");
    expect(overlayGists).toContain("my private local note");
    store.close();
  });

  test("`--local` note never appears in a committed file nor in a peer's push digest", () => {
    const { repo, store } = setup(root);
    const files = MemoryFiles.forStore(store);

    remember(store, { note: "shared retry-queue gotcha", surface: "cli", files });
    const loc = remember(store, { note: "my throwaway scratch note", surface: "local", files });
    expect(loc.ok).toBe(true);

    // (1) Not in any committed file: only the cli note is in the committed log; the
    //     local note is in the gitignored overlay, marked `remember-local`.
    const committedGists = files.readMemories("mainline").map((m) => m.gist);
    expect(committedGists).toContain("shared retry-queue gotcha");
    expect(committedGists).not.toContain("my throwaway scratch note");
    // The raw committed bytes never carry the local note either (percent-encoded).
    expect(files.memoryLines("mainline").join("\n")).not.toContain("throwaway");
    if (loc.ok) expect(store.getMemory(loc.entityId)?.origin).toBe("remember-local");

    // (1b) Not even in the AUTHOR's OWN push digest (a shared/placed artifact).
    const mineGists = rankGotchas(store).map((g) => g.gist);
    expect(mineGists).toContain("shared retry-queue gotcha");
    expect(mineGists).not.toContain("my throwaway scratch note");

    // (2) A peer pulls only the committed mainline log (overlay is gitignored) and
    //     reindexes → the local note is absent from the peer store + push digest.
    const peerCtx = join(root, "peer-ctx");
    mkdirSync(join(peerCtx, "memory", "details"), { recursive: true });
    writeFileSync(
      join(peerCtx, "memory", "log.md"),
      files.memoryLines("mainline").join("\n") + "\n",
    );
    const peerStore = openStore({ projectDir: repo, home: join(root, "peer-home") });
    reindexMemoryFromFiles(peerStore, new MemoryFiles(peerCtx), {});
    const peerGists = rankGotchas(peerStore).map((g) => g.gist);
    expect(peerGists).toContain("shared retry-queue gotcha");
    expect(peerGists).not.toContain("my throwaway scratch note");
    expect(peerStore.listMemoryEntries().map((m) => m.gist)).not.toContain(
      "my throwaway scratch note",
    );
    peerStore.close();
    store.close();
  });

  test("three-tier: same committed config + different overlays → SAME shared digest, DIFFERENT local views", () => {
    const { repo, store } = setup(root);
    const files = MemoryFiles.forStore(store);
    const a = remember(store, { note: "alpha committed gotcha", surface: "cli", files });
    const b = remember(store, { note: "bravo committed gotcha", surface: "cli", files });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("seed failed");

    // Both working copies share this committed config (no pins).
    writeSharedConfig(repo, `{ "pin": [], "veto": [] }`);
    const sharedBefore = buildPushBlock(store, { config: readPushConfig(repo) }).text;

    // Copy A's personal overlay pins alpha to the front.
    writeLocalConfig(repo, JSON.stringify({ pin: [a.handle] }));
    const localA = buildPushBlock(store, { config: readMergedPushConfig(repo) }).text;
    // The SHARED/placed digest ignores the personal overlay — unchanged.
    expect(buildPushBlock(store, { config: readPushConfig(repo) }).text).toBe(sharedBefore);

    // Copy B's personal overlay pins bravo instead.
    writeLocalConfig(repo, JSON.stringify({ pin: [b.handle] }));
    const localB = buildPushBlock(store, { config: readMergedPushConfig(repo) }).text;
    expect(buildPushBlock(store, { config: readPushConfig(repo) }).text).toBe(sharedBefore);

    // Same committed config → identical SHARED digest across copies; the personal
    // overlays make the LOCAL views differ (different pin order).
    expect(localA).not.toBe(localB);
    expect(localA).not.toBe(sharedBefore);
    store.close();
  });

  test("E4 opt-out: zero committed-zone writes across remember/confirm/migration/import, functional locally", () => {
    const { repo, store, emptyHome } = setup(root);
    writeSharedConfig(repo, `{ "commitMemory": false }`);
    const files = MemoryFiles.forStore(store);
    expect(files.localOnly).toBe(true);

    // (a) remember (cli surface) — normally committed → diverted to overlay, active.
    const r = remember(store, { note: "opt-out repo gotcha", surface: "cli", files });
    expect(r.ok && r.status).toBe("active");
    expect(r.ok && r.localOnly).toBe(true);
    expect(r.ok && r.committedZoneDisabled).toBe(true);
    if (!r.ok) throw new Error("remember failed");

    // (b) confirm — never promotes to the committed zone in an opt-out repo.
    const conf = setMemoryLifecycle(store, r.entityId, "active", files);
    expect(conf.ok).toBe(true);
    expect(conf.ok && conf.promoted).toBeUndefined();
    expect(conf.ok && conf.localOnly).toBe(true);

    // (c) migration — a store-only row swept into the files lands in the overlay.
    const migStore = openStore({ projectDir: repo, home: join(root, "mig-home") });
    remember(migStore, { note: "store-only legacy row", surface: "cli" }); // no files → store-only
    const migFiles = MemoryFiles.forStore(migStore);
    migrateStoreMemoryToFiles(migStore, migFiles);
    expect(migFiles.readMemories("overlay").map((m) => m.gist)).toContain("store-only legacy row");
    migStore.close();

    // (d) import — host memory always lands in the overlay (unchanged by opt-out).
    const slug = store.projectRoot.replace(/[^a-zA-Z0-9]/g, "-");
    const hostDir = join(emptyHome, ".claude", "projects", slug, "memory");
    mkdirSync(hostDir, { recursive: true });
    writeFileSync(join(hostDir, "note.md"), "# Note\nhost imported gotcha\n");
    importClaudeCodeMemory(store, { claudeHome: emptyHome, files });

    // ZERO committed-zone writes: the committed logs were never created/appended.
    expect(existsSync(join(repo, ".ctx", "memory", "log.md"))).toBe(false);
    expect(existsSync(join(repo, ".ctx", "memory", "decisions.md"))).toBe(false);
    expect(files.readMemories("mainline")).toHaveLength(0);
    expect(files.readDecisions("mainline")).toHaveLength(0);

    // Fully functional locally: the note is active + recallable; overlay has content.
    expect(listMemories(store, { status: "active" }).map((m) => m.gist)).toContain(
      "opt-out repo gotcha",
    );
    expect(recall(store, r.entityId).ok).toBe(true);
    expect(files.readMemories("overlay").map((m) => m.gist)).toContain("opt-out repo gotcha");
    store.close();
  });

  test("doctor surfaces the E4 opt-out mode", () => {
    const { repo, home } = setup(root);
    writeSharedConfig(repo, `{ "commitMemory": false }`);
    const report = runDoctor({ projectRoot: repo, home, env: {} });
    const mem = report.checks.find((c) => c.name === "memory")!;
    expect(mem.detail).toContain("commit-memory OFF");

    // The default (commit ON) repo says so.
    const root2 = join(root, "b");
    mkdirSync(root2, { recursive: true });
    const { repo: repo2, home: home2 } = setup(root2);
    const report2 = runDoctor({ projectRoot: repo2, home: home2, env: {} });
    expect(report2.checks.find((c) => c.name === "memory")!.detail).toContain("commit-memory ON");
  });

  test("doctor shallow-clone advisory fires on a shallow fixture (warn, never fail)", () => {
    const { repo, home } = setup(root);
    // A full clone → no warning.
    const full = runDoctor({ projectRoot: repo, home, env: {} }).checks.find(
      (c) => c.name === "git-depth",
    )!;
    expect(full.ok).toBe(true);
    expect(full.detail).toContain("full clone");

    // Fabricate the shallow marker git writes for a `--depth` clone.
    writeFileSync(join(repo, ".git", "shallow"), "0".repeat(40) + "\n");
    const shallow = runDoctor({ projectRoot: repo, home, env: {} }).checks.find(
      (c) => c.name === "git-depth",
    )!;
    expect(shallow.ok).toBe(true); // ADVISORY — never fails the doctor
    expect(shallow.detail).toContain("WARNING");
    expect(shallow.detail).toContain("shallow clone");
    expect(shallow.detail).toContain("anchored-at");
  });
});
