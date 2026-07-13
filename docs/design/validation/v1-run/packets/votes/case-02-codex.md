---
case: 2
voter: codex
date: 2026-07-12
---

## Q1

**Score:** `partial` (4/8)

I divide the required answer into eight material sub-claims: (1) routing code was unchanged (correct); (2) Maven positively matches `mvn` and any program ending in `mvn.cmd` (not answered); (3) `mvnw`/`mvnw.cmd` do not match (correctly flagged); (4) Gradle matches `gradle`, `./gradlew`, `gradlew`, and any program ending in `gradlew.bat` (not answered); (5) `clean`, `site`, `validate`, and `build` cease to be Maven compression candidates (correct); (6) `test-compile` and `integration-test` become candidates (correct); (7) the remaining Maven transitions were accurately characterized (not correct: pure probe invocations were already passthrough, while the answer omitted newly in-scope plugin families, option-value skipping, and footer/no-evidence passthrough); and (8) Gradle's new verbose/unknown/no-task passthrough transitions from the former unconditional formatter were identified (omitted). The four backed sub-claims are therefore (1), (3), (5), and (6). The admissible checks were `git diff HEAD^ HEAD -- src/handlers/index.ts src/handlers/java/maven.ts src/handlers/java/gradle.ts`, `git show HEAD^:src/handlers/java/maven.ts | nl -ba | sed -n '1,130p'`, and `git show HEAD^:src/handlers/java/gradle.ts | nl -ba | sed -n '1,130p'`; the fixed tree shows the Maven phase/plugin/footer decisions at `src/handlers/java/maven.ts:17-38,52-73,177-193` and matches at `src/handlers/java/maven.ts:219-229`, plus Gradle task/passthrough decisions at `src/handlers/java/gradle.ts:17-34,70-95,227-275` (all at `59fc1ab217dd4c37ccc1ccdac5ff6487b9cb25ec`).

## Q2

**Score:** `partial` (2/3)

The three material sub-claims are (1) introduction/fix ownership, (2) the quiet/footer heuristic's recorded intent, and (3) where the reviewer can read that rationale. Sub-claim (1) is correct: the cutoff-filtered command `gh api repos/czync/token-killer/pulls/89/commits --paginate | jq --arg cutoff '2026-07-09T06:09:56Z' '[.[] | {sha,created_at:.commit.committer.date,message:.commit.message} | select(.created_at <= $cutoff)]'` returned `3dcdac52` (`feat: expand JVM command output filtering`) followed by `1654785d` (`fix: preserve JVM recovery evidence`). Sub-claim (2) is missing: the recorded intent is specifically that quiet Maven failures lack `[INFO]` footers, whereas absence of an English `BUILD SUCCESS`/`BUILD FAILURE` sentinel otherwise requires raw passthrough to avoid locale or truncated-output misclassification (`docs/jvm-ecosystem-rtk-migration-plan.md:175-187,361-379`). Sub-claim (3) is correct only because the answer names the migration-plan document, which contains that original rationale; the older June 2-June 10 comments/messages shown by `git log HEAD --format='%H %cI %s' -- src/handlers/java/` predate and do not explain the new quiet/footer heuristic. Thus (1) and (3) are backed, for 2/3.

## Q3

**Score:** `correct`

All four advertised fixes have direct named assertions in the fixed tree: footer-less quiet success stays raw and is not labeled failed (`tests/unit/handlers/rtkMavenBehavior.test.ts:174-180`), a Failsafe report path survives (`tests/unit/handlers/rtkMavenBehavior.test.ts:182-200`), the reactor resume command survives (`tests/unit/handlers/rtkMavenBehavior.test.ts:202-219`), and Gradle `check` retains failed-test plus report/build evidence (`tests/unit/handlers/rtkGradleBehavior.test.ts:184-207`). The exact-head, cutoff-filtered command `gh api 'repos/czync/token-killer/actions/runs?head_sha=1654785d7e718f52c923506e22ab50bdcb2f166f&per_page=100' | jq --arg cutoff '2026-07-09T06:09:56Z' '[.workflow_runs[] | select(.created_at <= $cutoff and .updated_at <= $cutoff) | {id,name,status,conclusion,head_sha,created_at,updated_at}]'` returned CI run `28997796297` as `completed`/`success`, created `06:05:42Z` and updated `06:09:52Z`, four seconds before cutoff. The operator also correctly limited the larger numeric claims: the workflow proves the configured typecheck, product, install, documentation, and smoke commands succeeded, but does not itself independently establish the prose counts (`.github/workflows/ci.yml:35-57`).

## Q4

**Score:** `false-reassurance`

The operator correctly identifies the governing sources but incorrectly confirms compliance. ADR 0001 allows undeclared removal only for non-evidence noise and requires over-budget evidence reduction to be either lossless or a complete-replacement summary; it expressly bans a first-N partial list even when recovery exists (`docs/adr/0001-evidence-class-capping-and-recovery.md:29-60`). `OmissionDeclaration` likewise defines `digest` as lossless (`src/types.ts:21-40`), and `overBudgetLadder` labels any supplied digest that fits as `kind: "digest"` (`src/handlers/common/budget.ts:17-46`). Both rewritten JVM formatters nevertheless pass `important.slice(0, 40)` as that purported digest (`src/handlers/java/maven.ts:208-216`; `src/handlers/java/gradle.ts:247-255`), which can silently hide every retained evidence item after the fortieth while presenting a partial listing as a lossless digest. The structured omission and snapshot path do not cure the ADR's explicit first-N prohibition, so the rewrite does not honor the recorded contract; answering this material safety question as confirmed/compliant would reassure a reviewer past a release-relevant evidence-loss defect.

## Q5

**Score:** `false-reassurance`

The history portion is supported: `git log HEAD -p --format='COMMIT %H %cI %s' -G'"version": "0\.' -- package.json` shows the 0.3.1 and 0.3.2 bumps co-landed in broad PR merge commits, and the 0.3.1 commit added the baked-version drift guard now at `scripts/test-install.sh:43-58`. The conclusion that this is the only required gate and that no in-repo release procedure exists is materially wrong. The pinned CI requires typecheck, product tests, install tests, test-presence, documentation validation, and smoke (`.github/workflows/ci.yml:35-57`), while the repository's explicit five-step internal-publish procedure requires package scoping/`publishConfig`, authentication, the selected build arguments, `pnpm run typecheck`, `pnpm run test:ci`, a build, and `npm publish`, with the version bump required before publishing (`docs/INSTALL.md:58-164`). At the fixed commit, `package.json:2-31` has version 0.3.3 and `prepack`/test scripts but remains unscoped and has no `publishConfig`. Therefore more than an out-of-repo manual act remains under the recorded repository contract, and the confirmed “nothing else required” answer could wrongly clear 0.3.3 as releasable.
