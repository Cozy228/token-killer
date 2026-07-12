---
packet: 8
pr: czync/token-killer#51
cutoff: 2026-06-17T17:38:12Z
merge_commit: af88664b18f1abbb71fc67e62191bac6b4f0d77e
base: feat/0.3.1
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 8 (token-killer#51)

**PR:** czync/token-killer#51 — "fix(optimize): scope triggered inspect to static-context only"
**Cutoff (UTC):** 2026-06-17T17:38:12Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `af88664b18f1abbb71fc67e62191bac6b4f0d77e` (base: feat/0.3.1)

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
   `git worktree add --detach <tmp> af88664b18f1abbb71fc67e62191bac6b4f0d77e` in the token-killer
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
6. **Output your vote** as `packets/votes/case-08-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, full body (176s discarded
full-inspect motivation, internal `--static-only` flag, 4 checked acceptance
criteria, side-fix of `--apply` opening HTML), 4-file list. Operator carries
batch-topology context from cases 5-7 (#51's merge = af88664b, merged before
#53/#52; batch CI red pattern).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | `--static-only` leaves `result`/`habits` undefined, and the body claims report and exit-code logic "already treat [that] as no runtime data". Which downstream consumers of `runInspect` outputs exist at cutoff (report rendering, `--fail-on` exit codes, telemetry aggregates, scope-bucket persistence), and is the "already handled" claim true for each — or does any path assume a defined scan result? | yes |
| 2 | Ownership / routing | Where was the optimize↔inspect contract recorded — which ADR/decision says `tk optimize` consumes only `static_context` findings (ADR 0003 inspect-default-full-static-context? ADR 0006 optimize-apply engine?) — and does this PR's scoping match that recorded contract or quietly narrow it? | yes |
| 3 | Verification-evidence | What was CI on this PR's head at the 17:38:12Z cutoff (batch siblings ran red on Node 22), and does `tests/unit/context/optimizeStaticScope.test.ts` at cutoff actually cover the four checked acceptance criteria (scan/habits spies with a real seeded transcript, static-finding parity full-vs-scoped, no-double-scan, stderr why-message)? | yes |
| 4 | Convention / decision-context | The body says `--static-only` is "not part of the public flag surface". What convention distinguishes internal from public flags in this repo at cutoff (help text, parse layer, docs), and does `--static-only` conform — is it hidden from `--help` and rejected/undocumented for direct users? | yes |
| 5 | Delivery-requirements | The claim "no double cold-scan across `user` + `project`" — what mechanism in this PR actually delivers it (shared analyzer run? bucket reuse between scopes?), is it tested, and does anything else need to ship for a git-repo user to stop paying the doubled cost described in the body? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — undefined result/habits: is "already handled" true?

**Operator's verbatim queries:**

```
grep -n -B2 -A5 "staticOnly|static-only" src/inspect/cli.ts
grep -n "result ??|result ? |habits" src/inspect/cli.ts src/report/html.ts src/inspect/telemetry.ts
grep -n -B2 -A4 "failOn|exitCode" src/inspect/cli.ts
```

**Operator's final answer (verbatim):**

Answer: the "already treat as no runtime data" claim checks out at every
consumer found: report renders against an explicit empty result,
telemetry aggregation short-circuits to undefined, and exit-code logic
is severity-driven rather than scan-dependent. No path at cutoff
dereferences a missing scan result.

**Operator confidence label:** **confirmed**

---

### Q2 — where the optimize↔inspect contract is recorded

**Operator's verbatim queries:**

```
grep -n -i static docs/adr/0003-inspect-default-full-static-context.md
grep -n -i "static_context|static context" docs/adr/0006-cli-consolidation-and-optimize-apply-engine.md
grep -n -B3 -A8 staticOnly src/context/optimizeCli.ts src/context/applySafe.ts
```

**Operator's final answer (verbatim):**

Answer: the consumption contract lives in code comments (both trigger
sites), not in an ADR; ADR 0003 supplies the static-analyzer precedent
and ADR 0006 the apply engine, but neither states the
"static-findings-only" contract explicitly. The PR matches the recorded
(comment-level) contract and changes computation, not consumption. Same
repo pattern as cases 1/4: load-bearing contracts recorded at code level.

**Operator confidence label:** **confirmed**

---

### Q3 — CI truth + acceptance coverage

**Operator's verbatim queries:**

```
gh api repos/czync/token-killer/pulls/51 -q .head.sha
gh api 'repos/…/actions/runs?head_sha=<head>'  → completed/failure 17:17:41Z
grep -n 'test(' tests/unit/context/optimizeStaticScope.test.ts
```

**Operator's final answer (verbatim):**

Answer: acceptance coverage is complete and named — every checked box
has a dedicated test at cutoff. The PR-level verification claim ("1752
passed") is author-asserted; the admissible CI record on this head is a
FAILURE run 21 minutes before the batch push.

**Operator confidence label:** **confirmed**

---

### Q4 — internal-flag convention conformance

**Operator's verbatim queries:**

```
grep -n "inspect" src/cli.ts (help block) ; grep -n '"--json|--fail-on' src/cli.ts
grep -rn "static-only" src/cli.ts src/parse.ts docs/  → no public surface hit
```

**Operator's final answer (verbatim):**

Answer: conforms to the repo's (informal) convention: internal flags are
undocumented-but-parseable, marked by code comment, absent from help and
docs. There is no formal internal-flag registry or rejection mechanism;
a user who discovers the flag can use it, which matches how the repo
treats other internal seams.

**Operator confidence label:** **confirmed**

---

### Q5 — what actually eliminates the doubled cost

**Operator's verbatim queries:**

```
grep -n -B3 -A8 "static-only|staticOnly" src/context/optimizeCli.ts src/context/applySafe.ts
grep -n 'test(' tests/unit/context/optimizeStaticScope.test.ts  (:168)
```

**Operator's final answer (verbatim):**

Answer: the mechanism is elimination — the transcript scan is simply no
longer part of either scope's trigger, so "doubled" becomes "zero";
per-scope static analysis still runs twice but that is the cheap,
scope-legitimate part. It is tested (:168), and nothing further needs to
ship for the git-repo user described in the body to stop paying the
176s×2.

**Operator confidence label:** **confirmed**

---

