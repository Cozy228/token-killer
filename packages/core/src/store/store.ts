/**
 * The `Store` contract (CTX-IMPL §2/§3/§4) — pinned in slice 1b so 1c/1d/1e
 * build against ONE interface. SQLite-backed via node:sqlite; one DB per
 * project shard at $CTX_HOME/projects/<shard>/store.sqlite.
 *
 * Invariants owned here:
 * - claims are append-only (no update/delete API exists, by design);
 * - file paths are persisted project-relative, never absolute (one scrub
 *   function at the store writer — §3 write-boundary rule);
 * - readers see only published generations (`gen <= published_gen`);
 * - single-writer lease is compare-and-set in meta, 30s TTL, stealable on
 *   expiry (§4.5); readers never block (WAL + snapshot reads).
 */
import { existsSync, mkdirSync } from "node:fs";
import { relative, isAbsolute, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase, openDatabaseReadOnly, transaction, iterateRows } from "./sqlite.ts";
import { runMigrations } from "./migrate.ts";
import { resolveShard, ctxHome, shardDir, storePath, type ShardResolution } from "./shard.ts";
import { HANDLE_MIN_LEN, parseHandle, shortHandleCandidate } from "./handles.ts";
import { blake2bHex } from "./hash.ts";
import {
  readFileLocator,
  readGitLocator,
  readSnapshotLocator,
  type ReadThroughHost,
} from "./readthrough.ts";
import type {
  Claim,
  ClaimInput,
  Conflict,
  ConflictKind,
  ConflictStatus,
  Cursor,
  Entity,
  EntityInput,
  EntityKind,
  Facet,
  FtsHit,
  LeaseResult,
  LeaseState,
  Link,
  LinkInput,
  Locator,
  MemoryDriftReason,
  MemoryEvent,
  MemoryEventInput,
  MemoryInput,
  MemoryListRow,
  MemoryRow,
  MemoryStatus,
  ReadThroughResult,
} from "./types.ts";
import { monotonicUlidFactory } from "../memory/ulid.ts";

export const LEASE_TTL_MS = 30_000;
export const MEMORY_GIST_MAX_CHARS = 240;
const MEMORY_SOURCE = "memory";

/** The `memory_events` append-only triggers (migration 002). Kept here so the
 *  sanctioned reset seam can drop + recreate them around a files→store rebuild. */
const MEMORY_EVENTS_TRIGGERS = `
CREATE TRIGGER memory_events_no_update BEFORE UPDATE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only (no UPDATE)');
END;
CREATE TRIGGER memory_events_no_delete BEFORE DELETE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only (no DELETE)');
END;`;

export interface OpenStoreOptions {
  /** Directory to resolve the project shard from (default: process.cwd()). */
  projectDir?: string;
  /** Data home override (default: $CTX_HOME or ~/.ctx). Tests MUST set this (G-7). */
  home?: string;
  /** Injectable clock (lease TTL, timestamps) — fixed-clock tests (§10). */
  now?: () => number;
}

export interface Store {
  readonly shard: string;
  readonly projectRoot: string;
  readonly mainRoot: string;
  readonly dbPath: string;
  close(): void;

  // entities
  upsertEntity(input: EntityInput): void;
  getEntity(id: string): Entity | undefined;
  entityCount(maxGen?: number): number;
  /**
   * Count entities of one kind (optionally at or below `maxGen`) — the code
   * source's shrink guard (2c) compares the published symbol graph size across
   * generations. Additive read-only view over the same rows as `entityCount`.
   */
  countByKind(kind: EntityKind, maxGen?: number): number;
  /**
   * All entities of one kind (optionally at or below `maxGen`) — the code
   * source's 2d call-graph resolution and docs→symbol mention resolution both
   * need the project-wide symbol universe. Additive, read-only; the
   * `entities(kind, name)` index makes the kind scan cheap.
   */
  entitiesByKind(kind: EntityKind, maxGen?: number): Entity[];
  /**
   * Direct name index, case-insensitive exact match (additive, read-only;
   * slice 1f named-seed injection — CTX-IMPL §6.1: identifier-shaped query
   * tokens resolve via the name index and are force-included).
   */
  entitiesByName(name: string, limit?: number): Entity[];

  // claims — append-only (no mutation API, by design)
  addClaim(input: ClaimInput): number;
  claimsFor(subject: string, predicate?: string): Claim[];
  getClaim(id: number): Claim | undefined;

  // links (resolved current view)
  setLink(input: LinkInput): void;
  linksFrom(src: string, predicate?: string): Link[];
  linksTo(dst: string, predicate?: string): Link[];
  flagLinksStale(entityId: string): number;
  /**
   * Delete the resolved links from `src` (optionally one predicate) — links are
   * a mutable current view (unlike append-only claims), so a re-ingest that
   * re-resolves a file's edges clears the stale ones first (2c incremental
   * re-resolution: a shadowed import must not leave its old target linked).
   * Returns the number of links removed.
   */
  clearLinks(src: string, predicate?: string): number;
  /**
   * Delete the resolved links INTO `dst` (optionally one predicate) — the mirror
   * of `clearLinks` for incoming edges. A retired symbol (dropped from the
   * `contains` graph but kept as an entity so rename-chain history survives)
   * must not keep stale INCOMING `calls`/`references` edges from callers/docs
   * that were not themselves re-parsed this pass (2c/2d retire completion).
   * Returns the number of links removed.
   */
  clearLinksTo(dst: string, predicate?: string): number;

