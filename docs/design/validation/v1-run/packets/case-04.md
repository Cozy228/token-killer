---
packet: 4
pr: czync/token-killer#57
cutoff: 2026-07-08T06:39:26Z
merge_commit: 6e9d0c90a6b4aeef3089542f6669a9603b4c8a88
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 4 (token-killer#57)

**PR:** czync/token-killer#57 — "feat: release 0.3.2 support, doctor, inspect hardening"
**Cutoff (UTC):** 2026-07-08T06:39:26Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `6e9d0c90a6b4aeef3089542f6669a9603b4c8a88` (base: main)

## Instructions to the panel member (read fully before scoring)

You are one vote on the truth panel of the V0 WoZ stage-1 protocol
(`docs/design/validation/V0-WOZ-PROTOCOL.md`, frozen 2026-07-11). You are
adjudicating in a FRESH session, independent of the operator session and of
the other panel member. Rules that bind you:

1. **Blindness.** Do NOT read the operator scorecards
   (`docs/design/validation/v1-run/case-*.md`), the v1-run README checklist
   notes, or any other packet's votes before casting yours. This packet is
   your only operator-derived input. Do not consult `ctx` or any compiled
   artifact.
2. **Admissibility (§3).** Only evidence existing at or before the cutoff
   above is admissible. Pin your reads:
   `git worktree add --detach <tmp> 6e9d0c90a6b4aeef3089542f6669a9603b4c8a88` in the token-killer
   clone; history queries only on that commit's ancestry; GitHub API
   records filtered `created_at <= cutoff`. The realized post-merge outcome
   of the PR is inadmissible for the knowability judgment.
3. **Your job per question:** against your OWN independent read of the
   admissible sources plus the operator's verbatim queries below, judge:
   (a) was the operator's final answer correct? (b) was the answer (or a
   better one) reachable from admissible sources? (c) does any confident
   claim in the answer turn out wrong — if so, on a material question,
   apply the false-reassurance test (§2).
4. **Scoring rubric (§7, fixed):** score each question exactly one of
   `correct` (1.0) · `abstained-correctly` (0, never a kill trigger) ·
   `partial` (fraction = correctly-backed material sub-claims ÷ required
   material sub-claims; enumerate the sub-claims) · `incorrect` (0) ·
   `false-reassurance` (wrong AND presented as confirmed/safe/complete on a
   material question — kill trigger).
5. **False reassurance (§2, verbatim intent):** a material question answered
   wrongly while presented as confirmed/safe/complete — a confident wrong
   answer that would have reassured the reviewer into an action the truth
   would have changed. A disclosed unknown ("sources do not establish X")
   is NOT a failure; a lazy abstention where the answer WAS reachable
   scores `incorrect`.
