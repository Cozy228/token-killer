-- 004-memory-unresolved-here: S9 `unresolved-here` derived annotation (slice 4).
-- A memory whose committed anchor points at an entity NOT resolvable on THIS
-- checkout (a per-branch symbol absent here, or an external SoR snapshot not
-- imported locally) is `unresolved-here` — a DERIVED, per-machine index state,
-- NOT a committed status and NOT a `stale-suspect` conflict. It is kept disjoint
-- from drift (S4/S9): it never flips the served status to needs-review and is
-- never down-ranked as stale; it is only surfaced with an import/branch hint and
-- locally excluded from the push digest (Decision 7). Like `drift_reason`, this
-- column is rebuildable index state (recomputed at every reindex), never synced.
-- Forward-only; runs inside one transaction owned by the migration runner.

ALTER TABLE memory ADD COLUMN unresolved_here INTEGER NOT NULL DEFAULT 0;  -- 0|1 derived