  // conflicts
  addConflict(a: number, b: number, kind: ConflictKind): void;
  conflicts(status?: ConflictStatus): Conflict[];
  /** Every conflict regardless of status — the rebuild path re-derives their
   *  cached `status` from resolution events (conflicts.status = folded state). */
  allConflicts(): Conflict[];
  /**
   * Write a conflict's CACHED status. Internal cache-write — conflict
   * resolve/dismiss go through the fold module's `resolveConflictViaEvent`
   * (append event, then materialize) (C4/Decision 5). Named `cache…` so any call
   * site reads as a cache write; production callers are `memory/fold.ts` + this
   * file only (guarded by a test). A store-primitive unit test exercises it.
   */
  cacheConflictStatus(a: number, b: number, status: ConflictStatus): void;
  /**
   * Delete every conflict row of one kind (a CACHE deletion, not a source
   * mutation). The full reindex recomputes the DERIVED `stale-suspect` layer from
   * scratch (S4 §1): it deletes the cached rows then re-files only the ones
   * re-derived this pass. Non-destruction holds — the committed source + the
   * append-only events + the underlying claims are untouched; only the
   * rebuildable conflict cache is cleared. Contradiction conflicts are NOT passed
   * here (they keep re-deriving from events).
   */
  deleteConflictsByKind(kind: ConflictKind): void;
  /**
   * OPEN `stale-suspect` conflicts whose `a` claim's subject is this memory —
   * the CURRENT-STATE staleness signal (E7): rank/push read it, the lifecycle
   * `confirm` verb resolves it. The append-only `stale-reason` claims stay as
   * the permanent audit trail; only the conflict carries current state.
   * Indexed lookup via claims(subject) — rank calls this per candidate.
   */
  openStaleSuspects(memoryId: string): Conflict[];

  // memory + anchors (store IS the source of truth here — §2 notes exception)
  writeMemory(input: MemoryInput): void;
  getMemory(entityId: string): MemoryRow | undefined;
  /**
   * Write a memory's CACHED status. INTERNAL cache-write used only by the status
   * fold (`memory/fold.ts`) to materialize the E2/E5 fold composed with the drift
   * annotation (A5). Lifecycle verbs append an immutable event and refold — they
   * never call this. Named `cache…` so any call site reads as a cache write;
   * production callers are `memory/fold.ts` + this file only (guarded by a test).
   */
  cacheMemoryStatus(entityId: string, status: MemoryRow["status"]): void;
  /** Set the derived anchor-drift annotation (S4) — per-checkout index state,
   *  never an event. `null` clears it (a human confirm affirms freshness). */
  setMemoryDrift(entityId: string, reason: MemoryDriftReason | null): void;
  /** Set the derived S9 `unresolved-here` annotation (per-checkout index state,
   *  never an event). Disjoint from drift; recomputed from scratch at reindex. */
  setMemoryUnresolvedHere(entityId: string, unresolved: boolean): void;
  /** Set the derived committed-vs-overlay provenance (slice-6 item 4) — the zone
   *  this memory's `create` currently lives in. Per-checkout index state recomputed
   *  at reindex, never a committed status. */
  setMemoryOriginZone(entityId: string, zone: "mainline" | "overlay"): void;
  /** Append an immutable lifecycle/decision event (append-only; the fold source).
   *  Returns the event ULID. Never updates/deletes (DB triggers enforce it). */
  appendMemoryEvent(input: MemoryEventInput): string;
  /**
   * Allocate the next monotonic event stamp `(id, at)` WITHOUT inserting a row —
   * so a file-first write-through (slice 3) can serialize the committed line with
   * the SAME id/at it then hands to `appendMemoryEvent`. Advances the store's
   * monotonic base (single-writer), so it must always be followed by the insert.
   */
  nextEventStamp(at?: number): { id: string; at: number };
  /**
   * Idempotently replay a committed event line into the index cache (reindex /
   * pull-delta). `INSERT OR IGNORE` keyed by the file-supplied `id`, so parsing
   * the same append-only log twice never duplicates — the files are the log, the
   * table is the rebuildable cache (S10 #4).
   */
  ingestMemoryEvent(event: MemoryEvent): void;
  /** A memory's events in total order `(at, then ULID)` (E2) — the fold input. */
  memoryEvents(memoryId: string): MemoryEvent[];
  /** Every lifecycle/decision event, total-ordered — the rebuild path input. */
  allMemoryEvents(): MemoryEvent[];
  /** Every memory index row (unfiltered) — the S3 migration export enumerates
   *  the full store, including non-`active`/gen-invisible rows. Read-only. */
  allMemories(): MemoryRow[];
  /**
   * The ONE sanctioned cache-reset seam (files→store only). Drops the
   * append-only `memory_events` triggers, clears the entire memory domain
   * (events, memory rows + entities/FTS/anchors/links, and memory-provenance
   * claims + their conflicts), then recreates the triggers — all in one
   * transaction. The append-only triggers stay AUTHORITATIVE for normal
   * operation; this is the only bypass, used exclusively to rebuild the
   * rebuildable cache from the committed files (migration end, non-append
   * pull-delta fallback). Nothing store-only is exported here — the CALLER runs
   * the catch-up export first (ordering guard).
   */
  resetMemoryCache(): void;
  setAnchors(memoryId: string, entityIds: string[]): void;
  anchorsOf(memoryId: string): string[];
  /**
   * Enumerate memory entries (lifecycle listing), optionally status-filtered,
   * `gen<=published_gen` visibility filtered, ordered last_verified desc then id.
   * A6: closes the enumeration seam so `listMemories` reads through the store's
   * own connection instead of opening a second read-only SQLite connection.
   */
  listMemoryEntries(status?: MemoryStatus): MemoryListRow[];

  // full-text (contentless — index only, rowid keyed to entities.rowid)
  ftsIndex(entityId: string, doc: { name: string; text: string; kind: string }): void;
  ftsRemove(entityId: string): void;
  ftsSearch(match: string, limit?: number): FtsHit[];

