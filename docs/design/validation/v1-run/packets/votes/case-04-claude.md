---
case: 4
voter: claude
date: 2026-07-12
---

# Case 4 vote — claude (token-killer#57, cutoff 2026-07-08T06:39:26Z)

All file/line citations below are against a detached worktree pinned at merge
commit `6e9d0c90a6b4aeef3089542f6669a9603b4c8a88`. GitHub API records cited were
verified `created_at <= 2026-07-08T06:39:26Z`.

## Q1 — what breaks for `tk status` callers

**Score: partial (4/5)**

The operator's mechanics are right but the migration inventory is incomplete, and the
missed item is exactly the class the question enumerated (scripts). Verified correct:
(1) direct `ctx status` gets a deterministic stderr rename hint and exit 1
(`src/cli.ts:392-393`); (2) a regression test exists
(`tests/integration/allCommands.test.ts:91-96`, asserting exit 1 and the hint string);
(3) the Windows tester guide instructs `ctx status` exactly four times at cutoff
(`docs/WINDOWS-TESTER-GUIDE.md:66,117,157,172`); (4) two perf-plan docs still
reference it (`docs/runtime-perf-impl-goal.md:69`,
`docs/runtime-startup-perf-plan.md:228,615`). Incorrect sub-claim: "the blast radius
that remains is documentation." `scripts/windows-dogfood.ps1:346` is an un-migrated
scripted caller — `Invoke-Tk @("status")` runs the CLI binary directly (`Invoke-Tk`
definition at `scripts/windows-dogfood.ps1:228-233` spawns `$script:TkBin`) and
requires `ExitCode -eq 0` plus `'host'` in output to Pass; after this PR it exits 1
with the hint, so the Windows dogfood functional phase records a Fail (plus a stale
`ctx status` mention in its generated tester text at line 1109). Not
false-reassurance: the answer's core safety claim (deterministic hint, no silent
breakage) holds even for that script — it fails loudly — and the wrongness is one
missed surface in an otherwise correct enumeration. Sub-claims: rename-hint behavior
(correct), regression test (correct), tester-guide 4x (correct), two perf-plan docs
(correct), "only docs remain un-migrated" (incorrect) = 4/5.

## Q2 — ADR 0011 → 0013 reconciliation

**Score: partial (3/5)**

The supersession claims are verified: ADR 0011 carries `status: superseded` +
`superseded-by: 0013-support-destination-baked-at-build` frontmatter and an explicit
superseded banner (`docs/adr/0011-support-routing-env-configured.md:1-11`); ADR 0013
carries `supersedes: 0011` and a full "Why this supersedes ADR 0011" section
(`docs/adr/0013-support-destination-baked-at-build.md:1-4,28-39`). "Nothing dangling"
also checks out: repo-wide grep at the pinned commit finds `CTX_SUPPORT` only in
ADRs 0011/0013 and no stale references to env-only routing elsewhere. But the
question asked three things the answer only partly delivers. (a) What ADR 0011
decided is never stated (env-configured routing via `CTX_SUPPORT_*` with no baked
destination, `0011:13-20`) — the answer points at the banner instead of answering.
(b) The "other recorded decisions govern the support-routing surface" part names
ADR 0014, which is the doctor/records surface
(`docs/adr/0014-doctor-diagnose-repair-and-records-normalization.md:6`), not support
routing; the decision a reviewer actually must reconcile with build-time baking is
ADR 0004 §5 — the telemetry-endpoint build-arg pattern that 0013 itself cites as its
precedent (`docs/adr/0013:18`) — which the answer omits. Sub-claims: 0011 stamped
superseded at cutoff (correct), 0013 rationale recorded (correct), nothing dangling
(correct), what 0011 decided (not answered), other governing decisions to reconcile
(missed ADR 0004 §5; cited 0014 instead) = 3/5.

## Q3 — CI at cutoff + regression-fix tests

**Score: correct**

