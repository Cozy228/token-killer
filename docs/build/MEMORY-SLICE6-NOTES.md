# Slice 6 — identity dedup + content-hash anchors + two-copy eval (implementation notes)

<!-- Deviation-log build artifact (no YAML frontmatter: this repo ingests itself, and a
`status:` frontmatter field would classify as a decision entity and trip the living-repo doc
assertion — see slice-3/4/5 notes). Absorb the surviving verdict into a REGISTER at slice close,
then archive, per the slice-1/2/3/4/5 precedent. -->

Work order: `MEMORY-SLICE6-GOAL-PROMPT.md` (scope items 1–4), under `MEMORY-SYNC-GOAL-PROMPT.md`
(item 6 + hard invariants + acceptance bar), `MEMORY-DECISIONS.md` (E1/E5/E6), `MEMORY-SLICE3-NOTES.md`
(D1 ruling, R2/R9 + the Codex-fix section), `MEMORY-SLICE5-NOTES.md` (opt-out push open question +
Codex-fix section). Built directly on `feat/1.0.0 @ 387bbb2` (O-17/O-20 fixes merged).

## What shipped, per scope item

1. **D1 identity layer — `sameAsCandidate` derived at reindex.** `recomputeIdentityAtReindex`
   (`reindex.ts`) derives near-duplicate identity conflicts from the committed memory bytes and
   files them as OPEN `sameAsCandidate` conflicts. Follows the S4 "claims=evidence, conflicts=state"
   pattern exactly like `stale-suspect`: DELETE the cached `sameAsCandidate` conflicts, then re-file
   only the ones re-derived from current committed content. Derivation is pure + content-keyed
   (`identityCandidatePairs`, `dedup.ts`): a word-token blocking index (lossless for the Jaccard gate)
   → the entropy/number-guarded `fuzzyDuplicate` → canonical `[min,max]` pairs, sorted. No wall-clock,
   no FTS rank cap, no store-insertion order → identical across a long-lived peer and a fresh clone.
   Runs in BOTH the full reindex and the pull-delta path, independent of the code index. Resolution is
   the existing append-only `resolve-conflict`/`dismiss` verb (C4) folded by `rebuildConflictStatuses`
   (content-addressed refs, R8) — survives reindex.

2. **O-18 content-hash baseline in the anchor bytes.** New OPTIONAL committed grammar token
   `anchor-sig=<enc-json>` (`serialize.ts`) — a per-anchor map `{ h, a? }` where `h` = the target
   entity's `contentHash` (the store's existing `blake2bHex` primitive — no second pipeline) and `a`
   = the symbol's `arity`. Captured at write time (`anchorSigsFor`, `remember.ts`) and carried verbatim
   through promotion (`promoteCreateToMainline`) and migration/catch-up (`catchup.ts`). At reindex,
   `recomputeDriftAtReindex` compares a PRESENT anchor target's current `{contentHash, arity}` to the
   committed baseline: arity differs → `signature-changed`; else hash differs → `body-changed` — the
   SAME split as the within-branch `flagAnchorDrift` (A5). An absent map = a legacy anchor → no
   present-target drift = exactly today's behaviour. Hashing at write/reindex time only (A11: no
   per-query file IO or git spawn).

3. **Two-working-copy collaboration eval** (`slice6-identity-hash.test.ts`, written before/with the
   derivation). Five REAL git working-copy fixtures (mkdtemp + `git init`/`git clone`/`git merge`, never
   this repo): (a) merge-clean-but-contradictory — two near-identical memories union-merge cleanly, the
   post-merge reindex files a `sameAsCandidate` conflict (the case git cannot test); (b) convergence — A
   commits a memory + a dismiss resolution, B `git clone`s, both reindex to E6 logical dump equality;
   (c) overlay-never-committed — a `--local` note on A is gitignored and never reaches B via clone;
   (d) secret-guard-effective — a secret-shaped note diverts to the overlay, never in A's committed log
   nor B's; (e) E5 decision-collision — retire on one branch + supersede on another → clean union merge
   → contradiction conflict filed + later-by-total-order (supersede) wins.

