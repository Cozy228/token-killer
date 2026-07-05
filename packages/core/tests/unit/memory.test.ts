import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  claudeProjectSlug,
  importClaudeCodeMemory,
  parseFrontmatter,
  parseMemoryIndex,
  toGist,
} from "../../src/memory/claudeImporter.ts";
import { embeddedNumbers, fuzzyDuplicate, shannonEntropy } from "../../src/memory/dedup.ts";
import { MemorySourceAdapter } from "../../src/memory/adapter.ts";
import { listMemories, recall, remember, setMemoryLifecycle } from "../../src/memory/remember.ts";
import { search } from "../../src/select/engine.ts";
import { hasSentinel, stripSentinelBlocks } from "../../src/memory/sentinel.ts";
import { deterministicUlid, memoryId, ulid } from "../../src/memory/ulid.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

/** Unwrap a success-shaped result or fail loudly (test helper). */
function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok result, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** Build a synthetic Claude Code memory dir under a temp `claudeHome`. */
function seedClaudeMemory(
  claudeHome: string,
  projectRoot: string,
  files: Record<string, string>,
): string {
  const dir = join(claudeHome, ".claude", "projects", claudeProjectSlug(projectRoot), "memory");
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe("memory: ULID identity", () => {
  test("deterministic ULID is stable per seed; fresh ULID is time-ordered", () => {
    expect(deterministicUlid(1000, "claude-code:a.md")).toBe(
      deterministicUlid(1000, "claude-code:a.md"),
    );
    expect(deterministicUlid(1000, "claude-code:a.md")).not.toBe(
      deterministicUlid(1000, "claude-code:b.md"),
    );
    const id = memoryId(ulid(1_700_000_000_000));
    expect(id.startsWith("mem:")).toBe(true);
    expect(id.slice(4)).toHaveLength(26); // 10 time + 16 random, Crockford base32
    expect(id.slice(4)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // Later timestamp sorts lexicographically after an earlier one.
    expect(ulid(2000, new Uint8Array(10)) > ulid(1000, new Uint8Array(10))).toBe(true);
  });
});

describe("memory: sentinel echo exclusion", () => {
  const block = "<!-- ctx:managed:begin -->\nctx digest text\n<!-- ctx:managed:end -->";

  test("stripSentinelBlocks removes the managed block and leaves surrounding text", () => {
    const text = `before\n${block}\nafter`;
    expect(hasSentinel(text)).toBe(true);
    const stripped = stripSentinelBlocks(text);
    expect(stripped).not.toContain("ctx:managed:begin");
    expect(stripped).toContain("before");
    expect(stripped).toContain("after");
  });

  test("a stray unmatched marker line is also dropped", () => {
    expect(stripSentinelBlocks("keep\n<!-- ctx:managed:begin -->\nkeep2")).not.toContain(
      "ctx:managed",
    );
  });
});

describe("memory: dedup identity rules", () => {
  test("entropy floor: short / low-entropy gists never fuzzy-match", () => {
    expect(fuzzyDuplicate("ok", "ok").candidate).toBe(false);
    expect(fuzzyDuplicate("aaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaa").reason).toBe(
      "below-entropy-floor",
    );
    expect(shannonEntropy("aaaa")).toBe(0);
  });

  test("differing embedded numbers veto a match (ADR 0011 ≠ ADR 0013)", () => {
    const a = "ADR 0011 records the evidence ladder decision for the store";
    const b = "ADR 0013 records the evidence ladder decision for the store";
    expect(embeddedNumbers("ADR 0011").has("11")).toBe(true);
    expect(fuzzyDuplicate(a, b).reason).toBe("differing-numbers");
  });

  test("high-overlap distinct-text gists are flagged as candidates only", () => {
    const a = "the retry queue drops request metadata on redelivery under load";
    const b = "the retry queue drops request metadata on redelivery when overloaded";
    const v = fuzzyDuplicate(a, b);
    expect(v.candidate).toBe(true);
    expect(v.similarity).toBeGreaterThanOrEqual(0.6);
    // Unrelated text is not a candidate.
    expect(fuzzyDuplicate(a, "windows startup perf plan uses av exclusion gates").candidate).toBe(
      false,
    );
  });
});

describe("memory: parsing helpers", () => {
  test("parseFrontmatter splits a shallow YAML block", () => {
    const { frontmatter, body } = parseFrontmatter(
      '---\nname: x\ndescription: "hi there"\n---\nBODY\n',
    );
    expect(frontmatter.name).toBe("x");
    expect(frontmatter.description).toBe("hi there");
    expect(body.trim()).toBe("BODY");
  });

  test("parseMemoryIndex maps topic files to curated gists", () => {
    const idx = parseMemoryIndex(
      "- [Title](topic.md) — the gist here\n- [Other](o.md#a) - second gist",
    );
    expect(idx.get("topic.md")).toBe("the gist here");
    expect(idx.get("o.md")).toBe("second gist");
  });

  test("toGist caps at 240 chars on a word boundary with an ellipsis", () => {
    const long = `${"word ".repeat(80)}`.trim();
    const g = toGist(long);
    expect(g.length).toBeLessThanOrEqual(240);
    expect(g.endsWith("…")).toBe(true);
  });
});

describe("memory: Claude importer (synthetic dir — deterministic tier)", () => {
  let root: string;
  let repo: string;
  let home: string;
  let claudeHome: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-imp-");
    repo = makeGitFixture(root);
    home = join(root, "ctx-home");
    claudeHome = join(root, "fake-home");
    store = openStore({ projectDir: repo, home });
    seedClaudeMemory(claudeHome, store.projectRoot, {
      "MEMORY.md":
        "# Index\n- [Alpha](alpha.md) — alpha curated gist\n- [Long](long.md) — " +
        "word ".repeat(80),
      "alpha.md":
        "---\nname: Alpha\ndescription: alpha desc\ntype: feedback\n---\nAlpha body text.\n",
      "long.md": "---\nname: Long\n---\nlong body\n",
      "beta.md": "# Beta heading\n\nbeta body paragraph\n",
      "echo.md":
        "real content before\n<!-- ctx:managed:begin -->\ndigest\n<!-- ctx:managed:end -->\nreal after\n",
      "pure-echo.md": "<!-- ctx:managed:begin -->\ndigest only\n<!-- ctx:managed:end -->\n",
    });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("imports topic files, skips the pure-echo file, all inferred/host-import", () => {
    const r = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome });
    expect(r.entities).toBe(4); // alpha, long, beta, echo (pure-echo skipped)
    expect(r.skipped).toBe(1);
    for (const id of r.written) {
      const m = store.getMemory(id);
      expect(m?.origin).toBe("host-import:claude-code");
      expect(m?.authority).toBe("inferred");
      expect(m?.gist.length ?? 0).toBeLessThanOrEqual(240);
    }
  });

  test("echo exclusion: sentinel stripped from body, pure-echo file skipped", () => {
    const r = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome });
    for (const id of r.written) {
      const m = store.getMemory(id);
      expect(m?.detail ?? "").not.toContain("ctx:managed");
      expect(m?.gist ?? "").not.toContain("ctx:managed");
    }
    // The echo.md entry keeps its real surrounding content.
    const echo = r.written
      .map((id) => store.getMemory(id))
      .find((m) => m?.detail?.includes("real after"));
    expect(echo?.detail).toContain("real content before");
  });

  test("curated index gist preferred; frontmatter/heading fallbacks", () => {
    const r = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome });
    const byName = new Map(r.written.map((id) => [store.getEntity(id)?.name, store.getMemory(id)]));
    expect(byName.get("Alpha")?.gist).toBe("alpha curated gist"); // index wins over frontmatter
    expect(byName.get("Long")?.gist.endsWith("…")).toBe(true); // long index gist capped
    expect(byName.get("Beta heading")?.gist).toContain("beta body"); // heading name + body gist
  });

  test("re-import is idempotent (deterministic ids upsert, no duplicates)", () => {
    const first = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome });
    const before = store.entityCount();
    const second = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome });
    expect(second.entities).toBe(first.entities);
    expect(store.entityCount()).toBe(before);
    expect(second.written.sort()).toEqual(first.written.sort());
  });

  test("no memory dir → clean no-op report (never throws)", () => {
    const r = importClaudeCodeMemory(store, { projectRoots: ["/nonexistent/path"], claudeHome });
    expect(r).toMatchObject({ memoryDir: undefined, entities: 0, skipped: 0 });
  });

  test("D4: within-host near-dups surface as a sameAsCandidate conflict (not just a link)", () => {
    // Two near-dup gists (same numbers, Jaccard ≥ 0.6) → candidate; kept separate.
    seedClaudeMemory(claudeHome, store.projectRoot, {
      "dup-a.md": "the retry queue drops request metadata on redelivery under load",
      "dup-b.md": "the retry queue drops request metadata on redelivery when overloaded",
    });
    const r = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome });
    expect(r.candidates).toBeGreaterThanOrEqual(1);
    const dupConflicts = store.conflicts("open").filter((c) => c.kind === "sameAsCandidate");
    expect(dupConflicts.length).toBeGreaterThanOrEqual(1);
    // The conflict's claims resolve to two DISTINCT memory entities (never merged).
    const c = dupConflicts[0]!;
    const subA = store.getClaim(c.a)?.subject;
    const subB = store.getClaim(c.b)?.subject;
    expect(subA).toBeDefined();
    expect(subB).toBeDefined();
    expect(subA).not.toBe(subB);
    expect(store.getMemory(subA!)).toBeDefined();
    expect(store.getMemory(subB!)).toBeDefined();
  });

  test("A3: imports land needs-review (not active), drained via the review queue", () => {
    const r = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome });
    for (const id of r.written) expect(store.getMemory(id)?.status).toBe("needs-review");
    expect(listMemories(store, { status: "needs-review" }).length).toBe(r.entities);
    expect(listMemories(store, { status: "active" }).length).toBe(0);
  });

  test("D8: MemorySourceAdapter dirtyCheck is mtime-aware; ingest wires + is idempotent", async () => {
    const adapter = new MemorySourceAdapter({
      claudeHome,
      projectRoots: [store.projectRoot],
    });
    const budget = { deadline: Number.MAX_SAFE_INTEGER, now: () => 1_700_000_000_000 };

    // Seeded host dir with an unseen watermark → dirty.
    const first = await adapter.dirtyCheck(store);
    expect(first.dirty).toBe(true);
    const ing = await adapter.ingest(store, first, budget);
    expect(ing.entities).toBeGreaterThan(0);
    const importedCount = listMemories(store).length;

    // Re-check with an unchanged dir → clean (watermark advanced by ingest).
    const second = await adapter.dirtyCheck(store);
    expect(second.dirty).toBe(false);
    // Re-ingest anyway → deterministic upsert, no new entities (idempotent).
    await adapter.ingest(store, { source: "memory", dirty: true, magnitude: 1 }, budget);
    expect(listMemories(store).length).toBe(importedCount);

    // Touch a topic file PAST the stored watermark → dirty again (content edits
    // are caught, not just add/remove).
    const dir = join(
      claudeHome,
      ".claude",
      "projects",
      claudeProjectSlug(store.projectRoot),
      "memory",
    );
    const watermark = Number(store.getCursor("memory")?.position ?? 0);
    const future = new Date(watermark + 60_000);
    utimesSync(join(dir, "beta.md"), future, future);
    expect((await adapter.dirtyCheck(store)).dirty).toBe(true);

    // Absent dir → always-clean fast path.
    const noDir = new MemorySourceAdapter({ claudeHome, projectRoots: ["/nonexistent/path"] });
    expect((await noDir.dirtyCheck(store)).dirty).toBe(false);
  });
});

