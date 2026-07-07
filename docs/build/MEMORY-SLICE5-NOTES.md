# Slice 5 — personal overlay + three-tier scope (`--local`) (implementation notes)

<!-- Deviation-log build artifact (no YAML frontmatter: this repo ingests itself, and a
`status:` frontmatter field would classify as a decision entity and trip the living-repo doc
assertion — see slice-3/4 notes). Absorb the surviving verdict into a REGISTER at slice close,
then archive, per the slice-1/2/3/4 precedent. -->

Work order: `MEMORY-SLICE5-GOAL-PROMPT.md` (5 scope items), under `MEMORY-SYNC-GOAL-PROMPT.md`
(item 5 + hard invariants + acceptance bar), `MEMORY-DECISIONS.md` (E3, E4, D27/D30),
`MEMORY-SYNC-SETTLEMENTS.md` (S8 matrix; the `.ctx/push.jsonc` = three-tier (b) and
`.ctx/*.local.*` = three-tier (c) zone rows), and `MEMORY-SLICE4-NOTES.md` (the `surface`
fail-open advisory + the D2 shallow-clone handoff). Built directly on `feat/1.0.0 @ 8c05075`.

## Precondition waiver (O-17)

The work order's precondition — the O-17 Codex post-merge review of slices 3+4 fixed or explicitly
waived — was **explicitly WAIVED by the maintainer** for this build ("The precondition (O-17 Codex
review) has been explicitly waived by the maintainer for this build; proceed"). Recorded here per
the durable-context requirement.

## What shipped, per scope item

1. **CLI `remember --local` (S8 / E4).** New caller surface `local` on `remember()`: lands in the
   gitignored personal OVERLAY as `active` (human-authored → no review queue; deliberately divergent
   my-view attention that NEVER syncs). Plain CLI `remember` (surface `cli`) → committed Mainline
   `active`, unchanged. MCP (`mcp`) → overlay `needs-review`, unchanged. `cmdRemember` maps `--local`
   → `surface: "local"` and discloses the landing zone: `local only — never shared`.

2. **`surface` is REQUIRED.** `RememberInput.surface` lost its `"cli"` default — a caller that
   forgets its surface is now a compile error, closing the slice-4 fail-open (a future agent-side
   caller can no longer silently land in the committed zone). The routing is a small
   `ROUTE_FOR_SURFACE` table (`cli → mainline/active`, `mcp → overlay/needs-review`,
   `local → overlay/active`). All production callers already stated their surface (`cli.ts`,
   `serve.ts`); every store-only test fixture now states the surface it means to test (see
   Deviations for the batch update + the two wrapper helpers).

