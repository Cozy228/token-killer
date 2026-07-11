-- 006-r-slice-claim-integrity: the R-slice schema foundation (CONTEXA-IMPL §8;
-- Appendix A DR-02/05/06/09). Forward-only; one transaction owned by the runner.
--
-- Four independent schema deltas, all additive except the DR-09 column drop:
--   DR-02  split the 4-value `authority` provenance enum into two orthogonal
--          axes LAW §3 keeps separate: `derivation` (OBSERVED|DECLARED|INFERRED)
--          and `confidence` (CONFIRMED|LIKELY|POSSIBLE). Backfilled from
--          carrier+method+actor (NEVER the legacy enum, NEVER authorship alone).
--          `authority` is RETAINED as a compatibility shadow (see R-SLICE-NOTES
--          D-SHADOW) — derivation+confidence are the canonical trust fields.
--   DR-05  (schema half) `disclosure` permission class on memory, default 'local'.
--   DR-06  bind a published generation to the full D32 identity tuple: add
--          `identity`/`building_identity` to `generations`.
--   DR-09  drop the dead `served_count`/`last_served` memory columns (no writer).
--
-- The backfill CASE logic MIRRORS store/trust.ts::trustFor EXACTLY (kept in sync
-- by hand). CONFIRMED is never assigned at backfill (it requires independent
-- corroboration, which a single row cannot self-certify). Ambiguous rows stay
-- NULL derivation/NULL confidence = unknown, and never render as a likely fact.

-- ---- DR-02: claims ----
ALTER TABLE claims ADD COLUMN derivation TEXT;   -- OBSERVED|DECLARED|INFERRED|NULL(unknown)
ALTER TABLE claims ADD COLUMN confidence TEXT;   -- CONFIRMED|LIKELY|POSSIBLE|NULL(unknown)

UPDATE claims SET derivation = CASE
  WHEN carrier = 'migration' OR carrier = 'system' THEN NULL
  WHEN carrier LIKE 'host:%' OR carrier LIKE 'host-import:%' THEN 'DECLARED'
  WHEN carrier IN ('remember','remember-local','memory','cli') THEN 'DECLARED'
  WHEN method = 'semantic-proposal' THEN 'INFERRED'
  WHEN method = 'explicit-key' THEN 'DECLARED'
  WHEN method IN ('path-match','symbol-match','rename-tracked','structural') THEN 'OBSERVED'
  ELSE NULL END;
UPDATE claims SET confidence = CASE
  WHEN carrier = 'migration' OR carrier = 'system' THEN NULL
  WHEN carrier LIKE 'host:%' OR carrier LIKE 'host-import:%' THEN 'POSSIBLE'
  WHEN method = 'semantic-proposal' THEN 'POSSIBLE'
  WHEN derivation IN ('OBSERVED','DECLARED') THEN 'LIKELY'
  ELSE NULL END;

-- ---- DR-02: memory_events (append-only — drop the guards, backfill, restore) ----
DROP TRIGGER IF EXISTS memory_events_no_update;
DROP TRIGGER IF EXISTS memory_events_no_delete;

ALTER TABLE memory_events ADD COLUMN derivation TEXT;
ALTER TABLE memory_events ADD COLUMN confidence TEXT;

UPDATE memory_events SET derivation = CASE
  WHEN carrier = 'migration' OR carrier = 'system' THEN NULL
  WHEN carrier LIKE 'host:%' OR carrier LIKE 'host-import:%' THEN 'DECLARED'
  WHEN carrier IN ('remember','remember-local','memory','cli') THEN 'DECLARED'
  WHEN method = 'semantic-proposal' THEN 'INFERRED'
  WHEN method = 'explicit-key' THEN 'DECLARED'
  WHEN method IN ('path-match','symbol-match','rename-tracked','structural') THEN 'OBSERVED'
  ELSE NULL END;
UPDATE memory_events SET confidence = CASE
  WHEN carrier = 'migration' OR carrier = 'system' THEN NULL
  WHEN carrier LIKE 'host:%' OR carrier LIKE 'host-import:%' THEN 'POSSIBLE'
  WHEN method = 'semantic-proposal' THEN 'POSSIBLE'
  WHEN derivation IN ('OBSERVED','DECLARED') THEN 'LIKELY'
  ELSE NULL END;

CREATE TRIGGER memory_events_no_update BEFORE UPDATE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only (no UPDATE)');
END;
CREATE TRIGGER memory_events_no_delete BEFORE DELETE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only (no DELETE)');
END;

-- ---- DR-02 + DR-05: memory ----
ALTER TABLE memory ADD COLUMN derivation TEXT;
ALTER TABLE memory ADD COLUMN confidence TEXT;
-- DR-05 schema half: disclosure permission class propagated from source. Default
-- `local` (the local facet's no-egress posture, LAW §4). Enforcement = Phase 3.
ALTER TABLE memory ADD COLUMN disclosure TEXT NOT NULL DEFAULT 'local';

-- memory has no `carrier`/`method` columns; derive from `origin` (its provenance
-- carrier) — remember/remember-local = a human/agent DECLARED it (LIKELY);
-- host-import = imported, unverified (POSSIBLE); human-note = DECLARED (LIKELY).
UPDATE memory SET derivation = CASE
  WHEN origin LIKE 'host-import:%' THEN 'DECLARED'
  WHEN origin IN ('remember','remember-local','human-note') THEN 'DECLARED'
  ELSE NULL END;
UPDATE memory SET confidence = CASE
  WHEN origin LIKE 'host-import:%' THEN 'POSSIBLE'
  WHEN origin IN ('remember','remember-local','human-note') THEN 'LIKELY'
  ELSE NULL END;

-- DR-09: drop the dead usage columns (no writer ever populated them; research
-- ruled the usage signal OUT). SQLite >= 3.35 DROP COLUMN.
ALTER TABLE memory DROP COLUMN served_count;
ALTER TABLE memory DROP COLUMN last_served;

-- ---- DR-06: generation identity tuple ----
-- A published generation must be bound to the full D32 tuple (repository revision,
-- worktree digest, schema version, analysis-policy version) so a clean dirty-check
-- under a DIFFERENT worktree/policy cannot reuse rows and serve them `fresh`
-- (all worktrees share one shard). `identity` = the digest of the published
-- generation's tuple; `building_identity` = the in-flight build's tuple.
ALTER TABLE generations ADD COLUMN identity TEXT;
ALTER TABLE generations ADD COLUMN building_identity TEXT;
