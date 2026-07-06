# Slice 2 — Event/decision log + derived status fold (implementation notes)

<!-- Deviation-log build artifact (no YAML frontmatter: this repo ingests itself,
and a `status:` frontmatter field would be classified as a decision entity and
trip the 1e-docs living-repo assertion — see "Living-repo tests fragile to
doc-churn"). Absorb the surviving verdict into a REGISTER at slice close, then
archive, per the slice-1 precedent (MEMORY-SYNC-SETTLEMENTS.md appendix). -->


## Joint-review fix round (commit 2 on this branch — F1–F6)

Fables + Codex review of commit `915cf6a` raised 6 findings; all fixed here (a new
commit, `915cf6a` untouched). Per-finding:

- **F1 (MAJOR) — migration backfill.** `002-memory-events.sql` now backfills one
  synthetic `create` event per pre-slice-2 memory row (`refs.status` = the row's
  current status, `actor`/`carrier` = `migration`, `authority` = `derived`,
  `at` = the entity's `first_seen`, event id = the memory's own ULID via
  `substr(entity_id, 5)`). Without it `foldStatus([]) = active` would let the drift
  path resurrect a legacy `superseded`/`needs-review` memory. Idempotent (migration
  gate + unique ULID ids); a fresh install has no memory rows → inserts nothing.
  Test: `memory-fold.test.ts` "F1: legacy memory rows are backfilled …" (001-only DB
  → seed legacy rows → apply 002 → one status-carrying create each, fold reproduces
  status, drift never resurrects a terminal state, re-run is a no-op).
- **F2 (MAJOR) — re-import clobbers a confirm.** Two layers: (a) `claudeImporter`
  appends the `create` event only when the memory has none yet (`memoryEvents(id)`
  guard) and refolds to materialize; (b) `writeMemory`'s `ON CONFLICT` no longer sets
  `status = excluded.status` — status applies on INSERT only, so a re-write/re-import
  never resets the cached fold. Test: `e-memory` "S2-F2: re-import … preserves a human
  confirm" (import → confirm → re-import same mtime → stays `active`, one create event).
- **F3 (MAJOR) — fold robustness to duplicate creates.** `foldStatus` now takes the
  FIRST `create` in total order as the baseline and ignores later creates (slice 3's
  union-merged files can replay one). Test: `memory-fold` "F3: a duplicate later
  `create` is inert" (`create(needs-review)→confirm→create(needs-review)` folds to
  `active`).
- **F4 (MEDIUM) — backwards clock.** `appendMemoryEvent` keeps a monotonic
  `#lastEventAt` (seeded from `MAX(at)` at open); the DEFAULT-clock path stores
  `max(now, #lastEventAt)` (same base the ULID factory clamps to). An EXPLICIT
  `input.at` (backfill/tests) is stored verbatim but still advances the base. Test:
  `memory-fold` "F4: a backwards clock does not regress the total order" (retire@2000,
  roll clock back, confirm → folds `active`).
- **F5 (MEDIUM) — drift downgrade.** `flagAnchored` is now escalate-only: a
  `driftSeverity` ladder (`target-removed` ≥ `signature-changed` > `body-changed` >
  none) gates `setMemoryDrift` so a lower class never overwrites a higher one within a
  reingest; equal-or-higher replaces; `confirm` still clears to null. Test:
  `memory-fold` "F5: drift escalates only" (two anchors: signature-changed then
  body-changed → stays `needs-review`, `driftReason` stays `signature-changed`).
- **F6 (structural hygiene, lighter version).** (a) `setMemoryStatus`/
  `setConflictStatus` renamed to `cacheMemoryStatus`/`cacheConflictStatus` so every
  call site reads as a cache write. (b) Conflict resolution unified through one
  fold-module seam `resolveConflictViaEvent(store, memoryId, a, b, verb)` (appends the
  event AND materializes the cache); `remember.ts` confirm uses it, nothing else
  dual-writes. (c) Guard test walks `packages/core/src` and asserts the ONLY modules
  referencing the cache-write methods are `memory/fold.ts` + `store/store.ts`. The
  Store interface itself is NOT redesigned (slice 3 owns that). Pre-slice-2
  RESOLVED/DISMISSED conflicts are handled by a second backfill block in `002` (synthetic
  `resolve-conflict`/`dismiss` events keyed by the conflict pair) so
  `rebuildConflictStatuses` never reopens them — chosen over the "slice-3 obligation +
  test.todo" alternative. Test: `memory-fold` "F6-backfill: a pre-existing resolved
  conflict gets a synthetic resolution event".

Fix-round deviations: `store.test.ts` / `memory-fold.test.ts` / `e-memory-quality.test.ts`
call sites updated for the `cache…` rename (they exercise the cache primitive directly —
allowed, tests are excluded from the F6 guard). No other behavior change to existing tests.

## Round-2 review (commit 3 on this branch — R2-1, R2-2)

Round-2 verdict: F1/F2/F3/F6 closed. Two items addressed here (new commit on top of the
F1–F6 commit):

