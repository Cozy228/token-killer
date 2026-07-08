/**
 * Git extractor unit + property tests (CONTEXA-IMPL §5.1, §10). Fixture repos are
 * script-generated into temp dirs (Windows EBUSY cleanup); all git spawns carry
 * explicit timeouts via the sandbox helper. No real host state is touched (G-7).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createGitAdapter } from "../../src/ingest/git/adapter.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import { computeCochange, DEFAULT_MAX_FILES_PER_COMMIT } from "../../src/ingest/git/cochange.ts";
import { parseReferences } from "../../src/ingest/git/trailers.ts";
import { walkCommits } from "../../src/ingest/git/walk.ts";
import { headOid, revListCount } from "../../src/ingest/git/gitCli.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, git, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";
import { DatabaseSync } from "node:sqlite";

/** Commit a set of {path: contents} with a message. */
function commit(repo: string, files: Record<string, string>, message: string): void {
  for (const [path, contents] of Object.entries(files)) {
    writeFileSync(join(repo, path), contents);
    git(["add", path], repo);
  }
  git(["commit", "-q", "-m", message], repo);
}

/** A budget that never expires (generous cold path). */
function fullBudget(): Budget {
  return { deadline: Number.MAX_SAFE_INTEGER, now: () => 0 };
}

function claimCount(store: Store): number {
  const db = new DatabaseSync(store.dbPath);
  db.exec("PRAGMA busy_timeout=5000");
  try {
    return (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

describe("trailers & issue keys (§5.1)", () => {
  test("closing keywords, bare hashes, issue keys, decision trailers", () => {
    const refs = parseReferences(
      "fix crash in loader (#7)",
      "Fixes #12\nRelated to ABC-345 and WEB-9\nCloses #12\nDecision: adopt-node-sqlite\n",
    );
    // #12 is a closing ref (Fixes) — not double-counted as a bare reference.
    expect(refs).toContainEqual({ kind: "fixes", target: "#12" });
    expect(refs).toContainEqual({ kind: "references", target: "#7" });
    expect(refs).toContainEqual({ kind: "issue-key", target: "ABC-345" });
    expect(refs).toContainEqual({ kind: "issue-key", target: "WEB-9" });
    expect(refs).toContainEqual({ kind: "decision", target: "adopt-node-sqlite" });
    expect(refs).toContainEqual({ kind: "closes", target: "#12" }); // "Closes #12"
    // #12 is a closing ref (fixes/closes), never demoted to a bare "references".
    expect(refs.some((r) => r.kind === "references" && r.target === "#12")).toBe(false);
  });

  test("no references → empty", () => {
    expect(parseReferences("plain subject", "no keys here")).toEqual([]);
  });
});

describe("co-change window + support (§5.1)", () => {
  const c = (files: string[]) => ({
    oid: "x",
    oid12: "x",
    author: "",
    authorEmail: "",
    date: "",
    subject: "",
    body: "",
    files: files.map((p) => ({ status: "M" as const, path: p })),
  });

  test("pairs at support ≥ 3 surface; below the floor drop out", () => {
    const commits = [c(["a", "b"]), c(["a", "b"]), c(["a", "b"]), c(["a", "c"])];
    const pairs = computeCochange(commits);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ src: "a", dst: "b", support: 3 });
    // confidence = P(B|A) = support / min(count(a)=4, count(b)=3) = 3/3 = 1.
    expect(pairs[0]!.confidence).toBeCloseTo(1, 5);
  });

  test("a bulk commit above the file cap does not inflate incidental pairs", () => {
    const bulk = c(Array.from({ length: DEFAULT_MAX_FILES_PER_COMMIT + 1 }, (_, i) => `f${i}`));
    const commits = [c(["a", "b"]), c(["a", "b"]), c(["a", "b"]), bulk, bulk];
    const pairs = computeCochange(commits);
    // a↔b stays at 3 (bulk commits, which also contain a&b, are excluded).
    expect(pairs.find((p) => p.src === "a" && p.dst === "b")?.support).toBe(3);
    expect(pairs.some((p) => p.src === "f0")).toBe(false);
  });

  test("deterministic ordering: support desc, then confidence, then id", () => {
    const commits = [
      c(["a", "b"]),
      c(["a", "b"]),
      c(["a", "b"]),
      c(["a", "b"]),
      c(["m", "n"]),
      c(["m", "n"]),
      c(["m", "n"]),
    ];
    const pairs = computeCochange(commits);
    expect(pairs.map((p) => `${p.src}-${p.dst}`)).toEqual(["a-b", "m-n"]);
  });
});

describe("git adapter over fixture repos (§5.1)", () => {
  let root: string;
  let repo: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-gitx-");
    repo = makeGitFixture(root); // one commit: README.md
    store = openStore({ projectDir: repo, home: join(root, "contexa-home") });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("commit entities use git locators; message read back, not stored", async () => {
    commit(repo, { "a.ts": "export const a = 1;\n" }, "feat: add a\n\nDecision: keep-a");
    const oid = headOid(repo)!;
    const adapter = createGitAdapter();
    await adapter.ingest(store, { source: "git", dirty: true, magnitude: 2 }, fullBudget());

    const cid = `commit:${oid.slice(0, 12)}`;
    const entity = store.getEntity(cid);
    expect(entity?.kind).toBe("commit");
    expect(entity?.locator).toEqual({ t: "git", oid });
    // touches links the post-image file.
    expect(store.linksFrom(cid, "touches").map((l) => l.dst)).toContain("file:a.ts");
    // Decision trailer → explicit-key claim.
    expect(store.claimsFor(cid, "decision").map((c2) => c2.object)).toContain("keep-a");
    // Message body read back through the git locator (index-not-copy).
    const rt = store.readThrough(cid);
    expect(rt.ok && rt.via === "git" && rt.text.includes("feat: add a")).toBe(true);
  });

  test("rename chain produces a rename-tracked link; old history reachable", async () => {
    commit(repo, { "old.ts": "export const x = 1;\n".repeat(20) }, "add old");
    git(["mv", "old.ts", "new.ts"], repo);
    git(["commit", "-q", "-m", "rename old to new"], repo);
    const adapter = createGitAdapter();
    await adapter.ingest(store, { source: "git", dirty: true, magnitude: 3 }, fullBudget());

    const renameLinks = store.linksTo("file:new.ts", "renamed-to");
    expect(renameLinks.map((l) => l.src)).toContain("file:old.ts");
    expect(renameLinks[0]?.method).toBe("rename-tracked");
    // Old path's own creation history is reachable from the new entity.
    const oldTouches = store.linksTo("file:old.ts", "touches");
    expect(oldTouches.length).toBeGreaterThanOrEqual(1);
  });

  test("co-change link lands for files changed together ≥3 times", async () => {
    for (let i = 0; i < 3; i++) {
      commit(repo, { "a.ts": `// a ${i}\n`, "b.ts": `// b ${i}\n` }, `edit ab ${i}`);
    }
    const adapter = createGitAdapter({ cochangeMinSupport: 3 });
    await adapter.ingest(store, { source: "git", dirty: true, magnitude: 4 }, fullBudget());
    const link = store.linksFrom("file:a.ts", "co-changed").find((l) => l.dst === "file:b.ts");
    expect(link, "a.ts co-changed b.ts").toBeDefined();
    const claim = store.getClaim(link!.claimId!);
    expect(claim?.locus).toMatch(/support=3/);
  });

  test("dirtyCheck: count semantics + clean short-circuit (A4-immutable)", async () => {
    const adapter = createGitAdapter();
    // Cold: behind by the full history.
    const cold = await adapter.dirtyCheck(store);
    expect(cold.dirty).toBe(true);
    expect(cold.magnitude).toBe(revListCount(repo, undefined));

    await adapter.ingest(store, cold, fullBudget());
    // Warm, no new commits: clean, magnitude 0 (cursor == HEAD).
    expect(await adapter.dirtyCheck(store)).toMatchObject({ dirty: false, magnitude: 0 });

    // One more commit → behind by exactly 1 (COUNT, not boolean).
    commit(repo, { "c.ts": "export const c = 1;\n" }, "add c");
    expect(await adapter.dirtyCheck(store)).toMatchObject({ dirty: true, magnitude: 1 });
  });

  test("re-ingest with no new commits is a no-op (idempotent, no duplicate claims)", async () => {
    commit(repo, { "a.ts": "1\n", "b.ts": "2\n" }, "add a,b");
    const adapter = createGitAdapter();
    await adapter.ingest(store, { source: "git", dirty: true, magnitude: 2 }, fullBudget());
    const entities = store.entityCount();
    const claims = claimCount(store);

    // Second ingest over the same history: nothing new.
    await adapter.ingest(store, { source: "git", dirty: false, magnitude: 0 }, fullBudget());
    expect(store.entityCount()).toBe(entities);
    expect(claimCount(store)).toBe(claims);
  });

  test("budget exhaustion mid-ingest resumes without duplicating claims", async () => {
    // Four commits, batch size 2 → two batches. The budget trips after batch 1.
    commit(repo, { "f1.ts": "1\n" }, "c1");
    commit(repo, { "f2.ts": "2\n" }, "c2");
    commit(repo, { "f3.ts": "3\n" }, "c3");
    commit(repo, { "f4.ts": "4\n" }, "c4");
    const head = headOid(repo)!;

    const adapter = createGitAdapter({ batchSize: 2 });
    // now() returns < deadline on the first batch check, ≥ deadline on the next.
    let call = 0;
    const partialBudget: Budget = { deadline: 100, now: () => (call++ === 0 ? 0 : 100) };
    const first = await adapter.ingest(
      store,
      { source: "git", dirty: true, magnitude: 5 },
      partialBudget,
    );
    expect(first.complete).toBe(false);
    // Cursor advanced past the first batch but NOT to HEAD (generation unpublished).
    const midCursor = store.getCursor("git")?.position;
    expect(midCursor).toBeDefined();
    expect(midCursor).not.toBe(head);
    expect(store.publishedGen("git")).toBe(0); // not yet published

    // Resume with a full budget: finishes the remainder, publishes, catches up.
    const second = await adapter.ingest(
      store,
      { source: "git", dirty: true, magnitude: 2 },
      fullBudget(),
    );
    expect(second.complete).toBe(true);
    expect(store.getCursor("git")?.position).toBe(head);
    expect(store.publishedGen("git")).toBe(1);

    // No commit's touches claim was double-appended (idempotency guard). Each of
    // the 4 fixture files + README is touched by exactly one commit.
    const db = new DatabaseSync(store.dbPath);
    db.exec("PRAGMA busy_timeout=5000");
    try {
      const dupes = db
        .prepare(
          `SELECT subject, object, COUNT(*) AS n FROM claims
           WHERE predicate = 'touches' GROUP BY subject, object HAVING n > 1`,
        )
        .all();
      expect(dupes).toEqual([]);
    } finally {
      db.close();
    }
  });

  test("walkCommits parses rename status with score + post-image path", async () => {
    commit(repo, { "src.ts": "export const v = 1;\n".repeat(30) }, "add src");
    git(["mv", "src.ts", "dst.ts"], repo);
    git(["commit", "-q", "-m", "move src"], repo);
    const commits = walkCommits(repo, undefined);
    const move = commits.find((cm) => cm.subject === "move src");
    const rename = move?.files.find((f) => f.status === "R");
    expect(rename).toMatchObject({ path: "dst.ts", oldPath: "src.ts" });
    expect(rename?.score).toBeGreaterThan(0);
  });
});