  // cursors
  getCursor(source: string): Cursor | undefined;
  setCursor(source: string, position: string, freshness: number, gen: number): void;

  // generations (§4 publish protocol)
  beginGeneration(source: string): number;
  publishGeneration(source: string): void;
  publishedGen(source: string): number;

  // single-writer lease (§4.5)
  acquireLease(holder: string, ttlMs?: number): LeaseResult;
  releaseLease(holder: string): void;
  currentLease(): LeaseState | undefined;

  // handles (§3)
  internHandle(entityId: string, facet?: Facet): string;
  resolveHandle(input: string): { entityId: string; facet: Facet | undefined } | undefined;

  // meta
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;

  /**
   * Run `fn` inside ONE write-locking transaction (§4 / §11). The whole body
   * commits together or rolls back together — the SCIP pass (2e) buffers its
   * decoded claims + arbitrated link upgrades and applies them here so a
   * malformed `index.scip` leaves the store EXACTLY as tree-sitter left it (D16
   * fail-open: no half-applied SCIP generation). Do NOT nest: `fn` must call
   * only the autocommit writers (upsertEntity/addClaim/setLink/clearLinks), not
   * the self-transacting ops (beginGeneration/publishGeneration/ftsIndex/
   * setAnchors) — SQLite rejects a nested BEGIN.
   */
  transaction<T>(fn: () => T): T;

  // read-through (§3) — recoverable failures are values, never throws
  readThrough(entityId: string): ReadThroughResult;
  resolveLocator(locator: Locator, contentHash?: string, entityId?: string): ReadThroughResult;
}

/** §3 write-boundary rule: ONE scrub function; paths persist project-relative. */
export function scrubToProjectRelative(path: string, projectRoot: string): string {
  if (!isAbsolute(path)) return path.split("\\").join("/");
  const rel = relative(projectRoot, path);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`refusing to persist a path outside the project root: ${path}`);
  }
  return rel.split(sep).join("/");
}

interface EntityRow {
  id: string;
  kind: string;
  name: string;
  locator: string;
  content_hash: string | null;
  source_rev: string | null;
  attrs: string;
  first_seen: number;
  last_verified: number;
  gen: number;
}

class SqliteStore implements Store {
  readonly shard: string;
  readonly projectRoot: string;
  readonly mainRoot: string;
  readonly dbPath: string;
  readonly #db: DatabaseSync;
  readonly #now: () => number;
  /** Monotonic ULID source for event ids — the E2 total-order tiebreaker must
   *  reflect causal order even for two events sharing a millisecond. */
  readonly #eventUlid = monotonicUlidFactory();
  /** Monotonic base for default-clock event `at` (F4): a backwards clock must not
   *  regress the total order. Seeded from the max existing event `at` at open, so
   *  it survives process restarts. */
  #lastEventAt = -1;

