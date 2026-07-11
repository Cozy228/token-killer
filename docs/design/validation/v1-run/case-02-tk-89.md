---
case: 2
pr: czync/token-killer#89
title: "fix: preserve JVM recovery evidence"
cutoff: 2026-07-09T06:09:56Z
cutoff_kind: merge-fallback
merge_commit: 59fc1ab217dd4c37ccc1ccdac5ff6487b9cb25ec
base: main
status: operated
---

# Case 2 — token-killer#89

Subject read before question-writing: PR title, full body (summary/why/
validation claims), 15-file list, hunk map, maven.ts main hunk (phase
detection, quiet-mode signals, noise filters, plugin-goal scoping).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The maven handler replaces the `BUILD_VERBS` verb test with `detectMavenPhase` (option-value skipping, plugin-goal scoping where only `checkstyle/pmd/spotbugs/jacoco/spring-boot:*` stay in scope, everything else with `:` passes through). Which command spellings actually route into the java handlers (mvn/mvnw/gradle/gradlew matching), and does the rewrite change compression/passthrough behavior for any command shape that previously compressed (or vice versa) beyond the four advertised fixes? | yes |
| 2 | Ownership / routing | The body attributes the regressions to "JVM output filtering added on the 0.3.3 branch". Which commit/PR introduced that filtering and what did it record about the quiet-mode/footer heuristics' intent — where does a reviewer find the original rationale to check this fix against? | yes |
| 3 | Verification-evidence | The body claims 54 JVM vitest / 2020 product tests / 52-smoke / install-bake validation. What is independently verifiable at cutoff: do the new test files cover the four fix claims (quiet-mode success mislabel, Failsafe report paths, reactor resume command, gradle `check` as test+analysis evidence), and was CI green on this head at or before cutoff? | yes |
| 4 | Convention / decision-context | What recorded contract governs dropping output in handlers (omission disclosure / never-fabricate / RTK-parity), and does this rewrite honor it — is filtered-away output declared via `OmissionDeclaration`, and where is that contract written? | yes |
| 5 | Delivery-requirements | The PR bumps package.json to 0.3.3 and ships a 569-line migration-plan doc. What does this repo require around a version bump (VERSION baking, install/smoke gates, release steps), how did 0.3.1/0.3.2 bumps ship, and is anything else required before 0.3.3 is releasable that this PR doesn't carry? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

All git queries pinned to merge commit `59fc1ab2` (`${S}`) or `${S}^`;
GitHub API results checked against cutoff 2026-07-09T06:09:56Z.

### Q1 — routing + behavior changes beyond the advertised fixes

Queries executed:

```
grep -rn "maven|gradle" src/handlers/index.ts   (pinned worktree @${S})
grep -n "match(|program ===|endsWith" src/handlers/java/{maven,gradle}.ts (@${S})
git show "${S}^:src/handlers/java/maven.ts"  | grep -n "BUILD_VERBS|match("
git show "${S}^:src/handlers/java/gradle.ts" | grep -n "match("
```

Evidence (cited):

- Routing UNCHANGED by this PR: maven matches `program === "mvn"` or
  `endsWith("mvn.cmd")` both before (`${S}^` maven.ts:56-57) and after
  (maven.ts:224-225). Gradle matches `gradle`, `./gradlew`, `gradlew`,
  `*gradlew.bat` (unchanged, gradle.ts:262-267). Note (pre-existing, not this
  PR): the Maven wrapper `mvnw`/`./mvnw` does NOT match (`"mvnw.cmd"` does not
  end with `"mvn.cmd"`), while the Gradle wrapper does — asymmetric coverage.
- Old scope (`${S}^` maven.ts:8): `BUILD_VERBS = compile|test|package|install|
  deploy|verify|validate|clean|site|build`. New scope (diff): `MAVEN_PHASES =
  compile|test-compile|test|integration-test|package|install|verify|deploy`.
  ⇒ `validate`, `clean`, `site`, `build` LEAVE compression scope (a bare
  `mvn clean`/`mvn site` compressed before, passes through raw now);
  `test-compile`/`integration-test` enter it.
