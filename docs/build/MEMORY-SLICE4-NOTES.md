# Slice 4 — memory dirty source + import→overlay→confirm (implementation notes)

<!-- Deviation-log build artifact (no YAML frontmatter: this repo ingests itself,
and a `status:` frontmatter field would classify as a decision entity and trip the
living-repo doc assertion — see slice-3 notes). Absorb the surviving verdict into a
REGISTER at slice close, then archive, per the slice-1/2/3 precedent. -->

Work order: `MEMORY-SLICE4-GOAL-PROMPT.md` (8 scope items), under `MEMORY-SYNC-GOAL-PROMPT.md`
(hard invariants + acceptance bar), `MEMORY-DECISIONS.md` (A3/A4, E3/E4/E8),
`MEMORY-SYNC-SETTLEMENTS.md` (S8a, S9, S10 #1/#5), and `MEMORY-SLICE3-NOTES.md` (the D1/D2/D3
handoffs). Built directly on `feat/1.0.0 @ b3b4b14`.

## Precondition waiver (O-17)

The work order's precondition — the O-17 Codex post-merge review of slice 3 fixed or explicitly
waived — was **explicitly WAIVED by the maintainer** (message at slice start: "build directly on
b3b4b14"). No slice-3 review findings were pending; slice 3 merged clean at b3b4b14. Recorded here
per the instruction.

## What shipped, per scope item

1. **Memory is a real dirty source (S10 #1/#5).** `memory/adapter.ts` rewritten: `dirtyCheck` is
   mtime-first with a manifest short-circuit over the four log files (`memory/log.md`,
   `memory/decisions.md`, `memory.local.md`, `decisions.local.md`) — an unchanged file (mtime matches
   the stored manifest) is never read; only a file whose own mtime advanced is `blake2b`-checksummed.
   Dirty when a file changed, the host dir watermark advanced, or the one-time catch-up has not run.
   `ingest` reindexes via the slice-3 `reindexMemoryFromFiles` (additive for pure appends, reset for a
   non-append shape — detected by comparing each file's retained prefix hash against the manifest).
   Cadence rides the existing M1 first-call-per-process refresh gate (D25) — no watcher, no per-query
   IO (a warm query only stats four files). A11 asserted on a 400-entry committed fixture.

2. **Write-through is always-on on every production path.** MCP `remember` (`serve/serve.ts`) and the
   refresh-path host import (`memory/adapter.ts`) now always carry a `MemoryFiles`; CLI already did
   (slice 3). See Deviations for the treatment of the `files?` param and the living-repo tests.

3. **Migration cold-path trigger.** `adapter.ingest` wires `isMigrationDue → migrateStoreMemoryToFiles`
   (catch-up export + reset rebuild) then an idempotent additive reindex for the doctor report. Proven
   idempotent (adapter run twice sweeps once, no churn). O-06: the false `ctx import` text was corrected
   — it now says host memory lands in the personal overlay as needs-review on cold-path `ctx sync`.

4. **Confirm PROMOTES the overlay create body to Mainline (closes slice-3 D3).** `setMemoryLifecycle`
   confirm on an overlay-only create reconstructs the `mem` line (+ detail sidecar) from the store with
   the ORIGINAL create event id/at and appends it to the committed mainline log; the confirm `dec` line
   is committed to mainline too. On reindex the mainline create wins over the leftover overlay line (F6
   `shadowedOverlay`), so the stale overlay line stays append-only but is deterministically shadowed —
   see the orphan-overlay-line story below. Round-trip proven: a peer that pulls only mainline sees the
   promoted memory active after reindex.

5. **S8a caller-surface split.** `RememberInput.surface` (`"cli" | "mcp"`, default `cli`): CLI/human →
   committed Mainline `active`; MCP/agent → overlay `needs-review`. `serve.ts` passes `surface:"mcp"`,
   `cli.ts` passes `surface:"cli"`. `--local`/three-tier scope stays slice 5.

6. **E4 secret guard on the live committed paths.** `remember` (mainline surface) and the confirm
   promotion both run `scanMemoryForSecret` before the committed zone; a secret-shaped body is diverted
   to the overlay as `needs-review` with a success-shaped remediation note (never a hard error, never a
   committed secret). The migration path already had it (slice 3).

7. **`unresolved-here` first-class (S9).** New rebuildable column `unresolved_here` (migration
   `004-memory-unresolved-here.sql`) on the memory index. `recomputeDriftAtReindex` clears it per
   checkout and re-derives it for an absent anchor that is branch-absent (the committed `anchored-at`
   is NOT an ancestor of HEAD) or external — kept disjoint from `target-removed` drift. Surfaced in
   `select/project.ts` with a branch/import hint (`ⓘ anchor not present on this branch/checkout`);
   status stays `active`, no drift, never down-ranked (rank.ts untouched); locally excluded from the
   push digest (`push/rank.ts`).

8. **E8 ops surface.** New read-only `memory/ops.ts` `memoryOpsReport(store, files)` (the shared seam
   the M3 guide Knowledge page will reuse) — review-queue size + oldest-item age, last-reindex
   `skipped` + `shadowedOverlay` (persisted in the adapter manifest), sidecar dangling/orphan counts,
   external snapshot ages (empty until M4). Wired into `ctx doctor` as a new advisory `memory` check
   (only sidecar-integrity drift flags a fix; aging review items never fail — E8 no-auto-expiry).

## The orphan-overlay-line story (item 4)

When an agent/MCP `remember` or a host import lands a create in the OVERLAY (`needs-review`), and a
human later `confirm`s it, the confirm PROMOTES the create body to the committed Mainline log — but the
original overlay create line is append-only and is **not removed**. So after promotion the same memory
id has TWO create lines: one committed (mainline), one local (overlay). This is deliberate and safe:

- On reindex, mainline is processed first and F6 makes an overlay create whose id mainline already owns
  a **shadowed** no-op (counted in `ReindexReport.shadowedOverlay`, doctor-surfaced). Mainline text
  wins deterministically — the privacy-inversion fix from slice-3 F6 also covers this case.
- The overlay line is gitignored and never shared, so a peer never sees it; the peer reindexes only the
  committed mainline create → identical active memory (proven in the round-trip test).
- The overlay orphan therefore costs one shadowed line locally and nothing on any peer. A future
  overlay compaction (rewrite the overlay dropping promoted ids) is possible but out of scope; the
  `shadowedOverlay` doctor count is the visibility hook if it ever grows.

## Decisions (choices the design left open — I settled these)

- **The `files?` param stays optional in the core signatures; production always passes one.** Item 2
  says "production write paths always carry a `MemoryFiles`" — they now do (CLI, MCP serve, adapter
  import). I did NOT make the param non-optional / default-to-`forStore` internally, because the
  living-repo tests MUST be able to redirect the writer at a sandbox `.contexa` (they read the REAL repo for
  symbols/anchors/host-dir but must never write `.contexa/` into it). The param IS that injection seam.
  This is the conservative reading of "remove the default-off seam": the store-only branch is no longer
  a production mode nor a test dodge — every production surface carries a writer and every living-repo
  write test injects a sandbox writer (see Deviations). Logged so the reviewer can rule otherwise.
- **Reindex shape (additive vs reset) is decided by a per-file retained-prefix hash, not git tips.** The
  adapter has no old/new commit tips at hand, so it compares each watched file's current first-`N`-bytes
  hash (N = the last-synced size) against the stored sha: unchanged prefix + grew → append (additive);
  shrank or prefix changed → reset (shed rows). Deterministic, no git spawn in the dirty path. The
  git-tip-based `pullDeltaReindex` (S10 #3) remains available and tested but is not the adapter's path
  (a delta-proportional pull optimization keyed off git tips is a future refinement).
- **`unresolved_here` is a new index column, not an entity-attr or serve-time computation.** It must be
  materialized (A11: no per-query git spawn) and disjoint from `drift_reason` (S9: never down-ranked).
  A column recomputed at reindex (exactly like `drift_reason`) is the honest home. Cost: migration
  `004`, so the migration set bumped 3→4 (see Deviations — mirrors the slice-3 003 precedent).
- **The adapter's cold-path sequence: host-import → migration-if-due → reindex.** Host import writes the
  overlay + store; migration sweeps any store-only rows then reset-rebuilds; otherwise a plain reindex
  absorbs pulled committed lines. Migration and reindex are never both the shedding path in one pass.
- **E4 divert on confirm-promotion keeps the decision in the overlay.** If a confirm would promote a
  secret-shaped body, the promotion is refused AND the confirm `dec` line is written to the overlay (not
  mainline), so no committed `dec` line dangles on an uncommitted id and nothing secret enters git.

## Deviations (departures from the plan, with reasons)

- **`files?` kept optional (not forced always-on in the signature).** See the first Decision. Item 2's
  letter ("production paths always carry a `MemoryFiles`") is satisfied; the param remains as the
  sandbox-injection seam the hard constraint requires. Not a dodge: no living-repo test relies on
  OMITTING the writer to avoid the real repo — the named ones inject a redirected writer instead.
- **Re-pointed MORE than the two named living-repo tests.** The work order names `2d-biography` and
  `1h-push`. Making the memory *adapter* a write-through source also meant `perf-gates`,
  `2a-code-foundation`, and `2e-perf` — which run `createDefaultRegistry()` + `RefreshEngine.refresh`
  over `projectDir: REPO_ROOT` — would create `.contexa/` in the real repo on the cold path (I hit this: a
  279 KB `memory.local.md` + 99 sidecars appeared in the worktree before I fixed it). Resolution
  ("equivalent isolation", per the hard constraint): `MemoryAdapterOptions.contexaRoot` injection, and
  those three tests pass `memory: { contexaRoot: <temp> }` so the writer lands in a sandbox. `2d-biography`
  and `1h-push` inject a sandbox `MemoryFiles` into their direct `remember`/`import`/`confirm` calls.
  `1c-memory` also opens `REPO_ROOT` stores and calls core write paths but WITHOUT a writer, so it
  stays store-only and never creates `.contexa/` — left as-is (safe, not a dodge; the production surfaces
  all carry a writer). `2d-callgraph`, `2b-touches`, and `2d-biography`'s ingest already ran memory off
  or built adapters without memory — untouched.
- **Migration set bumped 3 → 4** (`004-memory-unresolved-here.sql`). Updated the two migration-set tests
  that assert the exact set (`migrate.test.ts`, `memory-fold.test.ts` F1-backfill) — permitted by the
  work order and mirroring the slice-2/3 precedent. No other pre-existing test's intent changed.
- **Updated the slice-3 `slice3-storage.test.ts` zone-routing cases.** Item 5 explicitly supersedes
  slice-3's "all `remember()` → overlay" routing. The two affected cases now pass `surface:"mcp"` for
  the agent case, and the confirm-path case asserts the item-4 PROMOTION (mainline create + `res.promoted`)
  instead of slice-3's "mainline has no memory line". Same intent, updated for the S8a matrix.
- **Regenerated the `1g-golden` remember transcript.** The MCP `remember` tool now lands `needs-review`
  (S8a), so the golden shows `saved · needs-review` + the overlay/confirm hint. Regenerated with
  `CTX_UPDATE_GOLDEN=1` and reviewed.
- **`1i-install-doctor` expected-check-names list gained `memory`** (the new E8 doctor check).

## Adjacent-found (untouched)

- The `pullDeltaReindex` git-tip delta path (S10 #3) is fully implemented + tested but the adapter uses
  a full additive/reset reindex instead (no git tips at the adapter seam). A delta-proportional adapter
  path is a future refinement, not slice-4 scope.
- `flagAnchorDrift` (`ingest/code/incremental.ts`) is still not `anchored-at`-aware / `unresolved-here`-
  aware (slice-3 adjacent note stands) — the within-branch incremental drift path does not yet emit the
  S9 split; only the reindex path does. Unifying the two drift entry points is future (E7-family).
- External-snapshot `unresolved-here` (category-③ carriers) has no live producer until M4; the reindex
  marks a non-`sym:`/`file:` absent anchor as `unresolved-here`, but no such anchor is authored yet.
- Pre-existing untracked `docs/reference/`, `docs/agents/`, `docs/design/measurement/`, `tools/` at the
  repo root (the parallel session's) — left untouched. `OPEN.md` is not present in this worktree
  (untracked in main); O-06 addressed via the `cmdImport` text, O-11/O-17/O-19 noted here.

## Open questions / handoffs for slice 5

- **`--local` + three-tier push-config merge** (the third zone: external snapshots) — slice 5, as
  scoped OUT here. The `surface` param and the zone plumbing are ready for a `--local` variant.
- **E1 identity-dedup-at-reindex** (slice-3 D1) — still deferred; write-time `sameAs` stays author-local.
- **Overlay compaction** (drop promoted-then-shadowed overlay create lines) — optional; `shadowedOverlay`
  is the doctor visibility hook if the orphan set grows.
- **Adapter delta-proportional pull** (thread git old/new tips into the adapter to use `pullDeltaReindex`
  instead of a full reindex) — a perf refinement if a huge `.contexa/memory` ever makes the additive full
  reindex a cold-path cost.
- **shallow-clone doctor check** (slice-3 D2) — still a note only.
- **`RememberInput.surface` defaults to `"cli"` — fail-OPEN for future agent-side callers (slice-5
  advisory).** Today the only two callers are the CLI (`surface:"cli"`) and MCP serve (`surface:"mcp"`),
  both explicit, so the default is never exercised in production. But a future agent-side caller that
  forgets to set `surface` would silently land in the committed Mainline as `active` (E3 bypass by
  omission). When `--local` / the three-tier scope lands (slice 5), consider making `surface`
  **required** (no default), so a missing surface is a type error, not a silent commit.

## Fable review round 1 (fixes — new commits)

Review of `b3b4b14..c413936` PASSED overall (both logged deviations ACCEPTED as ruled). Three findings
fixed on the same branch.

- **F1 (MEDIUM, latent until M4) — drift must WIN over `unresolved-here` on a mixed-anchor memory.**
  `recomputeDriftAtReindex`'s anchor loop `break`-ed on the first match, so a memory with `[external
  anchor + ancestry-proven-removed local anchor]` could render as `unresolved-here` (active,
  push-excluded) instead of `target-removed` drift — a genuinely stale memory shown as merely
  unresolved, and order-dependent (`store.anchorsOf` order is unspecified). Fix: scan ALL anchors first;
  file `target-removed` if ANY absent local anchor classifies removed (drift wins); set
  `unresolved-here` only when no drift was filed. Test: two memories with the same two anchors in
  OPPOSITE order both resolve to `target-removed` (needs-review, not unresolved-here).
- **F2 (MINOR, robustness) — the promotion guard must not depend on its own unreachability.**
  `promoteCreateToMainline` now returns a boolean; on `false` (mem/create missing — unreachable today
  via the 002 backfill + importer guard) the caller routes the confirm `dec` line to the OVERLAY (same
  shape as the E4 divert) and does NOT set `promoted`, so a create-less memory can never leave a
  dangling committed `dec` line (the exact D3 defect this slice closes). Test: a directly-constructed
  create-less memory → confirm → no mainline mem/dec line, the dec lands in the overlay.
- **F3 (MINOR, hardening) — dirtyCheck short-circuits on mtime AND size.** `dirtyCheck` now skips the
  re-hash only when both mtime and size match the manifest (the `statSync` result was already in hand),
  closing most of the same-millisecond in-place-rewrite window. Accepted bounded cost (noted per the
  reviewer): a touched-but-identical file re-hashes on every subsequent `dirtyCheck` until the next
  `ingest` re-stamps the manifest with the new mtime — a `git pull` that rewrites `.contexa/memory` bumps
  mtime once, so the re-hash is a single extra read per changed file per warm cycle, not a hot-loop cost.

### Reviewer rulings recorded

- **`files?` kept optional — ACCEPTED.** The reviewer ruled the conservative reading (production
  surfaces always carry a writer; the param remains the sandbox-injection seam the hard constraint
  requires; no living-repo test dodges by omitting it) is fine as-is. Not to be "fixed" to non-optional.
- **Wider test re-pointing — ACCEPTED.** Sandboxing the memory writer in `perf-gates` / `2a` / `2e`
  (beyond the two named tests) via `MemoryAdapterOptions.contexaRoot` is the correct equivalent isolation.

## Codex post-merge review fixes (O-17/O-20, 2026-07-07)

- **F-D (C4-1, MAJOR) — promotion must not lose `anchored-at`.** `remember()` computed `anchoredAt` AFTER
  `upsertEntity`, so the live entity attrs never carried it; a confirm BEFORE any reindex called
  `promoteCreateToMainline`, which read `attrs.anchoredAt` → `undefined`, and the promoted mainline line
  dropped its anchor stamp. Fix: compute `anchoredAt` before the entity write and include it in the attrs
  (mirrors `reindex.ingestMemoryEntry`). Test: `slice4-dirty-import.test.ts` "F-D: a pre-reindex confirm
  promotes the create WITH its anchored-at" (MCP note anchored to the readme → immediate confirm → the
  promoted line's `anchored-at` equals the sandbox HEAD).
- **F-E (C4-2, MAJOR) — stale-suspect resolutions follow the confirm's zone.** `resolveConflictViaEvent`
  hardcoded zone `mainline`; a secret-diverted (or unpromoted overlay) confirm therefore wrote a committed
  resolution `dec` referencing an id no peer has (the D3 dangling class). Fix: `resolveConflictViaEvent`
  takes a `zone` parameter (default `mainline`); `setMemoryLifecycle` passes the SAME zone it used for the
  confirm dec. Test: `slice4-dirty-import.test.ts` "F-E: a secret-diverted confirm routes its stale-suspect
  resolution to the OVERLAY" (both the confirm dec AND the resolve-conflict dec land in the overlay;
  mainline `decisions.md` never created).
- **F-F (C4-3, MEDIUM) — doctor's memory check is genuinely read-only.** `checkMemoryOps` opened via
  `openStore`, which mkdirs the shard, runs migrations, and writes `project_root` meta — a doctor run on a
  fresh checkout left traces. Fix: added `openDatabaseReadOnly` (node:sqlite `{ readOnly: true }`,
  available on the 22.16 floor) + `openStoreReadOnly` (no mkdir/migrations/setMeta; throws when the DB is
  absent). `checkMemoryOps` uses it and reports an advisory (`ok: true`) when the store is MISSING or its
  schema predates the shipped code (doctor never upgrades). Test: `slice4-dirty-import.test.ts` "F-F:
  doctor's memory check is genuinely read-only" (no store → no shard dir created + advisory; existing
  store → report returned, DB mtime + size untouched).
