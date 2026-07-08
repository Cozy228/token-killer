/**
 * Slice 6 — identity dedup + content-hash anchors + two-working-copy eval.
 *
 * Item 1 (D1): reindex derives `sameAsCandidate` identity conflicts from the
 * committed bytes — deterministic, content-keyed, recomputed per checkout like
 * drift; surfaced never auto-merged; resolved via the append-only decision log.
 * Item 2 (O-18): a committed content-hash baseline in the anchor bytes lets a
 * signature/body-changed PRESENT target re-derive drift deterministically at a
 * full reindex + on a fresh clone (previously only `target-removed` survived); an
 * absent hash = legacy anchor = exactly today's behaviour.
 * Item 3: the two-working-copy collaboration eval (the acceptance instrument) —
 * five REAL git working-copy fixtures (merge-clean-but-contradictory / convergence
 * / overlay-never-committed / secret-guard / E5 decision-collision).
 * Item 4: reindex records committed-vs-overlay provenance so an opt-out repo's own
 * locally-placed push digest excludes overlay-kept notes.
 *
 * Every fixture is a temp-dir git repo (never the real repo). Clock injected; no
 * wall-clock, no network, no LLM.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStore, type Store } from "../../src/store/store.ts";
import { remember, setMemoryLifecycle } from "../../src/memory/remember.ts";
import { MemoryFiles } from "../../src/memory/fileStore.ts";
import { pullDeltaReindex, reindexMemoryFromFiles } from "../../src/memory/reindex.ts";
import { resolveConflictViaEvent } from "../../src/memory/fold.ts";
import { currentHeadCommit } from "../../src/memory/anchoredAt.ts";
import { writeFileSync } from "node:fs";
import { dumpJson } from "../../src/memory/dump.ts";
import { identityCandidatePairs } from "../../src/memory/dedup.ts";
import { parseMemory, serializeMemory, type SerializedMemory } from "../../src/memory/serialize.ts";
import { rankGotchas } from "../../src/push/rank.ts";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import type { Conflict } from "../../src/store/types.ts";
import { rmSync } from "node:fs";
import { cleanupTempDir, git, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

let clock = 1_700_000_000_000;
const now = (): number => (clock += 1000);

function memEntry(over: Partial<SerializedMemory> & { memoryId: string }): SerializedMemory {
  return {
    eventId: `01EV${over.memoryId.slice(4, 12)}`,
    at: (clock += 1000),
    actor: "cli",
    carrier: "cli",
    method: "explicit-key",
    authority: "confirmed",
    status: "active",
    gist: "committed note",
    origin: "human-note",
    anchors: [],
    ...over,
  };
}

function commitAll(repo: string, msg: string): void {
  git(["add", "-A"], repo);
  // `--allow-empty`: the overlay-never-committed / secret-guard fixtures
  // deliberately leave NOTHING trackable (the write went to a gitignored overlay),
  // so a plain commit would fail with "nothing to commit" — an empty commit still
  // models "the human committed whatever git would track" for the clone step.
  git(["commit", "-q", "--allow-empty", "-m", msg], repo);
}

const openConflicts = (store: Store, kind: Conflict["kind"]): Conflict[] =>
  store.conflicts("open").filter((c) => c.kind === kind);

// ---------------------------------------------------------------------------
// Item 1 — D1 identity layer
// ---------------------------------------------------------------------------

describe("slice 6 — item 1: identity dedup derived at reindex (D1)", () => {
  test("identityCandidatePairs is deterministic + content-keyed (order-independent)", () => {
    const mems = [
      { id: "mem:B", gist: "always prefer pnpm and never reach for npm or npx here" },
      { id: "mem:A", gist: "always prefer pnpm and never reach for npm or npx in here" },
      { id: "mem:C", gist: "the sqlite index is rebuilt from the committed memory files" },
    ];
    const pairs = identityCandidatePairs(mems);
    // A↔B near-duplicate (canonical order); C excluded (disjoint content).
    expect(pairs).toEqual([["mem:A", "mem:B"]]);
    // Shuffling the input never changes the derived set (no ordering dependence).
    expect(identityCandidatePairs([...mems].reverse())).toEqual(pairs);
    // Differing embedded numbers veto a candidate (ADR 0011 ≠ ADR 0013).
    expect(
      identityCandidatePairs([
        { id: "mem:X", gist: "the decision recorded in ADR 0011 governs this behaviour" },
        { id: "mem:Y", gist: "the decision recorded in ADR 0013 governs this behaviour" },
      ]),
    ).toEqual([]);
  });

  describe("reindex derivation over committed bytes", () => {
    let root: string;
    let repo: string;
    beforeEach(() => {
      root = makeTempDir("ctx-s6-i1-");
      repo = makeGitFixture(root);
    });
    afterEach(() => cleanupTempDir(root));

    test("two near-identical committed memories → open sameAsCandidate; peer == fresh clone (E6)", () => {
      const files = new MemoryFiles(join(repo, ".contexa"));
      files.appendMemory(
        "mainline",
        memEntry({
          memoryId: "mem:01DUPMEMONE0000000000AAA",
          gist: "always prefer pnpm and never reach for npm or npx in this repo",
        }),
      );
      files.appendMemory(
        "mainline",
        memEntry({
          memoryId: "mem:01DUPMEMTWO0000000000BBB",
          gist: "always prefer pnpm and never reach for npm or npx in this project",
        }),
      );

      // Long-lived peer: reindex twice (accumulated state); fresh clone: once.
      const peer = openStore({ projectDir: repo, home: join(root, "peer"), now });
      const clone = openStore({ projectDir: repo, home: join(root, "clone"), now });
      try {
        reindexMemoryFromFiles(peer, new MemoryFiles(join(repo, ".contexa")));
        reindexMemoryFromFiles(peer, new MemoryFiles(join(repo, ".contexa")));
        reindexMemoryFromFiles(clone, new MemoryFiles(join(repo, ".contexa")));

        expect(openConflicts(peer, "sameAsCandidate")).toHaveLength(1);
        // Surfaced, never auto-merged: both memories remain, both active.
        expect(peer.getMemory("mem:01DUPMEMONE0000000000AAA")?.status).toBe("active");
        expect(peer.getMemory("mem:01DUPMEMTWO0000000000BBB")?.status).toBe("active");
        // E6: content-keyed → the peer and a fresh clone dump identically.
        expect(dumpJson(peer)).toBe(dumpJson(clone));
      } finally {
        peer.close();
        clone.close();
      }
    });

    test("a human dismiss (committed decision) folds the derived conflict + survives reindex", () => {
      const ctx = join(repo, ".contexa");
      const files = new MemoryFiles(ctx);
      files.appendMemory(
        "mainline",
        memEntry({
          memoryId: "mem:01DISMISSDUP0000000000AA",
          gist: "the memory index rebuilds deterministically from committed files here",
        }),
      );
      files.appendMemory(
        "mainline",
        memEntry({
          memoryId: "mem:01DISMISSDUP0000000000BB",
          gist: "the memory index rebuilds deterministically from committed files now",
        }),
      );
      const store = openStore({ projectDir: repo, home: join(root, "home"), now });
      try {
        reindexMemoryFromFiles(store, new MemoryFiles(ctx));
        const conflict = openConflicts(store, "sameAsCandidate")[0]!;
        // C4: resolve via the append-only decision log (a committed dec line).
        resolveConflictViaEvent(
          store,
          "mem:01DISMISSDUP0000000000AA",
          conflict.a,
          conflict.b,
          "dismiss",
          "cli",
          new MemoryFiles(ctx),
          "mainline",
        );
        // The derived conflict re-files at reindex but the committed dismiss folds it.
        reindexMemoryFromFiles(store, new MemoryFiles(ctx));
        expect(openConflicts(store, "sameAsCandidate")).toHaveLength(0);
        expect(
          store.conflicts("dismissed").filter((c) => c.kind === "sameAsCandidate"),
        ).toHaveLength(1);
      } finally {
        store.close();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Item 2 — O-18 committed content-hash baseline
// ---------------------------------------------------------------------------

describe("slice 6 — item 2: content-hash anchor baseline (O-18)", () => {
  test("anchor-sig round-trips through serialize → parse; absent = legacy", () => {
    const withSig = memEntry({
      memoryId: "mem:01SIGROUND00000000000AAA",
      anchors: ["sym:src/x.ts#f"],
      anchorSigs: { "sym:src/x.ts#f": { h: "abc123", a: 2 } },
    });
    const parsed = parseMemory(serializeMemory(withSig));
    expect(parsed?.anchorSigs).toEqual({ "sym:src/x.ts#f": { h: "abc123", a: 2 } });
    // A legacy line (no anchor-sig token) parses with anchorSigs undefined.
    const legacy = memEntry({
      memoryId: "mem:01SIGLEGACY000000000BBB",
      anchors: ["sym:src/x.ts#f"],
    });
    expect(parseMemory(serializeMemory(legacy))?.anchorSigs).toBeUndefined();
  });

  describe("present-target drift re-derived at reindex", () => {
    let root: string;
    let repo: string;
    beforeEach(() => {
      root = makeTempDir("ctx-s6-i2-");
      repo = makeGitFixture(root);
    });
    afterEach(() => cleanupTempDir(root));

    /** Reindex a store whose code index carries `sym:src/x.ts#f` at (hash, arity). */
    function reindexWithSymbol(
      home: string,
      files: MemoryFiles,
      sym: { hash: string; arity: number } | "absent",
    ): Store {
      const store = openStore({ projectDir: repo, home, now });
      const gen = store.beginGeneration("code");
      if (sym !== "absent") {
        store.upsertEntity({
          id: "sym:src/x.ts#f",
          kind: "symbol",
          name: "f",
          locator: { t: "file", path: "src/x.ts", span: [1, 5] },
          contentHash: sym.hash,
          attrs: { arity: sym.arity },
          gen,
        });
      }
      store.publishGeneration("code");
      reindexMemoryFromFiles(store, files);
      return store;
    }

    test("body-changed re-derives at full reindex + on a fresh clone; legacy anchor does not", () => {
      const files = new MemoryFiles(join(repo, ".contexa"));
      // Anchored with a committed baseline hash h1 (arity 2).
      files.appendMemory(
        "mainline",
        memEntry({
          memoryId: "mem:01BODYCHANGED000000000A",
          gist: "documents the body of f() in src/x.ts",
          anchors: ["sym:src/x.ts#f"],
          anchorSigs: { "sym:src/x.ts#f": { h: "h1", a: 2 } },
        }),
      );
      // A legacy anchor (no baseline) on the same target.
      files.appendMemory(
        "mainline",
        memEntry({
          memoryId: "mem:01LEGACYANCHOR00000000A",
          gist: "a legacy note also pointing at f() with no committed hash baseline",
          anchors: ["sym:src/x.ts#f"],
        }),
      );

      // Peer: the symbol's body changed (same arity 2, new hash h2).
      const peer = reindexWithSymbol(join(root, "peer"), new MemoryFiles(join(repo, ".contexa")), {
        hash: "h2",
        arity: 2,
      });
      // Fresh clone: same committed files, same current code → same derivation.
      const clone = reindexWithSymbol(
        join(root, "clone"),
        new MemoryFiles(join(repo, ".contexa")),
        {
          hash: "h2",
          arity: 2,
        },
      );
      try {
        expect(peer.getMemory("mem:01BODYCHANGED000000000A")?.driftReason).toBe("body-changed");
        // body-changed = down-rank only (A5): status stays active, not needs-review.
        expect(peer.getMemory("mem:01BODYCHANGED000000000A")?.status).toBe("active");
        // Legacy anchor (no baseline) → NO present-target drift (exactly today).
        expect(peer.getMemory("mem:01LEGACYANCHOR00000000A")?.driftReason).toBeUndefined();
        expect(peer.getMemory("mem:01LEGACYANCHOR00000000A")?.status).toBe("active");
        // E6: peer == fresh clone.
        expect(dumpJson(peer)).toBe(dumpJson(clone));
      } finally {
        peer.close();
        clone.close();
      }
    });

    test("signature-changed (arity differs) flips to needs-review at reindex", () => {
      const files = new MemoryFiles(join(repo, ".contexa"));
      files.appendMemory(
        "mainline",
        memEntry({
          memoryId: "mem:01SIGCHANGED0000000000A",
          gist: "documents the signature of f() taking two arguments in src/x.ts",
          anchors: ["sym:src/x.ts#f"],
          anchorSigs: { "sym:src/x.ts#f": { h: "h1", a: 2 } },
        }),
      );
      const store = reindexWithSymbol(join(root, "home"), new MemoryFiles(join(repo, ".contexa")), {
        hash: "h9",
        arity: 3, // arity changed → signature-changed
      });
      try {
        expect(store.getMemory("mem:01SIGCHANGED0000000000A")?.driftReason).toBe(
          "signature-changed",
        );
        expect(store.getMemory("mem:01SIGCHANGED0000000000A")?.status).toBe("needs-review");
      } finally {
        store.close();
      }
    });

    test("R9: a reappeared-and-changed target re-derives drift despite a stale confirm", () => {
      // Author a memory anchored to a present symbol so the create carries the
      // baseline hash h1; the confirm later clears a target-removed drift.
      const authoring = openStore({ projectDir: repo, home: join(root, "author"), now });
      const files = new MemoryFiles(join(repo, ".contexa"));
      try {
        const cgen = authoring.beginGeneration("code");
        authoring.upsertEntity({
          id: "sym:src/x.ts#g",
          kind: "symbol",
          name: "g",
          locator: { t: "file", path: "src/x.ts", span: [1, 5] },
          contentHash: "h1",
          attrs: { arity: 1 },
          gen: cgen,
        });
        authoring.publishGeneration("code");
        const r = remember(authoring, {
          note: "explains g() in src/x.ts",
          anchors: ["sym:src/x.ts#g"],
          surface: "cli",
          files,
          now,
        });
        expect(r.ok).toBe(true);
      } finally {
        authoring.close();
      }
      commitAll(repo, "add anchored memory");

      const memId = parseMemory(
        new MemoryFiles(join(repo, ".contexa")).memoryLines("mainline")[0]!,
      )!.memoryId;

      // The symbol is removed → target-removed drift → the human confirms (records
      // clearedDrift + confirmedAt in the committed bytes).
      const s1 = openStore({ projectDir: repo, home: join(root, "s1"), now });
      try {
        s1.beginGeneration("code");
        s1.publishGeneration("code"); // code index published, symbol absent
        reindexMemoryFromFiles(s1, new MemoryFiles(join(repo, ".contexa")));
        expect(s1.getMemory(memId)?.driftReason).toBe("target-removed");
        const res = setMemoryLifecycle(
          s1,
          memId,
          "active",
          new MemoryFiles(join(repo, ".contexa")),
        );
        expect(res.ok).toBe(true);
      } finally {
        s1.close();
      }
      commitAll(repo, "confirm the removed anchor");

      // Fresh checkout: the confirm suppresses target-removed while the symbol is
      // absent (R9 — stays active).
      const s2 = openStore({ projectDir: repo, home: join(root, "s2"), now });
      try {
        s2.beginGeneration("code");
        s2.publishGeneration("code");
        reindexMemoryFromFiles(s2, new MemoryFiles(join(repo, ".contexa")));
        expect(s2.getMemory(memId)?.status).toBe("active");
        expect(s2.getMemory(memId)?.driftReason).toBeUndefined();
      } finally {
        s2.close();
      }

      // The symbol REAPPEARS but CHANGED (new body hash). The committed baseline
      // hash comparison beats the stale clearedDrift: present-target drift re-files.
      const s3 = openStore({ projectDir: repo, home: join(root, "s3"), now });
      try {
        const g = s3.beginGeneration("code");
        s3.upsertEntity({
          id: "sym:src/x.ts#g",
          kind: "symbol",
          name: "g",
          locator: { t: "file", path: "src/x.ts", span: [1, 9] },
          contentHash: "h2-changed",
          attrs: { arity: 1 },
          gen: g,
        });
        s3.publishGeneration("code");
        reindexMemoryFromFiles(s3, new MemoryFiles(join(repo, ".contexa")));
        expect(s3.getMemory(memId)?.driftReason).toBe("body-changed");
      } finally {
        s3.close();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Item 3 — two-working-copy collaboration eval (the acceptance instrument)
// ---------------------------------------------------------------------------

describe("slice 6 — item 3: two-working-copy collaboration eval", () => {
  let root: string;
  let repoA: string;
  beforeEach(() => {
    root = makeTempDir("ctx-s6-i3-");
    repoA = makeGitFixture(root);
    // Lay down the committed scaffold (.gitattributes merge=union) once.
    new MemoryFiles(join(repoA, ".contexa")).ensureScaffold();
    commitAll(repoA, "ctx scaffold");
  });
  afterEach(() => cleanupTempDir(root));

  function cloneRepo(name: string): string {
    const dst = join(root, name);
    git(["clone", "-q", repoA, dst], root);
    git(["config", "user.email", "ctx-test@example.invalid"], dst);
    git(["config", "user.name", "ctx test"], dst);
    return dst;
  }

  test("(a) merge-clean-but-contradictory: two near-identical memories → sameAsCandidate at reindex", () => {
    // Branch A and branch B each independently author a near-identical memory; the
    // append-only log union-merges CLEANLY (no git conflict), yet the two are the
    // same fact — the case git cannot test. Post-merge reindex files the identity
    // conflict.
    git(["checkout", "-q", "-b", "branch-a"], repoA);
    new MemoryFiles(join(repoA, ".contexa")).appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01BRANCHAMEM0000000000A",
        gist: "the auth token must be refreshed before every push to the remote",
      }),
    );
    commitAll(repoA, "branch-a memory");

    git(["checkout", "-q", "main"], repoA);
    git(["checkout", "-q", "-b", "branch-b"], repoA);
    new MemoryFiles(join(repoA, ".contexa")).appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01BRANCHBMEM0000000000B",
        gist: "the auth token has to be refreshed before every push to the remote",
      }),
    );
    commitAll(repoA, "branch-b memory");

    git(["checkout", "-q", "main"], repoA);
    git(["merge", "-q", "--no-edit", "branch-a"], repoA);
    git(["merge", "-q", "--no-edit", "branch-b"], repoA); // clean union merge

    // Both branches' lines survive the clean union merge (ids are percent-encoded).
    const log = readFileSync(join(repoA, ".contexa/memory/log.md"), "utf8");
    expect(log).toContain("01BRANCHAMEM0000000000A");
    expect(log).toContain("01BRANCHBMEM0000000000B");

    const peer = openStore({ projectDir: repoA, home: join(root, "peer"), now });
    const clone = openStore({ projectDir: repoA, home: join(root, "clone-store"), now });
    try {
      reindexMemoryFromFiles(peer, new MemoryFiles(join(repoA, ".contexa")));
      reindexMemoryFromFiles(clone, new MemoryFiles(join(repoA, ".contexa")));
      expect(openConflicts(peer, "sameAsCandidate")).toHaveLength(1);
      expect(dumpJson(peer)).toBe(dumpJson(clone)); // E6
    } finally {
      peer.close();
      clone.close();
    }
  });

  test("(b) convergence: A commits a memory + a resolution, B pulls, both reindex to logical equality", () => {
    const filesA = new MemoryFiles(join(repoA, ".contexa"));
    filesA.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01CONVERGEDUP00000000AA",
        gist: "the index cache is fully rebuildable from the committed memory log",
      }),
    );
    filesA.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01CONVERGEDUP00000000BB",
        gist: "the index cache is entirely rebuildable from the committed memory log",
      }),
    );
    const a = openStore({ projectDir: repoA, home: join(root, "a-store"), now });
    try {
      reindexMemoryFromFiles(a, new MemoryFiles(join(repoA, ".contexa")));
      const c = openConflicts(a, "sameAsCandidate")[0]!;
      resolveConflictViaEvent(
        a,
        "mem:01CONVERGEDUP00000000AA",
        c.a,
        c.b,
        "dismiss",
        "cli",
        new MemoryFiles(join(repoA, ".contexa")),
        "mainline",
      );
    } finally {
      a.close();
    }
    commitAll(repoA, "memory + dismiss resolution");

    const repoB = cloneRepo("repoB");
    const aFinal = openStore({ projectDir: repoA, home: join(root, "a-final"), now });
    const b = openStore({ projectDir: repoB, home: join(root, "b-store"), now });
    try {
      reindexMemoryFromFiles(aFinal, new MemoryFiles(join(repoA, ".contexa")));
      reindexMemoryFromFiles(b, new MemoryFiles(join(repoB, ".contexa")));
      // B pulled the memory AND the resolution: the conflict is dismissed on both.
      expect(openConflicts(b, "sameAsCandidate")).toHaveLength(0);
      expect(b.conflicts("dismissed").filter((x) => x.kind === "sameAsCandidate")).toHaveLength(1);
      // E6 logical (not byte-identical) equality across the two working copies.
      expect(dumpJson(b)).toBe(dumpJson(aFinal));
    } finally {
      aFinal.close();
      b.close();
    }
  });

  test("(c) overlay-never-committed: a --local note on A never reaches B via any git operation", () => {
    const localFiles = new MemoryFiles(join(repoA, ".contexa"));
    const a = openStore({ projectDir: repoA, home: join(root, "a-local"), now });
    try {
      const r = remember(a, {
        note: "my personal reminder to re-run the flaky test before pushing",
        surface: "local",
        files: localFiles,
        now,
      });
      expect(r.ok && r.localOnly).toBe(true);
    } finally {
      a.close();
    }
    // The overlay file exists but is gitignored; commit everything trackable.
    expect(existsSync(join(repoA, ".contexa/memory.local.md"))).toBe(true);
    commitAll(repoA, "whatever is trackable");
    // git must refuse to track the overlay (it is gitignored).
    const tracked = git(["ls-files", ".contexa"], repoA);
    expect(tracked).not.toContain("memory.local.md");

    const repoB = cloneRepo("repoB");
    expect(existsSync(join(repoB, ".contexa/memory.local.md"))).toBe(false);
    const b = openStore({ projectDir: repoB, home: join(root, "b-local"), now });
    try {
      reindexMemoryFromFiles(b, new MemoryFiles(join(repoB, ".contexa")));
      expect(b.allMemories()).toHaveLength(0); // the --local note never crossed
    } finally {
      b.close();
    }
  });

  test("(d) secret-guard-effective: a secret-shaped note never enters the committed zone or B", () => {
    const files = new MemoryFiles(join(repoA, ".contexa"));
    const a = openStore({ projectDir: repoA, home: join(root, "a-secret"), now });
    try {
      const r = remember(a, {
        note: "deploy key is sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd do not lose it",
        surface: "cli", // targets the committed Mainline zone…
        files,
        now,
      });
      // …but the E4 guard diverts it to the gitignored overlay (success-shaped).
      expect(r.ok && r.remediation).toBeTruthy();
    } finally {
      a.close();
    }
    // The committed mainline log never carries the secret.
    const mainlineLog = join(repoA, ".contexa/memory/log.md");
    if (existsSync(mainlineLog)) {
      expect(readFileSync(mainlineLog, "utf8")).not.toContain("sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
    commitAll(repoA, "trackable only");
    const repoB = cloneRepo("repoB");
    const clonedLog = join(repoB, ".contexa/memory/log.md");
    if (existsSync(clonedLog)) {
      expect(readFileSync(clonedLog, "utf8")).not.toContain("sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
    const b = openStore({ projectDir: repoB, home: join(root, "b-secret"), now });
    try {
      reindexMemoryFromFiles(b, new MemoryFiles(join(repoB, ".contexa")));
      // The secret never reached the peer's committed zone.
      for (const m of b.allMemories()) {
        expect(m.gist).not.toContain("sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      }
    } finally {
      b.close();
    }
  });

  test("(e) E5 decision-collision: retire on one branch + supersede on another → later wins + contradiction", () => {
    // A shared committed memory M; branch A retires it, branch B supersedes it. The
    // decision log union-merges cleanly; the fold sees BOTH terminal dispositions.
    const files = new MemoryFiles(join(repoA, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01COLLIDEMEM000000000AA", gist: "a fact two people will judge" }),
    );
    // A replacement memory for the supersede to point at.
    files.appendMemory(
      "mainline",
      memEntry({ memoryId: "mem:01COLLIDEREPL00000000BB", gist: "the replacement fact" }),
    );
    commitAll(repoA, "shared memory M + replacement");

    git(["checkout", "-q", "-b", "retire-branch"], repoA);
    new MemoryFiles(join(repoA, ".contexa")).appendDecision("mainline", {
      eventId: "01RETIREDEC0000000000000A",
      at: (clock += 1000),
      memoryId: "mem:01COLLIDEMEM000000000AA",
      verb: "retire",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
      reason: "this is wrong",
    });
    commitAll(repoA, "retire on branch");

    git(["checkout", "-q", "main"], repoA);
    git(["checkout", "-q", "-b", "supersede-branch"], repoA);
    new MemoryFiles(join(repoA, ".contexa")).appendDecision("mainline", {
      eventId: "01SUPERSEDEDEC000000000ZB", // later ULID than the retire (total order)
      at: (clock += 1000),
      memoryId: "mem:01COLLIDEMEM000000000AA",
      verb: "supersede",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
      refs: { supersededBy: "mem:01COLLIDEREPL00000000BB" },
    });
    commitAll(repoA, "supersede on branch");

    git(["checkout", "-q", "main"], repoA);
    git(["merge", "-q", "--no-edit", "retire-branch"], repoA);
    git(["merge", "-q", "--no-edit", "supersede-branch"], repoA); // clean union

    const store = openStore({ projectDir: repoA, home: join(root, "collide"), now });
    try {
      reindexMemoryFromFiles(store, new MemoryFiles(join(repoA, ".contexa")));
      // A contradiction conflict is filed (surfaced, never auto-merged)…
      expect(openConflicts(store, "contradiction")).toHaveLength(1);
      // …and the later-by-total-order decision (supersede) wins for derived status.
      expect(store.getMemory("mem:01COLLIDEMEM000000000AA")?.status).toBe("superseded");
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Item 4 — committed-vs-overlay provenance at reindex
// ---------------------------------------------------------------------------

describe("slice 6 — item 4: opt-out repo excludes overlay-kept notes from its local digest", () => {
  let root: string;
  let repo: string;
  beforeEach(() => {
    root = makeTempDir("ctx-s6-i4-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("an opt-out repo's overlay-redirected note is excluded; a peer's shared digest is unchanged", () => {
    // Opt-out repo: `localOnly` redirects the mainline write to the overlay; the
    // note stays active + origin `remember` (an ordinary note kept local).
    const optOutFiles = new MemoryFiles(join(repo, ".contexa"), true);
    const optOut = openStore({ projectDir: repo, home: join(root, "optout"), now });
    try {
      const r = remember(optOut, {
        note: "the deploy pipeline needs the staging config exported first",
        surface: "cli",
        files: optOutFiles,
        now,
      });
      expect(r.ok && r.committedZoneDisabled).toBe(true);
      reindexMemoryFromFiles(optOut, new MemoryFiles(join(repo, ".contexa"), true));
      const m = optOut.allMemories()[0]!;
      expect(m.originZone).toBe("overlay");
      // Item 4: an overlay-kept note is excluded from the locally-placed push digest.
      expect(rankGotchas(optOut).map((g) => g.entityId)).not.toContain(m.entityId);
    } finally {
      optOut.close();
    }

    // A normal repo committing the SAME note keeps it mainline → still in the digest
    // (a peer's shared digest is unchanged: overlay provenance never enters).
    mkdirSync(join(root, "normal"), { recursive: true });
    const normalRepo = makeGitFixture(join(root, "normal"));
    const normalFiles = new MemoryFiles(join(normalRepo, ".contexa"));
    const normal = openStore({ projectDir: normalRepo, home: join(root, "normal-home"), now });
    try {
      const r = remember(normal, {
        note: "the deploy pipeline needs the staging config exported first",
        surface: "cli",
        files: normalFiles,
        now,
      });
      expect(r.ok).toBe(true);
      reindexMemoryFromFiles(normal, new MemoryFiles(join(normalRepo, ".contexa")));
      const m = normal.allMemories()[0]!;
      expect(m.originZone).toBe("mainline");
      expect(rankGotchas(normal).map((g) => g.entityId)).toContain(m.entityId);
    } finally {
      normal.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Fable review round 1 — S6-R1 (confirm of present-target drift) + S6-R2 (live zone)
// ---------------------------------------------------------------------------

describe("slice 6 — review round 1", () => {
  let root: string;
  let repo: string;
  beforeEach(() => {
    root = makeTempDir("ctx-s6-rr1-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  /** Reindex a store whose code index carries `sym:src/x.ts#f` at (hash, arity). */
  function reindexWithSymbol(home: string, sym: { hash: string; arity: number } | "absent"): Store {
    const store = openStore({ projectDir: repo, home, now });
    const gen = store.beginGeneration("code");
    if (sym !== "absent") {
      store.upsertEntity({
        id: "sym:src/x.ts#f",
        kind: "symbol",
        name: "f",
        locator: { t: "file", path: "src/x.ts", span: [1, 5] },
        contentHash: sym.hash,
        attrs: { arity: sym.arity },
        gen,
      });
    }
    store.publishGeneration("code");
    reindexMemoryFromFiles(store, new MemoryFiles(join(repo, ".contexa")));
    return store;
  }

  test("S6-R1: a confirmed present-target drift stays active across reindex (same machine + fresh clone)", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01CONFIRMSIG0000000000A",
        gist: "documents the signature of f() taking two arguments in src/x.ts",
        anchors: ["sym:src/x.ts#f"],
        anchorSigs: { "sym:src/x.ts#f": { h: "h1", a: 2 } },
      }),
    );
    const memId = "mem:01CONFIRMSIG0000000000A";

    // Arity changed (2 → 3): reindex derives signature-changed → needs-review.
    const a = reindexWithSymbol(join(root, "a"), { hash: "h1", arity: 3 });
    try {
      expect(a.getMemory(memId)?.driftReason).toBe("signature-changed");
      expect(a.getMemory(memId)?.status).toBe("needs-review");
      // The human confirms — records confirmSigs {h1, a:3} in the committed dec.
      expect(
        setMemoryLifecycle(a, memId, "active", new MemoryFiles(join(repo, ".contexa"))).ok,
      ).toBe(true);
      expect(a.getMemory(memId)?.status).toBe("active");
      // A later full reindex on the SAME machine must NOT re-undo the confirm.
      const g = a.beginGeneration("code");
      a.upsertEntity({
        id: "sym:src/x.ts#f",
        kind: "symbol",
        name: "f",
        locator: { t: "file", path: "src/x.ts", span: [1, 5] },
        contentHash: "h1",
        attrs: { arity: 3 },
        gen: g,
      });
      a.publishGeneration("code");
      reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".contexa")));
      expect(a.getMemory(memId)?.driftReason).toBeUndefined();
      expect(a.getMemory(memId)?.status).toBe("active");
    } finally {
      a.close();
    }
    // A FRESH clone reads the same committed confirm bytes → same suppression.
    const b = reindexWithSymbol(join(root, "b"), { hash: "h1", arity: 3 });
    try {
      expect(b.getMemory(memId)?.driftReason).toBeUndefined();
      expect(b.getMemory(memId)?.status).toBe("active");
    } finally {
      b.close();
    }
  });

  test("S6-R1: a target that changes AGAIN after the confirm re-derives drift on both machines", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01CONFIRMAGAIN00000000A",
        gist: "documents the signature of f() taking two arguments in src/x.ts",
        anchors: ["sym:src/x.ts#f"],
        anchorSigs: { "sym:src/x.ts#f": { h: "h1", a: 2 } },
      }),
    );
    const memId = "mem:01CONFIRMAGAIN00000000A";
    const a = reindexWithSymbol(join(root, "a"), { hash: "h1", arity: 3 });
    try {
      setMemoryLifecycle(a, memId, "active", new MemoryFiles(join(repo, ".contexa")));
      expect(a.getMemory(memId)?.status).toBe("active");
    } finally {
      a.close();
    }
    // The symbol arity changes AGAIN (3 → 4): the confirm no longer matches → drift.
    const a2 = reindexWithSymbol(join(root, "a2"), { hash: "h1", arity: 4 });
    const b = reindexWithSymbol(join(root, "b"), { hash: "h1", arity: 4 });
    try {
      expect(a2.getMemory(memId)?.driftReason).toBe("signature-changed");
      expect(a2.getMemory(memId)?.status).toBe("needs-review");
      expect(b.getMemory(memId)?.driftReason).toBe("signature-changed");
      expect(dumpJson(a2)).toBe(dumpJson(b)); // deterministic across machines
    } finally {
      a2.close();
      b.close();
    }
  });

  test("S6-R2: an opt-out remember is push-excluded with NO reindex in between", () => {
    const optOutFiles = new MemoryFiles(join(repo, ".contexa"), true);
    const store = openStore({ projectDir: repo, home: join(root, "optout"), now });
    try {
      const r = remember(store, {
        note: "the staging config must be exported before the deploy pipeline runs",
        surface: "cli",
        files: optOutFiles,
        now,
      });
      expect(r.ok && r.committedZoneDisabled).toBe(true);
      const id = r.ok ? r.entityId : "";
      // The live write stamped originZone=overlay — excluded WITHOUT any reindex.
      expect(store.getMemory(id)?.originZone).toBe("overlay");
      expect(rankGotchas(store).map((g) => g.entityId)).not.toContain(id);
    } finally {
      store.close();
    }
  });

  test("S6-R2: a confirm-promoted mcp note is immediately push-eligible without a reindex", () => {
    const files = new MemoryFiles(join(repo, ".contexa"));
    const store = openStore({ projectDir: repo, home: join(root, "promote"), now });
    try {
      const r = remember(store, {
        note: "the release checklist requires a green three-os matrix before tagging",
        surface: "mcp",
        files,
        now,
      });
      expect(r.ok && r.status).toBe("needs-review");
      const id = r.ok ? r.entityId : "";
      expect(store.getMemory(id)?.originZone).toBe("overlay");
      // Human confirm promotes the create to Mainline → immediately eligible.
      const res = setMemoryLifecycle(store, id, "active", new MemoryFiles(join(repo, ".contexa")));
      expect(res.ok && res.promoted).toBe(true);
      expect(store.getMemory(id)?.originZone).toBe("mainline");
      expect(rankGotchas(store).map((g) => g.entityId)).toContain(id);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Codex joint-review round — C6-1..C6-4
// ---------------------------------------------------------------------------

describe("slice 6 — Codex review round", () => {
  let root: string;
  let repo: string;
  beforeEach(() => {
    root = makeTempDir("ctx-s6-codex-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  test("C6-1: target-removed suppression is per-anchor — a LATER removal of a different anchor still flags", () => {
    const head = currentHeadCommit(repo)!;
    const ctx = join(repo, ".contexa");
    const memId = "mem:01TWOANCHORS0000000000A";
    new MemoryFiles(ctx).appendMemory(
      "mainline",
      memEntry({
        memoryId: memId,
        gist: "documents two symbols that may each be removed independently",
        anchors: ["sym:src/x.ts#a", "sym:src/x.ts#b"],
        anchoredAt: head,
      }),
    );

    /** Reindex a fresh store with a chosen presence for each symbol. */
    function reindexWith(home: string, present: string[]): Store {
      const store = openStore({ projectDir: repo, home, now });
      const gen = store.beginGeneration("code");
      for (const id of present) {
        store.upsertEntity({
          id,
          kind: "symbol",
          name: id.split("#")[1]!,
          locator: { t: "file", path: "src/x.ts", span: [1, 5] },
          contentHash: `hash-${id}`,
          gen,
        });
      }
      store.publishGeneration("code");
      reindexMemoryFromFiles(store, new MemoryFiles(ctx));
      return store;
    }

    // sym#a absent, sym#b present → target-removed drift for #a; the human confirms.
    const s1 = reindexWith(join(root, "s1"), ["sym:src/x.ts#b"]);
    try {
      expect(s1.getMemory(memId)?.driftReason).toBe("target-removed");
      const res = setMemoryLifecycle(s1, memId, "active", new MemoryFiles(ctx));
      expect(res.ok).toBe(true);
      expect(s1.getMemory(memId)?.status).toBe("active");
    } finally {
      s1.close();
    }

    // LATER, sym#b is removed too (both absent). #a stays suppressed (the human
    // judged it), but #b's genuine removal MUST still file target-removed.
    const s2 = reindexWith(join(root, "s2"), []);
    const clone = reindexWith(join(root, "clone"), []);
    try {
      expect(s2.getMemory(memId)?.driftReason).toBe("target-removed");
      expect(s2.getMemory(memId)?.status).toBe("needs-review");
      // The open stale-suspect names #b (the newly-removed anchor), not #a.
      const staleClaims = s2
        .openStaleSuspects(memId)
        .map((c) => s2.getClaim(c.a)?.object ?? s2.getClaim(c.b)?.object);
      expect(staleClaims).toContain("sym:src/x.ts#b");
      expect(dumpJson(s2)).toBe(dumpJson(clone)); // deterministic peer vs fresh clone
    } finally {
      s2.close();
      clone.close();
    }
  });

  test("C6-2: a supersede pair does not seed an identity conflict", () => {
    const ctx = join(repo, ".contexa");
    const files = new MemoryFiles(ctx);
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01SUPERSEDEDUP0000000AA",
        gist: "the old rule for resolving anchor drift on a branch switch here",
      }),
    );
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01SUPERSEDEDUP0000000BB",
        gist: "the old rule for resolving anchor drift on a branch switch now",
      }),
    );
    // BB supersedes the near-duplicate AA (the human already reconciled them).
    files.appendDecision("mainline", {
      eventId: "01SUPDEC00000000000000AAA",
      at: (clock += 1000),
      memoryId: "mem:01SUPERSEDEDUP0000000AA",
      verb: "supersede",
      actor: "cli",
      carrier: "cli",
      method: "explicit-key",
      authority: "confirmed",
      refs: { supersededBy: "mem:01SUPERSEDEDUP0000000BB" },
    });

    const peer = openStore({ projectDir: repo, home: join(root, "peer"), now });
    const clone = openStore({ projectDir: repo, home: join(root, "clone"), now });
    try {
      reindexMemoryFromFiles(peer, new MemoryFiles(ctx));
      reindexMemoryFromFiles(clone, new MemoryFiles(ctx));
      expect(peer.getMemory("mem:01SUPERSEDEDUP0000000AA")?.status).toBe("superseded");
      // No open identity conflict for a pair the supersede already resolved.
      expect(openConflicts(peer, "sameAsCandidate")).toHaveLength(0);
      expect(dumpJson(peer)).toBe(dumpJson(clone)); // E6
    } finally {
      peer.close();
      clone.close();
    }
  });

  test("C6-3: an additive reindex does not re-file identity from a stale (files-absent) row", () => {
    const ctx = join(repo, ".contexa");
    const log = join(repo, ".contexa/memory/log.md");
    const m1 = memEntry({
      memoryId: "mem:01STALEROW00000000000AA",
      gist: "the reindex derives identity candidates from the committed memory bytes",
    });
    const m2 = memEntry({
      memoryId: "mem:01STALEROW00000000000BB",
      gist: "the reindex derives identity candidates from committed memory byte data",
    });
    const files = new MemoryFiles(ctx);
    files.appendMemory("mainline", m1);
    files.appendMemory("mainline", m2);

    const peer = openStore({ projectDir: repo, home: join(root, "peer"), now });
    try {
      reindexMemoryFromFiles(peer, new MemoryFiles(ctx));
      expect(openConflicts(peer, "sameAsCandidate")).toHaveLength(1);

      // The peer switches to a checkout where M2's line is GONE (only M1 committed).
      writeFileSync(log, `${serializeMemory(m1)}\n`, "utf8");
      reindexMemoryFromFiles(peer, new MemoryFiles(ctx)); // additive default

      // A fresh clone of the same M1-only files.
      const clone = openStore({ projectDir: repo, home: join(root, "clone"), now });
      try {
        reindexMemoryFromFiles(clone, new MemoryFiles(ctx));
        // The stale M2 store row must NOT re-file the M1↔M2 identity conflict…
        expect(openConflicts(peer, "sameAsCandidate")).toHaveLength(0);
        // …so the identity layer converges with the fresh clone (which has none).
        expect(peer.conflicts("open").filter((c) => c.kind === "sameAsCandidate")).toEqual(
          clone.conflicts("open").filter((c) => c.kind === "sameAsCandidate"),
        );
      } finally {
        clone.close();
      }
    } finally {
      peer.close();
    }
  });

  test("C6-4: the pull-delta path files + folds identity across two working copies", () => {
    // repoA base: scaffold + M1 committed.
    new MemoryFiles(join(repo, ".contexa")).appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01PULLDELTA0000000000AA",
        gist: "the push digest reads the shared config merged with the personal overlay",
      }),
    );
    commitAll(repo, "base M1");

    // B clones at oldTip and full-reindexes (has M1, no conflict).
    const repoB = join(root, "repoB");
    git(["clone", "-q", repo, repoB], root);
    git(["config", "user.email", "ctx-test@example.invalid"], repoB);
    git(["config", "user.name", "ctx test"], repoB);
    const oldTip = currentHeadCommit(repoB)!;
    const b = openStore({ projectDir: repoB, home: join(root, "b"), now });
    try {
      reindexMemoryFromFiles(b, new MemoryFiles(join(repoB, ".contexa")));
      expect(openConflicts(b, "sameAsCandidate")).toHaveLength(0);

      // A commits a near-duplicate memory + a dismiss resolution.
      const a = openStore({ projectDir: repo, home: join(root, "a"), now });
      try {
        new MemoryFiles(join(repo, ".contexa")).appendMemory(
          "mainline",
          memEntry({
            memoryId: "mem:01PULLDELTA0000000000BB",
            gist: "the push digest reads the shared config merged with a personal overlay",
          }),
        );
        reindexMemoryFromFiles(a, new MemoryFiles(join(repo, ".contexa")));
        const c = openConflicts(a, "sameAsCandidate")[0]!;
        resolveConflictViaEvent(
          a,
          "mem:01PULLDELTA0000000000AA",
          c.a,
          c.b,
          "dismiss",
          "cli",
          new MemoryFiles(join(repo, ".contexa")),
          "mainline",
        );
      } finally {
        a.close();
      }
      commitAll(repo, "A: near-dup M2 + dismiss");

      // B pulls, then runs the DELTA reindex path over the pulled commits.
      git(["pull", "-q", "--no-edit", "origin", "main"], repoB);
      const newTip = currentHeadCommit(repoB)!;
      const res = pullDeltaReindex(b, new MemoryFiles(join(repoB, ".contexa")), {
        projectRoot: repoB,
        oldTip,
        newTip,
      });
      expect(res.mode).toBe("delta");

      // The pull-delta path filed the identity conflict AND folded the committed dismiss.
      expect(openConflicts(b, "sameAsCandidate")).toHaveLength(0);
      expect(b.conflicts("dismissed").filter((x) => x.kind === "sameAsCandidate")).toHaveLength(1);

      // E6: dump equals a fresh clone that full-reindexes the same committed bytes.
      const fresh = openStore({ projectDir: repoB, home: join(root, "fresh"), now });
      try {
        reindexMemoryFromFiles(fresh, new MemoryFiles(join(repoB, ".contexa")));
        expect(dumpJson(b)).toBe(dumpJson(fresh));
      } finally {
        fresh.close();
      }
    } finally {
      b.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Memory tail work order (post-slice-6): E7 convergence + drift determinism
// ---------------------------------------------------------------------------

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };

/** The reason-class triple both derivation paths must AGREE on (E7): the memory's
 *  drift annotation, the reason-classed stale-suspect conflict object, and the
 *  served status effect. Content-keyed — independent of per-store numeric ids /
 *  carrier ("tree-sitter" vs "reindex"), which the E6 dump also ignores. */
function driftTriple(
  store: Store,
  memId: string,
): { drift?: string; staleObject?: string; status?: string } {
  const conflict = store
    .conflicts("open")
    .filter((c) => c.kind === "stale-suspect")
    .find((c) => store.getClaim(c.a)?.subject === memId);
  return {
    drift: store.getMemory(memId)?.driftReason,
    staleObject: conflict ? store.getClaim(conflict.b)?.object : undefined,
    status: store.getMemory(memId)?.status,
  };
}

describe("memory tail — item 1(b): within-branch ↔ reindex drift convergence (E7)", () => {
  let root: string;
  let repo: string;
  beforeEach(() => {
    root = makeTempDir("ctx-tail-conv-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  /** dirtyCheck + ingest a code adapter over `proj` (mirrors the 2c harness). */
  async function ingestCode(store: Store, adapter: CodeSourceAdapter): Promise<void> {
    clearScanCache(); // the fixture tree is mutated between passes
    const dirty = await adapter.dirtyCheck(store);
    await adapter.ingest(store, dirty, MAX_BUDGET);
  }

  /** Publish a code index carrying `sym:src/x.ts#f` at (hash, arity), or none. */
  function reindexWithSymbol(
    home: string,
    files: MemoryFiles,
    sym: { hash: string; arity: number } | "absent",
  ): Store {
    const store = openStore({ projectDir: repo, home, now });
    const gen = store.beginGeneration("code");
    if (sym !== "absent") {
      store.upsertEntity({
        id: "sym:src/x.ts#f",
        kind: "symbol",
        name: "f",
        locator: { t: "file", path: "src/x.ts", span: [1, 5] },
        contentHash: sym.hash,
        attrs: { arity: sym.arity },
        gen,
      });
    }
    store.publishGeneration("code");
    reindexMemoryFromFiles(store, files);
    return store;
  }

  test("PRESENT-target signature change: within-branch == reindex (signature-changed → needs-review)", async () => {
    // (i) within-branch: a real file + adapter re-ingest across an arity change.
    const proj = join(root, "wb");
    mkdirSync(proj, { recursive: true });
    const wb = openStore({ projectDir: proj, home: join(root, "wb-home"), now });
    let wbTriple: ReturnType<typeof driftTriple>;
    try {
      const adapter = new CodeSourceAdapter({ inProcess: true });
      writeFileSync(
        join(proj, "x.ts"),
        `export function f(a: number): number {\n  return a;\n}\n`,
        "utf8",
      );
      await ingestCode(wb, adapter);
      const mem = remember(wb, {
        surface: "cli",
        note: "f takes one arg",
        anchors: ["sym:x.ts#f"],
      });
      if (!mem.ok) throw new Error("within-branch anchor setup failed");
      // Arity 1 → 2 (same id): a signature change.
      writeFileSync(
        join(proj, "x.ts"),
        `export function f(a: number, b: number): number {\n  return a + b;\n}\n`,
        "utf8",
      );
      await ingestCode(wb, adapter);
      wbTriple = driftTriple(wb, mem.entityId);
    } finally {
      wb.close();
    }

    // (ii) reindex: the committed memory carries an arity-1 baseline; the current
    // code index carries `f` at arity 2 → presentTargetDrift → signature-changed.
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01CONVSIGCHANGED0000000A",
        gist: "documents the signature of f() in src/x.ts",
        anchors: ["sym:src/x.ts#f"],
        anchorSigs: { "sym:src/x.ts#f": { h: "h1", a: 1 } },
      }),
    );
    const rx = reindexWithSymbol(join(root, "rx"), new MemoryFiles(join(repo, ".contexa")), {
      hash: "h2",
      arity: 2,
    });
    let rxTriple: ReturnType<typeof driftTriple>;
    try {
      rxTriple = driftTriple(rx, "mem:01CONVSIGCHANGED0000000A");
    } finally {
      rx.close();
    }

    // Both paths agree on the reason class, the conflict object, and the status.
    const expected = {
      drift: "signature-changed",
      staleObject: "signature-changed",
      status: "needs-review",
    };
    expect(wbTriple).toEqual(expected);
    expect(rxTriple).toEqual(expected);
  });

  test("deleted-file target-removed: within-branch == reindex (target-removed → needs-review)", async () => {
    // (i) within-branch: anchor a note to a real file, then delete the file.
    const proj = join(root, "wb");
    mkdirSync(proj, { recursive: true });
    const wb = openStore({ projectDir: proj, home: join(root, "wb-home"), now });
    let wbTriple: ReturnType<typeof driftTriple>;
    try {
      const adapter = new CodeSourceAdapter({ inProcess: true });
      writeFileSync(
        join(proj, "foo.ts"),
        `export function used(): number {\n  return 1;\n}\n`,
        "utf8",
      );
      await ingestCode(wb, adapter);
      const mem = remember(wb, {
        surface: "cli",
        note: "foo.ts holds used",
        anchors: ["file:foo.ts"],
      });
      if (!mem.ok) throw new Error("within-branch file anchor setup failed");
      rmSync(join(proj, "foo.ts"));
      await ingestCode(wb, adapter);
      wbTriple = driftTriple(wb, mem.entityId);
    } finally {
      wb.close();
    }

    // (ii) reindex: the committed memory anchors to `file:foo.ts` (anchoredAt an
    // ancestor of HEAD) and the current code index does NOT carry that file entity
    // → classifyAbsentAnchor → target-removed.
    const head = currentHeadCommit(repo)!;
    const files = new MemoryFiles(join(repo, ".contexa"));
    files.appendMemory(
      "mainline",
      memEntry({
        memoryId: "mem:01CONVTARGETREMOVED0000A",
        gist: "documents foo.ts which no longer exists on this checkout",
        anchors: ["file:foo.ts"],
        anchoredAt: head,
      }),
    );
    const rx = reindexWithSymbol(
      join(root, "rx"),
      new MemoryFiles(join(repo, ".contexa")),
      "absent",
    );
    let rxTriple: ReturnType<typeof driftTriple>;
    try {
      rxTriple = driftTriple(rx, "mem:01CONVTARGETREMOVED0000A");
    } finally {
      rx.close();
    }

    const expected = {
      drift: "target-removed",
      staleObject: "target-removed",
      status: "needs-review",
    };
    expect(wbTriple).toEqual(expected);
    expect(rxTriple).toEqual(expected);
  });
});

describe("memory tail — item 2: recomputeDriftAtReindex sheds stale additive rows (C6-3 for drift)", () => {
  let root: string;
  let repo: string;
  beforeEach(() => {
    root = makeTempDir("ctx-tail-drift-");
    repo = makeGitFixture(root);
  });
  afterEach(() => cleanupTempDir(root));

  /** Content-keyed open stale-suspect set (`memId|reason`), order-independent —
   *  the E6 convergence unit (never per-store numeric claim ids). */
  function staleSuspectSet(store: Store): string[] {
    return store
      .conflicts("open")
      .filter((c) => c.kind === "stale-suspect")
      .map((c) => `${store.getClaim(c.a)?.subject}|${store.getClaim(c.b)?.object}`)
      .sort();
  }

  test("an additive reindex does not re-file drift from a stale (files-absent) row; peer == fresh clone (E6)", () => {
    const ctx = join(repo, ".contexa");
    const log = join(repo, ".contexa/memory/log.md");
    const head = currentHeadCommit(repo)!;
    const m1 = memEntry({
      memoryId: "mem:01DRIFTSTALEROW00000AAAA",
      gist: "documents helper a() that is removed on this branch of history",
      anchors: ["sym:src/x.ts#a"],
      anchoredAt: head,
    });
    const m2 = memEntry({
      memoryId: "mem:01DRIFTSTALEROW00000BBBB",
      gist: "documents helper b() that is removed on this branch of history",
      anchors: ["sym:src/x.ts#b"],
      anchoredAt: head,
    });
    const files = new MemoryFiles(ctx);
    files.appendMemory("mainline", m1);
    files.appendMemory("mainline", m2);

    /** Publish an EMPTY code index (drift derivation runs; both anchors absent →
     *  target-removed via ancestry) then reindex the committed memory files. */
    function publishAndReindex(store: Store): void {
      store.beginGeneration("code");
      store.publishGeneration("code"); // no symbols → sym#a / sym#b absent
      reindexMemoryFromFiles(store, new MemoryFiles(ctx));
    }

    const peer = openStore({ projectDir: repo, home: join(root, "peer"), now });
    try {
      publishAndReindex(peer);
      // Both memories anchor to since-removed symbols → two target-removed suspects.
      expect(staleSuspectSet(peer)).toEqual([
        "mem:01DRIFTSTALEROW00000AAAA|target-removed",
        "mem:01DRIFTSTALEROW00000BBBB|target-removed",
      ]);

      // The peer switches to a checkout where M2's line is GONE (only M1 committed).
      writeFileSync(log, `${serializeMemory(m1)}\n`, "utf8");
      publishAndReindex(peer); // additive default — the M2 store row lingers.

      // A fresh clone of the same M1-only files.
      const clone = openStore({ projectDir: repo, home: join(root, "clone"), now });
      try {
        publishAndReindex(clone);
        // The stale M2 store row must NOT re-file its target-removed stale-suspect…
        expect(staleSuspectSet(peer)).toEqual(["mem:01DRIFTSTALEROW00000AAAA|target-removed"]);
        // …so the drift conflict set converges with the fresh clone (E6).
        expect(staleSuspectSet(peer)).toEqual(staleSuspectSet(clone));
      } finally {
        clone.close();
      }
    } finally {
      peer.close();
    }
  });
});