  constructor(db: DatabaseSync, dbPath: string, res: ShardResolution, now: () => number) {
    this.#db = db;
    this.dbPath = dbPath;
    this.shard = res.shard;
    this.projectRoot = res.projectRoot;
    this.mainRoot = res.mainRoot;
    this.#now = now;
    const maxAt = this.#db.prepare("SELECT MAX(at) AS m FROM memory_events").get() as {
      m: number | null;
    };
    this.#lastEventAt = maxAt.m ?? -1;
  }

  close(): void {
    this.#db.close();
  }

  // ---- entities ----

  upsertEntity(input: EntityInput): void {
    const locator: Locator =
      input.locator.t === "file"
        ? { ...input.locator, path: scrubToProjectRelative(input.locator.path, this.projectRoot) }
        : input.locator;
    const now = this.#now();
    this.#db
      .prepare(
        `INSERT INTO entities (id, kind, name, locator, content_hash, source_rev, attrs, first_seen, last_verified, gen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind, name = excluded.name, locator = excluded.locator,
           content_hash = excluded.content_hash, source_rev = excluded.source_rev,
           attrs = excluded.attrs, last_verified = excluded.last_verified, gen = excluded.gen`,
      )
      .run(
        input.id,
        input.kind,
        input.name,
        JSON.stringify(locator),
        input.contentHash ?? null,
        input.sourceRev ?? null,
        JSON.stringify(input.attrs ?? {}),
        now,
        now,
        input.gen,
      );
  }

  getEntity(id: string): Entity | undefined {
    const row = this.#db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as
      | EntityRow
      | undefined;
    if (!row) return undefined;
    return entityFromRow(row);
  }

  entityCount(maxGen?: number): number {
    const row = (
      maxGen === undefined
        ? this.#db.prepare("SELECT COUNT(*) AS n FROM entities").get()
        : this.#db.prepare("SELECT COUNT(*) AS n FROM entities WHERE gen <= ?").get(maxGen)
    ) as { n: number };
    return row.n;
  }

  entitiesByKind(kind: string, maxGen?: number): Entity[] {
    const rows = (maxGen === undefined
      ? this.#db.prepare("SELECT * FROM entities WHERE kind = ? ORDER BY id")
      : this.#db.prepare("SELECT * FROM entities WHERE kind = ? AND gen <= ? ORDER BY id")
    ).all(...(maxGen === undefined ? [kind] : [kind, maxGen])) as unknown as EntityRow[];
    return rows.map((row) => entityFromRow(row));
  }

  entitiesByName(name: string, limit = 32): Entity[] {
    const rows = this.#db
      .prepare("SELECT * FROM entities WHERE name = ? COLLATE NOCASE ORDER BY id LIMIT ?")
      .all(name, limit) as unknown as EntityRow[];
    return rows.map((row) => entityFromRow(row));
  }

  countByKind(kind: string, maxGen?: number): number {
    const row = (
      maxGen === undefined
        ? this.#db.prepare("SELECT COUNT(*) AS n FROM entities WHERE kind = ?").get(kind)
        : this.#db
            .prepare("SELECT COUNT(*) AS n FROM entities WHERE kind = ? AND gen <= ?")
            .get(kind, maxGen)
    ) as { n: number };
    return row.n;
  }

  // ---- claims (append-only) ----

  addClaim(input: ClaimInput): number {
    const result = this.#db
      .prepare(
        `INSERT INTO claims (subject, predicate, object, carrier, locus, method, authority, at, gen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.subject,
        input.predicate,
        input.object ?? null,
        input.carrier,
        input.locus ?? null,
        input.method,
        input.authority,
        this.#now(),
        input.gen,
      );
    return Number(result.lastInsertRowid);
  }

  claimsFor(subject: string, predicate?: string): Claim[] {
    const stmt =
      predicate === undefined
        ? this.#db.prepare("SELECT * FROM claims WHERE subject = ? ORDER BY id")
        : this.#db.prepare("SELECT * FROM claims WHERE subject = ? AND predicate = ? ORDER BY id");
    const params = predicate === undefined ? [subject] : [subject, predicate];
    return [...iterateRows(stmt, ...params)].map((r) => claimFromRow(r as Record<string, unknown>));
  }

  getClaim(id: number): Claim | undefined {
    const row = this.#db.prepare("SELECT * FROM claims WHERE id = ?").get(id);
    return row ? claimFromRow(row as Record<string, unknown>) : undefined;
  }

  // ---- links ----

  setLink(input: LinkInput): void {
    this.#db
      .prepare(
        `INSERT INTO links (src, dst, predicate, method, confidence, claim_id, verified_at, stale)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(src, predicate, dst) DO UPDATE SET
           method = excluded.method, confidence = excluded.confidence,
           claim_id = excluded.claim_id, verified_at = excluded.verified_at, stale = 0`,
      )
      .run(
        input.src,
        input.dst,
        input.predicate,
        input.method,
        input.confidence ?? 1.0,
        input.claimId ?? null,
        this.#now(),
      );
  }

  linksFrom(src: string, predicate?: string): Link[] {
    const stmt =
      predicate === undefined
        ? this.#db.prepare("SELECT * FROM links WHERE src = ?")
        : this.#db.prepare("SELECT * FROM links WHERE src = ? AND predicate = ?");
    const params = predicate === undefined ? [src] : [src, predicate];
    return [...iterateRows(stmt, ...params)].map((r) => linkFromRow(r as Record<string, unknown>));
  }

  linksTo(dst: string, predicate?: string): Link[] {
    const stmt =
      predicate === undefined
        ? this.#db.prepare("SELECT * FROM links WHERE dst = ?")
        : this.#db.prepare("SELECT * FROM links WHERE dst = ? AND predicate = ?");
    const params = predicate === undefined ? [dst] : [dst, predicate];
    return [...iterateRows(stmt, ...params)].map((r) => linkFromRow(r as Record<string, unknown>));
  }

  flagLinksStale(entityId: string): number {
    const result = this.#db
      .prepare("UPDATE links SET stale = 1 WHERE src = ? OR dst = ?")
      .run(entityId, entityId);
    return Number(result.changes);
  }

  clearLinks(src: string, predicate?: string): number {
    const result =
      predicate === undefined
        ? this.#db.prepare("DELETE FROM links WHERE src = ?").run(src)
        : this.#db.prepare("DELETE FROM links WHERE src = ? AND predicate = ?").run(src, predicate);
    return Number(result.changes);
  }

  clearLinksTo(dst: string, predicate?: string): number {
    const result =
      predicate === undefined
        ? this.#db.prepare("DELETE FROM links WHERE dst = ?").run(dst)
        : this.#db.prepare("DELETE FROM links WHERE dst = ? AND predicate = ?").run(dst, predicate);
    return Number(result.changes);
  }

  // ---- conflicts ----

  addConflict(a: number, b: number, kind: ConflictKind): void {
    this.#db
      .prepare("INSERT OR IGNORE INTO conflicts (a, b, kind, status) VALUES (?, ?, ?, 'open')")
      .run(a, b, kind);
  }

  conflicts(status: ConflictStatus = "open"): Conflict[] {
    return this.#db
      .prepare("SELECT * FROM conflicts WHERE status = ?")
      .all(status) as unknown as Conflict[];
  }

  allConflicts(): Conflict[] {
    return this.#db.prepare("SELECT * FROM conflicts").all() as unknown as Conflict[];
  }

  cacheConflictStatus(a: number, b: number, status: ConflictStatus): void {
    this.#db.prepare("UPDATE conflicts SET status = ? WHERE a = ? AND b = ?").run(status, a, b);
  }

  deleteConflictsByKind(kind: ConflictKind): void {
    this.#db.prepare("DELETE FROM conflicts WHERE kind = ?").run(kind);
  }

  openStaleSuspects(memoryId: string): Conflict[] {
    return this.#db
      .prepare(
        `SELECT c.* FROM conflicts c JOIN claims ca ON ca.id = c.a
         WHERE c.kind = 'stale-suspect' AND c.status = 'open' AND ca.subject = ?`,
      )
      .all(memoryId) as unknown as Conflict[];
  }

  // ---- memory ----

  writeMemory(input: MemoryInput): void {
    if (input.gist.length > MEMORY_GIST_MAX_CHARS) {
      // Serve/remember (1c) catches this and answers with success-shaped
      // guidance to split note/detail; the STORE enforces the invariant (§2).
      throw new RangeError(
        `memory gist exceeds ${MEMORY_GIST_MAX_CHARS} chars (${input.gist.length})`,
      );
    }
    this.#db
      .prepare(
        // `status` applies on INSERT only; on CONFLICT it is PRESERVED (F2): the
        // cached status is the fold output, so a re-import/re-write must NOT reset
        // it — that would clobber a human confirm. The fold (memory/fold.ts) is the
        // only writer of `status` after creation, via `cacheMemoryStatus`.
        `INSERT INTO memory (entity_id, gist, detail, origin, session_ref, authority, status, valid_from, valid_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(entity_id) DO UPDATE SET
           gist = excluded.gist, detail = excluded.detail, origin = excluded.origin,
           session_ref = excluded.session_ref, authority = excluded.authority,
           valid_from = excluded.valid_from, valid_to = excluded.valid_to`,
      )
      .run(
        input.entityId,
        input.gist,
        input.detail ?? null,
        input.origin,
        input.sessionRef ?? null,
        input.authority,
        input.status ?? "active",
        input.validFrom ?? null,
        input.validTo ?? null,
      );
  }

  getMemory(entityId: string): MemoryRow | undefined {
    const row = this.#db.prepare("SELECT * FROM memory WHERE entity_id = ?").get(entityId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return {
      entityId: row.entity_id as string,
      gist: row.gist as string,
      detail: (row.detail as string | null) ?? undefined,
      origin: row.origin as MemoryRow["origin"],
      sessionRef: (row.session_ref as string | null) ?? undefined,
      authority: row.authority as MemoryRow["authority"],
      status: row.status as MemoryRow["status"],
      servedCount: row.served_count as number,
      lastServed: (row.last_served as number | null) ?? undefined,
      driftReason: (row.drift_reason as MemoryDriftReason | null) ?? undefined,
      unresolvedHere: Number(row.unresolved_here ?? 0) === 1,
      originZone: (row.origin_zone as MemoryRow["originZone"] | null) ?? undefined,
      validFrom: (row.valid_from as number | null) ?? undefined,
      validTo: (row.valid_to as number | null) ?? undefined,
    };
  }

  allMemories(): MemoryRow[] {
    const ids = this.#db
      .prepare("SELECT entity_id FROM memory ORDER BY entity_id")
      .all() as unknown as Array<{ entity_id: string }>;
    const out: MemoryRow[] = [];
    for (const { entity_id } of ids) {
      const row = this.getMemory(entity_id);
      if (row) out.push(row);
    }
    return out;
  }

  resetMemoryCache(): void {
    transaction(this.#db, () => {
      // Bypass the append-only guard ONLY here (files→store rebuild).
      this.#db.exec("DROP TRIGGER IF EXISTS memory_events_no_update");
      this.#db.exec("DROP TRIGGER IF EXISTS memory_events_no_delete");
      this.#db.exec("DELETE FROM memory_events");
      // FTS is contentless — clear the memory entities' rows before the entities.
      this.#db.exec(
        "DELETE FROM fts WHERE rowid IN (SELECT rowid FROM entities WHERE kind = 'memory')",
      );
      this.#db.exec("DELETE FROM anchors");
      this.#db.exec("DELETE FROM links WHERE src LIKE 'mem:%' OR dst LIKE 'mem:%'");
      // Conflicts referencing memory-provenance claims (resolve before the claims).
      this.#db.exec(
        `DELETE FROM conflicts WHERE
           a IN (SELECT id FROM claims WHERE subject LIKE 'mem:%') OR
           b IN (SELECT id FROM claims WHERE subject LIKE 'mem:%')`,
      );
      this.#db.exec("DELETE FROM claims WHERE subject LIKE 'mem:%'");
      this.#db.exec("DELETE FROM memory");
      this.#db.exec("DELETE FROM entities WHERE kind = 'memory'");
      // Restore the append-only guard for normal operation.
      this.#db.exec(MEMORY_EVENTS_TRIGGERS);
    });
  }

  cacheMemoryStatus(entityId: string, status: MemoryRow["status"]): void {
    this.#db.prepare("UPDATE memory SET status = ? WHERE entity_id = ?").run(status, entityId);
  }

  setMemoryDrift(entityId: string, reason: MemoryDriftReason | null): void {
    this.#db
      .prepare("UPDATE memory SET drift_reason = ? WHERE entity_id = ?")
      .run(reason, entityId);
  }

  setMemoryUnresolvedHere(entityId: string, unresolved: boolean): void {
    this.#db
      .prepare("UPDATE memory SET unresolved_here = ? WHERE entity_id = ?")
      .run(unresolved ? 1 : 0, entityId);
  }

  setMemoryOriginZone(entityId: string, zone: "mainline" | "overlay"): void {
    this.#db.prepare("UPDATE memory SET origin_zone = ? WHERE entity_id = ?").run(zone, entityId);
  }

  appendMemoryEvent(input: MemoryEventInput): string {
    // F4 (R2-1): the default-clock path is STRICTLY monotonic per writer — `at`
    // must be > the last default event's `at`, not just ≥ it. `#lastEventAt` is
    // seeded from `MAX(at)` at open, but the ULID factory restarts fresh each
    // process; a mere clamp to `max(now, last)` could produce an EQUAL `at` whose
    // fresh-random ULID sorts before a prior (higher-random) event at the same
    // ms, inverting `(at, id)` across a process restart with a rolled-back clock.
    // Strict `+1` keeps the total order monotonic regardless of the ULID. The
    // ms-level skew on same-ms bursts is accepted (and harmless: order is what
    // matters). An EXPLICIT `input.at` (backfill / tests) is stored VERBATIM but
    // still advances the base so later default events stay strictly above it.
    // Sample the clock ONCE — a rollback between two `this.#now()` reads could
    // otherwise still yield `at <= #lastEventAt`, which a fresh ULID factory
    // cannot compensate for across a restart (SQL orders by `at` first).
    const nowMs = this.#now();
    const at = input.at ?? (nowMs > this.#lastEventAt ? nowMs : this.#lastEventAt + 1);
    if (at > this.#lastEventAt) this.#lastEventAt = at;
    const id = input.id ?? this.#eventUlid(at);
    this.#db
      .prepare(
        `INSERT INTO memory_events (id, memory_id, verb, actor, reason, refs, carrier, locus, method, authority, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.memoryId,
        input.verb,
        input.actor,
        input.reason ?? null,
        JSON.stringify(input.refs ?? {}),
        input.carrier,
        input.locus ?? null,
        input.method,
        input.authority,
        at,
      );
    return id;
  }

  nextEventStamp(explicitAt?: number): { id: string; at: number } {
    // Same monotonic discipline as appendMemoryEvent's default-clock path (F4 /
    // R2-1): a backwards clock must not regress the total order. Advances the
    // base, so the caller MUST follow with the insert (single-writer).
    const nowMs = this.#now();
    const at = explicitAt ?? (nowMs > this.#lastEventAt ? nowMs : this.#lastEventAt + 1);
    if (at > this.#lastEventAt) this.#lastEventAt = at;
    return { id: this.#eventUlid(at), at };
  }

  ingestMemoryEvent(event: MemoryEvent): void {
    // Reindex replay — idempotent (INSERT OR IGNORE by the file-supplied id). The
    // files are the append-only source; the table is a rebuildable cache, so
    // replaying the same log line twice is a no-op, never a duplicate.
    this.#db
      .prepare(
        `INSERT OR IGNORE INTO memory_events
           (id, memory_id, verb, actor, reason, refs, carrier, locus, method, authority, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.memoryId,
        event.verb,
        event.actor,
        event.reason ?? null,
        JSON.stringify(event.refs ?? {}),
        event.carrier,
        event.locus ?? null,
        event.method,
        event.authority,
        event.at,
      );
    if (event.at > this.#lastEventAt) this.#lastEventAt = event.at;
  }

  memoryEvents(memoryId: string): MemoryEvent[] {
    const rows = this.#db
      .prepare("SELECT * FROM memory_events WHERE memory_id = ? ORDER BY at, id")
      .all(memoryId) as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => memoryEventFromRow(r));
  }

  allMemoryEvents(): MemoryEvent[] {
    const rows = this.#db
      .prepare("SELECT * FROM memory_events ORDER BY at, id")
      .all() as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => memoryEventFromRow(r));
  }

  setAnchors(memoryId: string, entityIds: string[]): void {
    transaction(this.#db, () => {
      this.#db.prepare("DELETE FROM anchors WHERE memory_id = ?").run(memoryId);
      const ins = this.#db.prepare("INSERT INTO anchors (memory_id, entity_id) VALUES (?, ?)");
      for (const id of entityIds) ins.run(memoryId, id);
    });
  }

  anchorsOf(memoryId: string): string[] {
    return (
      this.#db
        .prepare("SELECT entity_id FROM anchors WHERE memory_id = ? ORDER BY entity_id")
        .all(memoryId) as unknown as Array<{ entity_id: string }>
    ).map((r) => r.entity_id);
  }

  listMemoryEntries(status?: MemoryStatus): MemoryListRow[] {
    const publishedGen =
      (
        this.#db
          .prepare("SELECT COALESCE(published_gen, 0) AS g FROM generations WHERE source = ?")
          .get(MEMORY_SOURCE) as { g: number } | undefined
      )?.g ?? 0;
    const sql =
      `SELECT m.entity_id AS entityId, e.name AS name, m.gist AS gist, m.origin AS origin,
              m.authority AS authority, m.status AS status,
              (SELECT short FROM handles h WHERE h.entity_id = m.entity_id AND h.facet IS NULL LIMIT 1) AS handle
       FROM memory m JOIN entities e ON e.id = m.entity_id
       WHERE e.gen <= ?` +
      (status ? " AND m.status = ?" : "") +
      " ORDER BY e.last_verified DESC, m.entity_id";
    const params: Array<string | number> = status ? [publishedGen, status] : [publishedGen];
    return this.#db.prepare(sql).all(...params) as unknown as MemoryListRow[];
  }

  // ---- fts (contentless; rowid keyed to entities.rowid) ----

  #entityRowid(entityId: string): number | undefined {
    const row = this.#db.prepare("SELECT rowid FROM entities WHERE id = ?").get(entityId) as
      | { rowid: number }
      | undefined;
    return row?.rowid;
  }

  ftsIndex(entityId: string, doc: { name: string; text: string; kind: string }): void {
    const rowid = this.#entityRowid(entityId);
    if (rowid === undefined) throw new Error(`fts index before entity upsert: ${entityId}`);
    transaction(this.#db, () => {
      this.#db.prepare("DELETE FROM fts WHERE rowid = ?").run(rowid);
      this.#db
        .prepare("INSERT INTO fts (rowid, name, text, kind, entity_id) VALUES (?, ?, ?, ?, ?)")
        .run(rowid, doc.name, doc.text, doc.kind, entityId);
    });
  }

  ftsRemove(entityId: string): void {
    const rowid = this.#entityRowid(entityId);
    if (rowid !== undefined) this.#db.prepare("DELETE FROM fts WHERE rowid = ?").run(rowid);
  }

  ftsSearch(match: string, limit = 20): FtsHit[] {
    try {
      const rows = this.#db
        .prepare(
          `SELECT e.id AS entity_id, f.rank AS rank
           FROM fts f JOIN entities e ON e.rowid = f.rowid
           WHERE fts MATCH ? ORDER BY f.rank LIMIT ?`,
        )
        .all(match, limit) as unknown as Array<{ entity_id: string; rank: number }>;
      return rows.map((r) => ({ entityId: r.entity_id, rank: r.rank }));
    } catch {
      return []; // malformed FTS5 query syntax — recoverable, selection owns query building
    }
  }

  // ---- cursors ----

  getCursor(source: string): Cursor | undefined {
    const row = this.#db.prepare("SELECT * FROM cursors WHERE source = ?").get(source) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return {
      source: row.source as string,
      position: (row.position as string | null) ?? undefined,
      freshness: (row.freshness as number | null) ?? undefined,
      gen: (row.gen as number | null) ?? undefined,
    };
  }

  setCursor(source: string, position: string, freshness: number, gen: number): void {
    this.#db
      .prepare(
        `INSERT INTO cursors (source, position, freshness, gen) VALUES (?, ?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET
           position = excluded.position, freshness = excluded.freshness, gen = excluded.gen`,
      )
      .run(source, position, freshness, gen);
  }

  // ---- generations (§4 publish protocol) ----

  beginGeneration(source: string): number {
    return transaction(this.#db, () => {
      this.#db
        .prepare("INSERT OR IGNORE INTO generations (source, published_gen) VALUES (?, 0)")
        .run(source);
      const row = this.#db
        .prepare("SELECT published_gen, building_gen FROM generations WHERE source = ?")
        .get(source) as { published_gen: number; building_gen: number | null };
      // Resuming an interrupted build reuses its gen (resumable ingest, §4).
      const building = row.building_gen ?? row.published_gen + 1;
      this.#db
        .prepare("UPDATE generations SET building_gen = ? WHERE source = ?")
        .run(building, source);
      return building;
    });
  }

  publishGeneration(source: string): void {
    transaction(this.#db, () => {
      const row = this.#db
        .prepare("SELECT building_gen FROM generations WHERE source = ?")
        .get(source) as { building_gen: number | null } | undefined;
      if (!row || row.building_gen === null) {
        throw new Error(`publishGeneration without beginGeneration for source: ${source}`);
      }
      this.#db
        .prepare("UPDATE generations SET published_gen = ?, building_gen = NULL WHERE source = ?")
        .run(row.building_gen, source);
    });
  }

  publishedGen(source: string): number {
    const row = this.#db
      .prepare("SELECT published_gen FROM generations WHERE source = ?")
      .get(source) as { published_gen: number } | undefined;
    return row?.published_gen ?? 0;
  }

  // ---- lease (§4.5: CAS in meta, TTL, stealable on expiry) ----

  acquireLease(holder: string, ttlMs = LEASE_TTL_MS): LeaseResult {
    return transaction(this.#db, () => {
      const now = this.#now();
      const current = this.#leaseUnlocked();
      if (current && current.holder !== holder && current.expiresAt > now) {
        return { acquired: false, lease: current };
      }
      const lease: LeaseState = { holder, expiresAt: now + ttlMs };
      this.#db
        .prepare(
          "INSERT INTO meta (key, value) VALUES ('lease', ?) " +
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(JSON.stringify(lease));
      return { acquired: true, lease };
    });
  }

  releaseLease(holder: string): void {
    transaction(this.#db, () => {
      const current = this.#leaseUnlocked();
      if (current && current.holder === holder) {
        this.#db.prepare("DELETE FROM meta WHERE key = 'lease'").run();
      }
    });
  }

  currentLease(): LeaseState | undefined {
    return this.#leaseUnlocked();
  }

  #leaseUnlocked(): LeaseState | undefined {
    const row = this.#db.prepare("SELECT value FROM meta WHERE key = 'lease'").get() as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as LeaseState) : undefined;
  }

  // ---- handles ----

  internHandle(entityId: string, facet?: Facet): string {
    for (let len = HANDLE_MIN_LEN; len <= 128; len++) {
      const candidate = shortHandleCandidate(entityId, facet, len);
      const existing = this.#db
        .prepare("SELECT entity_id, facet FROM handles WHERE short = ?")
        .get(candidate) as { entity_id: string; facet: string | null } | undefined;
      if (!existing) {
        this.#db
          .prepare("INSERT INTO handles (short, entity_id, facet) VALUES (?, ?, ?)")
          .run(candidate, entityId, facet ?? null);
        return candidate;
      }
      if (existing.entity_id === entityId && (existing.facet ?? undefined) === facet) {
        return candidate;
      }
      // collision: bump prefix length 5→6→7… (P28 addenda)
    }
    throw new Error(`handle space exhausted for ${entityId}`); // unreachable in practice
  }

  resolveHandle(input: string): { entityId: string; facet: Facet | undefined } | undefined {
    const parsed = parseHandle(input);
    if (!parsed) return undefined;
    if (parsed.form === "verbatim") {
      return this.getEntity(parsed.key) ? { entityId: parsed.key, facet: parsed.facet } : undefined;
    }
    const row = this.#db
      .prepare("SELECT entity_id, facet FROM handles WHERE short = ?")
      .get(parsed.key) as { entity_id: string; facet: string | null } | undefined;
    return row
      ? { entityId: row.entity_id, facet: (row.facet ?? undefined) as Facet | undefined }
      : undefined;
  }

  // ---- meta ----

  getMeta(key: string): string | undefined {
    const row = this.#db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.#db
      .prepare(
        "INSERT INTO meta (key, value) VALUES (?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  transaction<T>(fn: () => T): T {
    return transaction(this.#db, fn);
  }

  // ---- read-through ----

  readThrough(entityId: string): ReadThroughResult {
    const entity = this.getEntity(entityId);
    if (!entity) return { ok: false, reason: "no-entity", message: `unknown entity: ${entityId}` };
    return this.resolveLocator(entity.locator, entity.contentHash, entityId);
  }

  resolveLocator(locator: Locator, contentHash?: string, entityId?: string): ReadThroughResult {
    switch (locator.t) {
      case "file": {
        const host: ReadThroughHost = {
          projectRoot: this.projectRoot,
          isKnownEntityPath: (path) => this.#isKnownEntityPath(path),
        };
        const result = readFileLocator(host, locator);
        if (!result.ok) return result;
        // Staleness check (§3): every resolver re-checks content_hash; drift →
        // entity's links flagged, serve discloses.
        let drift = false;
        if (contentHash !== undefined && result.fullText !== undefined) {
          drift = blake2bHex(result.fullText) !== contentHash;
          if (drift && entityId !== undefined) this.flagLinksStale(entityId);
        }
        return { ok: true, text: result.text, drift, via: "file" };
      }
      case "git":
        return readGitLocator(this.projectRoot, locator);
      case "store": {
        if (entityId === undefined) {
          return { ok: false, reason: "no-entity", message: "store locator needs an entity id" };
        }
        const mem = this.getMemory(entityId);
        if (!mem) {
          return { ok: false, reason: "not-found", message: `no memory row for ${entityId}` };
        }
        return {
          ok: true,
          text: mem.detail ? `${mem.gist}\n\n${mem.detail}` : mem.gist,
          drift: false,
          via: "store",
        };
      }
      case "snapshot":
        return readSnapshotLocator();
    }
  }

  #isKnownEntityPath(path: string): boolean {
    const row = this.#db
      .prepare(
        "SELECT 1 AS hit FROM entities WHERE json_extract(locator, '$.t') = 'file' AND json_extract(locator, '$.path') = ? LIMIT 1",
      )
      .get(path.split("\\").join("/"));
    return row !== undefined;
  }
}