3. **Three-tier push config.** The shared committed `.ctx/push.jsonc` (project truth: pins/vetoes,
   D27/D30) merges with a PERSONAL overlay `.ctx/push.local.jsonc` (the `.ctx/*.local.*` convention;
   already gitignored by the memory scaffold's `*.local.jsonc` pattern). `mergePushConfig` is a
   deterministic merge (shared entries first, then overlay extras, de-duplicated). New readers reuse
   the existing `parsePushConfig` pipeline: `readPushConfig` (SHARED only — unchanged contract, used
   for the placed/committed block + the opt-out read), `readLocalPushConfig` (overlay only), and
   `readMergedPushConfig` (the LOCAL view). `ctx push --local` renders the merged local view to
   stdout, DISPLAY-ONLY — never placed into a host file. No write path from the personal layer into
   the committed file. See the Decision on why the placed block stays SHARED-only.

4. **Per-repo opt-out knob (E4).** New `commitMemory` boolean on the shared `.ctx/push.jsonc`
   (default `true`; `false` = this repo must not commit memory). Enforced at ONE chokepoint:
   `MemoryFiles.localOnly` (read once at construction via `readMemoryOptOut(ctxRoot)`) redirects
   EVERY write that logically targets the committed Mainline zone to the overlay
   (`appendMemory`/`appendDecision`), so nothing ever creates or appends the committed logs. Reads
   still address the literal zone (mainline reads stay empty; reindex never double-counts). This
   covers all four write paths automatically: CLI `remember`, confirm-promotion (also skips the
   promotion attempt so no Mainline-shaped create body is reconstructed), migration
   (`catchUpStoreOnlyEvents` → `appendMemory("mainline")` → redirected), and host import (already
   overlay). `remember`/`setMemoryLifecycle` mirror the zone + emit a success-shaped disclosure.
   Doctor's `memory` check surfaces the mode (`commit-memory OFF/ON`). `editPinVeto` preserves
   `commitMemory: false` across a pin/veto edit so the CLI never erases the opt-out.

5. **Shallow-clone doctor advisory (D2).** New read-only `git-depth` doctor check: detects a shallow
   clone via `.git/shallow` (resolving `.git`-as-a-pointer-file and `commondir` for linked worktrees;
   pure filesystem, no git spawn) and WARNS that the `anchored-at` ancestry classifier is unreliable
   (`unresolved-here` vs `target-removed`). Advisory only — `ok: true` always (warn, never fail).

## Decisions (choices the design left open — I settled these)

- **The placed/committed push block uses the SHARED config ONLY; the personal overlay is a
  DISPLAY-ONLY local view.** Item 3 requires "no write path from the personal layer into the
  committed file" and "LOCAL-EFFECT-ONLY". The push block is placed into `AGENTS.md`/`CLAUDE.md`,
  which are frequently git-committed, so folding personal pins into the placed block WOULD be a write
  path from the personal layer into a committed file. Resolution: `readPushConfig` (shared) drives
  the placed block (its digest is byte-identical across peers with the same committed config, exactly
  the acceptance's "SAME shared push digest"); `readMergedPushConfig` drives `ctx push --local`, which
  only prints. This is the conservative reading and is what makes the two-working-copy acceptance pass
  cleanly.

- **A `--local` note is excluded from the push digest via a new `remember-local` origin.** A
  `--local` note is `active` in the author's own store, so without a marker it would surface in the
  author's OWN placed push block (→ a never-shared note in a possibly-committed `AGENTS.md`). Since
  the push digest is shared project presentation and `--local` means "never shared", `rankGotchas`
  now excludes `origin === "remember-local"` (from both the auto-ranked set and pin resolution). This
  reuses the established provenance field (`MemoryOrigin`) — round-trips through `serialize`/reindex,
  needs NO migration, and only `catchup.ts` branches on origin (`host-import` prefix — disjoint). The
  work order named only "never in a committed file nor a peer's push digest"; excluding it from the
  author's own digest too is the conservative privacy reading. See Open questions for the opt-out
  analogue.

- **`commitMemory` lives on `.ctx/push.jsonc` (the shared config), read from `ctxRoot`, not
  `projectRoot`.** Item 4 says "Knob location: the shared config (item 3)". `readMemoryOptOut(ctxRoot)`
  keys on the `.ctx` dir so a sandbox-injected `MemoryFiles` reads its OWN `.ctx` — the living-repo
  tests never read the real repo's config (the hard constraint). It is parsed only from the SHARED
  file; a personal overlay never opts a whole repo out (opt-out is project truth, taken from the
  shared layer in `mergePushConfig`).

- **The opt-out is enforced at the `MemoryFiles` file layer (defense-in-depth), and mirrored in the
  higher-level write logic (disclosure/messaging).** The file redirect is the HARD guarantee ("zero
  committed-zone writes"); `remember`/`setMemoryLifecycle` also consult `files.localOnly` so the
  store event zone, the `promoted` flag, and the CLI disclosure all agree. Either alone would be
  correct-ish; both together are correct AND honest.

- **A11 preserved.** The opt-out read and the config merge are cold-path only: `MemoryFiles.forStore`
  / adapter `ingest` (write/cold path) read the opt-out once per invocation; the merge is only in
  `ctx push --local` (a cold-path command). The A11 hot paths (`dirtyCheck`, serve) are untouched —
  `dirtyCheck` does not construct `MemoryFiles`, and nothing per-query reads the config.

## Deviations (departures from the plan, with reasons)

- **Added a `remember-local` value to `MemoryOrigin` (a shared type).** Not in the literal scope
  list, but required to keep a `--local` note out of the shared push digest (see the Decision). Low
  blast radius: `serialize` already defaults unknown/absent origin to `"remember"`, and the only
  origin branch (`catchup.ts` host-import) is disjoint. No migration.

- **Batch-updated ~40 test call sites for the now-required `surface`.** Item 2 explicitly permits
  this ("Update all callers; store-only unit fixtures pick the surface they mean to test"). Two
  wrapper helpers gained a `surface: "cli"` default (`e-memory-quality.test.ts` `remb`,
  `memory-fold.test.ts` `remb`); ~36 direct `remember(store, { … })` calls across
  `1c-memory`, `1h-push`, `2c-fingerprint`, `2d-biography`, `slice3-storage`, `slice4-dirty-import`,
  `memory`, `push-block`, and `memory-fold` got an explicit `surface: "cli"` (the historical default
  they relied on). No test's INTENT changed — `"cli"` is the store-only committed-active semantics
  those fixtures already assumed.

- **`1i-install-doctor` expected-check-names list gained `git-depth`.** The new doctor check; mirrors
  the slice-4 `memory` addition.

- **`push-config.test.ts` gained `commitMemory` + `mergePushConfig` + `readMemoryOptOut` cases.** New
  behavior; the existing "unknown key rejected" case still holds (`commitMemory` is now a known key,
  but `pinn`/typos remain unknown).

## Adjacent-found (untouched)

- **`flagAnchorDrift` (`ingest/code/incremental.ts`) still not `anchored-at`/`unresolved-here`-aware**
  (slice-3/4 adjacent note stands) — the within-branch incremental drift path does not emit the S9
  split; only the reindex path does. Out of scope.

- **`pullDeltaReindex` git-tip delta path** remains implemented+tested but the adapter uses a full
  additive/reset reindex (slice-4 adjacent note stands).

- **The migration `CatchUpReport.toMainline` counter** reflects the LOGICAL zone; in an opt-out repo
  the physical write is redirected to the overlay by `MemoryFiles.localOnly`, so the counter can read
  `toMainline > 0` while nothing physically hit the committed zone. Left as-is (internal diagnostics,
  not a committed-zone write); noted so a future reader isn't surprised.

## Open questions / handoffs for slice 6

- **Opt-out repo + push digest.** A `--local` note is excluded from the push digest via
  `remember-local`; an OPT-OUT repo's ordinary notes keep `origin: "remember"` and so still surface in
  the (locally-placed) push block. If the opt-out repo commits `AGENTS.md`, those local-kept notes ride
  along. Excluding overlay-only notes from the author's own push digest in general would need a
  persisted committed-vs-overlay provenance column (reindex + migration) — deferred; it belongs with
  the slice-6 reindex-semantics work (D1/O-18), whose two-working-copy fixtures are its natural test.

- **Overlay compaction / delta-proportional pull** — still evidence-gated (the `shadowedOverlay`
  doctor count + A11 gates are the triggers), NOT scheduled (per the work order's "Explicitly OUT").

- **Identity-dedup-at-reindex (D1) + content-hash anchor baseline (O-18)** — ruled to slice 6, untouched.

## Self-verification (acceptance walk)

Ran all three suites in the worktree:
- core: `pnpm --filter @ctx/core test` → **421 passed | 2 todo (423)**, 47 files.
- cli: `pnpm --filter (cli) test` → **22 passed (5 files)**.
- legacy (root): `pnpm test:product` → **1896 passed | 4 skipped (1900)**.
- typecheck: `tsc --noEmit` green for both `packages/core` and `packages/cli`.

Per acceptance item (test that proves it):
1. `--local` → overlay+active; never in a committed file nor a peer's push digest →
   `slice5-local-overlay.test.ts` "surface routing…" + "`--local` note never appears…".
2. same committed config + different overlays → SAME shared digest, DIFFERENT local views →
   `slice5-local-overlay.test.ts` "three-tier: same committed config…" + `push-config.test.ts`
   `mergePushConfig` determinism/order cases.
3. opt-out → zero committed-zone writes across remember/confirm/migration/import, functional locally →
   `slice5-local-overlay.test.ts` "E4 opt-out: zero committed-zone writes…".
4. `surface` required compiles/behaves → the whole suite compiles under the required type; routing
   proven by "surface routing…".
5. shallow-clone doctor warning fires → `slice5-local-overlay.test.ts` "doctor shallow-clone
   advisory…"; opt-out mode surfaced → "doctor surfaces the E4 opt-out mode".
   CLI disclosure → `memory-cli.test.ts` "remember --local discloses…"; `ctx push --local` view →
   `push-cli.test.ts` "push --local renders the merged local view…"; opt-out preserved across a pin
   edit → `push-cli.test.ts` "push pin preserves the E4 commitMemory opt-out".

## Codex post-merge review fixes (O-17/O-20, 2026-07-07)

- **F-G (C5-1, MAJOR) — confirm must never promote a `--local` note.** `setMemoryLifecycle`'s promotion
  guard checked `files.localOnly` but not the memory's origin, so a `remember --local` note (origin
  `remember-local`) confirmed via `ctx memory confirm` got its body appended to the committed `log.md` —
  breaking "--local never appears in any committed file". Fix: a `remember-local` memory routes its confirm
  dec (and the F-E resolution decs) to the overlay and is never promoted, regardless of the repo opt-out.
  Added `committedZoneDisabled?` to `LifecycleResult` so the CLI tells an E4 opt-out apart from a `--local`
  note; the CLI now discloses "local only — never shared" for the latter. Tests:
  `slice5-local-overlay.test.ts` "F-G: confirm on a `--local` note never promotes it …" (committed files
  never carry the id; confirm dec in the overlay; not `promoted`) + `memory-cli.test.ts` "F-G: confirming a
  --local note discloses it stays local …" (disclosure mentions local, not "promoted").
- **F-H (C5-2, MAJOR) — catch-up zone routing honours surface intent.** The catch-up zone default routed
  everything except host-import+needs-review to MAINLINE, so a files-less `remember(store, {note,
  surface:"local"})` (public core API — `files` optional) and a files-less `mcp` row got exported to the
  committed zone by migration/catch-up. Fix: zone = `overlay` when `origin === "remember-local"` OR the
  current status is `needs-review` (any origin — E3: needs-review is unconfirmed, committed =
  human-authored-or-confirmed); terminal/active AUTHORED rows keep mainline. Origin exports verbatim so
  `remember-local` stays push-excluded after reindex. Test: `slice5-local-overlay.test.ts` "F-H: files-less
  local/mcp store-only rows catch-up into the OVERLAY …" (both land in the overlay — local `active`
  `remember-local`, mcp `needs-review`; fresh reindex preserves zones; push digest excludes both).
