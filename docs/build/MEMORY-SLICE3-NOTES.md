# Slice 3 — Storage locus swap (implementation notes)

<!-- Deviation-log build artifact (no YAML frontmatter: this repo ingests itself,
and a `status:` frontmatter field would be classified as a decision entity and
trip the 1e-docs living-repo assertion — see "Living-repo tests fragile to
doc-churn"). Absorb the surviving verdict into a REGISTER at slice close, then
archive, per the slice-1/2 precedent. -->

Work order: `MEMORY-SYNC-GOAL-PROMPT.md` "Implementation slices" item 3, under
`MEMORY-DECISIONS.md` (B1 / C1–C5 / E1–E8) and `MEMORY-SYNC-SETTLEMENTS.md`
(S1-residual / S3 / S4 / S8 / S10). Committed `.contexa/` files become the source of
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
  Mainline (committed) = `.contexa/memory/log.md` (C1 memory entries), `.contexa/memory/decisions.md`
  (C2 lifecycle log), `.contexa/memory/details/<ulid>.md` (write-once sidecars). Overlay
  (gitignored) = `.contexa/memory.local.md`, `.contexa/decisions.local.md`, `.contexa/details.local/<ulid>.md`.
  `.contexa/.gitattributes` declares `memory/log.md merge=union` + `memory/decisions.md merge=union`
  (E2). `.contexa/.gitignore` covers `*.local.md`, `*.local.jsonc`, `details.local/`. `.contexa/concepts/`
  laid down (C3) with a `.gitkeep` — **there is no authored concept write path yet**; the layout +
  serialization seam exist, feature deferred (recorded here per the work order).
- **Serialization = percent-encoded key/value tokens, NOT JSONL (C2).** Every value is
  `encodeURIComponent`-encoded so a line can never contain a space/newline that a union merge could
  tear; `refs` is the only nested field (encoded JSON). Round-trips 1:1 with the slice-2
  `memory_events` shape + the memory-row payload (gist/detail-pointer/origin/anchors/anchored-at/
  session/valid_from-to). A `create` (`mem`) line carries the note itself; lifecycle events are `dec`
  lines. Sidecar-per-detail (S1) keyed by the memory ULID, write-once.
- **Index location = status quo `~/.contexa/<shard>/store.sqlite` (item 7).** Nothing forced a move; the
  index is never committed (it lives outside the repo) and is always rebuildable. The `.contexa/.gitignore`
  additionally covers the overlay so no auto-generated file can reach git even if a future index moved
  in-repo.
- **DB `memory_events` append-only triggers KEPT for normal ops + ONE sanctioned reset seam (amended by
  round-3 F5).** Round 1 kept the triggers and made reindex purely additive. Round 3's second reviewer
  showed that stance is obsolete now that FILES are the source: the cache needs a way to SHED rows (a
  redaction/removal, a migration that must re-derive exactly like a fresh clone). Resolution:
  `store.resetMemoryCache()` is the ONE bypass — inside a transaction it drops the append-only triggers,
  clears the memory domain (events + memory rows + memory entities/FTS/anchors/links + memory-provenance
  claims + their conflicts), then recreates the triggers. The triggers stay AUTHORITATIVE for normal
  operation (the slice-2 append-only test is unchanged and green); reset is files→store only, wired into
  `reindexMemoryFromFiles(…, {mode:"reset"})` and used at migration end + the non-append pull-delta
  fallback. Additive `INSERT OR IGNORE` (`store.ingestMemoryEvent`) remains the default for plain appends.
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
  write-through would create `.contexa/memory/…`, `.contexa/.gitattributes` and `.contexa/.gitignore` in the real
  repo — a direct violation of the hard gotcha "never create a `.contexa/` directory or committed memory
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

## Fable review round 1 (fixes — new commits, history not rewritten)

Codex was quota-blocked; this Fable round was the deep one. 7 findings, all addressed.

- **R1 (MAJOR — parse never crashes reindex).** `parseMemory`/`parseDecision` now wrap the
  `decodeURIComponent`/`JSON.parse` body in try/catch and return `undefined` on any corrupt line (bad
  percent-escape, bad refs JSON). `reindexMemoryFromFiles` now iterates raw lines, SKIPS + COUNTS
  unparseable ones, and returns a `ReindexReport {memories, decisions, skipped}` (success-shaped,
  doctor-visible later); `pullDeltaReindex` gained a `skipped` count too. A mangled line is an expected
  input on a human-reviewed committed log (E3) and under a manual conflict resolution (S10 #3), and
  S1(b) rules integrity problems are warnings, never crashes. Test: a log with one bad-percent mem line
  + one bad-refs dec line → reindex completes, `memories=1`, `skipped=2`.
- **R2 (MAJOR — derived stale-suspect layer recomputed at full reindex).** `recomputeDriftAtReindex`
  now calls the new `store.deleteConflictsByKind("stale-suspect")` (a CACHE deletion — committed source,
  events, and stale-reason claims untouched, so non-destruction holds) BEFORE re-deriving, so only the
  ancestry-provable `target-removed` stale-suspects survive a full reindex. This ends the R2-2
  within-process stickiness AT the reindex boundary (ratified S4 §1: "drift AND the stale-suspect
  conflict it files are derived index state, recomputed per checkout"), fixing both the E6 divergence (a
  long-lived peer vs a fresh clone) and the incoherent active-memory-with-open-stale-suspect pair.
  Contradiction conflicts + human resolutions keep deriving from events; the within-process
  `flagAnchored` stickiness (between reindexes) is untouched. Tests: (i) peer with a historical
  signature-changed stale-suspect → full reindex → `dumpJson` equals a fresh clone; (ii) target absent
  + anchored-at ancestor → stale-suspect filed → target present again → conflict gone, drift null,
  status = fold. **Follow-up for OPEN.md (NOT slice 3):** a deterministic forward path for
  signature/body-changed drift across a full reindex needs a committed content-hash baseline in the
  anchor bytes; today those classes are dropped at full reindex and re-flagged only on the next
  within-process code re-ingest.
- **R3 (MEDIUM — migration E3 rationale, notes only).** Running the S3 migration is itself a human act:
  the operator's decision to run it IS the human confirmation that authorizes the committed zone for
  authored rows (only host-import-unconfirmed + secrets divert to the overlay). The `MigrationReport`
  counts (`toMainline`/`toOverlay`/`diverted`) are the operator's exact visibility of what was committed
  vs withheld. So "unconfirmed agent-authored row → Mainline on migration, but → overlay on the live
  path" is not an E3 violation: the live path has no human in the loop; the migration run does.
- **R4 (MEDIUM — authority carried verbatim).** `MemoryInput.authority` / `MemoryRow.authority` /
  `MemoryListRow.authority` / `MemoryListItem.authority` / `push/rank.ts`'s `GotchaCandidate.authority`
  widened to the 4-valued `Authority`; `ingestMemoryEntry` no longer collapses via
  `=== "confirmed" ? … : …`/`as never` — it carries the parsed authority through unchanged. Test: an
  `observed`-authority row survives serialize → reindex → `getMemory` + `dumpJson`.
- **R5 (MINOR — secret-diverted status replay).** A diverted secret lands `needs-review` (a human must
  review+redact it), but a TERMINAL original status (retired/superseded) is now replayed via the
  overlay decision log so a DEAD secret does not resurrect into the review queue; only a live
  (active/needs-review) secret stays pending. `statusToReplay(secret, current, landing)` encodes this.
  Test: a retired secret-shaped row migrates → fresh reindex → status `retired`, not `needs-review`.
- **R6 (MINOR — no argument mutation).** `MemoryFiles.appendMemory` no longer writes back
  `entry.detailPointer`; it serializes a local `{ ...entry, detailPointer }` copy.
- **R7 (MINOR — gitignore comment).** The `.gitignore` template comment no longer promises an index
  pattern it does not list; it notes the index lives under `~/.contexa` (outside the repo) and where to add
  a pattern if a future index moves in-repo.

## Fable review round 2 (fixes — new commits)

Deep-read of `fold.ts` against the acceptance bar surfaced 2 MAJOR cross-machine defects + 1 MEDIUM
ordering bug introduced by the R2 fix. All three fixed.

- **R8 (MAJOR — committed resolution refs must be content-addressed).** `resolveConflictViaEvent`
  previously wrote per-store autoincrement claim ids (`refs.conflictA/B`) into the committed decision
  log; on a fresh clone those ids differ, so the replay matched nothing (conflict never clears for the
  team) or an UNRELATED pair (silent wrong resolution). Fix: new resolution events write stable claim
  KEYS `refs: { a: "<subject|predicate|object|locus>", b: "…" }`; `rebuildConflictStatuses` resolves a
  string ref to the LOCAL claim id by content (`claimsFor` + object/locus match) → `cacheConflictStatus`.
  The numeric path is kept as a legacy same-store read (slice-2 events + the 002 backfill still carry
  numbers, valid locally). The key builder is now ONE shared `claimKeyOf` in `fold.ts`; `dump.ts` uses
  it too (single definition). Test: A files + dismisses a stale-suspect (committed), fresh peer B
  reindexes the same files → B's own-numbered conflict resolves by content.
- **R9 (MAJOR — full-reindex re-derivation must not undo a human confirm).** A `confirm` clears drift +
  resolves the stale-suspect (E7-recovery), but the anchor stays in the committed bytes, so the next
  full reindex re-derived `target-removed` and flipped the confirmed memory back to needs-review —
  every reindex (slice-4 branch switches) re-undid the confirm. Fix (deterministic from committed
  bytes): a `confirm` that clears a drift now records `clearedDrift: "<reason-class>"` and
  `confirmedAt: "<HEAD oid at confirm time>"` in its committed refs (grammar addition — refs is JSON,
  no line-format change). `recomputeDriftAtReindex` skips `target-removed` for a memory whose fold
  status is active via a confirm carrying `clearedDrift: "target-removed"` AND whose `confirmedAt` is
  an ancestor of HEAD (the human judged this absence on this line of history). A confirm made while the
  target was PRESENT carries no `clearedDrift`, so a later real removal still flags on every machine.
  Tests: confirm-clears-drift → full reindex → stays active + no stale-suspect (same machine AND a
  fresh clone from the same committed bytes); counter-case: confirm predates the removal (no
  `clearedDrift`) → reindex DOES flag `target-removed`.
  - **Documented edge (accepted):** if the target REAPPEARS and is then REMOVED AGAIN after such a
    confirm, the full reindex still skips it (it trusts the stale `clearedDrift` confirm). The
    within-branch incremental `flagAnchorDrift` (landed 2c) still catches that live removal, so the
    memory is not silently lost — only the from-scratch reindex path defers to the confirm. A fully
    deterministic forward path (a committed content-hash baseline in the anchor bytes) is the same
    named follow-up as R2 — not slice 3.
- **R10 (MEDIUM — resolution re-application must run AFTER the stale-suspect re-file).** The R2 fix put
  `recomputeDriftAtReindex` (which re-files stale-suspects as `open`) AFTER `rebuildConflictStatuses`,
  so a locally dismissed-but-still-derivable conflict reopened at every reindex. Fix:
  `recomputeDriftAtReindex` now re-runs `rebuildConflictStatuses` as its LAST step, so re-filed
  conflicts immediately re-absorb their committed resolution. Composes with R9 (a confirmed memory does
  not even re-file); R10 covers non-confirm resolutions (`dismiss`). Test: dismiss a stale-suspect →
  full reindex with the target still absent+ancestor → the conflict is `dismissed`, not `open`.

## Fable review round 3 (fixes — new commits; arbitrating an independent 2nd reviewer)

Root cause threading the MAJORs: the slice-2 "DB events append-only" stance is obsolete now that FILES
are the source — the cache needed ONE sanctioned reset-rebuild seam (F5). 7 code fixes + 3 rulings.

- **F1 (MAJOR — crash-resume loses the status line).** Migration is now id-keyed per EVENT (not per
  memory): `catchUpStoreOnlyEvents` builds the present-set from every mem+dec line and exports exactly
  the event lines absent from the files. A crash between a create line and its lifecycle line is
  completed on the next run. Test: a memory with a create+retire history, only the create line
  pre-flushed → resume writes the retire line, no duplicate create, fresh reindex → retired.
- **F2 (MAJOR — export event history verbatim + end with a reset).** Non-diverted rows now export their
  FULL `memory_events` history VERBATIM (create → mem line carrying its own `refs.status`; lifecycle →
  dec lines; ids/at preserved) — no synthesized status replay. Secret-diverted rows keep the landing
  rewrite (overlay `needs-review`) + the R5 terminal replay. Migration ENDS with the reset rebuild (F5)
  so the migrating machine re-derives from the files EXACTLY like a fresh clone. Test: a machine with a
  legacy create+supersede+retire contradiction history + a secret row → after migration `dumpJson` ===
  a fresh clone's. **Amends the S3 settlement's "status replayed" mechanics** (the settlement predates
  the slice-2 event log): status is now derived from the verbatim events, never a mutable copy — the
  ruling (status derived, never copied) is unchanged and satisfied more strictly.
- **F3 (MAJOR — distribution: `git diff` external drivers).** `pullDeltaReindex`'s diff now runs with
  `--no-ext-diff --no-textconv` (+ `--no-pager`), so a user's `diff.external` (delta/difftastic —
  widespread) or a textconv filter can no longer make the delta path see zero content and silently
  index nothing. Test: a fixture with `diff.external` set → the delta path still parses real lines.
- **F4 (MAJOR — post-migration store-only writes stranded).** The marker is now a last-run STAMP, not a
  gate: `isMigrationDue(store, files)` = "any store memory event absent from the files" (O(events)
  catch-up scan). Every cold-path check sweeps new store-only rows into their zone. The MCP `remember`
  surface + refresh-path import stay store-only BY DESIGN (slice 4 wires the live writers; `serve.ts` /
  `adapter.ts` untouched here — the living-repo suites drive them on the real repo); this catch-up is
  the safety net. Test: a store-only row written after migration → next due-check sweeps it into
  mainline + the index.
- **F5 (structural — the one sanctioned reset seam; fixes the #2/#8 shed-rows gap).** `store.resetMemoryCache()`
  (see the amended decision above) wired into `reindexMemoryFromFiles(…, {mode:"reset"})`, used at
  migration end (F2c) and the pull-delta NON-APPEND fallback (a rewrite/redaction that must SHED rows —
  the purge path a peer previously lacked). ORDERING GUARD: reset runs the catch-up export FIRST so
  genuine store-only rows are committed before the cache clears. To keep the guard from RE-EXPORTING a
  committed-then-removed row (which would undo a redaction), the pull-delta fallback passes the OLD
  commit's event ids (`git show <oldTip>:.contexa/memory/…`) as `resetExcludeIds`: a row whose create was
  committed and is now gone is purged, a genuinely store-only row (never committed) is preserved. Test:
  a redaction removes a committed secret line + a store-only local row exists → after the fallback the
  secret is purged AND the local row survives.
- **F6 (MEDIUM — overlay clobbers mainline).** Reindex processes mainline first and tracks its ids; an
  overlay mem entry whose id is already owned by mainline is SKIPPED (mainline wins deterministically)
  and counted in `ReindexReport.shadowedOverlay` (doctor-surfaceable). Closes the privacy inversion
  where a leftover unredacted overlay line shadowed a redacted committed line. Test: same id in both
  zones → mainline text served, `shadowedOverlay === 1`.
- **F7 (MINOR — pull-delta routing + rename).** Added lines are routed by the file they came from
  (tracking the `+++` header), not by tag alone: a `mem` line in `decisions.md` fails its file's parser
  and is skipped, never misapplied. `--no-renames` makes a log rename degrade to delete+add → the `-`
  entry line triggers the non-append fallback. Tests: a misplaced line is skipped (not indexed) + a
  deleted log → full-fallback.

### Documented rulings (no code)

- **D1 — the E1 identity layer (dedup → `sameAsCandidate` at reindex) is NOT in slice 3.** Named
  slice-4/6 handoff. Corollary: write-time `sameAs` conflicts are author-local until then (a known E6
  scope limit — the E6 acceptance instrument covers committed-DERIVED state, and the reset rebuild makes
  the committed-derived dump identical across peers; author-local dedup links are outside that set).
- **D2 — shallow / partial clones.** `git merge-base --is-ancestor` cannot see a truncated graph, so an
  absent anchor degrades CONSERVATIVELY to `unresolved-here` (never false-`stale`), and the R9
  confirm-suppression fails safe (a missing `confirmedAt` ancestor check → not suppressed → the memory
  simply isn't force-cleared). Determinism precondition: a FULL-HISTORY clone. A `ctx doctor` check for
  shallow clones is future work.
- **D3 — a confirm/dismiss on an overlay-only memory writes a mainline `dec` line whose `mem:` id no
  peer has** → a fold-inert dangling decision line that accumulates until slice-4 promotion of the
  overlay create to mainline. Recorded so slice 4 owns the promotion (and a doctor sweep of dangling
  mainline decisions).

## Open questions

- None blocking. Slice-4 handoffs: (1) wire `MemoryFiles` always-on + the migration trigger into the
  refresh cold path + `memory/adapter.ts` dirtyCheck over `.contexa/memory/`; (2) the S8a CLI-human vs
  MCP-agent `remember` caller-surface split (CLI-human → Mainline); (3) promote a confirmed overlay
  *create* body to Mainline (full overlay mechanics); (4) first-class `unresolved-here` rendering + the
  E4 guard on the live import/remember paths (the module is reused as-is). Slice-3 review focus (deepest
  round): the append-only-triggers-kept + additive-reindex decision, the opt-in write-through, and the
  E3 zone routing.

## Codex post-merge review fixes (O-17/O-20, 2026-07-07)

- **F-A (C3-1, MAJOR) — pull-delta must recompute drift.** `pullDeltaReindex`'s delta path ended with
  `rebuildConflictStatuses` only, so a pulled memory anchored to a target that is absent-and-
  ancestry-removed on this checkout stayed clean-`active` instead of filing `target-removed` drift.
  Fix: the delta path now calls `recomputeDriftAtReindex(store, gen)` after the refold loop (it re-runs
  `rebuildConflictStatuses` last, R10 — no double rebuild), matching the full path. Pull is a cold path;
  A11 untouched. Test: `slice3-storage.test.ts` "F-A: pull-delta recomputes drift …" (pulled anchor to
  a removed target now files `target-removed` + a stale-suspect; needs-review).
- **F-B (C3-2, MAJOR) — catch-up exclusion is per-event with a purge condition.** `catchUpStoreOnlyEvents`
  skipped the WHOLE memory when its create id was in `excludeCommittedIds`, losing new store-only
  lifecycle events on still-committed memories. Fix: PURGE only when the create is in `excludeCommittedIds`
  AND absent from the files (a redaction); otherwise export per-event, skipping any event id present OR in
  `excludeCommittedIds`. Test: `slice3-storage.test.ts` "F-B: catch-up exclusion is per-event …" (a
  still-committed memory's new store-only retire survives; the redacted row is still purged — F5 stays
  green).
- **F-C (C3-3, MAJOR) — mainline-wins extends to overlay decision lines.** A leftover overlay `dec` on a
  mainline-owned id flipped a committed memory's fold locally (broke mainline-wins + peer determinism).
  Fix: in the decisions loop, `zone === "overlay" && mainlineIds.has(d.memoryId) && !files.localOnly` →
  skip + count in `shadowedOverlay`. The `localOnly` (E4 opt-out) exemption keeps overlay-routed decisions
  folding. Non-destruction holds (bytes stay; only the index ignores them). Edge acknowledged: an opt-out
  flipped OFF mid-life leaves overlay-era decisions shadowed — surfaced via `shadowedOverlay`. Test:
  `slice3-storage.test.ts` "F-C: an overlay dec on a mainline-owned id is shadowed … folds under opt-out".
- **C3-4 (not fixed — record only).** The slice-3 active-overlay-in-push-digest finding is subsumed at
  HEAD by slice-4/5 routing (cli→mainline, mcp→needs-review, local→`remember-local` push-excluded). The
  residual (an OPT-OUT repo's ordinary notes in its own locally-placed digest) is slice-6 scope item 4
  (already scheduled). No code here.