/**
 * Open (creating + migrating if needed) the store for a project directory.
 * Shard resolution is worktree-aware (§3); the DB lives under `home`, so store
 * data survives worktree deletion.
 */
export function openStore(opts: OpenStoreOptions = {}): Store {
  const res = resolveShard(opts.projectDir ?? process.cwd());
  const home = opts.home ?? ctxHome();
  mkdirSync(shardDir(res.shard, home), { recursive: true });
  const dbPath = storePath(res.shard, home);
  const db = openDatabase(dbPath);
  runMigrations(db);
  const store = new SqliteStore(db, dbPath, res, opts.now ?? Date.now);
  if (store.getMeta("project_root") === undefined) store.setMeta("project_root", res.mainRoot);
  return store;
}

/**
 * Open an EXISTING store strictly read-only (F-C4-3 / `ctx doctor`): never mkdirs
 * the shard, never runs migrations, never writes `project_root` meta — a doctor
 * run on a fresh checkout must leave ZERO traces. Throws when the store file is
 * absent (the caller reports an advisory "memory ops unavailable"). The schema is
 * whatever is on disk; the caller must not read columns a stale schema may lack
 * (doctor checks `schema_version` first and never upgrades).
 */
export function openStoreReadOnly(opts: OpenStoreOptions = {}): Store {
  const res = resolveShard(opts.projectDir ?? process.cwd());
  const home = opts.home ?? ctxHome();
  const dbPath = storePath(res.shard, home);
  if (!existsSync(dbPath)) {
    throw new Error(`no memory store at ${dbPath}`);
  }
  const db = openDatabaseReadOnly(dbPath);
  return new SqliteStore(db, dbPath, res, opts.now ?? Date.now);
}