- New passthroughs beyond the advertised fixes (diff): verbose flags
  (`-X/--debug/-e/--errors`), probe-only invocations (`--version` etc.),
  unknown plugin goals (`anything:with-colon` except the 5 whitelisted
  prefixes), and empty args.

Answer: routing is untouched, so the blast radius is confined to what the
two handlers emit. But the rewrite changes behavior beyond the four
advertised fixes: four verbs (`clean`, `site`, `validate`, `build`) silently
drop OUT of compression, verbose/probe/unknown-goal invocations become
passthrough, and two new phases join. All of these are behavior deltas a
reviewer should know about; they are direction-of-safety (passthrough = no
information loss) but do change token-savings behavior. Pre-existing gap
worth flagging: `mvnw` wrapper never routed to the handler at all.

Confidence: **confirmed**.

### Q2 — where is the original filtering + its rationale

Queries executed:

```
git log "${S}" --format='%h %cI %s' -- src/handlers/java/
gh pr view 89 --json commits
git show "${S}^:src/handlers/java/maven.ts" | sed -n '14,55p'
```

Evidence (cited):

- The "filtering added on the 0.3.3 branch" is INSIDE this PR: commits
  `3dcdac52 feat: expand JVM command output filtering` then `1654785d fix:
  preserve JVM recovery evidence` (+ `0bed33a8 docs: plan JVM RTK
  migration`). The regression and its fix shipped together; the fix commit
  titled the PR.
- The pre-PR java-handler lineage on main: `43f37c3b` (2026-06-02, initial
  20 handlers) → `fc68a445` (06-04, "align handlers with lossless RTK
  output") → `2110953d` (06-08, defineHandler traits) → `a0bf8705` (06-10,
  "output fidelity across git/js/python/java/dotnet/system/cloud").
- Original quiet/footer intent is recorded in-code: `${S}^` maven.ts
  comment "Derive heading from actual result — successful builds must not
  be labeled failed" (`isSuccess = /BUILD SUCCESS/`) — i.e. the footer
  heuristic predates the PR, and quiet `-q` runs (which suppress the footer)
  were already mislabel-prone before this PR.
- Fuller rationale for the migration direction: the in-PR 569-line
  `docs/jvm-ecosystem-rtk-migration-plan.md` (admissible — part of the PR).

Answer: the offending filtering is the PR's own first feature commit
(3dcdac52), fixed by its second commit — a reviewer diffing commit-by-commit
sees the regression and repair in sequence. The older heuristics' rationale
lives in code comments (footer-derived heading) and commit messages of the
06-02→06-10 lineage (RTK lossless alignment / output fidelity); no ADR
covers JVM filtering specifically, but the PR itself ships the migration
plan doc that now records intent.

Confidence: **confirmed**.

### Q3 — verifiable test/CI evidence at cutoff

Queries executed:

```
gh api repos/czync/token-killer/pulls/89 -q .head.sha        → 1654785d
gh api 'repos/…/actions/runs?head_sha=1654785d'              → created/updated
git show "${S}:tests/unit/handlers/rtkMavenBehavior.test.ts"  | grep -n 'test("'
git show "${S}:tests/unit/handlers/rtkGradleBehavior.test.ts" | grep -n 'test("'
```

Evidence (cited):

- CI run on head `1654785d`: created 06:05:42Z, **completed success
  06:09:52Z — 4 seconds BEFORE the 06:09:56Z merge**. Green-at-cutoff holds
  (contrast with case 1).
- Each advertised fix has a named test at cutoff:
  1. quiet-success mislabel → maven test :174 "quiet success without an
     English footer stays raw instead of being labeled failed";
  2. Failsafe report path → :182 "failsafe failure keeps report path for
     integration-test recovery";
  3. reactor resume → :202 "reactor failure keeps resume command for human
     recovery";
  4. gradle check → gradle test :184 "check task keeps test failure
     evidence as well as build status".
