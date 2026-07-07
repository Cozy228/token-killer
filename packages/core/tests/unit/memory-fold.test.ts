/**
 * Slice 2 — event log + derived status fold (unit).
 *
 * Covers the E2 order-independent fold, the E5 decision-collision predicate +
 * contradiction filing, `composeStatus` (fold ∘ drift, A5), the DB-level
 * append-only guarantee on `memory_events`, and the "store is a rebuildable
 * materialized view" rebuild path. Deterministic, local, zero egress.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { flagAnchored } from "../../src/ingest/code/incremental.ts";
import {
  composeStatus,
  detectCollision,
  foldStatus,
  rebuildMemoryStatuses,
  refoldMemory,
  totalOrder,
} from "../../src/memory/fold.ts";
import { listMemories, remember, setMemoryLifecycle } from "../../src/memory/remember.ts";
import { openDatabase } from "../../src/store/sqlite.ts";
import { runMigrations } from "../../src/store/migrate.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import type { MemoryEvent, MemoryStatus } from "../../src/store/types.ts";
import { cleanupTempDir, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

/** Build a fully-specified event; overrides win. `at`/`id` set the total order. */
function ev(over: Partial<MemoryEvent> & Pick<MemoryEvent, "verb" | "at" | "id">): MemoryEvent {
  return {
    memoryId: "mem:x",
    actor: "test",
    reason: undefined,
    refs: {},
    carrier: "test",
    locus: undefined,
    method: "explicit-key",
    authority: "confirmed",
    ...over,
  };
}

/** Deterministic shuffles of an array (identity, reverse, seeded Fisher–Yates). */
function shuffles<T>(items: readonly T[]): T[][] {
  const out: T[][] = [[...items], [...items].reverse()];
  let seed = 12345;
  for (let k = 0; k < 4; k++) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      const j = seed % (i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    out.push(a);
  }
  return out;
}