function entityFromRow(row: EntityRow): Entity {
  return {
    id: row.id,
    kind: row.kind as Entity["kind"],
    name: row.name,
    locator: JSON.parse(row.locator) as Locator,
    contentHash: row.content_hash ?? undefined,
    sourceRev: row.source_rev ?? undefined,
    attrs: JSON.parse(row.attrs) as Record<string, unknown>,
    firstSeen: row.first_seen,
    lastVerified: row.last_verified,
    gen: row.gen,
  };
}

function claimFromRow(row: Record<string, unknown>): Claim {
  return {
    id: row.id as number,
    subject: row.subject as string,
    predicate: row.predicate as string,
    object: (row.object as string | null) ?? undefined,
    carrier: row.carrier as string,
    locus: (row.locus as string | null) ?? undefined,
    method: row.method as Claim["method"],
    authority: row.authority as Claim["authority"],
    at: row.at as number,
    gen: row.gen as number,
  };
}

function memoryEventFromRow(row: Record<string, unknown>): MemoryEvent {
  return {
    id: row.id as string,
    memoryId: row.memory_id as string,
    verb: row.verb as MemoryEvent["verb"],
    actor: row.actor as string,
    reason: (row.reason as string | null) ?? undefined,
    refs: JSON.parse((row.refs as string) ?? "{}") as Record<string, unknown>,
    carrier: row.carrier as string,
    locus: (row.locus as string | null) ?? undefined,
    method: row.method as MemoryEvent["method"],
    authority: row.authority as MemoryEvent["authority"],
    at: row.at as number,
  };
}

function linkFromRow(row: Record<string, unknown>): Link {
  return {
    src: row.src as string,
    dst: row.dst as string,
    predicate: row.predicate as string,
    method: row.method as Link["method"],
    confidence: row.confidence as number,
    claimId: (row.claim_id as number | null) ?? undefined,
    verifiedAt: row.verified_at as number,
    stale: (row.stale as number) === 1,
  };
}