- **R2-1 (MAJOR, code) — F4 still open across a process restart.** `#lastEventAt` seeds
  from `MAX(at)` at open, but the monotonic ULID factory restarts fresh each process, so
  a clamp to `max(now, last)` could produce an EQUAL `at` whose fresh-random ULID sorts
  BEFORE a prior higher-random event at the same ms → `(at, id)` inverts confirm/retire
  across a restart with a rolled-back clock. Fix: the default-clock path is now STRICTLY
  monotonic — `at = now > #lastEventAt ? now : #lastEventAt + 1` (then advance the base).
  Explicit `input.at` stays verbatim (backfill/tests) and still advances the base. The
  ms-level skew on same-ms bursts is accepted and documented (order is what matters). Test:
  `memory-fold` "event `at` strict monotonicity across restart (R2-1)" — append retire,
  close the store, reopen with an earlier clock, append confirm via the default path →
  `confirmAt > retireAt` and the fold yields `active`.
- **R2-2 (MEDIUM, contract-pin, NO behavior change) — drift stickiness across reingests.**
  Codex objection: escalate-only drift is STICKY across passes (target-removed → a later
  pass sees only body-changed → the annotation stays high, never auto-downgrading).
  Fable arbitration (recorded so slice 3 revisits it deliberately): this stickiness is the
  RATIFIED Phase-1 semantic, not a bug — drift flips to needs-review and the ONLY recovery
  is a human `confirm` (E7-recovery); auto-downgrade would silently clear a requested
  review, violating "conflicts surfaced, never auto-merged". Per-checkout wholesale
  re-derivation of drift is slice-3 reindex scope (S4), which resets annotations from
  scratch on a branch switch — the deliberate place to revisit stickiness. Actions taken:
  (a) `flagAnchored` comment now states the contract explicitly ("escalate-only AND
  sticky-until-confirm, mirroring the open stale-suspect conflict; slice-3 reindex
  recomputes drift from scratch per checkout"); (b) pinning test `memory-fold` "R2-2: drift
  is escalate-only AND sticky-until-confirm across reingest passes" (target-removed →
  body-changed later → stays needs-review; confirm → drift cleared, active); (c) this
  arbitration note.

---

Work order: `MEMORY-SYNC-GOAL-PROMPT.md` "Implementation slices" item 2, under the
E2/E5 rulings of `MEMORY-DECISIONS.md` and the S4/S10 contracts of
`MEMORY-SYNC-SETTLEMENTS.md`. Event log lands on the CURRENT storage (SQLite); the
locus move to committed `.ctx/` files is slice 3. Independently revertible: no
storage-locus, file-layout, or `.gitignore` change.

## Decisions (mechanics the docs left open — I settled these)

- **Event table final shape** (`migration 002-memory-events.sql`): `memory_events(
  id TEXT PK ULID, memory_id, verb, actor, reason, refs JSON, carrier, locus,
  method, authority, at INTEGER)`. Maps 1:1 to the C2 committed-log grammar
  (who=`actor`, when=`at`, verdict=`verb`, reason, refs) plus the claims table's
  carrier/locus/method/authority provenance vocabulary, so slice 3's move to a
  markdown decision log is mechanical. Append-only is enforced at the DB level by
  two `BEFORE UPDATE`/`BEFORE DELETE` triggers (`RAISE(ABORT,'append-only')`) — not
  just by API omission.
- **Verb set**: `create | confirm | retire | review | supersede | resolve-conflict
  | dismiss`. `create` is the fold baseline and carries the landing status in
  `refs.status` (so host-import → `needs-review` is reproduced by the fold, not a
  direct column write; the E3 CLI/MCP overlay split is slice 4, untouched here).
- **Fold** (`memory/fold.ts`): status = last status-asserting event in total order
  `(at, then ULID)`. Order-independent (sorts, never reads insertion/line order).
  `resolve-conflict`/`dismiss` are not memory-status verbs (they fold
  `conflicts.status`).
- **E5 collision predicate**: a memory whose event log contains **both** a `retire`
  and a `supersede` event — two mutually-exclusive terminal dispositions taken as
  independent decisions. Later-by-total-order wins the derived status; a
  `contradiction` conflict is filed between the two competing decisions; both events
  are retained; nothing auto-merged. Chosen because it exactly matches E5's stated
  example ("A retires X, B supersedes X") and never false-fires on any normal
  single-track flow (create→review→confirm, create→retire, create→supersede never
  hold both). Recorded alternative rejected: "any two differing status assertions
  collide" — would spam contradictions on the legitimate needs-review→confirm
  recovery flow (E7-recovery), so rejected.
- **Contradiction wiring**: the `conflicts` table is claim-id-keyed. A collision
  find-or-creates one stable provenance claim per colliding event (`predicate=
  lifecycle-decision`, `locus=event.id`) and files `addConflict(a,b,'contradiction')`.
  Stable claim ids + `INSERT OR IGNORE` make refold idempotent (no duplicate
  contradictions).
