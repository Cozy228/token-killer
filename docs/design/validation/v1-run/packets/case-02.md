---
packet: 2
pr: czync/token-killer#89
cutoff: 2026-07-09T06:09:56Z
merge_commit: 59fc1ab217dd4c37ccc1ccdac5ff6487b9cb25ec
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 2 (token-killer#89)

**PR:** czync/token-killer#89 — "fix: preserve JVM recovery evidence"
**Cutoff (UTC):** 2026-07-09T06:09:56Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `59fc1ab217dd4c37ccc1ccdac5ff6487b9cb25ec` (base: main)

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
   `git worktree add --detach <tmp> 59fc1ab217dd4c37ccc1ccdac5ff6487b9cb25ec` in the token-killer
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
6. **Output your vote** as `packets/votes/case-02-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, full body (summary/why/
validation claims), 15-file list, hunk map, maven.ts main hunk (phase
detection, quiet-mode signals, noise filters, plugin-goal scoping).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The maven handler replaces the `BUILD_VERBS` verb test with `detectMavenPhase` (option-value skipping, plugin-goal scoping where only `checkstyle/pmd/spotbugs/jacoco/spring-boot:*` stay in scope, everything else with `:` passes through). Which command spellings actually route into the java handlers (mvn/mvnw/gradle/gradlew matching), and does the rewrite change compression/passthrough behavior for any command shape that previously compressed (or vice versa) beyond the four advertised fixes? | yes |
| 2 | Ownership / routing | The body attributes the regressions to "JVM output filtering added on the 0.3.3 branch". Which commit/PR introduced that filtering and what did it record about the quiet-mode/footer heuristics' intent — where does a reviewer find the original rationale to check this fix against? | yes |
| 3 | Verification-evidence | The body claims 54 JVM vitest / 2020 product tests / 52-smoke / install-bake validation. What is independently verifiable at cutoff: do the new test files cover the four fix claims (quiet-mode success mislabel, Failsafe report paths, reactor resume command, gradle `check` as test+analysis evidence), and was CI green on this head at or before cutoff? | yes |
| 4 | Convention / decision-context | What recorded contract governs dropping output in handlers (omission disclosure / never-fabricate / RTK-parity), and does this rewrite honor it — is filtered-away output declared via `OmissionDeclaration`, and where is that contract written? | yes |
| 5 | Delivery-requirements | The PR bumps package.json to 0.3.3 and ships a 569-line migration-plan doc. What does this repo require around a version bump (VERSION baking, install/smoke gates, release steps), how did 0.3.1/0.3.2 bumps ship, and is anything else required before 0.3.3 is releasable that this PR doesn't carry? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — routing + behavior changes beyond the advertised fixes

**Operator's verbatim queries:**

```
grep -rn "maven|gradle" src/handlers/index.ts   (pinned worktree @${S})
grep -n "match(|program ===|endsWith" src/handlers/java/{maven,gradle}.ts (@${S})
git show "${S}^:src/handlers/java/maven.ts"  | grep -n "BUILD_VERBS|match("
git show "${S}^:src/handlers/java/gradle.ts" | grep -n "match("
```

**Operator's final answer (verbatim):**

Answer: routing is untouched, so the blast radius is confined to what the
two handlers emit. But the rewrite changes behavior beyond the four
advertised fixes: four verbs (`clean`, `site`, `validate`, `build`) silently
drop OUT of compression, verbose/probe/unknown-goal invocations become
passthrough, and two new phases join. All of these are behavior deltas a
reviewer should know about; they are direction-of-safety (passthrough = no
information loss) but do change token-savings behavior. Pre-existing gap
worth flagging: `mvnw` wrapper never routed to the handler at all.

**Operator confidence label:** **confirmed**

---

### Q2 — where is the original filtering + its rationale

**Operator's verbatim queries:**

```
git log "${S}" --format='%h %cI %s' -- src/handlers/java/
gh pr view 89 --json commits
git show "${S}^:src/handlers/java/maven.ts" | sed -n '14,55p'
```

**Operator's final answer (verbatim):**

Answer: the offending filtering is the PR's own first feature commit
(3dcdac52), fixed by its second commit — a reviewer diffing commit-by-commit
sees the regression and repair in sequence. The older heuristics' rationale
lives in code comments (footer-derived heading) and commit messages of the
06-02→06-10 lineage (RTK lossless alignment / output fidelity); no ADR
covers JVM filtering specifically, but the PR itself ships the migration
plan doc that now records intent.

**Operator confidence label:** **confirmed**

---

### Q3 — verifiable test/CI evidence at cutoff

**Operator's verbatim queries:**

```
gh api repos/czync/token-killer/pulls/89 -q .head.sha        → 1654785d
gh api 'repos/…/actions/runs?head_sha=1654785d'              → created/updated
git show "${S}:tests/unit/handlers/rtkMavenBehavior.test.ts"  | grep -n 'test("'
git show "${S}:tests/unit/handlers/rtkGradleBehavior.test.ts" | grep -n 'test("'
```

**Operator's final answer (verbatim):**

Answer: all four fix claims are covered by named unit tests present at
cutoff, and CI on the exact head SHA completed green 4s before merge —
fully admissible. The body's broader validation numbers are author claims
corroborated only to the extent the CI workflow runs them.

**Operator confidence label:** **confirmed** (with the author-asserted remainder explicitly

---

### Q4 — the output-dropping contract

**Operator's verbatim queries:**

```
git grep -n "OmissionDeclaration" "${S}" -- src/types.ts
git ls-tree "${S}" docs/adr/  → 0001-evidence-class-capping-and-recovery.md …
git show "${S}:docs/adr/0001-evidence-class-capping-and-recovery.md" | sed -n '1,12p'
git show "${S}:src/handlers/java/maven.ts" | grep -n "omission|ADR"
git show "${S}:docs/PRINCIPLES.md" | grep -n -i "fabricat|lossless|rtk"
```

**Operator's final answer (verbatim):**

Answer: the governing contract is ADR 0001 (declared caps, never silent
slices) plus the OmissionDeclaration type it feeds; this PR wires its new
formatters through the same over-budget ladder and declares omissions
there. Noise-line stripping remains undeclared by design — ADR 0001 governs
evidence capping, and the PR's fix direction (keep recovery evidence,
passthrough when unsure) moves TOWARD the recorded principle.

**Operator confidence label:** **confirmed**

---

### Q5 — version bump + delivery conventions

**Operator's verbatim queries:**

```
git log "${S}" --format='%h %ad %s' --date=short -G'"version": "0\.' -- package.json
git grep -n "VERSION" "${S}" -- scripts/ | grep -i version   (test-install drift guard)
git ls-tree --name-only "${S}" docs/ | grep -i "releas|publish|distribut"
```

**Operator's final answer (verbatim):**

Answer: bumping to 0.3.3 inside this fix PR matches how 0.2.0/0.3.1/0.3.2
all shipped; the baked-version drift guard is the required delivery gate
and the PR claims it ran. Nothing else is formally required in-repo (no
release checklist exists); publishing itself remains a manual out-of-repo
act.

**Operator confidence label:** **confirmed**

---

