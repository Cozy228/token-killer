-- 005-memory-origin-zone: slice-6 item 4 — committed-vs-overlay provenance.
-- Records which zone a memory's `create` currently lives in (mainline vs overlay),
-- so an opt-out repo's own locally-placed push digest can exclude overlay-kept
-- notes (the slice-5 open question). DERIVED, per-checkout index state recomputed
-- at every reindex from the committed / overlay files — exactly like `drift_reason`
-- and `unresolved_here`: never a committed status, never synced, never migrated as
-- committed bytes. NULL = unknown (store-only rows never reindexed from files, or
-- legacy) → treated as includable (today's behaviour). Forward-only; runs inside
-- one transaction owned by the migration runner.

ALTER TABLE memory ADD COLUMN origin_zone TEXT;  -- null|mainline|overlay (derived)