6. **Output your vote** as `packets/votes/case-04-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, full body (What/Changes/CI
fix/Verification, "Closes #58"), file-count distribution (335 files: src/core
20, docs/adr 15, src/context 9, scripts/*, server/*).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The body says `tk doctor` "replaces `tk status`". What breaks for anything that invoked `status` — is a `status` alias/stub kept, which in-repo surfaces (docs, smoke tests, host adapters, install scripts) referenced `tk status` before this PR, and are they all migrated at cutoff? | yes |
| 2 | Ownership / routing | ADR 0013 "supersedes ADR 0011" for support destinations. What did ADR 0011 decide, is it stamped superseded in the tree at cutoff, and which other recorded decisions govern the support-routing surface a reviewer must reconcile with the build-time baking approach? | yes |
| 3 | Verification-evidence | Was CI green on this PR's head at or before the 06:39:26Z cutoff, and do the claimed release-readiness regression fixes (pathless `tk rg`, `inspect --json` dispatch not falling through to passthrough) have named tests present at cutoff? | yes |
| 4 | Convention / decision-context | The Windows CI fix leans on `fingerprintSegment()` rendering `repo:<hash>` as `repo-<hash>` on Windows. Where is that path-encoding seam recorded (decision/ADR/code), and does marking the duplicate-pair tests POSIX-only conflict with any recorded cross-platform testing requirement? | yes |
| 5 | Delivery-requirements | The PR closes #58 and ships 0.3.2. What did the repo's recorded 0.3.2 scope (issue #58, any 0.3.2 scope doc present at cutoff) require, and is any scoped item missing from this PR — i.e., does "0.3.2" as merged match "0.3.2" as planned? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — what breaks for `tk status` callers

**Operator's verbatim queries:**

```
grep -rn "tk status|ctx status|\"status\"" src/cli.ts src/parse.ts docs/*.md tests/smoke/smoke.sh (@${S})
git show "${S}^:src/cli.ts" | grep -n status
```

**Operator's final answer (verbatim):**

Answer: scripted/agent callers of `ctx status` get a deterministic stderr
rename hint (with a regression test), not silent breakage. The blast
radius that remains is documentation: the Windows tester guide — a
document handed to external testers — still instructs `ctx status` four
times at cutoff, plus two perf-plan docs.

**Operator confidence label:** **confirmed**

---

### Q2 — ADR 0011 → 0013 reconciliation

**Operator's verbatim queries:**

```
ls docs/adr/ (@${S}) ; head -8 docs/adr/0011*.md ; head -8 docs/adr/0013*.md
```

**Operator's final answer (verbatim):**

Answer: the supersession is fully recorded and bidirectionally stamped in
the tree at cutoff — a reviewer can read 0011's superseded banner, 0013's
rationale, and 0014 for the doctor surface. Nothing dangling on this
surface.

**Operator confidence label:** **confirmed**

---

### Q3 — CI at cutoff + regression-fix tests

**Operator's verbatim queries:**

```
gh api repos/czync/token-killer/pulls/57 -q .head.sha     → 95fe2607
gh api 'repos/…/actions/runs?head_sha=95fe2607'
grep -rn "pathless|0 matches" tests/ ; grep -n "inspect --json|passthrough" tests/integration/allCommands.test.ts
```

**Operator's final answer (verbatim):**

Answer: yes on both counts — CI completed green pre-cutoff (first case in
this run where the merge waited), and both advertised regression fixes
carry named tests present at cutoff.

**Operator confidence label:** **confirmed**

---

### Q4 — the `repo:` → `repo-` seam's record

**Operator's verbatim queries:**

```
grep -rn fingerprintSegment src/ ; grep -n -B3 -A6 fingerprintSegment src/core/dataDir.ts
grep -rn "fingerprintSegment|repo-" docs/adr/*.md
```

**Operator's final answer (verbatim):**

Answer: the encoding seam is code-comment-recorded (dataDir.ts) with no
ADR — consistent with this repo's pattern of load-bearing conventions
living in code comments (cf. case 1 Q2). Marking the duplicate-pair tests
POSIX-only contradicts no recorded requirement; the constraint is physical
(Windows can't host both spellings), and the PR body documents it.

**Operator confidence label:** **confirmed**

---

### Q5 — does merged 0.3.2 match planned 0.3.2

**Operator's verbatim queries:**

```
gh issue view 58 (title, body, createdAt 2026-06-18)
grep -rln template src/report/ src/inspect/ (@${S}) → src/report/promptModel.ts
grep -c "always_on_bloat|skill_description_bloat|mcp_bloat|cost-tip" src/report/promptModel.ts → 6
```

**Operator's final answer (verbatim):**

Answer: the PR closes #58 with the demanded shape in place — a committed
per-category template registry with runtime interpolation and no model
call. Sampled checks corroborate; full per-category and per-acceptance-
item verification was not performed. No recorded 0.3.2 scope item was
found missing, with the caveat that "0.3.2 scope" exists as issue #58 +
the PR body itself rather than a standalone scope document.

**Operator confidence label:** **partial** (sampled, not exhaustive, verification of scope

---

