# codemap serving-tier schema: id derivation, table consolidation, no VACUUM

Pins the SQLite **serving-tier** schema that Slice 1 (`#73`, `src/codemap/db/schema.sql`) lays down — the
foundation every later slice reads. Settles identity-shaped decisions (expensive to retrofit) and
resolves several table overlaps / wording conflicts the action plan left open. Refined together with a
parallel review (codex) on the shared `feat/1.0.0` branch.

Scope follows D18: **serving tier now** (`nodes`/`edges` that ranking/behavior/projection read), **claim +
arbitration tier later** (its own slice, layered *upstream* of the serving tier — a clean addition, not a
retrofit). Migrations are additive ALTER-only (C9), so non-identity columns can grow later without a rebuild.

## Tables in `#73` (and only these)

`nodes` · `edges` · `nodes_fts` (+3 sync triggers) · `files` · `unresolved_refs` · `project_metadata` ·
`schema_versions`.

**Deferred to later slices (NOT in `#73`):** `fact_claims`, `arbitration_decisions`, `decision_claims`,
`identity_bindings`, `dependency_index`, lease/staging tables, and any embedding/vector schema. The
serving tier reads stay stable when these land upstream (D18).

## Decisions

1. **`nodes.id = sha256(repo_rel_posix_path, kind, qualified_name, descriptor)`** — **never** `start_line`,
   span, or content hash. Path is **repo-relative, POSIX-separated** (machine-independent: the same repo
   indexed on macOS and the Windows box must produce identical ids). `descriptor` = a normalized
   signature/param-arity **only for callable kinds** (overload disambiguation), empty otherwise
   (`qualified_name` already encodes scope). Excluding line means a body edit preserves the id → E5/E8
   incremental stays incremental; a rename/move is correctly a delete+add.
   *Supersedes J1's `hash(filePath '::' qualifiedName)`* (added `kind`; added an overload story).

2. **id collision policy = loud, scoped, never merged.** If two distinct symbols derive the same id, record
   a diagnostic to the existing **`files.errors`** JSON column, **skip the colliding node, and continue** —
   never silently merge two symbols into one row, never invent a new diagnostic table, never abort the
   whole index over one pathological symbol. (`descriptor` makes true collisions near-impossible; this is
   the safety net.)

3. **`index_generation INTEGER NOT NULL DEFAULT 0` on `nodes` AND `edges`** now. It is a
   *published-generation pointer* (D32 — full generation identity is the tuple
   `(repo revision, worktree digest, schema version, analysis policy version)`); the lease / staging /
   atomic-publish machinery is deferred, but the column ships now because retrofitting it touches every row.

4. **Dual `provenance` semantics, J2 authoritative:** `nodes.provenance ∈ {static, llm, template}`
   (field-level B; DEFAULT `'static'`; retrieval filters `='static'`); `edges.provenance ∈
   {tree-sitter, scip, heuristic}` (nullable; null = unannotated). **Rescinds C6's `resolver-derived` /
   `literal` wording** — same column name, two unrelated enums on two tables; do not conflate.

5. **`confidence REAL` is a typed column**, not JSON — on `nodes` (DEFAULT `1.0`) and `edges` (nullable).
   D26 makes confidence a hot-path soft ranking factor; burying it in JSON would force a per-row parse in
   `ORDER BY`/`WHERE`. General rule: **anything the retrieval/ranking path sorts or filters on → typed
   column; display/explain extras → JSON `metadata`.**

6. **`nodes.metadata TEXT`** (JSON, nullable) carries the non-hot-path extras (doc `format`, narrative
   source, etc.). `edges.metadata` already exists for `synthesizedBy`/`registeredAt` (J3).

7. **Merge `files` + `file_fingerprint` into one `files` table.** The plan had both carrying
   `path`+`content_hash`+mtime; two owners of the file hash/mtime guarantees drift. One table:
   `path, content_hash, language, size, mtime_ns, struct_json, node_count, errors, index_generation, indexed_at`.

