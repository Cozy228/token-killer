# Slice 3 — Storage locus swap (implementation notes)

<!-- Deviation-log build artifact (no YAML frontmatter: this repo ingests itself,
and a `status:` frontmatter field would be classified as a decision entity and
trip the 1e-docs living-repo assertion — see "Living-repo tests fragile to
doc-churn"). Absorb the surviving verdict into a REGISTER at slice close, then
archive, per the slice-1/2 precedent. -->

Work order: `MEMORY-SYNC-GOAL-PROMPT.md` "Implementation slices" item 3, under
`MEMORY-DECISIONS.md` (B1 / C1–C5 / E1–E8) and `MEMORY-SYNC-SETTLEMENTS.md`
(S1-residual / S3 / S4 / S8 / S10). Committed `.ctx/` files become the source of
truth; the SQLite store is a rebuildable index over them. The event model (slice
2) already existed on SQLite — this slice moved *where the events live*.

## New modules (packages/core/src/memory/)

- `serialize.ts` — the C1/C2 committed-line grammar (`- mem …` / `- dec …`, one
  physical line, percent-encoded values, `refs` = encoded JSON). Pure.
- `fileStore.ts` — `MemoryFiles`: the on-disk layout (mainline vs overlay), sidecars,
  scaffold (`.gitattributes merge=union` + `.gitignore`), read/append.
- `writeThrough.ts` — `recordCreate` / `recordDecision`: file-first, then the store.
- `reindex.ts` — `reindexMemoryFromFiles` (full), `pullDeltaReindex` (S10 #3),
  `recomputeDriftAtReindex` (S4/R2-2).
- `exportMigration.ts` — S3 one-shot export + reindex, idempotent + resumable.
- `secretGuard.ts` — E4 reusable deterministic secret-shaped guard.
- `anchoredAt.ts` — `currentHeadCommit` + `classifyAbsentAnchor` (S4 §4 ancestry).
- `dump.ts` — E6 canonical logical dump (`logicalDump` / `dumpJson`).

## Decisions (mechanics the docs left open — I settled these)

- **On-disk layout (I owned the final names, slice-1 conventions as the start):**
  Mainline (committed) = `.ctx/memory/log.md` (C1 memory entries), `.ctx/memory/decisions.md`
  (C2 lifecycle log), `.ctx/memory/details/<ulid>.md` (write-once sidecars). Overlay
  (gitignored) = `.ctx/memory.local.md`, `.ctx/decisions.local.md`, `.ctx/details.local/<ulid>.md`.
  `.ctx/.gitattributes` declares `memory/log.md merge=union` + `memory/decisions.md merge=union`
  (E2). `.ctx/.gitignore` covers `*.local.md`, `*.local.jsonc`, `details.local/`. `.ctx/concepts/`
  laid down (C3) with a `.gitkeep` — **there is no authored concept write path yet**; the layout +
  serialization seam exist, feature deferred (recorded here per the work order).
- **Serialization = percent-encoded key/value tokens, NOT JSONL (C2).** Every value is
  `encodeURIComponent`-encoded so a line can never contain a space/newline that a union merge could
  tear; `refs` is the only nested field (encoded JSON). Round-trips 1:1 with the slice-2
  `memory_events` shape + the memory-row payload (gist/detail-pointer/origin/anchors/anchored-at/
  session/valid_from-to). A `create` (`mem`) line carries the note itself; lifecycle events are `dec`
  lines. Sidecar-per-detail (S1) keyed by the memory ULID, write-once.
- **Index location = status quo `~/.ctx/<shard>/store.sqlite` (item 7).** Nothing forced a move; the
  index is never committed (it lives outside the repo) and is always rebuildable. The `.ctx/.gitignore`
  additionally covers the overlay so no auto-generated file can reach git even if a future index moved
  in-repo.
- **DB `memory_events` append-only triggers KEPT; reindex is purely additive (`INSERT OR IGNORE` by
  id).** The work order allowed dropping them "if they fight rebuild". They do not: because the *files*
  are append-only too, the DB event set is monotonic, so reindex reconciles by inserting missing rows
  (never deleting). This keeps the slice-2 DB-level append-only guarantee + its test green while still
  making the store a rebuildable cache. Added `store.ingestMemoryEvent` (INSERT OR IGNORE) for replay.
- **`store.nextEventStamp(at?)`** — allocate the next monotonic `(id, at)` WITHOUT inserting, so the
  write-through can serialize the committed line with the SAME stamp it then hands to the DB insert
  (true file-first ordering). Same monotonic discipline as `appendMemoryEvent` (F4/R2-1).
- **C5 `valid_from`/`valid_to` landed as real columns (migration `003-memory-bitemporal.sql`).** The
  ruling is "now"; slice 2 shipped without them. Carried verbatim in the committed bytes AND
  materialized in the rebuildable index so round-trip is DB-observable. Populated only from explicit
  args (never inferred) — no write path infers them yet; the serialization + column + dump support them.
- **Write-through is opt-in via a `files?: MemoryFiles` param; default omitted = store-only (slice-2
  behaviour).** See Deviations — this is the load-bearing choice that keeps the real repo clean while
  making production (CLI) genuinely file-backed.
- **Zone routing (slice-3 conservative, E3-safe):** agent `remember()` → OVERLAY; host imports →
  OVERLAY (`needs-review`); CLI/human lifecycle + confirm + conflict-resolution → MAINLINE; migration
  → per-row (mainline default; host-import-`needs-review` and secret-shaped → overlay). The S8a
  CLI-human-`remember` → Mainline distinction needs the caller-surface split, which is **slice 4** — so
  slice 3 routes ALL `remember()` to the overlay (nothing auto-generated reaches git; strict E3). This
  is the only demonstrable-in-slice-3 route to Mainline content besides migration: a human `confirm`
  writes a committed Mainline decision (the E3 confirmation path); promoting the overlay *create* body
  to Mainline is the full overlay mechanics = slice 4/5.
- **`anchored-at:<commit-id>` captured at write time** (`currentHeadCommit(projectRoot)`) whenever a
  `remember()` carries anchors + a files writer; absent for legacy/migrated rows (never fabricated).
  Serialized into the committed bytes. Rides in the memory entity `attrs.anchoredAt` after reindex so
  the from-scratch drift recompute can read it without a dedicated column.
- **S4 §4 classifier IMPLEMENTED (not test.todo).** `classifyAbsentAnchor` uses
  `git merge-base --is-ancestor` — ancestor of HEAD → `target-removed`; not-ancestor → `unresolved-here`;
  no `anchored-at` → `skip`. Deterministic across peers (reads only the git graph). Wired into
  `recomputeDriftAtReindex`: full reindex CLEARS all drift (the deliberate R2-2 unsticking), then — only
  if a code index is published — re-derives `target-removed` for absent code-shaped anchors whose
  `anchored-at` is an ancestor. `unresolved-here` is surfaced as "no drift, still active" for now (the
  full `unresolved-here` rendering/state is S9/slice 4/guide, not slice 3).
- **E6 dump is claim-id-free.** Conflicts are keyed by their claims' stable content
  (subject/predicate/object/locus), never the per-store auto-increment id, so two stores from the same
  files dump identically.
- **Migration status replay (S3):** the create line carries the *natural landing* status (host imports
  → `needs-review`, authored → `active`); a differing current status is reproduced by a synthesized
  `migration` decision event (carrier=migration). Provenance/authority/anchors/valid_from-to carried
  verbatim; the create-event id/at reuse the store's existing create event so no ULID churn. Marker
  (`memory_migrated_at`) written LAST → resumable; id-keyed skip → idempotent.

## Deviations (departures from the plan, with reasons)

- **Write-through is opt-in (`files?`), not always-on.** Two pre-existing living-repo acceptance tests
  open a store on the REAL token-killer repo and call the core write paths directly: `2d-biography`
  (`remember` on `REPO_ROOT`) and `1h-push` (`importClaudeCodeMemory` on `REPO_ROOT`). An always-on
  write-through would create `.ctx/memory/…`, `.ctx/.gitattributes` and `.ctx/.gitignore` in the real
  repo — a direct violation of the hard gotcha "never create a `.ctx/` directory or committed memory
  files in the token-killer repo itself." The conservative resolution (per the scope contract): the
  core write functions take an optional `MemoryFiles`; when omitted they behave exactly as slice 2
  (store-only). Production (CLI `remember` / `memory confirm|retire|review`) passes
  `MemoryFiles.forStore(store)`, so production is genuinely file-backed; the living-repo core tests
  pass nothing and never touch the real repo. E3 is never violated: when the writer IS present,
  agent/host events route to the gitignored overlay; when absent, no committed file is produced at all.
  Slice 4 makes it always-on when it wires the refresh cold path + `memory/adapter.ts`.
- **Migration trigger is NOT wired into the cold path.** S3 describes the trigger as "first
  post-upgrade cold path detects migration due via the meta marker", but item 5 also forbids touching
  `memory/adapter.ts` dirtyCheck / refresh wiring (slice 4). Resolution: `isMigrationDue(store)` +
  `migrateStoreMemoryToFiles(store, files)` are callable + tested; the cold-path trigger that calls
  them is slice-4's job (it owns the refresh wiring). Recorded so slice 4 wires them.
- **A host-import that is currently `active` migrates to Mainline (not overlay).** E3 is "committed =
  human-authored OR human-confirmed"; `status=active` on a host import means a human confirmed it, so
  committing it is legitimate. The migration additionally emits a `migration` confirm decision
  documenting the carried-over confirmation. Only host-import-`needs-review` (unconfirmed) diverts to
  the overlay, exactly as item 6 specifies.
- **Two pre-existing migration-set tests updated** (they assert the migration *set*, which changed by
  design — permitted by the work order, mirroring slice 2): `tests/unit/migrate.test.ts` (`applied`
  `[1,2]`→`[1,2,3]`, schema_version 2→3, + assert the `valid_from`/`valid_to` columns) and
  `tests/unit/memory-fold.test.ts` (the F1-backfill test's 001-only DB now applies `[2,3]`). No other
  pre-existing test modified; all slice-1/2 E-series/store/memory/push/select tests pass unmodified.

## Adjacent-found (untouched)

- `flagAnchorDrift` (`ingest/code/incremental.ts`) is NOT anchored-at-aware — it flags *every* memory
  anchored to a drifted target, without the S4 §4 ancestry split. That is correct for the *within-branch*
  code-reingest path (the target is present-but-changed, or removed on this branch). The cross-branch
  `unresolved-here` split lives only in the reindex path (`recomputeDriftAtReindex`) for now. Unifying
  the two drift entry points is a future cleanup (E7-family), not slice-3 scope.
- The `unresolved-here` state has no first-class rendering/column yet (S9 / guide / slice 4). Slice 3
  treats it as "no drift, still active + recallable"; the import-hint rendering is deferred.
- Pre-existing oxlint warnings in untouched test files (conditional-expect, extra-arg expects, `.todo`,
  unused vars in `2b`/`2d`/`e-memory-quality`) — not touched (out of scope). New slice-3 files lint clean.
- `docs/reference/`, `docs/agents/`, `docs/design/measurement/` untracked at the repo root (pre-existing,
  the parallel session's) — left untouched, as instructed.

## Open questions

- None blocking. Slice-4 handoffs: (1) wire `MemoryFiles` always-on + the migration trigger into the
  refresh cold path + `memory/adapter.ts` dirtyCheck over `.ctx/memory/`; (2) the S8a CLI-human vs
  MCP-agent `remember` caller-surface split (CLI-human → Mainline); (3) promote a confirmed overlay
  *create* body to Mainline (full overlay mechanics); (4) first-class `unresolved-here` rendering + the
  E4 guard on the live import/remember paths (the module is reused as-is). Slice-3 review focus (deepest
  round): the append-only-triggers-kept + additive-reindex decision, the opt-in write-through, and the
  E3 zone routing.
