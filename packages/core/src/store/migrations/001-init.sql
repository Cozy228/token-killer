-- 001-init: ctx store spine DDL, verbatim from CTX-IMPL §2 (authoritative).
-- Forward-only; runs inside one transaction owned by the migration runner
-- (PRAGMA journal_mode lives in connection bootstrap, not here — WAL cannot be
-- switched inside a transaction).

CREATE TABLE entities (
  id            TEXT PRIMARY KEY,   -- "<kind>:<stable-key>", see §3
  kind          TEXT NOT NULL,      -- symbol|file|module|commit|pr|issue|decision|doc_section|
                                    -- story|meeting|memory|concept
  name          TEXT NOT NULL,
  locator       TEXT NOT NULL,      -- JSON Locator (§3); read-through address (index-not-copy, P25①)
  content_hash  TEXT,               -- staleness check for file-backed entities
  source_rev    TEXT,               -- git tip / snapshot date / write time
  attrs         TEXT NOT NULL DEFAULT '{}',
  first_seen    INTEGER NOT NULL,
  last_verified INTEGER NOT NULL,
  gen           INTEGER NOT NULL
);
CREATE INDEX entities_kind_name ON entities(kind, name);

-- Append-only. Every extracted fact lands here first, provenance intact.
CREATE TABLE claims (
  id        INTEGER PRIMARY KEY,
  subject   TEXT NOT NULL,          -- entity id
  predicate TEXT NOT NULL,
  object    TEXT,                   -- entity id or JSON scalar
  carrier   TEXT NOT NULL,          -- git|files|tree-sitter|scip|github|jira|confluence|remember|host:<h>
  locus     TEXT,                   -- where inside the carrier (commit oid, file#Lx, api path)
  method    TEXT NOT NULL,          -- explicit-key|path-match|symbol-match|rename-tracked|
                                    -- structural|semantic-proposal
  authority TEXT NOT NULL CHECK (authority IN ('observed','derived','inferred','confirmed')),
  at        INTEGER NOT NULL,
  gen       INTEGER NOT NULL
);
CREATE INDEX claims_subject ON claims(subject, predicate);

-- Resolved current view (claims -> arbitration -> links). Selection reads THIS, never claims.
CREATE TABLE links (
  src TEXT NOT NULL, dst TEXT NOT NULL, predicate TEXT NOT NULL,
  method TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1.0,
  claim_id INTEGER,                 -- provenance back-pointer
  verified_at INTEGER NOT NULL, stale INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (src, predicate, dst)
);
CREATE INDEX links_dst ON links(dst, predicate);

CREATE TABLE conflicts (
  a INTEGER NOT NULL, b INTEGER NOT NULL,      -- claim ids
  kind TEXT NOT NULL,                          -- contradiction|sameAsCandidate|stale-suspect
  status TEXT NOT NULL DEFAULT 'open',         -- open|resolved|dismissed
  PRIMARY KEY (a, b)
);

CREATE TABLE memory (
  entity_id    TEXT PRIMARY KEY REFERENCES entities(id),
  gist         TEXT NOT NULL,                  -- hard cap 240 chars, enforced at write
  detail       TEXT,
  origin       TEXT NOT NULL,                  -- remember|host-import:<host>|human-note
  session_ref  TEXT,
  authority    TEXT NOT NULL,                  -- inferred|confirmed
  status       TEXT NOT NULL DEFAULT 'active', -- active|needs-review|superseded|retired
  served_count INTEGER NOT NULL DEFAULT 0,
  last_served  INTEGER
);
CREATE TABLE anchors (memory_id TEXT NOT NULL, entity_id TEXT NOT NULL,
                      PRIMARY KEY (memory_id, entity_id));

-- Contentless FTS (index-not-copy): text is indexed, never stored; serve does locator read-through.
-- fts.rowid is keyed to entities.rowid (contentless tables store no column values,
-- so the join back to the entity id goes through the shared rowid).
CREATE VIRTUAL TABLE fts USING fts5(
  name, text, kind UNINDEXED, entity_id UNINDEXED,
  content='', contentless_delete=1,
  tokenize = "unicode61 tokenchars '_$'"
);

CREATE TABLE handles (short TEXT PRIMARY KEY, entity_id TEXT NOT NULL, facet TEXT);

CREATE TABLE cursors     (source TEXT PRIMARY KEY, position TEXT, freshness INTEGER, gen INTEGER);
CREATE TABLE generations (source TEXT PRIMARY KEY, published_gen INTEGER NOT NULL DEFAULT 0,
                          building_gen INTEGER);
-- meta is bootstrapped by the migration runner (it stores schema_version, the
-- chicken for this egg) — IF NOT EXISTS keeps this file self-sufficient too.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);  -- schema_version, lease, project_root