describe("memory: remember / recall / lifecycle", () => {
  let root: string;
  let repo: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-rem-");
    repo = makeGitFixture(root);
    store = openStore({ projectDir: repo, home: join(root, "ctx-home") });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("unresolved anchor → guidance, nothing written", () => {
    const before = store.entityCount();
    const r = remember(store, { note: "note", anchors: ["sym:does/not/exist#x"] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unresolved-anchors");
      expect(r.candidates).toBeDefined();
    }
    expect(store.entityCount()).toBe(before);
  });

  test("anchor to an existing file entity resolves without auto-create", () => {
    store.upsertEntity({
      id: "file:README.md",
      kind: "file",
      name: "README.md",
      locator: { t: "file", path: "README.md" },
      gen: 1,
    });
    const r = remember(store, { note: "anchored", anchors: ["file:README.md"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(store.anchorsOf(r.entityId)).toEqual(["file:README.md"]);
  });

  test("recall of an unknown handle returns success-shaped guidance", () => {
    const r = recall(store, "z9999999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown-handle");
  });

  test("D3: prewrite reconcile — near-dup write links + advises, never blocks", () => {
    const a = must(
      remember(store, { note: "the retry queue drops request metadata on redelivery under load" }),
    );
    // A near-duplicate (same numbers, high word overlap) → success, linked + advised.
    const b = remember(store, {
      note: "the retry queue drops request metadata on redelivery when overloaded",
    });
    expect(b.ok).toBe(true); // never gated
    if (!b.ok) throw new Error("write must succeed");
    // sameAsCandidate link between the two, and a conflict in the channel.
    const link = store.linksFrom(b.entityId, "sameAsCandidate").find((l) => l.dst === a.entityId);
    expect(link?.method).toBe("semantic-proposal");
    expect(store.conflicts("open").some((c) => c.kind === "sameAsCandidate")).toBe(true);
    // supersede-candidate advisory names the existing entry (no auto-apply).
    expect(b.advisory?.kind).toBe("supersede-candidate");
    expect(b.advisory?.candidates.map((c) => c.entityId)).toContain(a.entityId);
    // Both kept, both active — never a destructive merge, never a supersede.
    expect(store.getMemory(a.entityId)?.status).toBe("active");
    expect(store.getMemory(b.entityId)?.status).toBe("active");
  });

  test("D3: differing embedded numbers → no candidate, no link, no advisory", () => {
    const a = must(
      remember(store, { note: "ADR 0011 records the evidence ladder decision for the store" }),
    );
    const b = remember(store, {
      note: "ADR 0013 records the evidence ladder decision for the store",
    });
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error("write must succeed");
    expect(b.advisory).toBeUndefined();
    expect(store.linksFrom(b.entityId, "sameAsCandidate")).toHaveLength(0);
    expect(store.conflicts("open").filter((c) => c.kind === "sameAsCandidate")).toHaveLength(0);
    void a;
  });

  test("lifecycle: list + status transitions (confirm/retire), status filter", () => {
    const a = remember(store, { note: "first fact about the retry path" });
    const b = remember(store, { note: "second fact about the store spine" });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("setup failed");

    expect(listMemories(store)).toHaveLength(2);

    const retire = setMemoryLifecycle(store, a.handle, "retired");
    expect(retire.ok).toBe(true);
    expect(store.getMemory(a.entityId)?.status).toBe("retired");

    // Filter by status.
    expect(listMemories(store, { status: "active" }).map((m) => m.entityId)).toEqual([b.entityId]);
    expect(listMemories(store, { status: "retired" }).map((m) => m.entityId)).toEqual([a.entityId]);

    // Unknown handle → guidance, not a throw.
    const bad = setMemoryLifecycle(store, "nope", "active");
    expect(bad.ok).toBe(false);
  });

  test("A1: a retired memory is excluded from default pull (search), recall still works", () => {
    const keep = remember(store, { note: "the retry queue redelivers on failure under load" });
    const gone = remember(store, {
      note: "the retry queue drops metadata on redelivery when busy",
    });
    expect(keep.ok && gone.ok).toBe(true);
    if (!keep.ok || !gone.ok) throw new Error("setup failed");

    // Both active → both reachable by search.
    const before = search(store, { query: "retry queue redelivery" });
    expect(before.items.map((i) => i.entityId)).toContain(gone.entityId);

    setMemoryLifecycle(store, gone.handle, "retired");
    const after = search(store, { query: "retry queue redelivery" });
    expect(after.items.map((i) => i.entityId)).not.toContain(gone.entityId); // hard-excluded
    expect(after.items.map((i) => i.entityId)).toContain(keep.entityId); // sibling unaffected
    expect(recall(store, gone.handle).ok).toBe(true); // still recoverable by handle
  });
});
