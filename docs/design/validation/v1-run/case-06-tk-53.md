---
case: 6
pr: czync/token-killer#53
title: "perf(inspect): single-pass scan + habits over one JSON.parse"
cutoff: 2026-06-17T17:38:12Z
cutoff_kind: merge-fallback
merge_commit: 0e5cc1aaa01652e228ad91bcee6a69f773611033
base: feat/0.3.1
status: operated
---

# Case 6 — token-killer#53

Subject read before question-writing: PR title, full body (summary, what
changed, 4 checked acceptance criteria, tests, reviewer notes about sibling
overlap with #38/#46 on scan.ts, worker-threads deferral), 5-file list.
Operator carries case-5 context (sub-PR batch merged 17:38:12Z into
feat/0.3.1 with Node-22 check failures, 0 reviews).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | This PR widens `scan.ts` exports (mergeAcc, finishScan, Accumulator, ScanTotals, PROGRESS_LINE_STRIDE) and touches files that siblings #38 (cache routing) and #46 (progress degrade) also modify, all merging at the same timestamp into `feat/0.3.1`. Did the three sibling changes compose cleanly in the branch state at cutoff — does `inspectSinglePass` actually honor #38's cross-run cache routing and #46's progress behavior — and who consumes the widened exports? | yes |
| 2 | Ownership / routing | For the shared `src/inspect/scan.ts` surface, what does the branch history at cutoff show about how the three same-timestamp merges were sequenced and reconciled (merge order, conflict resolutions), i.e. which PR's edits "won" and who holds the context for that reconciliation? | yes |
| 3 | Verification-evidence | The body claims 4 checked acceptance criteria and 117 local tests. What was the CI state on THIS PR's head at the 17:38:12Z cutoff (case-5 evidence suggests Node-22 FAILURE on both OSes), and do the four acceptance criteria have named tests in `tests/unit/inspect/passes.test.ts` at cutoff (JSON.parse spy, byte-identical regression, warm-cache, no-worker-threads assert)? | yes |
| 4 | Convention / decision-context | The body defers worker-thread concurrency "for Windows ESM-URL/second-entry risk". Which recorded prior incident or decision establishes that risk (e.g. the PR#3 Windows ESM loader work), and is the no-worker-threads constraint recorded anywhere durable beyond this PR body? | yes |
| 5 | Delivery-requirements | `inspectSinglePassAsync` ships tested but NOT wired into the CLI. What must still happen for users to get the AV-overlap benefit, is there a recorded follow-up to wire it, and does shipping an unwired exported function violate any repo gate (test-presence / dead-code checks) at cutoff? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

Pinned to merge commit `0e5cc1aa` (PR#53's merge into feat/0.3.1); cutoff
2026-06-17T17:38:12Z (GitHub mergedAt = batch push time; local merge commits
run 17:14–17:35Z, all pre-cutoff).

### Q1 — sibling composition + export consumers

Queries executed:

```
git log --format='%h %cI %p %s' 0e5cc1aa | head -12       (merge topology)
grep -n "inspectSinglePass|scanCached|extractCache" src/inspect/cli.ts (@0e5cc1aa)
grep -rn "mergeAcc|finishScan|PROGRESS_LINE_STRIDE" src/ (excl. scan.ts)
git log -1 --format='%h %cI %p %s' 8de065d1 ; git merge-base --is-ancestor …
```

Evidence (cited):

- Merge topology: the batch merged locally in sequence #43→#45→#46→#44→
  #42→#41→**#53** (0e5cc1aa, 17:32:08Z) →**#52** (8de065d1, 17:34:59Z,
  parent = 0e5cc1aa). All local merges pre-date the shared 17:38:12Z
  GitHub mergedAt (single push). So at THIS PR's merge commit, #46's
  progress work is already in; #52's --since/--session cache routing is
  NOT yet (it lands 3 minutes later, on top).
- Composition at 0e5cc1aa: `cli.ts:38` imports `inspectSinglePass`,
  `cli.ts:301` uses it on the unfiltered path; `cli.ts:34` imports the
  extract cache (the cross-run cache itself predates the siblings — PR#47
  body lists it as "already on this branch"); `passes.ts:62-75` consumes
  `PROGRESS_LINE_STRIDE` (composes with #46).
- Widened-export consumers: only `src/inspect/passes.ts` (lines 39-42,
  169) — no external consumer.
- Compose-safety with #52 is by-design: this PR's body routes
  `--since`/`--session` down the OLD two-pass path, which is exactly the
  path #52 optimizes.

Answer: the three sibling changes compose cleanly and by design rather
than by luck — single-pass owns the unfiltered path, #52 (merged minutes
later on top) owns the filtered path, and #46's stride constant is
consumed by the new passes module. The widened exports have exactly one
consumer (passes.ts). One honest caveat: the combined branch state was
only exercised by CI at the aggregate level (see Q3/case-5 Q2), not per
pairwise combination.

Confidence: **confirmed**.

### Q2 — how the same-timestamp merges were actually sequenced

Queries executed:

```
git log --format='%h %cI %p %s' 0e5cc1aa | head -12
git log --all --format='%h %cI %s' --grep="#38"
```

Evidence (cited):

- GitHub's identical 17:38:12Z mergedAt for #48–#56 is an artifact of one
  push; the LOCAL committer timestamps order the merges precisely:
  fix/43 17:29:32Z, fix/45 :34, fix/46 :35, fix/44 :48, fix/42 :49,
  fix/41 17:30:01Z, fix/39 17:32:08Z (this PR), fix/38 17:34:59Z.
  Some fixes were additionally squashed directly onto the branch minutes
  earlier (e.g. #40 at 17:20:50Z as a plain commit).
- Every merge commit and every underlying squash is authored/committed by
  Cozy (maintainer) — one person performed the entire reconciliation
  locally, then pushed once.

Answer: the reconciliation context lives with the maintainer alone: the
nine PRs were merged locally in a deliberate order (this PR second-to-
last, its filtered-path sibling #52 last, on top of it) and pushed as one
batch. No conflict-resolution commits appear between them — the merges
are clean — and no reviewer other than the merger exists in the record.

Confidence: **confirmed**.

### Q3 — CI truth at cutoff vs the checked acceptance boxes

Queries executed:

```
gh api repos/czync/token-killer/pulls/53 -q .head.sha   → 34b8acbc
gh api 'repos/…/actions/runs?head_sha=34b8acbc'
gh pr view 53 --json statusCheckRollup (per-check, from case-5 log)
grep -n 'test(|worker' tests/unit/inspect/passes.test.ts (@0e5cc1aa)
```

Evidence (cited):

- CI on this PR's own head `34b8acbc`: **completed/FAILURE**, created
  17:16:36Z, finished 17:21:16Z — pre-cutoff and RED. Per-check: both
  Node-20 legs SUCCESS, both Node-22 legs FAILURE (ubuntu + windows).
  The PR merged into the branch with its own CI red.
- The four acceptance criteria DO have named tests at cutoff in
  `tests/unit/inspect/passes.test.ts`: byte-identical (:91-103, :110-117),
  JSON.parse-once spy (:123), warm-cache re-parses nothing (:160),
  async-no-worker-threads (:179-200, incl. static source assert :195
  "imports no worker_threads").
- Local claim "117 tests passing" is author-asserted; the admissible CI
  record contradicts green at the matrix level (Node-22 legs).

Answer: the acceptance criteria are genuinely test-backed — the four
named tests exist and encode exactly the claimed properties. But the
PR-level verification claim fails at cutoff: this PR's head ran RED in
CI (both Node-22 jobs) and was merged anyway; only the later aggregate
branch-tip run (case 5) came back green. A reviewer at this PR's merge
moment had a red check staring at them.

Confidence: **confirmed**.

### Q4 — provenance of the "no worker threads" constraint

Queries executed:

```
grep -rn "worker|pathToFileURL|ESM" docs/ plans/ (@0e5cc1aa)   → no durable record
gh issue view 39 --json createdAt,body   → created 2026-06-17T16:58:54Z (pre-cutoff)
grep -n worker tests/unit/inspect/passes.test.ts
```

Evidence (cited):

- Issue #39 (created 16:58:54Z, ~40 min before cutoff — admissible)
  records the constraint and its rationale: "Prefer async batching over
  worker threads — worker threads were deferred for Windows
  ESM-URL/second-entry risk, and async carries none of that", plus an
  acceptance line "No worker-thread ESM-URL regressions on Windows".
- The test encodes it (`passes.test.ts:195-200`): static assert that the
  module never references `worker_threads`, comment citing the same risk.
- NO durable doc/ADR in the tree at cutoff records the ESM-URL/
  second-entry incident itself (docs/ + plans/ grep empty); `pathToFileURL`
  appears nowhere in the 0e5cc1aa tree. The prior experience the phrase
  "were deferred" points at has no written trace in-tree at this cutoff.

Answer: the constraint IS recorded pre-cutoff — in issue #39's text and
enforced by a static test — but its underlying incident ("Windows
ESM-URL/second-entry risk") has no in-tree record at cutoff; a reviewer
can cite the rule, not its evidence. Sources establish where the rule
lives, not why it's true.

Confidence: **confirmed** (with the provenance gap stated as the finding).

### Q5 — the unwired async variant's path to users

Queries executed:

```
grep -rn "inspectSinglePassAsync" src/ tests/ (@0e5cc1aa)  → passes.ts + its test only
head -12 scripts/check-test-presence.sh
gh issue view 39 --json body (acceptance items)
```

Evidence (cited):

- `inspectSinglePassAsync` has zero callers outside its module and test at
  cutoff; the CLI path stays synchronous (PR body: wiring it "would ripple
  async through 3 callers").
- Issue #39's acceptance explicitly marks concurrency "Optional" — the
  wiring is pre-declared as not required for the issue to close.
- `check-test-presence.sh` guards coverage shape only; no dead-code gate
  exists — an exported-but-unwired function violates nothing recorded.
- No follow-up issue for wiring exists at cutoff (the only recorded trace
  is #39's optional acceptance line and the PR body's "not wired" note).

Answer: users get no AV-overlap benefit until someone wires
`inspectSinglePassAsync` into `runInspect` (an async ripple through 3
callers, per the body). That gap is recorded as optional in issue #39,
violates no repo gate, and has no dedicated follow-up item at cutoff —
so the only tracker of this latent capability is the closed issue's
optional checkbox.

Confidence: **confirmed**.
