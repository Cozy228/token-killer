---
case: 5
pr: czync/token-killer#47
title: "token-killer 0.3.1 (+ Windows dogfood follow-ups)"
cutoff: 2026-06-18T05:44:23Z
cutoff_kind: merge-fallback
merge_commit: aab70754f77f1a6147e16104a6da20f3d00f9956
base: main
status: operated
---

# Case 5 — token-killer#47

Subject read before question-writing: PR title, full body (0.3.1 scope +
dogfood follow-up tracker #38–#46 with priorities, all checkboxes unchecked),
36-file list. Size note: 36,386 of the 41,047 lines are two committed debug
reports (`reports/debug-2026061606…/07….md`, 18,193 lines each); functional
change ≈ 4.6k lines — floor unaffected.

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The hot-path `git status` handler is reworked for single-spawn (+158/-15) and a new hook "beacon" (src/hook/beacon.ts, +claude.ts/+copilot.ts touches) enters the per-prompt hook path for BOTH hosts. What do these two hot surfaces now do on every invocation on an end-user machine — extra writes, new files, new failure modes if the beacon file/dir is unwritable — and which callers depend on the old `git status` capture behavior? | yes |
| 2 | Ownership / routing | This PR merges branch `feat/0.3.1`, onto which sub-PRs #48–#56 landed the day before (same-timestamp batch). Were those sub-PRs individually CI-checked/reviewed before landing on the branch, and what does approving #47 actually re-verify — is there a recorded gate for the branch, or does the reviewer of #47 inherit ~4.6k lines re-reviewed from scratch? | yes |
| 3 | Verification-evidence | The body's tracker lists #45 HIGH and #44/#40/#41/#42 MEDIUM with ALL checkboxes unchecked. Which tracker items are actually resolved inside this branch at cutoff (file list suggests #40/#41/#42/#38/#39/#46 landed), which remain open, and was CI green on the head at or before the 05:44:23Z cutoff? | yes |
| 4 | Convention / decision-context | Two 18,193-line debug reports captured on the Windows tester box are committed into `reports/`. What recorded convention governs debug-report contents (the renderDebug scrubbing seam — paths, usernames, hostnames), and do these committed files comply with it? | yes |
| 5 | Delivery-requirements | Tracker item #45 (HIGH) demands: bump package.json → 0.3.1 AND a CI assert that baked `VERSION == package.json`. The diff shows package.json +1/-1 and scripts/test-install.sh +17. Is the full version-drift gate delivered and CI-wired at cutoff, and is anything else the dogfood report marks as ship-blocking still missing for a field 0.3.1? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

All git queries pinned to merge commit `aab70754` (`${S}`); cutoff
2026-06-18T05:44:23Z.

### Q1 — the two hot surfaces' new per-invocation behavior

Queries executed:

```
sed -n '1,30p' src/hook/beacon.ts (@${S}) ; grep -n beacon src/hook/{claude,copilot}.ts
grep -n "spawn|probe|capture" src/handlers/git/status.ts ; sed -n '1,18p' same
```

Evidence (cited):

- Beacon (`src/hook/beacon.ts:1-30`): **opt-in** behind `TK_HOOK_BEACON`
  (default OFF — "keeps the protocol wire byte-identical for every host
  that hasn't asked"); emits ONE `additionalContext` line ("tk active …"),
  never changes rewrite carrier/permission/exit code; NO file writes, no
  new failure surface when disabled. Wired into both hosts
  (claude.ts:86-99, copilot.ts:68).
- `git status` single-spawn (`status.ts:199-217`): the second full capture
  is now gated on cheap fs probes ("a few existsSync calls, no spawn");
  in-progress-op detection reads `.git/` state files directly (capped
  64-level walk "like core/dataDir.ts"); compact-path routing mirrors
  RTK's `uses_compact_status_path` (status.ts:8-13). A dedicated test file
  ships (`tests/unit/handlers/gitStatusSingleSpawn.test.ts`, +186).
- Callers: the handler is self-contained behind the handler registry; no
  other in-repo consumer of the removed second capture found.

Answer: on an end-user machine, default behavior adds NOTHING to the hook
wire (beacon off) and REMOVES a spawn from the `git status` hot path
(second capture only when fs probes say an op is in progress). Failure
modes are narrowed, not widened: beacon is additive-only when opted in;
the probes are read-only existsSync calls. No dependent callers found.

Confidence: **confirmed**.

### Q2 — what gate did the branch content actually pass

Queries executed:

```
git log aab70754 --format='%h %s' -15        → aab70754 is a SQUASH of feat/0.3.1
gh pr view 53 / 50 --json reviews,statusCheckRollup,mergedAt
gh pr view 53 --json statusCheckRollup (per-check)
gh api …/actions/runs?head_sha=<pr47 head>
```

Evidence (cited):

- `aab70754` is a single squash commit on main; its parent is #37's
  commit. The 9 sub-PRs (#48–#56) merged into `feat/0.3.1` in a
  same-timestamp batch (17:38:12Z, 2026-06-17), one per tracker issue.
- Sub-PRs carried **0 reviews**, and their check rollups show
  **FAILURE on both Node-22 jobs** (sub-PR #53: ubuntu-22 FAILURE,
  windows-22 FAILURE, both Node-20 jobs SUCCESS; #50 same pattern).
  They were merged into the branch red.
- The branch tip (#47's head) then ran CI green: created 03:35:12Z,
  success 03:37:41Z — **~2h07m before the 05:44:23Z merge**. Green at
  cutoff holds for the merged aggregate.

Answer: approving #47 is the ONLY real gate the aggregate passed —
the sub-PRs were individually unreviewed and partially red (Node 22
failures) when they landed on the branch. The final branch-tip CI run
(green, pre-cutoff) is what vouches for the merged state; a reviewer of
#47 inherits the full ~4.6k functional lines with no prior per-slice
review to lean on.

Confidence: **confirmed**.

### Q3 — tracker truth: which items are actually fixed at cutoff

Queries executed:

```
(file list from PR diff, subject) ; gh issue view 38/40/42/45 --json state,closedAt
gh api …/actions/runs?head_sha=<pr47 head>
```

Evidence (cited):

- The body's tracker shows all 9 checkboxes UNCHECKED, but each item's fix
  is inside this PR's own diff, one sub-PR each: #38→extractCache.ts,
  #39→passes.ts, #40→gitStatusSingleSpawn (status.ts+test), #41→
  optimizeStaticScope (applySafe/optimizeCli+test), #42→beacon.ts(+hosts),
  #43→tree.ts+rtkTreeBehavior, #44→windows-dogfood.ps1 (+177/-37),
  #45→package.json 0.3.1 + test-install.sh assert, #46→progress.ts.
- GitHub issue states: #38/#40/#42/#45 all closed 2026-06-19T10:37-38Z —
  **the day AFTER cutoff** (post-cutoff sweep; inadmissible as cutoff
  state, cited here only to show the tracker was not updated at merge).
- CI on the head: green 03:37:41Z, pre-cutoff (Q2).

Answer: at cutoff the tracker is stale-pessimistic — all 9 items are
substantively resolved inside the PR (each with its artifact, most with
named tests), while the body's checkboxes and the GitHub issues still
read open. A reviewer trusting the body would think the follow-ups are
outstanding; a reviewer diffing the branch finds them done. CI on the
final head was green two hours before merge.

Confidence: **confirmed**.

### Q4 — committed debug reports vs the scrub convention

Queries executed:

```
grep -n -B3 -A8 scrub src/debug/render.ts
grep -c "/Users/" reports/debug-20260616064120.md      → 2259
grep -n -m2 -B2 "/Users/ziyu" same                      → command-history table
grep -c cozyultra same                                  → 4
grep -c 'C:\\Users\\' same                              → 0
```

Evidence (cited):

- The recorded convention is code-level: `src/debug/render.ts:25-31`
  `scrubHome()` replaces the generating machine's home dir with `~`, and
  is applied to SELECTED fields (env table :104, hook paths :141) — not
  to everything.
- The committed report `reports/debug-20260616064120.md` contains **2,259
  occurrences of raw `/Users/ziyu/...`** — inside the recent-command
  history table (e.g. lines 67-70: full `find /Users/ziyu/Workspace/…`
  command strings) — plus 4 occurrences of the tester hostname
  `cozyultra`. Windows home paths are clean (0 hits), i.e. scrubHome did
  its narrow job; command TEXT was never in its scope.
- No repo policy doc at cutoff governs what `reports/` files may contain.

Answer: the only recorded scrubbing convention is `scrubHome`, and it is
field-scoped; the two 18k-line committed reports comply with its letter
but leak what it never covered — thousands of raw home-path command
strings and the tester machine name. There is no recorded
whole-document scrub requirement at cutoff for a reviewer to enforce;
the leak is real but violates no written rule that existed then.

Confidence: **confirmed**.

### Q5 — is the #45 version-drift gate complete

Queries executed:

```
grep -n '"version"' package.json (@${S})            → "0.3.1"
grep -n -A8 VERSION scripts/test-install.sh         → Step 3b drift guard
grep -n test:install .github/workflows/ci.yml       → wired in CI
```

Evidence (cited):

- `package.json:3` = 0.3.1 (bumped in-branch, sub-PR #50).
- `scripts/test-install.sh:43-55` "Step 3b: baked VERSION matches
  package.json (drift guard)" — explicitly cites issue #45; asserts the
  freshly built bundle's `tk --version` equals package.json.version.
- `ci.yml:55` runs `pnpm test:install` (Node-22 gated at this era, per
  the workflow's then-current `if:` — the same guard later removed by
  PR#87/case 3).
- Ship-blocking beyond #45: the dogfood report's HIGH list contains only
  #45; everything else was MEDIUM/LOW by the recorded rationale
  (cold+AV+low-spec box, inspect is ~monthly).

Answer: yes — the HIGH item is fully delivered at cutoff: version bumped,
drift assert written into test:install, and test:install wired in CI
(on the Node-22 matrix leg). Per the PR's own recorded prioritization,
no other item was ship-blocking for a field 0.3.1.

Confidence: **confirmed**.
