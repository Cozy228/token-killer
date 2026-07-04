/**
 * Connection bootstrap over node:sqlite (CTX-IMPL §2 notes).
 *
 * PRAGMA order is load-bearing: `busy_timeout` MUST be set first (before
 * `journal_mode`) so the WAL switch itself waits instead of failing under a
 * concurrent opener. The set mirrors codegraph's configureConnection.
 *
 * node:sqlite is flag-gated (`--experimental-sqlite`) on Node 22.5–22.12 and
 * unflagged later; ctx CI exports NODE_OPTIONS accordingly. `ctx doctor` (1i)
 * owns the runtime assertion (Node >=22.5, SQLite >=3.43).
 */
import { DatabaseSync, type StatementSync } from "node:sqlite";

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout=5000"); // FIRST — see header
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA synchronous=NORMAL");
  db.exec("PRAGMA cache_size=-64000");
  db.exec("PRAGMA temp_store=MEMORY");
  db.exec("PRAGMA mmap_size=268435456"); // 256MB
  return db;
}

/**
 * Run `fn` inside one immediate (write-locking) transaction. IMMEDIATE grabs
 * the write lock up front so the compare-and-set patterns (lease, generation
 * publish) cannot interleave with another writer between read and write.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Iterate rows without materializing the whole result set. Large scans use
 * iterate, never .all() (documented OOM class, §2 notes). StatementSync.iterate
 * is missing on the oldest supported Node 22.x lines — fall back to .all()
 * there (those scans are small in M1; adapters revisit if that changes).
 */
export function* iterateRows(
  stmt: StatementSync,
  ...params: Array<string | number | null>
): Generator<unknown> {
  const iter = stmt as unknown as {
    iterate?: (...p: Array<string | number | null>) => Iterable<unknown>;
    all: (...p: Array<string | number | null>) => unknown[];
  };
  if (typeof iter.iterate === "function") {
    yield* iter.iterate(...params);
  } else {
    yield* iter.all(...params);
  }
}
