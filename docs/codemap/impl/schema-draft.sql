-- [2026-07-04 P28] SUPERSEDED by CTX-IMPL.md §2 DDL (entities/claims/links/conflicts/memory/anchors/fts/handles/cursors/generations/meta). Kept for archaeology only.

-- codemap serving-tier schema — DRAFT for Slice 1 (#73 → src/codemap/db/schema.sql)
-- Authority: ADR 0041 (+ A2/A3/C5–C9 verbatim base). node:sqlite DatabaseSync.
--
-- APPLY ORDER (db/open.ts) — NOT a single transaction (ADR 0041 §2/§16):
--   (1) Connection PRAGMAs, ordered (C4 §14): busy_timeout FIRST → journal_mode=WAL
--       → foreign_keys=ON → synchronous=NORMAL
--   (2) CORE schema below, in ONE transaction (everything down to schema_versions).
--   (3) FTS schema (bottom block) SEPARATELY, wrapped in try/catch: if the user's
--       Node SQLite lacks FTS5, CREATE VIRTUAL TABLE throws — catch it, set
--       ftsAvailable=false, DO NOT roll back the core schema (C7 LIKE fallback).
-- Migrations are additive ALTER-only (C9). NEVER VACUUM (ADR 0041 §12): nodes_fts is
-- external-content keyed on rowid; VACUUM renumbers rowids and silently desyncs search.
--
-- IMPORTANT (ADR 0041 §1, SQLite quirk): in a rowid table, `TEXT PRIMARY KEY` is NOT
-- implicitly NOT NULL — an INSERT omitting it writes id IS NULL. Every TEXT PK below is
-- therefore declared `TEXT NOT NULL PRIMARY KEY` to hold the identity/catalog/KV invariant.

-- ═════════════════════════════ CORE SCHEMA (one transaction) ═════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- nodes — code/doc/concept symbols, each with a resolvable file:line span (J1)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nodes (
    id               TEXT NOT NULL PRIMARY KEY,   -- sha256(repo_rel_posix_path, kind, qualified_name, descriptor); NEVER line/span/content (§1)
    kind             TEXT NOT NULL,      -- TS-const enum, no CHECK (§13); codegraph-verbatim 22: file|module|class|struct|interface|trait|protocol|function|method|property|field|variable|constant|enum|enum_member|type_alias|namespace|parameter|import|export|route|component (tk doc/concept add with D-layer slices)
    name             TEXT NOT NULL,
    qualified_name   TEXT NOT NULL,
    file_path        TEXT NOT NULL,      -- repo-relative, POSIX separators
    language         TEXT NOT NULL,
    start_line       INTEGER NOT NULL,   -- J1 trust primitive: file:line:col never null
    end_line         INTEGER NOT NULL,
    start_column     INTEGER NOT NULL,
    end_column       INTEGER NOT NULL,
    docstring        TEXT,
    signature        TEXT,
    visibility       TEXT,
    is_exported      INTEGER NOT NULL DEFAULT 0,
    is_async         INTEGER NOT NULL DEFAULT 0,
    is_static        INTEGER NOT NULL DEFAULT 0,
    is_abstract      INTEGER NOT NULL DEFAULT 0,
    decorators       TEXT,               -- JSON array
    type_parameters  TEXT,               -- JSON array
    return_type      TEXT,
    node_hash        TEXT,               -- sha256 of node source SPAN (E6); ≠ files.content_hash (§9)
    confidence       REAL NOT NULL DEFAULT 1.0,        -- D26 hot-path soft factor (§5)
    provenance       TEXT NOT NULL DEFAULT 'static',   -- static|llm|template (B field-level; §4)
    version          INTEGER NOT NULL DEFAULT 1,       -- bumps only for regenerated llm|template nodes
    metadata         TEXT,               -- JSON: non-hot-path extras (doc format, narrative source) (§6)
    index_generation INTEGER NOT NULL DEFAULT 0,       -- per-row last-written generation pointer (§3; see edges note)
    updated_at       INTEGER NOT NULL    -- epoch-ms
);
CREATE INDEX IF NOT EXISTS idx_nodes_kind           ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_name           ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_qualified_name ON nodes(qualified_name);
CREATE INDEX IF NOT EXISTS idx_nodes_file_path      ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_file_line      ON nodes(file_path, start_line);
CREATE INDEX IF NOT EXISTS idx_nodes_lower_name     ON nodes(lower(name));
CREATE INDEX IF NOT EXISTS idx_nodes_provenance     ON nodes(provenance);

-- ─────────────────────────────────────────────────────────────────────────────
-- edges — typed relationships; heuristic edges provenance-tagged (J2)
--
-- GENERATION INVARIANT (ADR 0041 §P2): serving tables hold the CURRENT published
-- generation ONLY. `index_generation` is a per-row "last-written" pointer for
-- incremental staleness pre-filtering (E2) — it does NOT let multiple generations
-- coexist here, which is why it is deliberately OUT of the UNIQUE key. Incremental
-- refresh = delete a file's rows then reinsert (no conflict). D32 staging / multi-
-- generation publish uses SEPARATE staging tables, never these.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS edges (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source           TEXT NOT NULL,
    target           TEXT NOT NULL,
    kind             TEXT NOT NULL,      -- TS-const enum (§13); codegraph-verbatim 12: contains|calls|imports|exports|extends|implements|references|type_of|returns|instantiates|overrides|decorates (tk describes/semantic_impact add with doc/Evidence slices)
    line             INTEGER NOT NULL DEFAULT 0,   -- NOT NULL so UNIQUE dedupes (SQLite NULLs distinct; §10)
    col              INTEGER NOT NULL DEFAULT 0,
    confidence       REAL,               -- D26 soft factor; null = certain/structural (§5)
    provenance       TEXT,               -- tree-sitter|scip|heuristic; null = unannotated (§4)
    metadata         TEXT,               -- JSON: synthesizedBy/registeredAt (J3)
    index_generation INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE (source, target, kind, line, col)   -- current-gen-only; writes use INSERT OR IGNORE (delete+reinsert per file on incremental)
);
-- narrow source-only / target-only indexes omitted: (source,kind)/(target,kind) cover them via left-prefix scan
CREATE INDEX IF NOT EXISTS idx_edges_kind        ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_source_kind ON edges(source, kind);
CREATE INDEX IF NOT EXISTS idx_edges_target_kind ON edges(target, kind);
CREATE INDEX IF NOT EXISTS idx_edges_provenance  ON edges(provenance);

-- ─────────────────────────────────────────────────────────────────────────────
-- files — ONE per-file table (merges old files + file_fingerprint; §7)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
    path             TEXT NOT NULL PRIMARY KEY,   -- repo-relative, POSIX (§1: TEXT PK needs explicit NOT NULL)
    content_hash     TEXT NOT NULL,      -- sha256 hex of WHOLE file (E4 reindex-skip); ≠ nodes.node_hash (§9)
    language         TEXT NOT NULL,
    size             INTEGER NOT NULL,
    mtime_ns         INTEGER NOT NULL,
    struct_json      TEXT,               -- AST structural fingerprint (E5); null if no parser
    node_count       INTEGER NOT NULL DEFAULT 0,
    errors           TEXT,               -- JSON array; holds id-collision diagnostics (§2)
    index_generation INTEGER NOT NULL DEFAULT 0,
    indexed_at       INTEGER NOT NULL    -- epoch-ms
);

