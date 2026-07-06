/**
 * Slice 2 — event log + derived status fold (unit).
 *
 * Covers the E2 order-independent fold, the E5 decision-collision predicate +
 * contradiction filing, `composeStatus` (fold ∘ drift, A5), the DB-level
 * append-only guarantee on `memory_events`, and the "store is a rebuildable
 * materialized view" rebuild path. Deterministic, local, zero egress.
 */
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
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
    const r = remember(store, { note, now, ...opts });
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
    for (const id of before.keys()) store.setMemoryStatus(id, "active");
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
});
