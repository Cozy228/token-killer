---
case: 5
voter: claude
date: 2026-07-12
---

# Case 5 vote — claude (token-killer#47, cutoff 2026-06-18T05:44:23Z)

All reads were made against a detached worktree pinned at merge commit
`aab70754f77f1a6147e16104a6da20f3d00f9956` (`git worktree add --detach
/private/tmp/v0-vote-05-claude-e7cee0 aab70754…`). All GitHub API records cited
below carry `created_at`/`completedAt` at or before the cutoff.

## Q1 — the two hot surfaces' new per-invocation behavior

**Score: correct**

The operator's three claims independently verify. (1) Beacon is default-off and
file-free: `src/hook/beacon.ts:25-30` gates on `TK_HOOK_BEACON` (undefined →
false), the module imports no `node:fs` at all (lines 1-42), and both hosts only
spread an `additionalContext` string into an already-emitted decision —
`src/hook/claude.ts:86,98-99` (`...(beacon !== undefined ? { additionalContext:
beacon } : {})`) and `src/hook/copilot.ts:76`. There is no beacon file or
directory, so the "unwritable beacon dir" failure mode does not exist; default
wire output is byte-identical (beacon.ts:14-16 states and the code enforces
it). (2) `git status` is single-spawn on the hot path:
`src/handlers/git/status.ts:299-303` runs one porcelain capture; the second
human capture runs only when `hasInProgressState(gitDir)` (line 316) finds a
marker, and the probes are read-only `existsSync`/`statSync`/`readFileSync`
(lines 161-240); a nonzero porcelain exit short-circuits without probing (lines
305-309). (3) Dependent callers: `grep -rn auxStdout src` shows the only
consumers are the status handler's own filter and `src/handlers/git/extended.ts`
(which sets its own aux for `git add`); no external caller reads the old
double-capture. The one thing the answer omits — the savings baseline on the
fast path shifts from human→formatted to porcelain→formatted — is an internal,
in-diff-documented trade (status.ts:368-391), not a dependent caller, and none
of the operator's stated claims is thereby wrong.

## Q2 — what gate did the branch content actually pass

**Score: correct**

Every material claim reproduces. `git cat-file -p aab70754` shows a single
parent (`5093d062`), confirming #47 was squash-merged. `gh pr view 48…56`
returns all nine sub-PRs based on `feat/0.3.1`, every one with `reviews: 0`,
all merged in one batch at `2026-06-17T17:38:12Z`. Their head-SHA check rollups
were red on both Node 22 legs when they landed: #48, #50, #53, #56 each show
`test (ubuntu-latest, 22)` and `test (windows-latest, 22)` FAILURE (checks
completed 17:13-17:21Z, before the 17:38Z batch merge) with Node 20 legs green
— "individually unreviewed and partially red (Node 22 failures)" is exactly
right. The final gate: `gh api …/actions/runs?head_sha=59bdfebf…` (PR 47 head)
shows one CI run, `conclusion: success`, completed `2026-06-18T03:37:41Z` —
pre-cutoff and ~2h before the 05:44:23Z merge. PR 47 itself has `reviews: []`,
so an approver of #47 indeed inherits the ~4.6k functional lines with no prior
per-slice review to lean on.

## Q3 — tracker truth: which items are actually fixed at cutoff

**Score: correct**

The PR body (via `gh pr view 47 --json body`) lists 9 tracker items (#45 HIGH;
#44/#40/#41/#42 MEDIUM; #38/#39/#43/#46 LOW), all checkboxes `- [ ]` unchecked.
All nine GitHub issues were still open at cutoff: `gh issue view 38…46` shows
every `closedAt` = 2026-06-19T10:37-38Z, a day after the merge. Yet the squash
commit's message and file stat show each item resolved in-branch with an
artifact and, for most, named tests: #44 → `scripts/windows-dogfood.ps1` fix
("fix(dogfood): stop false FAIL … (#44)"); #45 → `package.json` +
`scripts/test-install.sh`; #46 → `src/inspect/progress.ts` +
`tests/unit/inspect/progress.test.ts`; #41 → `src/context/optimizeCli.ts` +
`tests/unit/context/optimizeStaticScope.test.ts`; #38/#39 →
`src/inspect/extractCache.ts`/`passes.ts` + `extractCache.test.ts`/
`passes.test.ts`; #42 → `src/hook/beacon.ts` + `beacon.test.ts`/`cli.test.ts`;
#43 → `src/handlers/system/tree.ts` + `rtkTreeBehavior.test.ts`; #40 →
`src/handlers/git/status.ts` + `gitStatusSingleSpawn.test.ts`. CI on the final
head was green at 03:37:41Z, roughly two hours pre-merge (same run as Q2). The
"stale-pessimistic tracker" characterization is therefore accurate on all three
axes: body says open, issues say open, branch content says done.

## Q4 — committed debug reports vs the scrub convention

**Score: correct**

The scrubbing seam is exactly as described: `scrubHome` (`src/debug/render.ts:
25-31`) replaces only `homedir()` with `~`, and it is applied field-by-field
(env table :104, hook/shim paths :141-152, artifact paths/bodies :337-340) but
NOT to the Section-3 command column — `commandCell` (:177-181) returns the raw
command untouched unless `--redact` was passed. The committed report complies
with scrubHome's letter (its env table shows `~/.token-killer`,
`~/Workspace/token-killer/dist/cli.js`) while leaking what scrubHome never
covered: `grep -c "/Users/" reports/debug-20260616064120.md` → 2259 raw
home-path command strings (first at line 67, the command-history table), and
`grep -c cozyultra` → 4 (tester box name, e.g. lines 6981, 7478, inside
embedded payloads — plus one raw `C:\Users\cozy2\…` at line 7450). On the
"recorded convention" claim: the in-repo design doc at this commit
(`docs/archive/debug-command-goal.md`, 隐私 section, lines 37-39) explicitly
records `tk debug` as default full-fidelity ("默认全保真 — 命令原文 + 异常行真实字节") with
`--redact` as an opt-in escape only — affirmatively confirming there was no
whole-document scrub requirement at cutoff. The operator's "leak is real but
violates no written rule that existed then" is the correct legal reading of the
admissible sources.

## Q5 — is the #45 version-drift gate complete

**Score: correct**

All three delivery legs verify at the pinned commit: `package.json:3` reads
`"version": "0.3.1"`; `scripts/test-install.sh:43-58` contains the "Step 3b:
baked VERSION matches package.json (drift guard)" block comparing `node
dist/cli.js --version` against `require('./package.json').version` and failing
on mismatch; `.github/workflows/ci.yml:55-57` runs `timeout -k 30 360 pnpm
test:install` with `if: matrix.node-version == 22` (`package.json:28` maps
`test:install` → `bash scripts/test-install.sh`). The operator's Node-22-leg
qualifier is accurate and disclosed. On "anything else ship-blocking": the PR
body's own prioritization marks only #45 HIGH (everything else MEDIUM/LOW), and
the underlying dogfood report (`docs/reports/windows-dogfood-2026-06-17.md`)
records findings as FAIL/WARN dossiers (D01/D02) without any ship-blocking or
priority language of its own — so "per the PR's own recorded prioritization, no
other item was ship-blocking" is faithful to the admissible record.
