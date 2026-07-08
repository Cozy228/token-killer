-- 002-memory-events: append-only memory lifecycle/decision event log + derived
-- status fold (slice 2 — event log on the CURRENT storage; the locus move to
-- committed files is slice 3). Forward-only; runs inside one transaction owned
-- by the migration runner.
--
-- Shape follows the C2 committed-log line grammar (who / when / verdict / reason
-- / refs) plus the claims table's carrier/locus/method/authority provenance
-- vocabulary, so slice 3's move to `.contexa/memory/decisions.md` is mechanical.
-- The event log is the SOURCE of derived status; `memory.status` is a rebuildable
-- CACHE of the E2/E5 fold over these events (S10 #4). This table is APPEND-ONLY:
-- the triggers below hard-block any UPDATE or DELETE (non-destruction invariant).

CREATE TABLE memory_events (
  id        TEXT PRIMARY KEY,   -- ULID (E2 total-order tiebreaker after `at`)
  memory_id TEXT NOT NULL,      -- mem:<ulid> entity this event concerns
  verb      TEXT NOT NULL,      -- create|confirm|retire|review|supersede|resolve-conflict|dismiss
  actor     TEXT NOT NULL,      -- who: cli|agent|system|migration|host:<h> (A4: lifecycle = human/CLI)
  reason    TEXT,               -- free-text rationale (C2 "reason")
  refs      TEXT NOT NULL DEFAULT '{}',  -- JSON refs: {status, supersededBy, superseded, conflictA, conflictB}
  carrier   TEXT NOT NULL,      -- provenance carrier (remember|cli|tree-sitter|migration|host:<h>)
  locus     TEXT,               -- where inside the carrier
  method    TEXT NOT NULL,      -- claims.method vocab (explicit-key|structural|...)
  authority TEXT NOT NULL CHECK (authority IN ('observed','derived','inferred','confirmed')),
  at        INTEGER NOT NULL    -- epoch-ms event timestamp (E2 primary sort key)
);
-- The fold reads events per memory in total order (at, then id) — indexed.
CREATE INDEX memory_events_memory ON memory_events(memory_id, at, id);
-- Conflict-resolution events are folded per referenced conflict pair.
CREATE INDEX memory_events_verb ON memory_events(verb);

-- Append-only enforcement at the DB level (E2 / non-destruction): no code path
-- may ever update or delete an event row. Triggers make it structurally impossible.
CREATE TRIGGER memory_events_no_update BEFORE UPDATE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only (no UPDATE)');
END;
CREATE TRIGGER memory_events_no_delete BEFORE DELETE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only (no DELETE)');
END;

-- Anchor-drift annotation on the memory index row (S4): derived, per-checkout
-- index state, recomputed at reindex, NEVER an event and NEVER committed. The
-- served `memory.status` is the composition of the fold-status with this
-- annotation (A5); a refold/rebuild recomposes but never erases the annotation.
ALTER TABLE memory ADD COLUMN drift_reason TEXT;  -- null|target-removed|signature-changed|body-changed

-- F1 backfill (S3 "status is replayed"): pre-slice-2 memory rows have NO events,
-- so `foldStatus([])` would default to `active` and the drift path could resurrect
-- a legacy `superseded`/`needs-review` memory (human-decision loss). Synthesize one
-- `create` event per existing memory carrying its CURRENT status as the fold
-- baseline. The event id is the memory's own ULID (`substr('mem:<ulid>', 5)` — unique
-- per memory + time-ordered); `at` = the entity's `first_seen`. Runs once (migration
-- gate); a fresh install has no memory rows so it inserts nothing.
INSERT INTO memory_events (id, memory_id, verb, actor, refs, carrier, method, authority, at)
SELECT substr(m.entity_id, 5), m.entity_id, 'create', 'migration',
       json_object('status', m.status), 'migration', 'structural', 'derived',
       COALESCE(e.first_seen, 0)
FROM memory m
LEFT JOIN entities e ON e.id = m.entity_id;

-- F6 backfill: pre-slice-2 RESOLVED/DISMISSED conflicts have no resolution events,
-- so a rebuild of `conflicts.status` (fold of resolution events) would reopen them.
-- Synthesize a `resolve-conflict`/`dismiss` event per already-closed conflict,
-- keyed by the conflict pair (memory_id = subject of claim `a`; `at` = that claim's
-- time). `open` conflicts need no event (open is the fold default).
INSERT INTO memory_events (id, memory_id, verb, actor, refs, carrier, method, authority, at)
SELECT 'migc:' || c.a || ':' || c.b, ca.subject,
       CASE c.status WHEN 'dismissed' THEN 'dismiss' ELSE 'resolve-conflict' END,
       'migration',
       json_object('conflictA', c.a, 'conflictB', c.b),
       'migration', 'structural', 'derived', COALESCE(ca.at, 0)
FROM conflicts c
JOIN claims ca ON ca.id = c.a
WHERE c.status IN ('resolved', 'dismissed');