8. **Merge `project_metadata` + `meta` into one `project_metadata(key, value, updated_at)`; drop `meta`.**
   Two key-value tables for the same job is needless. Holds `indexCommit` / `currentGeneration` /
   `schemaVersion`. No embedding slots designed now — KV/`metadata` already absorbs any future need.

9. **Rename the node-span hash to `nodes.node_hash`.** `files.content_hash` = hash of the **whole file**
   (drives reindex-skip, E4); `nodes.node_hash` = hash of the **node's source span** (drives per-symbol
   change, E6). Same name for two scopes invites misread; rename in greenfield is free.

10. **`edges` dedupe: `line` and `col` are `NOT NULL DEFAULT 0`, plus `UNIQUE(source, target, kind, line,
    col)`.** SQLite treats NULLs as distinct in UNIQUE constraints, so nullable line/col would defeat
    dedupe; incremental re-add (Slice 5) must not accumulate duplicate edges (inflates callers/impact → J).
    Writes use `INSERT OR IGNORE`.

11. **Timestamps are epoch-ms `INTEGER` everywhere.** The pre-merge tables mixed `INTEGER` and ISO8601
    `TEXT`; the `files` merge forces one convention — INTEGER (cheaper compare, no parse).

12. **No `VACUUM` on this database — OVERRIDES C10's manual `VACUUM`+`ANALYZE`.** `nodes_fts` is an
    external-content FTS5 table keyed on `nodes.rowid`; `VACUUM` renumbers rowids and **silently** desyncs
    search from data (no error, just wrong results after a maintenance op). Reclaim space by rebuilding the
    DB instead. C10 keeps only `PRAGMA optimize` + `wal_checkpoint(PASSIVE)`.

13. **`kind` / edge `kind` are `TEXT` with NO `CHECK` constraint.** The enum lives in a TypeScript const +
    a schema test (a `CHECK` change would force a SQLite table rebuild, violating C9 additive-only).
    **Reconciled against codegraph `src/types.ts` verbatim (re-cloned 2026-06-24 → `.research/codegraph`):**
    - **NODE_KINDS = 22 (verbatim):** `file, module, class, struct, interface, trait, protocol, function,
      method, property, field, variable, constant, enum, enum_member, type_alias, namespace, parameter,
      import, export, route, component`.
    - **EdgeKind = 12 (verbatim):** `contains, calls, imports, exports, extends, implements, references,
      type_of, returns, instantiates, overrides, decorates`.
    - **`#73` ships exactly these (codegraph base).** tk-layer additions — node `doc`/`concept` (D5 Domain),
      edge `describes`/`semantic_impact` (doc / Evidence-impact) — are added with their producing slices
      (8/9/10), additively (TEXT column, no migration). Listing them in `#73` would declare kinds with no
      producer.
    - **Correction recorded:** an earlier draft of this ADR listed "Edge kinds = 11" including
      `defines/accesses/describes/semantic_impact` — those were copied from C6's hand-written comment, **not**
      from codegraph, and `exports/type_of/returns/instantiates/decorates` were missing. Both C6's comment and
      the reconstruction were wrong; the verbatim `src/types.ts` above is the single truth. (This is the case
      for keeping `.research/` clones local — see ADR tail.)

14. **Connection PRAGMAs per C4 (unchanged), applied in `db/open.ts` not the schema:** `busy_timeout`
    **first**, then `journal_mode=WAL`, `foreign_keys=ON` (required for edge CASCADE — node:sqlite defaults
    OFF), `synchronous=NORMAL`.

15. **Unresolved / external references go to `unresolved_refs`** (with candidates), never a dangling edge
    and never a synthetic target node. (Edges FK-CASCADE to `nodes`, so a dangling target is rejected anyway.)

