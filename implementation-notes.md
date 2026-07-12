# implementation-notes.md — o33b/drill-guards (GUARD-1 / GUARD-2)

Branch: `o33b/drill-guards` off `feat/1.0.0` (base `303f46ab`).
Scope: `packages/core` only (+ its tests).

Two small guards against the EISDIR class exposed by E0-r2 (the atlas repo tracks
`.claude/skills/*` as git symlinks pointing at directories: git ingest made `file:`
entities for them, and serving a response that touched one threw
`store fault: EISDIR`, killing the whole response).

> Note: this file previously held the O-33(b) retrieval-fix (FIX-1/2/3) notes for the
> now-merged `o33b/retrieval-fix` slice. That work is already on `feat/1.0.0`
> (merge `303f46ab`); this file is repurposed for the current slice's deviation log.

## Files changed

- `packages/core/src/store/readthrough.ts` — GUARD-1
- `packages/core/src/ingest/git/adapter.ts` — GUARD-2
- `packages/core/tests/unit/readthrough.test.ts` — GUARD-1 tests
- `packages/core/tests/unit/git-extract.test.ts` — GUARD-2 test

## Decisions

- **GUARD-1 reason reuse.** As ordered, the non-regular-file case reuses the existing
  `"not-found"` failure reason (message `not a regular file: <path>`); no new enum
  member was added to `ReadThroughFail["reason"]`.
- **GUARD-1 placement.** The `!isFile()` guard sits inside the existing `try` that
  wraps `statSync`, capturing the full `Stats` (was `statSync(...).size`).
  `statSync` follows symlinks, so one call covers symlink→directory, plain
  directories, FIFOs, sockets, and device files before any `readFileSync`. For a
  symlink locator `resolveProjectPath` already resolves `abs` to the realpath (the
  directory), so the `statSync` here sees the directory and the guard fires either
  way.
- **GUARD-2 existence semantics.** `#ensureFileEntity` now does one
  `statSync(join(store.projectRoot, path))`. `statSync` **throwing** (path absent from
  the working tree) → keep the entity (historical/deleted files stay in the graph; the
  target-removed register depends on it). `statSync` **succeeding with `!isFile()`** →
  path exists but is a non-regular target → skip (`return 0`). Matches the ordered
  semantics exactly (statSync follows symlinks; symlink→directory is desired to skip).
- **Hot-path cost.** No caching added, per the work order. `fileSeen` already dedups,
  so the guard adds at most one `statSync` per unique path per ingest run.
- **Test skip pattern.** Each affected test file computes a module-scope
  `SYMLINKS_SUPPORTED` boolean (probe: temp dir, `mkdirSync` + `symlinkSync(..., "dir")`,
  catch → false) and gates the symlink cases with `test.skipIf(!SYMLINKS_SUPPORTED)`.
  This mirrors the repo's existing `describe.skipIf(<precomputed boolean>)` pattern
  (1c/1h acceptance tests). The pre-existing `resolveProjectPath` symlink-escape test
  kept its original inline try/catch-return style (untouched — out of scope).

## Deviations

- None. Both guards implemented as specified.

## Adjacent-found (untouched)

- The 5 living-repo acceptance failures named in the work order (1e A5-adr, 1f
  A6-search, 1g A7-why, 1g A7-drill, 2d B4-mention) reproduce on this branch exactly
  as documented — pre-existing doc-churn/ranking fragilities in living-repo tests,
  unrelated to these guards. Not touched.
- `resolveProjectPath` returns `abs: real` (the realpath) for the ok case, so a valid
  in-root symlink→file would be read through its resolved target. Fine for regular
  files; noted only because it interacts with GUARD-1's statSync target. No change.

## Open questions

- None.