4. **Slice-5 handoff — committed-vs-overlay provenance.** New rebuildable column `origin_zone`
   (migration `005-memory-origin-zone.sql`; `MemoryRow.originZone`; `store.setMemoryOriginZone`).
   `ingestMemoryEntry` records the zone the create was ingested from (mainline wins for a shadowed id).
   `push/rank.ts` excludes `originZone === "overlay"` from the locally-placed digest, so an opt-out
   repo's own notes (redirected to the overlay by `MemoryFiles.localOnly`) never leak into a
   possibly-committed `AGENTS.md`, while a peer's genuinely-committed mainline note is unchanged.
   `undefined` (store-only / never reindexed) → includable (today's behaviour), so no existing test
   shifts.

## Decisions (choices the design left open — I settled these)

- **Item-2 hashing scheme = the target entity's `contentHash` + symbol `arity`, classified exactly
  like `flagAnchorDrift`.** The WO left "normalized signature vs body span" to the builder; the
  acceptance bar is E-series determinism, not a scheme. Reusing the entity's already-computed
  `contentHash` (blake2b of the normalized span) means NO second hash pipeline (an explicit
  constraint), and carrying `arity` alongside lets the from-scratch reindex reproduce the A5
  signature-vs-body split faithfully (arity change → `signature-changed`/needs-review; body change →
  `body-changed`/down-rank) instead of collapsing both to one conservative class. Both inputs are
  deterministic across clones for the same source, so peer == fresh clone (E6). A file anchor with no
  `contentHash` simply gets no baseline (stays legacy) — `target-removed` still covers its deletion.

- **Identity derivation reuses the write-time `fuzzyDuplicate` precision gate, but recall is a
  deterministic token-blocking index, NOT the write-time FTS recall.** The write path
  (`findDuplicateCandidates`) uses `ftsSearch(match, 20)` — a rank CAP whose ordering can differ across
  SQLite builds near the boundary, which would break the E6 "peer == fresh clone" bar. The reindex
  derivation instead blocks by shared word token (a lossless pre-filter: two gists with Jaccard ≥ 0.6
  necessarily share tokens) and is a pure function of the gists. The write-time author-local dedup is
  left untouched (it drives the CLI advisory); at the next reindex the derived layer takes over and
  canonicalises — the E6 acceptance is post-reindex, so the two never disagree in the dump (which keys
  conflicts by claim CONTENT, not numeric id).

- **`origin_zone` is EXCLUDED from the E6 logical dump.** It is per-machine derived index state (like
  `unresolved_here`), and a `--local` overlay note exists on only one machine, so including it could
  make a peer and a clone diverge. The dump stays about logical memory equality; provenance is a local
  read for the push digest only. Left `dump.ts` unchanged.

- **R9 refinement is per-ANCHOR, not per-memory.** Previously a suppressing confirm `continue`d the
  whole memory, skipping every anchor. Now the confirm suppresses re-deriving `target-removed` for an
  ABSENT anchor only; a PRESENT anchor still runs the O-18 hash check. So a confirmed-absent target that
  REAPPEARS-and-CHANGES re-files drift (the hash comparison beats the stale `clearedDrift`) — the R9
  reappear edge, now deterministic at reindex and tested.

## Deviations (departures from the plan, with reasons)

- **R9 "reappear-then-removed-again" is closed only for the reappear-and-CHANGE leg at the reindex
  boundary; the reappear-IDENTICAL-then-removed leg still defers to the live `flagAnchorDrift`.** A
  from-scratch reindex sees only the CURRENT checkout, not an intermediate reappearance, so a target
  that reappears byte-identical and is then removed again cannot be distinguished from "absent since the
  confirm" without walking history. The content-hash comparison closes the case the WO names as
  testable (a changed reappeared target re-derives drift despite the stale confirm — `slice6…` "R9: a
  reappeared-and-changed target…"); the identical-reappear-then-remove corner remains covered by the
  within-branch incremental `flagAnchorDrift`, exactly as the slice-3 R9 note already documented. No
  behaviour is LOST relative to slice 3 — this is a strict improvement.

- **Two migration-set unit tests updated** (permitted by the WO, mirroring slices 3/4/5): the migration
  set changed by design (added `005-memory-origin-zone`). `migrate.test.ts` (`applied` `[1,2,3,4]` →
  `[1,2,3,4,5]`, `schemaVersion` 4 → 5, + assert the `origin_zone` column) and `memory-fold.test.ts`
  (the 001-only-DB test's `applied` `[2,3,4]` → `[2,3,4,5]`). No other pre-existing test modified; all
  slice-1..5 E-series/store/memory/push/select tests pass unmodified.

## Adjacent-found (untouched)

- **`flagAnchorDrift` (`ingest/code/incremental.ts`) is still not `anchored-at`/`unresolved-here`-aware**
  and does not read the O-18 baseline — it is the within-branch incremental path with a live prev→next
  comparison, so it does not need the committed baseline. Unifying the two drift entry points
  (incremental vs reindex) around the baseline is a future cleanup (E7-family), not slice-6 scope.
- **The write-time `findDuplicateCandidates` FTS-cap-20 recall** is best-effort and can miss a candidate
  the reindex derivation catches; left as-is (it only drives the live CLI advisory; the committed-derived
  layer is authoritative).
- **`identityCandidatePairs` is worst-case O(n²) in a token bucket** (a stop-word-heavy corpus). The
  entropy floor + `MIN_GIST_CHARS` prune most buckets, and memory is authored (hundreds, not millions),
  and reindex is a cold path (A11 covers dirty/serve, not reindex). A rarest-token blocking refinement is
  the follow-up if memory counts ever explode.
- **`docs/reference/`, `docs/agents/`, `docs/design/measurement/`** untracked at the repo root (the
  parallel session's) — left untouched, as instructed.

## Open questions

- None blocking. The residual R9 identical-reappear corner (above) and the identity O(n²) scale note are
  the only follow-ups, both documented and both no worse than the pre-slice-6 baseline.

## Self-verification (acceptance walk)

Ran all three suites in the worktree:
- core: `pnpm --filter @ctx/core test` → **442 passed | 2 todo (444)**, 48 files.
- cli: `pnpm --filter @ctx/cli test` → **23 passed (5 files)**.
- product (root): `pnpm test:product` → **1896 passed | 4 skipped (1900)**.
- typecheck: `tsc --noEmit` green for both `packages/core` and `packages/cli`.
- Red→green proven for the two new mechanisms: disabling `recomputeIdentityAtReindex` → the two item-1
  reindex-derivation tests fail; disabling `presentTargetDrift` → the three item-2 drift tests fail;
  both restored → green.

Per acceptance line (test that proves it):
- Five two-copy fixtures green → `slice6-identity-hash.test.ts` "item 3" (a)–(e).
- Identity candidates + drift re-derivation byte-deterministic peer vs fresh clone (E6 dump equality) →
  "item 1 … peer == fresh clone (E6)" + "item 2 … re-derives … on a fresh clone".
- Legacy anchors (no hash) behave exactly as today on every path → "item 2 … legacy anchor does not" +
  the `anchor-sig round-trips … absent = legacy` round-trip test.
- Identity conflicts surfaced never auto-merged; resolved via the decision log → "item 1 … open
  sameAsCandidate" + "a human dismiss … folds … survives reindex".
- Opt-out repo's local digest excludes overlay-kept notes while a peer's shared digest is unchanged →
  "item 4 … overlay-redirected note is excluded; a peer's shared digest is unchanged".
- A11 not regressed (no per-query file IO/git spawn; hashing at write/reindex only) → `perf-gates.test.ts`
  green in the core run; item-2 capture reads resolved store entities, item-1/2 derivation is reindex
  (cold path) only.
- Hard invariants (no LLM/network/egress; conflicts surfaced never auto-merged; non-destruction; E3) →
  the global-invariants + slice-3/4/5 E-series suites unmodified and green; identity/drift are cache-only
  re-derivations (committed bytes + append-only events untouched).