All three material claims verified independently. CI: `gh api
repos/czync/token-killer/pulls/57` gives head sha
`95fe26073a08070078a59e6139186d0c420c9e2b`; `gh api
'repos/czync/token-killer/actions/runs?head_sha=95fe2607…'` returns exactly one run
(workflow "CI", event pull_request) with `conclusion: success`, created
2026-07-08T06:36:11Z, completed (updated_at) 2026-07-08T06:38:59Z — green before the
06:39:26Z merge/cutoff. Pathless-rg regression tests present in the pinned tree:
`tests/integration/cli.test.ts:592` ("ctx rg with no path operand searches the cwd
(not empty stdin)") and `:609` ("ctx rg -g <glob> with no path operand finds matches
(reported glob bug)"), matching the fix's mechanism documented at
`src/executor.ts:491-498` (stdin 'ignore' instead of an empty pipe). The
`inspect --json` dispatch test is present at
`tests/integration/allCommands.test.ts:68-73` within the "every subcommand dispatches
end-to-end" suite, whose assertion `expect(result.stderr).not.toContain("ctx wraps
known dev tools")` (line ~88) is precisely the not-falling-through-to-passthrough
check. The aside comparing to other cases in the run is outside this packet's scope
and not a material sub-claim of this question.

## Q4 — the `repo:` → `repo-` seam's record

**Score: partial (3/4)**

Three of four material sub-claims verified; one confident sub-claim is wrong.
Correct: (1) the seam is recorded in a detailed code comment at
`src/core/dataDir.ts:137-147` (colon reserved on Windows, ENOENT on `mkdir
projects\repo:<hash>`, POSIX no-op, replace `/:/g` with `-` on win32); (2) marking
the duplicate-pair tests POSIX-only contradicts no recorded requirement — the marker
is `tests/unit/core/recordsHealth.test.ts:22` (`posixTest = process.platform ===
"win32" ? test.skip : test`) applied to the two duplicate-pair tests (lines 131, 142),
and I found no cross-platform testing mandate in `docs/PRINCIPLES.md`,
`docs/DESIGN.md`, or `AGENTS.md`; `.github/workflows/ci.yml` runs the identical
matrix on ubuntu + windows but records no rule against platform-conditional tests;
(3) the constraint is physical and the PR body documents it — the body states
"Windows cannot express both directories at once" and `:` is illegal in Windows path
components. Incorrect sub-claim: "no ADR." ADR 0014, added in this same PR and
present at cutoff, records the seam's substance twice: "duplicate `repo:`/`repo-`
buckets" (`docs/adr/0014:16`) and "merge `repo:`/`repo-` duplicate dirs (a store
copied between POSIX and Windows, where the colon is path-illegal)"
(`docs/adr/0014:31-33`). The question explicitly asked where the seam is recorded
(decision/ADR/code); asserting the ADR half absent is a miss, though not
false-reassurance — the claim errs toward caution and the material safety judgment
(POSIX-only skip is legitimate) is right. Sub-claims: code-comment record (correct),
no-conflict-with-recorded-requirement (correct), physical constraint + PR-body
documentation (correct), "no ADR" (incorrect — ADR 0014 records it) = 3/4.

## Q5 — does merged 0.3.2 match planned 0.3.2

**Score: correct**

Every confident claim verified, and my deeper-than-sampled check confirms the
conclusion the operator reached with disclosed limits. Issue #58 (created
2026-06-18T07:35:08Z, admissible) demands a committed per-category template registry,
select-and-fill `buildPrompt`, full closed-set coverage, deterministic/offline with no
model call, and composing "Copy all". At the pinned commit: the registry exists as
`PROMPT_TPL` in `src/report/promptModel.ts` (26 entries, lines 68-196) with
`buildPrompt` selecting by `f.type` and interpolating via `fillTpl`
(`promptModel.ts:231-235`); it is static `String.raw` template data with regex
interpolation — no model call. All 21 issue-listed PROBLEM types are covered, three
under corrected keys with an in-code rationale ("Keys MUST match the real finding
f.type… the earlier duplicate_instructions / conditional_rule_missing /
review_truncation_risk keys never matched a finding", `promptModel.ts:37-40`). The
9 hyphenated AdviceType categories have no registry entries, but they never reach the
copy-prompt surface: the HTML report's findings are `[...rtFindings,
...staticFindings]` (`src/inspect/cli.ts:389,429`), advice feeds only the
appendix/terminal report (`src/inspect/cli.ts:416-420` even notes "the HTML report
shows the unified `mcp_bloat` runtime finding instead"), and a coverage test enforces
a template for every type that does reach it
(`tests/unit/report/html.test.ts:343-381`); `buildAllPrompt` composition is tested
(`html.test.ts:383-395`). The scope-location caveat is also verified: at cutoff there
is no standalone 0.3.2 scope doc (repo-wide grep for `0.3.2` hits only
`package.json`, `plans/README.md`/`plans/014` as a baseline reference, and ADR 0015),
no 0.3.2 milestone (`gh api …/milestones?state=all` → mvp, alpha), and the only
pre-cutoff issues mentioning 0.3.2 are #57, #58, and #86 (a bug report listing
"tk 0.3.2" as its environment). The answer's hedges accurately describe its
verification depth rather than dodge a reachable answer, and the reached answer is
right: no recorded 0.3.2 scope item is missing from the merge.