- Extra: maven tests pin an RTK-source migration matrix (:81, entries map
  `mvn_cmd.rs::…` → fixtures, provenance "synthetic-from-plan"), plus
  verbose-bypass/empty-args passthrough tests (:242, :280).
- The PR body's larger numbers (2020 product tests, smoke 52/52, install
  7/7) are author-asserted; the CI run corroborates the vitest matrix but
  the operator did not re-derive those exact counts.

Answer: all four fix claims are covered by named unit tests present at
cutoff, and CI on the exact head SHA completed green 4s before merge —
fully admissible. The body's broader validation numbers are author claims
corroborated only to the extent the CI workflow runs them.

Confidence: **confirmed** (with the author-asserted remainder explicitly
scoped out).

### Q4 — the output-dropping contract

Queries executed:

```
git grep -n "OmissionDeclaration" "${S}" -- src/types.ts
git ls-tree "${S}" docs/adr/  → 0001-evidence-class-capping-and-recovery.md …
git show "${S}:docs/adr/0001-evidence-class-capping-and-recovery.md" | sed -n '1,12p'
git show "${S}:src/handlers/java/maven.ts" | grep -n "omission|ADR"
git show "${S}:docs/PRINCIPLES.md" | grep -n -i "fabricat|lossless|rtk"
```

Evidence (cited):

- Contract artifacts at cutoff: `src/types.ts:32 OmissionDeclaration`;
  `docs/adr/0001-evidence-class-capping-and-recovery.md` (status: accepted)
  — "Evidence-class capping, lossless digests, and a recovery contract",
  explicitly written against RTK's silent `+N more` capping.
- New maven.ts honors it at the budget boundary: line 208 comment "ADR 0001
  over-budget ladder: declared cap, never a silent slice"; formatMaven
  returns `{ output, omission }` (line 176/216).
- PRINCIPLES.md:22 records the product stance: the quality gate/fallback is
  the differentiator vs RTK ("RTK 容易高 savings 但错").
- Nuance visible in code: heuristic NOISE filtering (Scanning/Downloading/
  Total time lines) is treated as the compression itself and carries no
  omission declaration; the declared-omission machinery applies to
  over-budget capping. That split is consistent with ADR 0001's scope
  (capping, not noise stripping).

Answer: the governing contract is ADR 0001 (declared caps, never silent
slices) plus the OmissionDeclaration type it feeds; this PR wires its new
formatters through the same over-budget ladder and declares omissions
there. Noise-line stripping remains undeclared by design — ADR 0001 governs
evidence capping, and the PR's fix direction (keep recovery evidence,
passthrough when unsure) moves TOWARD the recorded principle.

Confidence: **confirmed**.

### Q5 — version bump + delivery conventions

Queries executed:

```
git log "${S}" --format='%h %ad %s' --date=short -G'"version": "0\.' -- package.json
git grep -n "VERSION" "${S}" -- scripts/ | grep -i version   (test-install drift guard)
git ls-tree --name-only "${S}" docs/ | grep -i "releas|publish|distribut"
```

Evidence (cited):

- Every prior release bumped `package.json` inside its release PR:
  `ab651c5c` 0.2.0 (#34), `aab70754` 0.3.1 (#47), `6e9d0c90` 0.3.2 (#57),
  now `59fc1ab2` 0.3.3 (#89). Bump-in-feature-PR is the established
  pattern, not an anomaly.
- Drift guard exists and is exercised: `scripts/test-install.sh:43-55`
  asserts the baked `__CTX_VERSION__` equals package.json.version (PR body's
  "baked VERSION (0.3.3)" claim maps to this gate).
- No release/publish checklist doc exists in docs/ at cutoff (grep empty);
  the 0.2.0 PR title mentions "prepack build & distribute docs" as the
  closest artifact.

Answer: bumping to 0.3.3 inside this fix PR matches how 0.2.0/0.3.1/0.3.2
all shipped; the baked-version drift guard is the required delivery gate
and the PR claims it ran. Nothing else is formally required in-repo (no
release checklist exists); publishing itself remains a manual out-of-repo
act.

Confidence: **confirmed**.
