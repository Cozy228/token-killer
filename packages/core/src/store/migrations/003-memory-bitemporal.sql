-- 003-memory-bitemporal: C5 valid_from / valid_to on the memory index (slice 3 —
-- the storage locus swap). Bitemporal validity lands with the file-backed
-- re-architecture; populated ONLY from explicit args / supersede-time, never
-- inferred (C5). The committed memory-log line carries `valid-from`/`valid-to`
-- as part of the committed bytes; these columns are the rebuildable index's
-- queryable materialization of them (both null by default = "valid now").
-- Forward-only; runs inside one transaction owned by the migration runner.

ALTER TABLE memory ADD COLUMN valid_from INTEGER;  -- null = unbounded past
ALTER TABLE memory ADD COLUMN valid_to   INTEGER;  -- null = still valid