16. **Every `TEXT PRIMARY KEY` is declared `TEXT NOT NULL PRIMARY KEY`.** SQLite quirk: in a rowid table a
    `TEXT PRIMARY KEY` is *not* implicitly `NOT NULL` (only `INTEGER PRIMARY KEY` / `WITHOUT ROWID` are), so
    an INSERT omitting it writes `id IS NULL` and silently breaks the identity / file-catalog / KV
    invariant. Applies to `nodes.id`, `files.path`, `project_metadata.key`. (Verified by executing the DDL.)

17. **The FTS schema is a SEPARATE, catchable apply step — not part of the core transaction.** `nodes_fts`
    + its 3 triggers are created *after* the core tables commit, wrapped in try/catch. If the user's Node
    SQLite was built without FTS5, `CREATE VIRTUAL TABLE` throws; catching it sets `ftsAvailable=false` and
    leaves the core schema intact so retrieval falls back to LIKE scan (C7). The triggers reference
    `nodes_fts`, so they live in this block and are skipped when FTS5 is absent. (A single-transaction apply
    would have failed the *whole* init before reaching the fallback.)

18. **Generation invariant: serving tables hold the CURRENT published generation only.** `index_generation`
    is a per-row "last-written" pointer for incremental staleness pre-filtering (E2); it does **not** let
    multiple generations coexist in `nodes`/`edges`, which is why it is deliberately **out** of the edges
    `UNIQUE` key. Incremental refresh = delete a file's rows then reinsert (no UNIQUE conflict). D32 staging
    / multi-generation atomic publish uses **separate staging tables**, never the serving tables. This
    invariant must be stated in `#73` so nothing later assumes multi-generation coexistence here.

19. **`project_metadata.value` is `TEXT NOT NULL`.** A KV row whose value is NULL has no valid semantics for
    `indexCommit` / `currentGeneration` / `schemaVersion` — it only defers the failure to every reader. To
    clear an entry, `DELETE` the key, never write a NULL value. (Verified: an INSERT omitting `value`
    succeeded.)

> **Corrections folded in from a parallel review (codex) that *executed* the draft DDL:** §16 (TEXT PK is
> nullable), §17 (FTS in-transaction would break the LIKE fallback), §18 (edges UNIQUE excludes
> `index_generation` → needs the current-gen-only invariant stated), §19 (`project_metadata.value` nullable).
> All four were real; none were caught by reading alone.

## Consequences

- Final mental model is **fewer tables and fewer sync paths than the original plan**, with extensibility
  preserved three ways: typed columns for the hot path, JSON `metadata` for extras, TS const + test for
  enum evolution.
- The exact full node-kind list is **not blocking** for `#73`: `TEXT` column means it completes additively.
- D18/D32 upper tiers (claims, arbitration, lease, staging, generation tuple) attach later without touching
  any serving-tier reader.

## Status

Proposed (2026-06-24). Supersedes/rescinds in part: J1 (id formula), C6 (edge-provenance wording + the
edge-kind comment), C8 (`files`/`meta` table split), E2 (`file_fingerprint` as a separate table), C10
(manual VACUUM). Draft DDL: `docs/codemap/impl/schema-draft.sql`. Consumed by `#73` → `src/codemap/db/schema.sql`.

**Reference clones.** The `/tmp/tk-research/*` clones the plan cites get wiped on `/tmp` cleanup (codegraph
was already gone when this ADR's enums were first written, producing a fabricated edge-kind list). They are
now re-cloned under the repo's **gitignored `.research/`** dir (D24: personal, never published → no license
concern keeping them local) so every `源:` citation stays re-verifiable through the build. **12 of the 13 cited clones re-cloned
2026-06-24**, each verified by a cited file: codegraph, gitnexus, repodoc, repoagent, codewiki, davia,
deepwiki-open, opendeepwiki, graphify, `QuantaAlpha/RepoMaster`, `aimasteracc/tree-sitter-analyzer`,
`Lum1104/Understand-Anything`. **Unresolved: `code-graph-mcp`** (Rust, no confident `gh search` match) — its
only citation (the `meta` kv-table shape) is already absorbed into `project_metadata` (§8), so `#73` does
not depend on it; add the URL if found.
