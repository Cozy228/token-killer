# Implementation notes — Codex post-merge review fixes (O-17/O-20)

Branch `memory/codex-postmerge-fixes` off `feat/1.0.0`. Eight arbitrated fixes
(F-A … F-H) to memory slices 3/4/5, one test per fix. Findings already verified
against HEAD by the reviewer — implemented as arbitrated.

## Decisions
- Read-only store open (F-F): added `openDatabaseReadOnly` (node:sqlite
  `{ readonly: true }`, verified available on the Node 22.16 floor / running 22.22)
  + `openStoreReadOnly` (no mkdir, no migrations, no setMeta; throws when the DB
  file is absent). Doctor's `checkMemoryOps` uses it and reports an advisory when
  the store is missing OR its schema predates the shipped code (never upgrades).
- F-G disclosure: added `committedZoneDisabled?` to `LifecycleResult` so the CLI
  can tell an E4 repo-opt-out ("this repo does not commit memory") apart from a
  `--local` note kept local ("local only — never shared"). Core semantics proven
  in the core acceptance suite; the disclosure string proven in the CLI suite.
- `checkMemoryOps` exported so F-F can drive it in isolation (a full `runDoctor`
  would create the store via `checkStore` before `checkMemoryOps` runs).

## Deviations
- (none material — see Decisions for the two choices the WO left open.)

## Adjacent-found (untouched)
- (none.)

## Open questions
- (none.)

## Not fixed (record only)
- C3-4 (slice-3 active-overlay-in-push-digest): subsumed at HEAD by slice-4/5
  routing (cli→mainline, mcp→needs-review, local→remember-local push-excluded).
  The residual (an OPT-OUT repo's ordinary notes in its own locally-placed digest)
  is slice-6 scope item 4 (already scheduled). No code here.
