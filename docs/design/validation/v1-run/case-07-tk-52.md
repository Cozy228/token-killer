---
case: 7
pr: czync/token-killer#52
title: "perf(inspect): let --since/--session reuse a per-event cross-run cache"
cutoff: 2026-06-17T17:38:12Z
cutoff_kind: merge-fallback
merge_commit: 8de065d1e5972d357f21fe3bb470e166628e5365
base: feat/0.3.1
status: operated
---

# Case 7 — token-killer#52

Subject read before question-writing: PR title, full body (what/how, 5
checked acceptance criteria incl. a `warm < cold * 0.5` timing assert,
reviewer notes on sibling conflicts and CACHE_SCHEMA_VERSION not bumped),
5-file list. Operator carries case-5/6 context (batch merge topology; #52
merged LAST at 17:34:59Z local, on top of #53).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | After this merge (which lands ON TOP of #53's single-pass rewiring), what does the combined `cli.ts` route for each flag shape — unfiltered, `--since`, `--session` — and do the TWO per-file caches now in play (scan/habits extracts vs the new `scan-events` stream, both keyed path+mtime+size) stay consistent, or can one be warm and the other stale in a way that changes reported numbers? | yes |
| 2 | Ownership / routing | Where was the extract-cache design originally decided (which commit/PR introduced `extractCache.ts`, its schema versioning, best-effort semantics, `TK_NO_SCAN_CACHE`), and does that record justify this PR's choice to add a namespace instead of bumping `CACHE_SCHEMA_VERSION`? | yes |
| 3 | Verification-evidence | What was CI on THIS PR's head at the cutoff (siblings ran red on Node 22), and do the five checked acceptance criteria have corresponding tests in `extractCache.test.ts` at cutoff — including the cold→warm timing assertion — with the "117 tests passing" claim being author-asserted or CI-corroborated? | yes |
| 4 | Convention / decision-context | The acceptance encodes a wall-clock timing assert (`warm < cold * 0.5`) in a unit test. What recorded testing conventions exist at cutoff about time-dependent tests (vitest timeout config, prior CI-hang/flakiness fixes), and does this assert comply or introduce a recorded-risk pattern? | yes |
| 5 | Delivery-requirements | The new `scan-events` namespace writes per-file event streams to the user's disk. Is pruning actually wired for the new namespace at cutoff (`pruneCache` coverage), what bounds the cache's growth on an end-user machine, and does the `TK_NO_SCAN_CACHE` kill-switch cover the new writes? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

Pinned to merge commit `8de065d1` (PR#52's merge, LAST of the batch, parent
= #53's merge 0e5cc1aa); cutoff 2026-06-17T17:38:12Z.

### Q1 — combined routing + two-cache consistency

Queries executed:

```
grep -n -B2 -A6 "inspectSinglePass|scanWindowed|eventCache" src/inspect/cli.ts (@8de065d1)
grep -n -B3 -A10 "scanWindowed|function scanCached" src/inspect/scan.ts
grep -n "mtime|size|key" src/inspect/extractCache.ts
```

Evidence (cited):

- Combined routing at cutoff (`scan.ts:533-535`): filtered
  (`--since`/`--session`) → `scanWindowed` when an eventCache is supplied,
  else `scanLive`; unfiltered → `scanCached`. `cli.ts:284-285` documents
  WHY filtered runs can't use #53's single-pass ("the UNFILTERED
  single-pass extract [is] inapplicable"); `cli.ts:279-280` creates the
  `scan-events` + `habits` namespaces, `cli.ts:312-317` routes the
  unfiltered case to `inspectSinglePass`.
- Cache-consistency: each computation path derives from exactly ONE
  namespace (windowed = event stream only; unfiltered = folded extracts
  only) — the two caches never feed the same result. Staleness is
  structurally impossible to serve: entries are "keyed strictly on
  (path, mtimeMs, size, SCHEMA_VERSION). Any mismatch is a miss"
  (`extractCache.ts:12`), so a changed file misses BOTH caches.

Answer: after the full batch, the flag → path map is: unfiltered →
single-pass over folded extracts (#53); `--since`/`--session` →
`scanWindowed` over the per-event stream (this PR); no-cache fallback →
`scanLive`. The two namespaces can be warm/cold independently but can
never disagree on content for the same file state, because both key on
the identical (path, mtime, size, schema) tuple and each result is
computed wholly from one namespace.

Confidence: **confirmed**.

### Q2 — where the cache design was decided

Queries executed:

```
git log --all --follow --format='%h %cI %s' -- src/inspect/extractCache.ts | tail -3
git log -1 --format='%B' 68153e81
git show 68153e81:src/inspect/extractCache.ts | grep -n "namespace|SCHEMA_VERSION"
```

Evidence (cited):

- `extractCache.ts` was introduced by `68153e81` (2026-06-17T11:52Z,
  pre-batch, the "already on this branch" slice) with a full design
  record in the commit message: motivation "the Windows dogfood saw
  ~241s x4", design "cross-run, per-file extract cache keyed by (path,
  mtime, size)".
- Namespacing is ORIGINAL design, not this PR's invention: the file at
  68153e81 already reads "One cache file per (namespace, source path)"
  (:66) and "rooted at `<root>/<namespace>/`" (:73), with
  `CACHE_SCHEMA_VERSION = 1` (:33) reserved for shape changes WITHIN a
  namespace.
- Best-effort + kill-switch semantics are in the same original header
  (:13-17): never throws, corrupt = miss, `TK_NO_SCAN_CACHE`, bounded by
  MAX_AGE pruning.

Answer: the cache design was decided one slice earlier the same day
(commit 68153e81, maintainer), and its written design directly justifies
this PR's namespace-over-version-bump choice: namespaces exist precisely
to separate payload shapes, while SCHEMA_VERSION guards a given shape.
Adding `scan-events` as a new namespace is the designed extension point,
so not bumping the version is correct per the original record.

Confidence: **confirmed**.

### Q3 — CI truth + acceptance tests

Queries executed:

```
gh api repos/czync/token-killer/pulls/52 -q .head.sha
gh api 'repos/…/actions/runs?head_sha=<head>'  → completed/failure 17:19:09Z
grep -n "0.5|cold|warm|performance.now" tests/unit/inspect/extractCache.test.ts
sed -n '138,175p' same
```

Evidence (cited):

- CI on this PR's head: **completed/FAILURE** (created 17:16:35Z,
  finished 17:19:09Z — pre-cutoff and RED), same batch pattern as #53
  (case 6: Node-22 legs failing). Merged red; only the aggregate
  branch-tip run went green hours later (case 5).
- Acceptance tests exist at cutoff in `extractCache.test.ts`: a counting
  cache wrapper asserts warm runs record hits and "ZERO new sets"
  (:160-175 region) — the deterministic core of criteria 1/3; cold→warm
  timing assert at :212-224 (`expect(warmMs).toBeLessThan(coldMs * 0.5)`
  via performance.now); best-effort corruption fallback and `--session`
  cases are described in the block header (:138-140) and covered by the
  new describe block; identity-to-cold-run asserts at :53-62.
- "117 tests passing" is author-asserted; the admissible CI record on
  this head is a FAILURE run.

Answer: the five checked acceptance boxes map to real tests present at
cutoff (consultation counting, timing, fallback, --session, plus
identity checks). But as with its sibling, the PR-level claim of green
verification is contradicted by the admissible record: this head's CI
run completed FAILURE 19 minutes before the merge was pushed.

Confidence: **confirmed**.

### Q4 — timing-assert vs recorded testing conventions

Queries executed:

```
grep -n "testTimeout|timeout" vitest.config.ts (@8de065d1)
grep -rn "timing|flak" tests/unit/inspect/extractCache.test.ts
```

Evidence (cited):

- The only recorded time-related testing convention at cutoff is
  `vitest.config.ts:31-35`: `testTimeout: 30000` with a rationale comment
  about spawnSync budgets and CI step-level timeout as the catastrophic
  backstop.
- No recorded rule addresses wall-clock ASSERTIONS (as opposed to
  timeouts); `warm < cold * 0.5` (:224) is the first of its kind in this
  suite per grep, and nothing marks it as a known-risk pattern.
- The same describe block hedges its determinism elsewhere: the
  hit/zero-sets counting wrapper (deterministic) carries the same
  acceptance load.

Answer: no convention at cutoff forbids or blesses wall-clock asserts —
the 30s testTimeout comment is the closest recorded thinking. The
`*0.5` margin rides on cold-parse dominance and could flake on a fast
FS/slow clock, but the deterministic counting assertions beside it carry
the same claim, so the timing assert is redundant belt-and-braces rather
than sole evidence. A reviewer could request its demotion; no recorded
rule requires it.

Confidence: **confirmed** (the absence of a convention is the sourced
finding).

### Q5 — disk growth, pruning, kill-switch for the new namespace

Queries executed:

```
grep -n -B2 -A4 pruneCache src/inspect/cli.ts src/inspect/extractCache.ts
grep -n -B2 -A4 TK_NO_SCAN_CACHE src/inspect/extractCache.ts
```

Evidence (cited):

- `cli.ts:273-275`: `pruneCache(cacheRoot, nowMs)` runs "once per run so
  the dir can't grow without bound" at the cache ROOT
  (`~/.tk…/inspect-cache`), i.e. across all namespaces including the new
  `scan-events`; `extractCache.ts:35,139-145`: prune drops entries whose
  CACHE FILE mtime exceeds 30 days, deliberately using the cache file's
  age "so a long-untouched entry is reclaimed even if its source path is
  gone".
- Kill-switch: `cacheDisabled()` (`extractCache.ts:54-57`) reads
  `TK_NO_SCAN_CACHE` at the cache layer, so the new namespace's reads AND
  writes obey it; best-effort wrapping (:13-14) means disk failures never
  break inspect.
- Bound: one cache file per (namespace, source file), sized by the
  extract (events are sanitized reductions, not raw lines).

Answer: pruning is wired for the new namespace at cutoff (root-level,
30-day file-age reclaim, orphan-safe), the kill-switch covers it because
it acts at the shared cache layer, and growth is bounded by
one-entry-per-source-file plus the age-based prune. Delivery-complete on
this axis.

Confidence: **confirmed**.
