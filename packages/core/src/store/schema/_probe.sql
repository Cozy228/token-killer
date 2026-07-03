-- copy-assets probe (slice 1a). Not a migration.
--
-- This file exists only to exercise the copy-assets build step end-to-end: it is
-- copied verbatim into dist/store/schema/_probe.sql by `pnpm --filter @ctx/core build`.
-- The real forward-only migrations (NNN-<name>.sql, CTX-IMPL §9 addenda) land in
-- slice 1b, at which point this probe should be removed.
SELECT 'ctx copy-assets probe';