describe("memory fold (slice 2 event log)", () => {
  // ---- E2: order-independent fold ----
  test("E2: shuffled insertion order → identical derived status", () => {
    const events = [
      ev({ verb: "create", at: 1000, id: "01A", refs: { status: "active" } }),
      ev({ verb: "review", at: 2000, id: "01B" }),
      ev({ verb: "confirm", at: 3000, id: "01C" }),
      ev({ verb: "retire", at: 4000, id: "01D" }),
    ];
    const results = shuffles(events).map((s) => foldStatus(s));
    expect(new Set(results).size).toBe(1); // all identical regardless of order
    expect(results[0]).toBe("retired"); // last-by-total-order wins
  });

  test("E2: same `at` is broken by ULID; the monotonic-larger ULID wins", () => {
    // create + retire share a millisecond — the ULID tiebreak decides the winner.
    const events = [
      ev({ verb: "retire", at: 5000, id: "5000B" }),
      ev({ verb: "create", at: 5000, id: "5000A", refs: { status: "active" } }),
    ];
    // total order: create (…A) before retire (…B) → retired.
    expect(totalOrder(events).map((e) => e.id)).toEqual(["5000A", "5000B"]);
    expect(foldStatus(events)).toBe("retired");
    expect(foldStatus([...events].reverse())).toBe("retired"); // insertion-order-free
  });

  test("create landing status is the fold baseline (import → needs-review)", () => {
    expect(
      foldStatus([ev({ verb: "create", at: 1, id: "a", refs: { status: "needs-review" } })]),
    ).toBe("needs-review");
    expect(foldStatus([ev({ verb: "create", at: 1, id: "a" })])).toBe("active"); // absent → active
  });

  test("F3: a duplicate later `create` is inert — the FIRST create is the baseline", () => {
    // create(needs-review) → confirm(active) → create(needs-review): the second
    // create must NOT reset the baseline over the intervening confirm.
    const events = [
      ev({ verb: "create", at: 1, id: "a", refs: { status: "needs-review" } }),
      ev({ verb: "confirm", at: 2, id: "b" }),
      ev({ verb: "create", at: 3, id: "c", refs: { status: "needs-review" } }),
    ];
    expect(foldStatus(events)).toBe("active");
    expect(new Set(shuffles(events).map((s) => foldStatus(s))).size).toBe(1); // order-free
  });

  // ---- E5: decision collision ----
  test("E5: a log with BOTH retire and supersede collides; later-by-total-order wins", () => {
    const retireFirst = [
      ev({ verb: "create", at: 1, id: "a" }),
      ev({ verb: "retire", at: 10, id: "b" }),
      ev({ verb: "supersede", at: 20, id: "c" }),
    ];
    expect(detectCollision(retireFirst)).toBeDefined();
    expect(foldStatus(retireFirst)).toBe("superseded"); // supersede is later

    const supersedeFirst = [
      ev({ verb: "create", at: 1, id: "a" }),
      ev({ verb: "supersede", at: 10, id: "b" }),
      ev({ verb: "retire", at: 20, id: "c" }),
    ];
    expect(detectCollision(supersedeFirst)).toBeDefined();
    expect(foldStatus(supersedeFirst)).toBe("retired"); // retire is later
  });

  test("E5: a normal single-track flow never false-fires a collision", () => {
    const normal = [
      ev({ verb: "create", at: 1, id: "a" }),
      ev({ verb: "review", at: 2, id: "b" }),
      ev({ verb: "confirm", at: 3, id: "c" }),
    ];
    expect(detectCollision(normal)).toBeUndefined();
  });

  // ---- compose (fold ∘ drift, A5) ----
  test("composeStatus: A5 drift classes; terminal fold wins", () => {
    expect(composeStatus("active", "signature-changed")).toBe("needs-review");
    expect(composeStatus("active", "target-removed")).toBe("needs-review");
    expect(composeStatus("active", "body-changed")).toBe("active"); // down-rank only
    expect(composeStatus("active", null)).toBe("active");
    expect(composeStatus("needs-review", null)).toBe("needs-review");
    // drift cannot resurrect a retired/superseded memory:
    expect(composeStatus("retired", "target-removed")).toBe("retired");
    expect(composeStatus("superseded", "signature-changed")).toBe("superseded");
  });

  // ---- append-only: DB triggers block UPDATE/DELETE ----
  test("memory_events is append-only: UPDATE and DELETE are blocked at the DB", () => {
    const dir = makeTempDir("ctx-events-");
    try {
      const db = openDatabase(join(dir, "store.sqlite"));
      runMigrations(db);
      db.prepare(
        `INSERT INTO memory_events (id, memory_id, verb, actor, refs, carrier, method, authority, at)
         VALUES ('01EV', 'mem:x', 'create', 'test', '{}', 'test', 'explicit-key', 'confirmed', 1)`,
      ).run();
      expect(() =>
        db.prepare("UPDATE memory_events SET verb = 'retire' WHERE id = '01EV'").run(),
      ).toThrow(/append-only/);
      expect(() => db.prepare("DELETE FROM memory_events WHERE id = '01EV'").run()).toThrow(
        /append-only/,
      );
      // The row is intact.
      expect(
        (db.prepare("SELECT verb FROM memory_events WHERE id = '01EV'").get() as { verb: string })
          .verb,
      ).toBe("create");
      db.close();
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("store is a rebuildable view (slice 2)", () => {
  let root: string;
  let store: Store;
  let clock: number;
  const now = (): number => clock;

  beforeEach(() => {
    root = makeTempDir("ctx-rebuild-");
    const repo = makeGitFixture(root);
    clock = 1_000_000;
    store = openStore({ projectDir: repo, home: join(root, "ctx-home"), now });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  const remb = (note: string, opts = {}): string => {
    clock += 1000;
    const r = remember(store, { surface: "cli", note, now, ...opts });
    if (!r.ok) throw new Error(`remember failed: ${r.reason}`);
    return r.handle;
  };

  test("wipe cached statuses → refold from events → equals the pre-wipe values", () => {
    const a = remb("alpha stays active");
    const b = remb("beta gets retired");
    const c = remb("gamma gets superseded");
    setMemoryLifecycle(store, b, "retired");
    remb("gamma v2", { supersedes: c }); // c → superseded via a supersede event
    const d = remb("delta needs review");
    setMemoryLifecycle(store, d, "needs-review");

    const before = new Map(listMemories(store).map((m) => [m.entityId, m.status]));
    expect(new Set(before.values())).toEqual(
      new Set<MemoryStatus>(["active", "retired", "superseded", "needs-review"]),
    );

    // Corrupt every cached status, then rebuild purely from the event log.
    for (const id of before.keys()) store.cacheMemoryStatus(id, "active");
    rebuildMemoryStatuses(store, store.publishedGen("memory"));

    const after = new Map(listMemories(store).map((m) => [m.entityId, m.status]));
    expect(after).toEqual(before);
    void a; // a stays active in both maps
  });

  test("appending an event without refold does NOT change the served status (reads are cache-only, no per-query fold)", () => {
    const h = remb("perf-shape probe");
    const id = store.resolveHandle(h)!.entityId;
    expect(store.getMemory(id)?.status).toBe("active");

    // Append a retire event straight to the log, bypassing the fold.
    store.appendMemoryEvent({
      memoryId: id,
      verb: "retire",
      actor: "test",
      carrier: "test",
      method: "explicit-key",
      authority: "confirmed",
    });
    // The served status is still the cached value — queries never replay the log.
    expect(store.getMemory(id)?.status).toBe("active");
    // Only an explicit refold (the write-time materializer) moves it.
    refoldMemory(store, id, store.publishedGen("memory"));
    expect(store.getMemory(id)?.status).toBe("retired");
  });

  test("F4: a backwards clock does not regress the total order (clamped `at`)", () => {
    const id = store.resolveHandle(remb("clock rollback probe"))!.entityId;
    const evt = (verb: MemoryEvent["verb"]): void =>
      void store.appendMemoryEvent({
        memoryId: id,
        verb,
        actor: "test",
        carrier: "test",
        method: "explicit-key",
        authority: "confirmed",
      });
    clock = 2_000_000;
    evt("retire"); // at → 2_000_000
    clock = 1_500_000; // ROLL BACK the clock
    evt("confirm"); // default `at` clamped to ≥ 2_000_000, monotonic ULID later
    expect(refoldMemory(store, id, store.publishedGen("memory"))).toBe("active"); // later append wins
  });

  test("F5: drift escalates only — a lower class never downgrades a higher one", () => {
    const id = store.resolveHandle(remb("two-anchor drift probe"))!.entityId;
    const gen = store.publishedGen("memory");
    store.setLink({ src: id, dst: "sym:one", predicate: "anchoredTo", method: "explicit-key" });
    store.setLink({ src: id, dst: "sym:two", predicate: "anchoredTo", method: "explicit-key" });
    // signature-changed lands first, then body-changed on the second anchor.
    flagAnchored(store, "sym:one", "signature-changed", gen);
    flagAnchored(store, "sym:two", "body-changed", gen);
    expect(store.getMemory(id)?.driftReason).toBe("signature-changed"); // not downgraded
    expect(store.getMemory(id)?.status).toBe("needs-review"); // needs-review effect preserved
  });

  test("R2-2: drift is escalate-only AND sticky-until-confirm across reingest passes", () => {
    const id = store.resolveHandle(remb("sticky drift probe"))!.entityId;
    const gen = store.publishedGen("memory");
    store.setLink({ src: id, dst: "sym:a", predicate: "anchoredTo", method: "explicit-key" });
    flagAnchored(store, "sym:a", "target-removed", gen);
    expect(store.getMemory(id)?.status).toBe("needs-review");
    // A LATER pass observing only body-changed must NOT downgrade (sticky).
    flagAnchored(store, "sym:a", "body-changed", gen);
    expect(store.getMemory(id)?.driftReason).toBe("target-removed");
    expect(store.getMemory(id)?.status).toBe("needs-review");
    // ONLY a human confirm clears it.
    setMemoryLifecycle(store, store.internHandle(id), "active");
    expect(store.getMemory(id)?.driftReason).toBeUndefined();
    expect(store.getMemory(id)?.status).toBe("active");
  });
});

// ---- R2-1: default-clock `at` is strictly monotonic across a process restart ----
describe("event `at` strict monotonicity across restart (R2-1)", () => {
  test("a reopen with a rolled-back clock still orders a new default event AFTER the last", () => {
    const root = makeTempDir("ctx-r21-");
    try {
      const repo = makeGitFixture(root);
      const home = join(root, "ctx-home");
      let clock = 5_000;
      const s1 = openStore({ projectDir: repo, home, now: () => clock });
      const r = remember(s1, { surface: "cli", note: "restart-order probe", now: () => clock });
      if (!r.ok) throw new Error(`remember failed: ${r.reason}`);
      const id = r.entityId;
      s1.appendMemoryEvent({
        memoryId: id,
        verb: "retire",
        actor: "test",
        carrier: "test",
        method: "explicit-key",
        authority: "confirmed",
      });
      const retireAt = s1.memoryEvents(id).find((e) => e.verb === "retire")!.at;
      s1.close();

      // Reopen with a clock EARLIER than the retire's `at`; fresh ULID factory.
      const s2 = openStore({ projectDir: repo, home, now: () => retireAt - 500 });
      s2.appendMemoryEvent({
        memoryId: id,
        verb: "confirm",
        actor: "test",
        carrier: "test",
        method: "explicit-key",
        authority: "confirmed",
      });
      const confirmAt = s2.memoryEvents(id).find((e) => e.verb === "confirm")!.at;
      expect(confirmAt).toBeGreaterThan(retireAt); // strictly after despite the rollback
      expect(refoldMemory(s2, id, s2.publishedGen("memory"))).toBe("active"); // confirm wins
      s2.close();
    } finally {
      cleanupTempDir(root);
    }
  });
});

// ---- F1 migration backfill: pre-slice-2 rows get a status-carrying create event ----
describe("migration 002 backfill (slice 2)", () => {
  const REAL_MIGRATIONS = fileURLToPath(new URL("../../src/store/migrations/", import.meta.url));

  test("F1: legacy memory rows are backfilled (status replayed, idempotent, no resurrection)", () => {
    const dir = makeTempDir("ctx-backfill-");
    try {
      // Apply 001 ONLY (a pre-slice-2 DB), then seed legacy rows with NO events.
      const only001 = join(dir, "m1");
      mkdirSync(only001);
      copyFileSync(join(REAL_MIGRATIONS, "001-init.sql"), join(only001, "001-init.sql"));
      const db = openDatabase(join(dir, "store.sqlite"));
      runMigrations(db, only001);

      const legacy: Array<[string, MemoryStatus]> = [
        ["mem:01LEGACYRETIRE0000000000", "retired"],
        ["mem:01LEGACYSUPER00000000000", "superseded"],
        ["mem:01LEGACYREVIEW0000000000", "needs-review"],
        ["mem:01LEGACYACTIVE0000000000", "active"],
      ];
      for (const [id, status] of legacy) {
        db.prepare(
          "INSERT INTO entities (id,kind,name,locator,attrs,first_seen,last_verified,gen) VALUES (?,?,?,?,?,?,?,?)",
        ).run(id, "memory", id, '{"t":"store"}', "{}", 111, 111, 1);
        db.prepare(
          "INSERT INTO memory (entity_id,gist,origin,authority,status) VALUES (?,?,?,?,?)",
        ).run(id, "legacy gist", "remember", "confirmed", status);
      }

      // Apply 002 (backfill) + 003 (bitemporal) + 004 (unresolved-here) over the
      // 001-only DB.
      expect(runMigrations(db).applied).toEqual([2, 3, 4]);

      // (a) exactly one create event per row, carrying its status, at = first_seen.
      const evOf = (id: string): MemoryEvent[] =>
        (
          db
            .prepare("SELECT * FROM memory_events WHERE memory_id=? ORDER BY at,id")
            .all(id) as Array<Record<string, unknown>>
        ).map((r) =>
          ev({
            verb: r.verb as MemoryEvent["verb"],
            at: r.at as number,
            id: r.id as string,
            refs: JSON.parse(r.refs as string) as Record<string, unknown>,
          }),
        );
      for (const [id, status] of legacy) {
        const evs = evOf(id);
        expect(evs).toHaveLength(1);
        expect(evs[0]!.verb).toBe("create");
        expect(evs[0]!.refs.status).toBe(status);
        expect(evs[0]!.at).toBe(111);
        // (b) fold reproduces the status; drift never resurrects a terminal state.
        expect(foldStatus(evs)).toBe(status);
        expect(composeStatus(foldStatus(evs), "signature-changed")).toBe(
          status === "retired" || status === "superseded" ? status : "needs-review",
        );
      }

      // (c) re-running the migration is a no-op — no duplicate events.
      const countBefore = (
        db.prepare("SELECT COUNT(*) n FROM memory_events").get() as { n: number }
      ).n;
      expect(runMigrations(db).applied).toEqual([]);
      expect((db.prepare("SELECT COUNT(*) n FROM memory_events").get() as { n: number }).n).toBe(
        countBefore,
      );
      db.close();
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("F6-backfill: a pre-existing resolved conflict gets a synthetic resolution event", () => {
    const dir = makeTempDir("ctx-cbackfill-");
    try {
      const only001 = join(dir, "m1");
      mkdirSync(only001);
      copyFileSync(join(REAL_MIGRATIONS, "001-init.sql"), join(only001, "001-init.sql"));
      const db = openDatabase(join(dir, "store.sqlite"));
      runMigrations(db, only001);
      // A claim (a=1) whose subject is a memory, and a RESOLVED conflict over it.
      db.prepare(
        "INSERT INTO claims (subject,predicate,object,carrier,method,authority,at,gen) VALUES (?,?,?,?,?,?,?,?)",
      ).run("mem:01X", "stale-anchor", "sym:y", "tree-sitter", "structural", "derived", 222, 1);
      db.prepare(
        "INSERT INTO claims (subject,predicate,object,carrier,method,authority,at,gen) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        "mem:01X",
        "stale-reason",
        "body-changed",
        "tree-sitter",
        "structural",
        "derived",
        222,
        1,
      );
      db.prepare(
        "INSERT INTO conflicts (a,b,kind,status) VALUES (1,2,'stale-suspect','resolved')",
      ).run();

      runMigrations(db); // apply 002 → conflict-resolution backfill
      const evs = db
        .prepare("SELECT verb, refs FROM memory_events WHERE memory_id='mem:01X'")
        .all() as Array<{ verb: string; refs: string }>;
      const resolve = evs.find((e) => e.verb === "resolve-conflict");
      expect(resolve, "synthetic resolve-conflict event filed").toBeDefined();
      expect(JSON.parse(resolve!.refs)).toMatchObject({ conflictA: 1, conflictB: 2 });
      db.close();
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ---- F6(c) structural guard: cache-write seam is not bypassed in production ----
describe("cache-write seam is narrowed to fold + store (F6)", () => {
  test("only memory/fold.ts and store/store.ts reference the cache-write methods", () => {
    const srcRoot = fileURLToPath(new URL("../../src/", import.meta.url));
    const offenders: string[] = [];
    const walk = (dir: string, rel: string): void => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, name.name);
        const r = rel ? `${rel}/${name.name}` : name.name;
        if (name.isDirectory()) walk(abs, r);
        else if (
          name.name.endsWith(".ts") &&
          /cacheMemoryStatus|cacheConflictStatus/.test(readFileSync(abs, "utf8"))
        ) {
          offenders.push(r);
        }
      }
    };
    walk(srcRoot, "");
    expect(offenders.sort()).toEqual(["memory/fold.ts", "store/store.ts"]);
  });
});
