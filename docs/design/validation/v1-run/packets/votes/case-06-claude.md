---
case: 6
voter: claude
date: 2026-07-12
---

# Case 6 vote — claude (token-killer#53, cutoff 2026-06-17T17:38:12Z)

All file/line citations are against a detached worktree pinned at merge commit
`0e5cc1aaa01652e228ad91bcee6a69f773611033`. All GitHub API records cited were
verified `created_at <= 2026-06-17T17:38:12Z` unless explicitly flagged.

## Q1 — sibling composition + export consumers

**Score: partial (3/4 = 0.75)**

Sub-claim enumeration: (1) the siblings compose by a deliberate path split —
single-pass owns the unfiltered path, the filtered path stays on the old
two-pass code — **correct**: `src/inspect/cli.ts:280-306` routes
`filtered ? scan(...) : inspectSinglePass(...)` with both cross-run caches
passed to the single-pass call, and `src/inspect/scan.ts:437-438` routes
`filtered ? scanLive : scanCached`; the cache-honoring is also test-proven
(`tests/unit/inspect/passes.test.ts:159-169`, "single-pass honors both
cross-run extract caches"). (2) #52 merged minutes later on top owns the
filtered path — **correct**: `git log -1 8de065d1` shows
`Merge ... 'origin/fix/38-inspect-since-cache'` at 2026-06-17T17:34:59Z with
parent `0e5cc1aa`, and `gh api pulls/52` gives title "perf(inspect): let
--since/--session reuse a per-event cross-run cache", created
2026-06-17T17:16:29Z. (3) "#46's stride constant is consumed by the new
passes module" — **incorrect attribution**: `PROGRESS_LINE_STRIDE` was
introduced by commit `5093d062` (the #37 report work; `git log -S
PROGRESS_LINE_STRIDE` lists only 5093d062, 68153e81, 34b8acbc), and the #46
commit `467c15b8` touches ONLY `src/inspect/progress.ts` +
`tests/unit/inspect/progress.test.ts` (`git show 467c15b8 --stat`) — it never
modifies `scan.ts` and never touches the stride constant. passes.ts does
consume the constant (`src/inspect/passes.ts:75`), but it is not #46's; #46's
actual progress behavior (non-TTY milestone degrade in
`makeProgressReporter`) composes at the reporter layer, a mechanism the
answer never identifies. (4) the widened exports have exactly one consumer,
passes.ts — **correct**: word-boundary grep for
`mergeAcc|finishScan|ScanTotals|PROGRESS_LINE_STRIDE|Accumulator` across
`src/` and `tests/` matches only `src/inspect/passes.ts` outside scan.ts. The
CI caveat is honestly disclosed. The composition conclusion survives, but one
of four material sub-claims rests on wrong evidence.

## Q2 — sequencing/reconciliation of the same-timestamp merges

**Score: false-reassurance**

The answer's core claim — "No conflict-resolution commits appear between them
— the merges are clean" — is wrong on the exact axis the question asks about
(conflict resolutions; which PR's edits won), and it was labeled
**confirmed**. Admissible evidence: this PR's own merge commit message
records `# Conflicts: src/inspect/cli.ts` (`git log -1 --format=%B 0e5cc1aa`),
and the #52 merge on top records `# Conflicts: src/inspect/cli.ts,
src/inspect/scan.ts` (`git log -1 --format=%B 8de065d1`, 17:34:59Z) — manual
conflict resolutions by the merger in precisely the shared surfaces the
question names. `git diff 34b8acbc 0e5cc1aa -- src/inspect/cli.ts` shows the
resolution folded #51's `staticOnly` plumbing into #39's single-pass routing —
that IS the reconciliation the question asked to characterize. There is
additionally a reconciliation commit between the merges and the push:
`eb260313` (17:37:49Z, pre-cutoff) "test(optimize): track inspectSinglePass
spy after #39 single-pass merge". The operator's queries used subject-only
`--format='%h %cI %p %s'`, which hides the conflict trailers; the truth was
one `%B` away. The correct sub-claims (nine PRs — `gh api pulls?base=feat/0.3.1`
shows #48–#56 all `merged_at 2026-06-17T17:38:12Z`; merge order with this PR's
merge second-to-last at 17:32:08Z and #52's last at 17:34:59Z; zero reviews on
#53; all merges authored by the maintainer) do not offset it: a reviewer told
"the merges are clean, nothing was reconciled" is reassured away from
inspecting an unreviewed manual conflict resolution that actually happened.
Material question, confident wrong core claim → false-reassurance.

## Q3 — CI truth at cutoff vs the checked acceptance boxes

**Score: correct**

Both material halves check out against admissible evidence. CI: `gh api
'actions/runs?head_sha=34b8acbc...'` returns one pull_request run created
2026-06-17T17:16:36Z (pre-cutoff), conclusion **failure**; its jobs show
`test (ubuntu-latest, 22)` failure, `test (windows-latest, 22)` failure, and
both Node-20 jobs success — completed by 17:21:15Z, i.e. red and visible
before the 17:38:12Z merge, exactly as the answer states ("red check staring
at them", merged anyway). Tests: at the pinned commit
`tests/unit/inspect/passes.test.ts` contains the four named tests — line 123
"JSON.parse is called once per data line, not twice" (spy), line 92 "scan
result equals scan(); habits result equals analyzeHabits()" under describe
"byte-identical to two-pass" (regression), line 160 "second run with warm
scan+habits caches re-parses nothing" (warm-cache), line 195 "the passes
module imports no worker_threads" with the static regex at line 200
(no-worker-threads assert). The aside that "only the later aggregate
branch-tip run (case 5) came back green" leans on the operator's granted
case-5 carry-over and on post-cutoff runs (the first branch-tip run,
17:38:23Z, is already past cutoff), but it is outside the question's material
scope and does not alter the two verified findings.

## Q4 — provenance of the "no worker threads" constraint

**Score: partial (2/3 ≈ 0.67)**

Sub-claim enumeration: (1) the constraint is recorded pre-cutoff in issue
#39 — **correct**: `gh api issues/39` shows created 2026-06-17T16:58:54Z, and
the body says "worker threads were deferred for Windows ESM-URL/second-entry
risk" plus acceptance item "No worker-thread ESM-URL regressions on Windows
(if concurrency is added, it stays async)". (2) enforced by a static test —
**correct**: `tests/unit/inspect/passes.test.ts:195-200` asserts the passes
source never matches `/worker_threads/`. (3) "its underlying incident ... has
no in-tree record at cutoff; a reviewer can cite the rule, not its evidence" —
**incorrect**: the question explicitly pointed at "the PR#3 Windows ESM
loader work", and PR #3's squash commit `cd536bf7` (merged 2026-06-16, inside
the pinned ancestry) records the incident verbatim in its message: "11 spawn
helpers: node --import pathToFileURL(loader) — a raw drive-letter path is
rejected by Node's --import on Windows (ERR_UNSUPPORTED_ESM_URL_SCHEME)"
(`git log -1 --format=%B cd536bf7`, lines 1157-1158). The operator's grep
covered only `docs/ plans/` tree files (where indeed nothing exists — my
sweep of docs/, scripts/, .github/ found no worker/ESM-URL incident doc) and
never followed the question's own PR#3 pointer into history, so the
provenance was declared unreachable when it was reachable from admissible
sources. Not false-reassurance: the wrong claim is a disclosed negative
("evidence not found"), not a safety confirmation — but it is a reachable
answer missed, so that sub-claim scores wrong.

## Q5 — the unwired async variant's path to users

**Score: partial (4/5 = 0.8)**

Sub-claim enumeration: (1) no user benefit until `inspectSinglePassAsync` is
wired into `runInspect`, an async ripple through 3 callers — **correct**:
`src/inspect/cli.ts:38,301` imports/calls only the sync `inspectSinglePass`;
grep shows the async variant exists only in `src/inspect/passes.ts` and
`tests/unit/inspect/passes.test.ts:14,184,192`; `runInspect` has exactly 3
callers (`src/cli.ts:237`, `src/context/optimizeCli.ts:121`,
`src/context/applySafe.ts:217`). (2) the gap is recorded as optional in issue
#39 — **correct**: the pre-cutoff body carries "Optional: cold-scan wall time
improves measurably with concurrency" and proposal item 2 marked optional.
(3) violates no repo gate — **correct**: `package.json` `test:ci` runs
product tests + install + `check-test-presence.sh` + validate-docs + smoke;
`scripts/check-test-presence.sh` is a handler-directory coverage-shape guard,
and passes.ts is fully test-backed anyway; no dead-code/unused-export gate
exists at the pinned commit. (4) no dedicated follow-up item at cutoff —
**correct**: `gh api search/issues q=repo:czync/token-killer+inspectSinglePassAsync`
returns only PR #53 and issue #39, both pre-cutoff. (5) "the only tracker ...
is the **closed** issue's optional checkbox" — **incorrect at the adjudicated
moment**: issue #39 was OPEN at cutoff (`closed_at: 2026-06-19T10:37:48Z`,
two days later); the "closed" state is post-cutoff (inadmissible) and flips
the practical reading from "live open tracker with an optional item" to
"dead checkbox nobody will revisit". Four of five material sub-claims hold.