-- ─────────────────────────────────────────────────────────────────────────────
-- unresolved_refs — external/unresolved targets; never dangling edges (§15)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unresolved_refs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    from_node_id   TEXT NOT NULL,
    reference_name TEXT NOT NULL,
    reference_kind TEXT NOT NULL,
    line           INTEGER NOT NULL,
    col            INTEGER NOT NULL,
    candidates     TEXT,                 -- JSON array
    file_path      TEXT NOT NULL DEFAULT '',
    language       TEXT NOT NULL DEFAULT 'unknown',
    FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- project_metadata — ONE kv table (merges old project_metadata + meta; §8)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_metadata (
    key        TEXT NOT NULL PRIMARY KEY,   -- 'indexCommit'|'currentGeneration'|'schemaVersion'|... (§1: TEXT PK needs explicit NOT NULL)
    value      TEXT NOT NULL,               -- NULL value has no valid KV semantics; to clear, DELETE the key (§19)
    updated_at INTEGER NOT NULL          -- epoch-ms
);

-- ─────────────────────────────────────────────────────────────────────────────
-- schema_versions — additive-only migration ledger (C9); seed version 1 at create
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_versions (
    version     INTEGER PRIMARY KEY,     -- INTEGER PK = rowid alias = implicitly NOT NULL
    applied_at  INTEGER NOT NULL,        -- epoch-ms
    description TEXT
);

-- ═══════════════ FTS SCHEMA — SEPARATE APPLY STEP, best-effort, catchable ═══════════════
-- Apply OUTSIDE the core transaction. If CREATE VIRTUAL TABLE throws (Node SQLite built
-- without FTS5), catch → ftsAvailable=false → core schema stays intact → retrieval falls
-- back to LIKE scan (C7). The 3 triggers belong to this block: they reference nodes_fts,
-- so they must NOT be created when FTS5 is unavailable.

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id, name, qualified_name, docstring, signature,
    content='nodes', content_rowid='rowid',
    tokenize='porter unicode61'
);  -- query: bm25(nodes_fts, 0, 20, 5, 1, 2)  (id=0,name=20,qname=5,docstring=1,signature=2)
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, id, name, qualified_name, docstring, signature)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.qualified_name, NEW.docstring, NEW.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, qualified_name, docstring, signature)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.qualified_name, OLD.docstring, OLD.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, qualified_name, docstring, signature)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.qualified_name, OLD.docstring, OLD.signature);
    INSERT INTO nodes_fts(rowid, id, name, qualified_name, docstring, signature)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.qualified_name, NEW.docstring, NEW.signature);
END;
