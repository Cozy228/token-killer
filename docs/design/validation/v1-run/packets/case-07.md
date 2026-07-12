---
packet: 7
pr: czync/token-killer#52
cutoff: 2026-06-17T17:38:12Z
merge_commit: 8de065d1e5972d357f21fe3bb470e166628e5365
base: feat/0.3.1
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 7 (token-killer#52)

**PR:** czync/token-killer#52 — "perf(inspect): let --since/--session reuse a per-event cross-run cache"
**Cutoff (UTC):** 2026-06-17T17:38:12Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `8de065d1e5972d357f21fe3bb470e166628e5365` (base: feat/0.3.1)

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
   `git worktree add --detach <tmp> 8de065d1e5972d357f21fe3bb470e166628e5365` in the token-killer
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
6. **Output your vote** as `packets/votes/case-07-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, full body (what/how, 5
checked acceptance criteria incl. a `warm < cold * 0.5` timing assert,
reviewer notes on sibling conflicts and CACHE_SCHEMA_VERSION not bumped),
5-file list. Operator carries case-5/6 context (batch merge topology; #52
merged LAST at 17:34:59Z local, on top of #53).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | After this merge (which lands ON TOP of #53's single-pass rewiring), what does the combined `cli.ts` route for each flag shape — unfiltered, `--since`, `--session` — and do the TWO per-file caches now in play (scan/habits extracts vs the new `scan-events` stream, both keyed path+mtime+size) stay consistent, or can one be warm and the other stale in a way that changes reported numbers? | yes |
| 2 | Ownership / routing | Where was the extract-cache design originally decided (which commit/PR introduced `extractCache.ts`, its schema versioning, best-effort semantics, `TK_NO_SCAN_CACHE`), and does that record justify this PR's choice to add a namespace instead of bumping `CACHE_SCHEMA_VERSION`? | yes |
| 3 | Verification-evidence | What was CI on THIS PR's head at the cutoff (siblings ran red on Node 22), and do the five checked acceptance criteria have corresponding tests in `extractCache.test.ts` at cutoff — including the cold→warm timing assertion — with the "117 tests passing" claim being author-asserted or CI-corroborated? | yes |
| 4 | Convention / decision-context | The acceptance encodes a wall-clock timing assert (`warm < cold * 0.5`) in a unit test. What recorded testing conventions exist at cutoff about time-dependent tests (vitest timeout config, prior CI-hang/flakiness fixes), and does this assert comply or introduce a recorded-risk pattern? | yes |
| 5 | Delivery-requirements | The new `scan-events` namespace writes per-file event streams to the user's disk. Is pruning actually wired for the new namespace at cutoff (`pruneCache` coverage), what bounds the cache's growth on an end-user machine, and does the `TK_NO_SCAN_CACHE` kill-switch cover the new writes? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — combined routing + two-cache consistency

**Operator's verbatim queries:**

```
grep -n -B2 -A6 "inspectSinglePass|scanWindowed|eventCache" src/inspect/cli.ts (@8de065d1)
grep -n -B3 -A10 "scanWindowed|function scanCached" src/inspect/scan.ts
grep -n "mtime|size|key" src/inspect/extractCache.ts
```

**Operator's final answer (verbatim):**

Answer: after the full batch, the flag → path map is: unfiltered →
single-pass over folded extracts (#53); `--since`/`--session` →
`scanWindowed` over the per-event stream (this PR); no-cache fallback →
`scanLive`. The two namespaces can be warm/cold independently but can
never disagree on content for the same file state, because both key on
the identical (path, mtime, size, schema) tuple and each result is
computed wholly from one namespace.

**Operator confidence label:** **confirmed**

---

### Q2 — where the cache design was decided

**Operator's verbatim queries:**

```
git log --all --follow --format='%h %cI %s' -- src/inspect/extractCache.ts | tail -3
git log -1 --format='%B' 68153e81
git show 68153e81:src/inspect/extractCache.ts | grep -n "namespace|SCHEMA_VERSION"
```

**Operator's final answer (verbatim):**

Answer: the cache design was decided one slice earlier the same day
(commit 68153e81, maintainer), and its written design directly justifies
this PR's namespace-over-version-bump choice: namespaces exist precisely
to separate payload shapes, while SCHEMA_VERSION guards a given shape.
Adding `scan-events` as a new namespace is the designed extension point,
so not bumping the version is correct per the original record.

**Operator confidence label:** **confirmed**

---

### Q3 — CI truth + acceptance tests

**Operator's verbatim queries:**

```
gh api repos/czync/token-killer/pulls/52 -q .head.sha
gh api 'repos/…/actions/runs?head_sha=<head>'  → completed/failure 17:19:09Z
grep -n "0.5|cold|warm|performance.now" tests/unit/inspect/extractCache.test.ts
sed -n '138,175p' same
```

**Operator's final answer (verbatim):**

Answer: the five checked acceptance boxes map to real tests present at
cutoff (consultation counting, timing, fallback, --session, plus
identity checks). But as with its sibling, the PR-level claim of green
verification is contradicted by the admissible record: this head's CI
run completed FAILURE 19 minutes before the merge was pushed.

**Operator confidence label:** **confirmed**

---

### Q4 — timing-assert vs recorded testing conventions

**Operator's verbatim queries:**

```
grep -n "testTimeout|timeout" vitest.config.ts (@8de065d1)
grep -rn "timing|flak" tests/unit/inspect/extractCache.test.ts
```

**Operator's final answer (verbatim):**

Answer: no convention at cutoff forbids or blesses wall-clock asserts —
the 30s testTimeout comment is the closest recorded thinking. The
`*0.5` margin rides on cold-parse dominance and could flake on a fast
FS/slow clock, but the deterministic counting assertions beside it carry
the same claim, so the timing assert is redundant belt-and-braces rather
than sole evidence. A reviewer could request its demotion; no recorded
rule requires it.

**Operator confidence label:** **confirmed** (the absence of a convention is the sourced

---

### Q5 — disk growth, pruning, kill-switch for the new namespace

**Operator's verbatim queries:**

```
grep -n -B2 -A4 pruneCache src/inspect/cli.ts src/inspect/extractCache.ts
grep -n -B2 -A4 TK_NO_SCAN_CACHE src/inspect/extractCache.ts
```

**Operator's final answer (verbatim):**

Answer: pruning is wired for the new namespace at cutoff (root-level,
30-day file-age reclaim, orphan-safe), the kill-switch covers it because
it acts at the shared cache layer, and growth is bounded by
one-entry-per-source-file plus the age-based prune. Delivery-complete on
this axis.

**Operator confidence label:** **confirmed**

---

