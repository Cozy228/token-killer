---
case: 7
voter: claude
date: 2026-07-12
---

# Vote — Case 7 (token-killer#52), claude

All evidence retrieved this session from a detached worktree pinned at merge commit
`8de065d1e5972d357f21fe3bb470e166628e5365` (verified: `git log --oneline` shows HEAD = the
#52 merge into feat/0.3.1, merge-committed 2026-06-17T17:34:59Z) and from the GitHub API
with records timestamped at or before the cutoff 2026-06-17T17:38:12Z.

## Q1 — combined routing + two-cache consistency

**Score: correct**

I independently re-derived the routing at the merge commit. `src/inspect/cli.ts:290-325`:
`filtered = sinceMs !== undefined || opts.session !== undefined`; the filtered branch calls
`scan(...)` with `eventCache` (built at cli.ts:279 as namespace `"scan-events"`), the
unfiltered branch calls `inspectSinglePass(...)` with `scanCache`+`habitsCache`
(cli.ts:312-317). `src/inspect/scan.ts:533-535`: filtered → `scanWindowed` when an
`eventCache` is present, else `scanLive`; unfiltered → `scanCached`. That matches the
operator's flag→path map exactly. On consistency: both namespaces go through the same
envelope in `src/inspect/extractCache.ts` — key is (path-hash filename, extractCache.ts:68-71;
mtimeMs+size, lines 102-103; `CACHE_SCHEMA_VERSION`, line 102), and the recorded design rule
is "Keyed strictly on (path, mtimeMs, size, SCHEMA_VERSION). Any mismatch is a miss" plus
"The key already guarantees correctness; this only bounds disk growth" (lines 12, 35-36), so
a stale entry is a miss and gets re-parsed, never served. `scanWindowed` reads only
`eventCache` (scan.ts:709-720); the single-pass path reads only `scanCache`/`habitsCache`
(passes.ts:107-124) — no reported number mixes namespaces. Tests at cutoff assert cache
transparency against a live scan (extractCache.test.ts:200, 236, 252, 270). The operator's
"warm/cold independently but never disagree on content for the same file state" is what the
admissible record establishes.

## Q2 — where the cache design was decided

**Score: correct**

`git log --follow --format='%h %cI %an %s' -- src/inspect/extractCache.ts` on the pinned
ancestry returns exactly two commits: `68153e81` (2026-06-17T19:52:10+08:00, i.e. 11:52Z the
same day, author Cozy = maintainer, "perf(inspect): cache per-file scan/habits extraction
across runs") and `99a1979d` (the PR head). The 68153e81 commit body records the full design:
key (path, mtime, size), best-effort ("any failure falls back to a live parse, never
throws"), `TK_NO_SCAN_CACHE` kill-switch, 30-day prune, namespaces `{scan,habits}`.
`git diff 68153e81..99a1979d -- src/inspect/extractCache.ts` shows #52 changed only the
prune namespace list, so the design comments were present at 68153e81:
"Bump when the cached payload shape (FileScanExtract / FileHabitExtract) changes, so old
entries miss instead of deserializing into the wrong shape" (extractCache.ts:31-32) and
namespace "separates the scan and habits payloads (different shapes) so one never
deserializes the other" (lines 73-74). A NEW payload shape in its OWN namespace is exactly
the designed extension point, and no existing shape changed — so not bumping
`CACHE_SCHEMA_VERSION` is justified by the original record, as the operator concluded. (The
GitHub commit→PR association maps 68153e81 to PR #47, the 0.3.1 sweep created
2026-06-17T16:59:51Z; the commit itself is the design locus, so citing the commit is right.)

## Q3 — CI truth + acceptance tests

**Score: correct**

GitHub API (`repos/czync/token-killer/pulls/52`): head = `99a1979d…`, created
17:16:29Z, merged 17:38:12Z; the body checks five acceptance boxes and asserts
"14 files, 117 tests passing" for `pnpm exec vitest run tests/unit/inspect` — an author
assertion in the PR body, not a CI artifact. `actions/runs?head_sha=99a1979d…` returns
exactly ONE run, created 17:16:35Z (admissible), `status: completed, conclusion: FAILURE`,
updated 17:19:09Z — 19 minutes before the merge landed at 17:38:12Z; per-job conclusions:
Node 22 failed on both ubuntu and windows, Node 20 passed. No later green run exists before
the cutoff. The five checked boxes do map to tests present at cutoff in
`tests/unit/inspect/extractCache.test.ts`: warm-cache consultation counting (line 179),
`warmMs < coldMs * 0.5` timing assert (lines 203-224), `--session` dedicated test (line
255), corrupt-entry best-effort fallback (line 227), and the fifth (dogfood) box is backed
by the cold→warm `--since` timing assertion in `scripts/windows-dogfood.ps1:440-455`. Both
halves of the operator's answer — real tests present, but green-verification claim
contradicted by a FAILURE run on this head at cutoff — are exactly what I found.

## Q4 — timing-assert vs recorded testing conventions

**Score: correct**

I searched the pinned tree for any recorded rule on time-dependent tests: `vitest.config.ts`
lines 26-36 (the only timeout convention — `testTimeout: 30000` with the CI-hang rationale
about tsx spawn cold-start misreported as 5s timeouts, introduced by commit `cd536bf7`,
PR #3, per `git log -S "testTimeout" -- vitest.config.ts`); `.github/workflows` (step-level
GNU `timeout` wrappers, `timeout-minutes: 25`); `AGENTS.md` (TDD framing only, no timing
rule); `docs/adr/0001..0012` (none about tests); and a repo-wide grep for
wall-clock/flakiness conventions (no hits beyond unrelated archive docs). So the operator's
sourced negative — no convention at cutoff forbids or blesses wall-clock asserts, the 30s
testTimeout comment being the closest recorded thinking — holds. The supporting observation
is also accurate: the timing test is belt-and-braces, because the adjacent counting test
(extractCache.test.ts:179-201, gets/hits/sets counters asserting zero re-parse on warm)
carries the cache-bites claim deterministically, and the timing test itself also asserts
`warm.toEqual(cold)` (line 220). The answer flags the flake risk rather than papering over
it; nothing in it is contradicted by the record.

## Q5 — disk growth, pruning, kill-switch for the new namespace

**Score: correct**

All three sub-claims verified at the pinned commit. Pruning wired: `cli.ts:275` calls
`pruneCache(cacheRoot, nowMs)` once per run at the cache root, and `extractCache.ts:147`
iterates `["scan", "scan-events", "habits"]` — the `scan-events` entry was added by this
very PR (branch diff 68153e81..99a1979d). Reclaim policy: `MAX_AGE_MS = 30 days`
(extractCache.ts:37), keyed on the CACHE file's own mtime "so a long-untouched entry is
reclaimed even if its source path is gone" (lines 137-140) — i.e. orphan-safe, matching the
operator. Kill-switch: `makeDiskExtractCache` returns a no-op cache when `TK_NO_SCAN_CACHE`
is set (lines 80, 54-57), and the `eventCache` is constructed through that same factory
(cli.ts:279), so the new writes are covered at the shared cache layer; test at
extractCache.test.ts:273-281 asserts the `scan-events` dir is never created under the
kill-switch. Growth bound: one entry per (namespace, source path) — the filename is a hash
of the absolute source path (lines 68-71) and `set` overwrites in place (line 118) — plus
the 30-day age prune. "Delivery-complete on this axis" is supported by the admissible
record.
