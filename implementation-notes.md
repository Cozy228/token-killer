# implementation-notes.md — O-33(b) retrieval fixes (FIX-1/2/3)

Work order: `docs/build/O33B-RETRIEVAL-FIX-GOAL-PROMPT.md`
Branch: `o33b/retrieval-fix` off `feat/1.0.0` (base `a285578e`).
Scope: `packages/core/**` (+ its tests) only. No CLI / measurement changes.

## Decisions (choices the design left open)

- **`filesByPathSuffix` matches on `locator.path`, not `name`.** File entities are
  NOT uniformly named by their full relative path: `ingest/docs.ts:223` names a docs
  file entity by `basename(relPath)`, whereas `ingest/git/adapter.ts:305` and
  `ingest/code/adapter.ts:488` use the full relative path. `locator.path` is the one
  field that is always the full project-relative path, so the suffix lookup resolves
  on `json_extract(locator, '$.path')` (the same shape `#isKnownEntityPath` already
  uses). Matching on `name` would silently miss docs files.
- **Case-insensitive resolution.** Exact match uses `= ? COLLATE NOCASE`; the suffix
  match uses `LIKE` (ASCII case-insensitive by default). Safer on case-insensitive
  filesystems; deterministic via `ORDER BY id`.
- **`QueryToken` gains a required `fileShaped: boolean`.** Path tokens (containing
  `/`) and bare basenames with an extension (`rewrite.ts`) are flagged. Path tokens
  carry the normalized project-relative suffix (forward slashes, `:line[:col]`
  stripped, absolute/drive/`./` prefix removed) in `text`/`raw`.
- **File-shape detection is deliberately liberal; a miss is harmless.** `isFileBasename`
  accepts exactly one dot with a 1–5 char lowercase extension (so `dotted.path` also
  matches). A token that resolves to no file entity via `filesByPathSuffix` falls
  through to the ordinary name/FTS named-seed path — prose stays reachable — so a
  false positive costs one empty store lookup and nothing else.
- **New tunable `FILE_SUFFIX_SEED_LIMIT = 8`** in `select/constants.ts`, added to
  `disclosedConstants()` (`fileSuffixSeedLimit`). Caps the file entities force-seeded
  by one path/basename token so an ambiguous bare basename (`index.ts`) cannot flood.
- **File-resolved named seeds keep the existing test/archive demotion.** The
  established named-seed injection multiplies by `demotion(entity)`; the FIX-2 file
  seeding reuses the same `injectNamed` helper for consistency. A named seed at
  `100 × 0.3` still dominates bm25, so precision is preserved. (See Open questions.)
- **Path tokens are excluded from FTS.** `toFtsMatch` and the `missUnknownRef`
  candidate probe filter out any token whose text contains `/` — those carry no FTS
  tokenchars and would only build noisy phrase queries; their constituent words are
  already emitted separately.
- **FIX-3 did not extend the `SelectMiss.reason` union.** Both the ref-mode miss and
  the task-mode zero-seed miss keep `reason: "unknown-ref"`; only the guidance text
  is split, via an `origin: "ref" | "task"` parameter. The work order asked to "split
  the guidance", not to add a reason — this is the smallest change and keeps existing
  `reason === "unknown-ref"` assertions valid.

## Deviations (departures from the plan)

- None substantive. The only interpretive call is the FIX-3 reason-enum decision
  above (conservative: guidance-only split, no new enum member).

## Adjacent-found (untouched)

- **`enum_declaration` has the same indexing gap as type aliases** (FIX-1 note). The
  tier-1 `.scm` does not capture `enum_declaration`, so `export enum Foo {…}` has no
  entity / FTS row and enum-name queries never reach code — exactly the R-B failure
  fixed for `type_alias_declaration`. OUT OF SCOPE per the work order; left for the
  maintainer to rule separately.
- **5 pre-existing living-repo acceptance failures on the base commit** (`a285578e`),
  present with AND without this change (identical failure set, verified by running the
  full core suite on the clean base):
  - `1e-docs.test.ts > A5-adr`
  - `1f-selection.test.ts > A6-search`
  - `1g-serve.test.ts > A7-why`
  - `1g-serve.test.ts > A7-drill`
  - `2d-callgraph.test.ts > B4-mention (parseDiffHunks references link)`
  These ingest THIS repo and are sensitive to its live doc/symbol contents (the known
  "living-repo tests fragile to doc-churn" class). They are NOT caused by this work
  and are not in its scope. Base: `5 failed | 495 passed | 2 todo (502)`. Worktree:
  `5 failed | 506 passed | 2 todo (513)` — i.e. +11 new passing tests, same 5 failures.

## Open questions

- Should a file-shaped token that resolves to a **test file the user explicitly named**
  bypass `TEST_FILE_DEMOTION`? Current behavior demotes it (consistent with existing
  named-seed handling). An explicit `foo.test.ts` query arguably wants the test
  undemoted. Left as-is to avoid changing demotion semantics under this work order.
