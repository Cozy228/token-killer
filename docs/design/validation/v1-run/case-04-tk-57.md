---
case: 4
pr: czync/token-killer#57
title: "feat: release 0.3.2 support, doctor, inspect hardening"
cutoff: 2026-07-08T06:39:26Z
cutoff_kind: merge-fallback
merge_commit: 6e9d0c90a6b4aeef3089542f6669a9603b4c8a88
base: main
status: operated
---

# Case 4 — token-killer#57

Subject read before question-writing: PR title, full body (What/Changes/CI
fix/Verification, "Closes #58"), file-count distribution (335 files: src/core
20, docs/adr 15, src/context 9, scripts/*, server/*).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The body says `tk doctor` "replaces `tk status`". What breaks for anything that invoked `status` — is a `status` alias/stub kept, which in-repo surfaces (docs, smoke tests, host adapters, install scripts) referenced `tk status` before this PR, and are they all migrated at cutoff? | yes |
| 2 | Ownership / routing | ADR 0013 "supersedes ADR 0011" for support destinations. What did ADR 0011 decide, is it stamped superseded in the tree at cutoff, and which other recorded decisions govern the support-routing surface a reviewer must reconcile with the build-time baking approach? | yes |
| 3 | Verification-evidence | Was CI green on this PR's head at or before the 06:39:26Z cutoff, and do the claimed release-readiness regression fixes (pathless `tk rg`, `inspect --json` dispatch not falling through to passthrough) have named tests present at cutoff? | yes |
| 4 | Convention / decision-context | The Windows CI fix leans on `fingerprintSegment()` rendering `repo:<hash>` as `repo-<hash>` on Windows. Where is that path-encoding seam recorded (decision/ADR/code), and does marking the duplicate-pair tests POSIX-only conflict with any recorded cross-platform testing requirement? | yes |
| 5 | Delivery-requirements | The PR closes #58 and ships 0.3.2. What did the repo's recorded 0.3.2 scope (issue #58, any 0.3.2 scope doc present at cutoff) require, and is any scoped item missing from this PR — i.e., does "0.3.2" as merged match "0.3.2" as planned? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

All git queries pinned to merge commit `6e9d0c90` (`${S}`); cutoff
2026-07-08T06:39:26Z.

### Q1 — what breaks for `tk status` callers

Queries executed:

```
grep -rn "tk status|ctx status|\"status\"" src/cli.ts src/parse.ts docs/*.md tests/smoke/smoke.sh (@${S})
git show "${S}^:src/cli.ts" | grep -n status
```

Evidence (cited):

- Post-PR `cli.ts:392-393`: `ctx status` prints a rename hint to stderr
  ("was renamed to `ctx doctor`") — removed verbs do NOT fall through to
  passthrough; `parse.ts:73` documents the replacement.
- A dedicated test guards this: `tests/integration/allCommands.test.ts:93`
  "removed verbs print a rename hint, not a passthrough attempt".
- Pre-PR cli.ts (@`${S}^`): `status` was a first-class verb (help text
  lines 45, 74-75).
- Stragglers still instructing humans to run `ctx status` at cutoff:
  `docs/WINDOWS-TESTER-GUIDE.md:66,117,157,172` and the runtime-perf plan
  docs (`runtime-perf-impl-goal.md:69`, `runtime-startup-perf-plan.md:228,
  615`). `tk telemetry status` is a different subcommand and unaffected.

Answer: scripted/agent callers of `ctx status` get a deterministic stderr
rename hint (with a regression test), not silent breakage. The blast
radius that remains is documentation: the Windows tester guide — a
document handed to external testers — still instructs `ctx status` four
times at cutoff, plus two perf-plan docs.

Confidence: **confirmed**.

### Q2 — ADR 0011 → 0013 reconciliation

Queries executed:

```
ls docs/adr/ (@${S}) ; head -8 docs/adr/0011*.md ; head -8 docs/adr/0013*.md
```

Evidence (cited):

- `0011-support-routing-env-configured.md` @cutoff: frontmatter
  `status: superseded` + `superseded-by: 0013-…` and a body banner linking
  ADR 0013. Its decision was: support routing via env config, no baked
  destination.
- `0013-support-destination-baked-at-build.md`: `status: accepted`,
  `supersedes: 0011-…`; rationale opens "ctx support reaches whoever
  packaged the build — the maintainer."
- Adjacent decisions shipped in the same PR: ADR
  `0014-doctor-diagnose-repair-and-records-normalization.md` (the doctor
  surface) and `0015-contexa-ctx-hard-rename.md` — the ADR set for this
  release is present and cross-stamped at cutoff.

Answer: the supersession is fully recorded and bidirectionally stamped in
the tree at cutoff — a reviewer can read 0011's superseded banner, 0013's
rationale, and 0014 for the doctor surface. Nothing dangling on this
surface.

Confidence: **confirmed**.

### Q3 — CI at cutoff + regression-fix tests

Queries executed:

```
gh api repos/czync/token-killer/pulls/57 -q .head.sha     → 95fe2607
gh api 'repos/…/actions/runs?head_sha=95fe2607'
grep -rn "pathless|0 matches" tests/ ; grep -n "inspect --json|passthrough" tests/integration/allCommands.test.ts
```

Evidence (cited):

- CI on head `95fe2607`: created 06:36:11Z, **completed success 06:38:59Z —
  27 seconds BEFORE the 06:39:26Z merge**. Green-at-cutoff holds.
- Pathless-rg regression: `tests/integration/cli.test.ts:581-592` —
  comment "Regression: `ctx rg PATTERN` with NO path operand reported a
  false '0 matches'" + test "ctx rg with no path operand searches the cwd
  (not empty stdin)"; the fix's rationale is also in `src/executor.ts:494`.
- Dispatch regression: `tests/integration/allCommands.test.ts:13,51,69,86`
  — inspect --json case asserts the verb reaches its handler and "never
  the command-router passthrough error".

Answer: yes on both counts — CI completed green pre-cutoff (first case in
this run where the merge waited), and both advertised regression fixes
carry named tests present at cutoff.

Confidence: **confirmed**.

### Q4 — the `repo:` → `repo-` seam's record

Queries executed:

```
grep -rn fingerprintSegment src/ ; grep -n -B3 -A6 fingerprintSegment src/core/dataDir.ts
grep -rn "fingerprintSegment|repo-" docs/adr/*.md
```

Evidence (cited):

- The seam and its rationale are recorded in code:
  `src/core/dataDir.ts:142-146` — Windows rejects `:` in path components;
  on POSIX it's a no-op so existing layouts stay untouched; "We only
  neutralise characters Windows actually rejects, keeping the segment
  stable per platform."
- No ADR covers it (grep over docs/adr empty for the seam); consumers:
  `src/inspect/persist.ts:42`, `src/core/recordsHealth.ts:237`.
- No recorded rule forbids platform-conditional tests; CI (plans/001 +
  workflow) requires both OSes to run the suite, which POSIX-only marking
  preserves (the tests skip rather than fail on Windows). The PR body
  itself records WHY Windows cannot express the `repo:`+`repo-`
  duplicate-pair fixture (both dirs can't coexist).

Answer: the encoding seam is code-comment-recorded (dataDir.ts) with no
ADR — consistent with this repo's pattern of load-bearing conventions
living in code comments (cf. case 1 Q2). Marking the duplicate-pair tests
POSIX-only contradicts no recorded requirement; the constraint is physical
(Windows can't host both spellings), and the PR body documents it.

Confidence: **confirmed**.

### Q5 — does merged 0.3.2 match planned 0.3.2

Queries executed:

```
gh issue view 58 (title, body, createdAt 2026-06-18)
grep -rln template src/report/ src/inspect/ (@${S}) → src/report/promptModel.ts
grep -c "always_on_bloat|skill_description_bloat|mcp_bloat|cost-tip" src/report/promptModel.ts → 6
```

Evidence (cited):

- Issue #58 (the one this PR closes) demands: pre-authored per-category
  prompt templates, committed as data, filled at runtime, NO runtime
  inference, over the closed PROBLEM/AdviceType category set.
- At cutoff, `src/report/promptModel.ts` exists as the per-type registry;
  sampled category keys (always_on_bloat, skill_description_bloat,
  mcp_bloat, cost-tip) all present. The PR body's "per-category prompts"
  claim maps to this file.
- The operator did NOT verify all ~30 categories individually, nor #58's
  full acceptance checklist item-by-item (issue body truncated at read;
  sampled verification only).
- The PR body's other scope claims (support baking, doctor, Copilot CLI
  discovery, PONYTAIL packaging, CI fix) each have visible artifacts in
  the file distribution (docs/adr 15 files, src/core 20, scripts/*).

Answer: the PR closes #58 with the demanded shape in place — a committed
per-category template registry with runtime interpolation and no model
call. Sampled checks corroborate; full per-category and per-acceptance-
item verification was not performed. No recorded 0.3.2 scope item was
found missing, with the caveat that "0.3.2 scope" exists as issue #58 +
the PR body itself rather than a standalone scope document.

Confidence: **partial** (sampled, not exhaustive, verification of scope
match; the registry's existence and mechanism are confirmed).