- **Drift annotation mechanics (S4)**: added one nullable column `memory.drift_reason`
  (`target-removed|signature-changed|body-changed`). Drift is derived per-checkout
  index state — recorded via `setMemoryDrift`, **never** an event, never committed.
  The served `memory.status` column = `composeStatus(fold, drift)`: `target-removed`/
  `signature-changed` → effective `needs-review`; `body-changed` → down-rank only
  (status unchanged, A5); terminal fold states (`retired`/`superseded`) win so drift
  can never resurrect them. Invariants held: (a) event log untouched by drift;
  (b) refold/rebuild recomposes with the drift column, never erasing it;
  (c) `confirm` clears `drift_reason` (freshness affirmed) + resolves the conflicts;
  (d) served status/rank/push/`⚠` projection read the same composed column, so
  behavior is byte-identical to before (all pre-existing E2/E7 drift tests pass
  unmodified).
- **`memory.status` is the cache; the log is the source (S10 #4)**: `getMemory`/
  visibility/rank/push read the single indexed `status` column. The fold runs only
  at event append / drift / rebuild (change-set-bounded per memory), never per
  query — asserted by a test that appends an event WITHOUT refold and shows the
  served status unchanged until `refoldMemory` runs.
- **Monotonic ULID for events** (`memory/ulid.ts::monotonicUlidFactory`, one per
  store): a `create` and a same-millisecond `retire` must total-order by causal
  order. Pure-random ULID low bits do NOT preserve that, which caused a real fold
  inversion (a retired memory folded back to active). The factory increments the
  previous random part within the same/ non-advancing ms, so a later event always
  gets a strictly larger ULID. This realizes the E2 assumption that ULID is a
  meaningful tiebreaker.
- **Event timestamp source**: all events (`create`/lifecycle/supersede/import) are
  stamped by the **store clock** (`appendMemoryEvent` default `at = store.now()`),
  not `remember()`'s separate `input.now`. Mixing an injected store clock with
  `remember`'s wall-clock `now` diverged the two time bases and broke ordering
  (surfaced by the 1h-push A2 test). One clock → correct total order.
- **`setMemoryStatus` / `setConflictStatus` retained as internal cache-writes**
  (documented as such on the interface): the three production write paths no longer
  call `setMemoryStatus` directly — they append an event and refold. The primitives
  stay because the fold + rebuild materialize through them and store-primitive unit
  tests exercise them. Seam narrowed (nothing in production bypasses the log) without
  removing the cache-write the fold needs.
- **`actor` granularity**: lifecycle events use `actor="cli"` (A4: human/CLI),
  `remember()` uses `actor="agent"`, imports use `actor="host:<h>"`. The finer
  CLI-human-vs-MCP-agent split (S8a) is slice 4 and deliberately NOT implemented.
- **Rebuild scope**: `rebuildMemoryStatuses` (refold every memory from events,
  preserving drift) + `rebuildConflictStatuses` (reset conflicts to open, re-apply
  resolution events) prove "store = rebuildable view". Exercised by tests; not wired
  into any cold path here (that is the slice-3 reindex path).

## Deviations (departures from the plan, with reason)

- **Two migrate.test.ts assertions updated** (the only pre-existing tests touched).
  They asserted `runMigrations` applies exactly `[1]` / schema_version `1`; slice 2
  adds `002-memory-events`, so they now assert `[1,2]` / `2` and include
  `memory_events` in the required-tables list. This is a test asserting the
  migration *set*, which changed by design — permitted by the work order's "unless a
  test asserts the old direct-mutation mechanics" clause.
- **No other existing test modified.** All prior E-series / store / memory / push /
  select tests pass unmodified, including the ones that call `setMemoryLifecycle`
  with a status argument and read `getMemory().status` after drift — because the
  served `status` column remains the composed value.
- **`composeStatus` terminal-precedence choice** (retired/superseded win over drift)
  is stricter than the pre-slice code, where `flagAnchored` unconditionally wrote
  `needs-review` even over a superseded row. No test drives drift onto a
  retired/superseded memory, so behavior is observably identical; the stricter rule
  is the conservative, defensible one (drift must not resurrect a terminal memory).

## Adjacent-found (untouched)

- `store.ts` now imports `monotonicUlidFactory` from `../memory/ulid.ts` — a minor
  layering inversion (store → memory util). No cycle (`ulid.ts` only depends on
  `store/hash.ts`). Left as-is; the ULID generator is a leaf util. Slice 3 may
  relocate it to `store/` if the layering matters.
- Pre-existing oxlint warnings in untouched test files (conditional-expect,
  extra-arg expects, `.todo` warnings) — not touched (out of scope).
- `docs/reference/` is untracked at the repo root (pre-existing) — left untouched.

## Open questions

- None blocking. Slice-3 owns: moving `memory_events` into a committed markdown
  decision log (the shape is already C2-aligned), the `.gitattributes merge=union`
  cross-writer story, and whether `drift_reason` should become a first-class
  `MemoryDriftReason` shared type in `store/` vs the code-ingest `StaleReasonClass`
  (kept structurally identical strings for now).
