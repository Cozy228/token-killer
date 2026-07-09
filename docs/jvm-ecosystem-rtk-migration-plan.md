# JVM Ecosystem RTK Migration Plan

Date: 2026-07-08

## Goal

Deepen `ctx` Java/JVM command-output coverage by porting the useful RTK JVM
handler behavior, tests, and fixtures into the existing TypeScript handler
stack, then implementing the common non-RTK JVM failure surfaces that Java
projects expose through Maven and Gradle.

This is not a new product surface. The work stays inside command proxy behavior:

- `src/handlers/java/maven.ts`
- `src/handlers/java/gradle.ts`
- `src/handlers/java/javac.ts`
- `src/handlers/java/staticAnalysis.ts` (new shared parser helpers for
  Checkstyle, PMD, SpotBugs, and JaCoCo output shapes)
- `tests/fixtures/java/*`
- `tests/unit/handlers/*`
- `tests/helpers/fixtureCases.ts`

Success means agent-visible JVM command output preserves P0 evidence while
removing high-volume Maven/Gradle/static-analysis noise.

## Scope Boundaries

In scope:

- Command-output filtering for Maven, Gradle, and direct `javac`.
- RTK-backed Maven and Gradle behavior where fixtures and tests can be ported
  directly.
- Java project output from Spring Boot, dependency resolution, Checkstyle, PMD,
  SpotBugs, and JaCoCo when it appears through Maven or Gradle.
- Fixtures that are either copied from RTK, captured from a small external Java
  sample project, or hand-written only when the output shape is documented and
  small enough to keep stable.

Out of scope:

- New language/runtime support outside Java command output.
- Broad compression for arbitrary Maven or Gradle plugin goals.
- Large vendored sample projects in this repository.
- Parser support that has no fixture proving the raw output shape.

Boundary rule: unknown Maven goals, unknown Gradle tasks, localized output that
misses expected English sentinels, and explicit verbose/debug invocations must
return stripped raw output instead of guessed summaries.

## Current Coverage

`ctx` currently has three JVM handlers:

| Handler | Current behavior | Gap |
|---|---|---|
| `maven` | Routes `mvn` / `mvn.cmd`; only build-like verbs are filtered; non-build verbs passthrough; keeps selected `[ERROR]`, `FAILURE`, `Tests run`, `Failed to execute goal`, and `Reactor Summary` lines. | No phase-specific parser; no Surefire/Failsafe block model; no quiet-mode path; weak multi-module and multi-failure coverage. |
| `gradle` | Routes `gradle`, `./gradlew`, `gradlew`, `gradlew.bat`; regex keep-list for failures, summaries, lint-ish lines, user frames, `Caused by:`. | No task routing; build/test/lint/connected/dependencies are mixed; no verbose bypass; no dependencies output compressor. |
| `javac` | Parses standard `file.java:line: error/warning` diagnostics and selected continuation lines. | Useful but narrow; should remain independent from Maven compiler output because Maven wraps `javac` diagnostics in `[ERROR]` lines. |

Existing test assets:

- `tests/fixtures/java/gradlew_*_raw.txt` are already ported from RTK.
- `tests/fixtures/java/gradle_build_*.txt`, `gradle_test_failed.txt`,
  `maven_test_failed.txt`, and `javac_errors.txt` cover product behavior.
- `tests/unit/handlers/rtkGradleBehavior.test.ts` covers only a small subset of
  RTK Gradle behavior.
- `tests/unit/handlers/rtkJavaDotnetBugfixBehavior.test.ts` locks several prior
  Java correctness fixes, especially Maven passthrough and Gradle omission
  declaration.

Older repo notes already called out the gap: Gradle had 56 RTK tests and 6 RTK
fixtures, while `ctx` had only a fixture-backed subset. RTK has since added a
dedicated Maven module, so Maven now needs the same treatment.

## Primary Sources Checked

Local source:

- RTK `src/cmds/jvm/README.md`
- RTK `src/cmds/jvm/gradlew_cmd.rs`
- RTK `src/cmds/jvm/mvn_cmd.rs`
- RTK `tests/fixtures/mvn_*`
- RTK `tests/fixtures/gradlew_*`
- `ctx` `src/handlers/java/{maven,gradle,javac}.ts`
- `ctx` Java fixtures and unit tests

Official docs:

- Apache Maven documents the main invocation shape as `mvn [options] [<goal(s)>] [<phase(s)>]` and lists the common default lifecycle phases `validate`, `compile`, `test`, `package`, `verify`, `install`, and `deploy`: <https://maven.apache.org/run.html>
- Apache Maven lifecycle docs distinguish the built-in `default`, `clean`, and `site` lifecycles: <https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html>
- Maven Surefire is the unit-test plugin; Maven Failsafe is the integration-test plugin, and their failure semantics differ around when the build fails: <https://maven.apache.org/surefire/maven-surefire-plugin/faq.html>
- The Maven Compiler Plugin uses `javac` by default for compile output: <https://maven.apache.org/plugins/maven-compiler-plugin/compile-mojo.html>
- Gradle CLI docs recommend the Gradle Wrapper (`./gradlew` / `gradlew.bat`) as the command-line entry point: <https://docs.gradle.org/current/userguide/command_line_interface.html>
- Gradle Java testing docs describe per-log-level test logging and stacktrace verbosity: <https://docs.gradle.org/current/userguide/java_testing.html>
- Gradle dependency docs define the built-in `dependencies` task as a rendered dependency tree for project configurations: <https://docs.gradle.org/current/userguide/viewing_debugging_dependencies.html>
- Gradle logging docs identify build logs as the primary diagnostic channel and warn that too much noise can obscure warnings and errors: <https://docs.gradle.org/current/userguide/logging.html>
- Maven Checkstyle `checkstyle:check` performs Checkstyle analysis, prints violations or a count to console, can fail the build, and binds to `verify`: <https://maven.apache.org/plugins/maven-checkstyle-plugin/check-mojo.html>
- Gradle's Checkstyle plugin performs quality checks on Java sources and generates reports: <https://docs.gradle.org/current/userguide/checkstyle_plugin.html>
- Maven PMD `pmd:check` fails the build on PMD violations and binds to `verify`: <https://maven.apache.org/plugins/maven-pmd-plugin/check-mojo.html>
- SpotBugs `spotbugs:check` binds to `verify` and invokes `spotbugs` first: <https://spotbugs.github.io/spotbugs-maven-plugin/check-mojo.html>
- Gradle's JaCoCo plugin provides coverage metrics and verification tasks for Java code: <https://docs.gradle.org/current/userguide/jacoco_plugin.html>

## Fixture Acquisition Plan

Fixture sources are ordered by trust and reproducibility:

1. RTK slice fixtures: copy the relevant `mvn_*` and `gradlew_*` raw fixtures
   into `tests/fixtures/java/` with `maven_` / `gradle_` names, preserving the
   original raw text before adding expected-output assertions.
2. Existing `ctx` fixtures: keep current Java fixtures as regression anchors and
   add missing expected assertions around them.
3. External Java sample capture: use a temporary clone under `/tmp`, run Maven
   and Gradle commands there, and save only command stdout/stderr snippets as
   fixtures. Do not commit the cloned project or generated build directories.
4. Minimal synthetic fixtures: allowed only for narrow plugin output shapes that
   are documented but hard to reproduce deterministically, such as a specific
   static-analysis violation line.

Candidate sample project:

- `https://github.com/spring-guides/gs-spring-boot.git`
- Verified on 2026-07-08 with a shallow clone under `/tmp`: the Java
  `initial/` and `complete/` subprojects contain `pom.xml`, `build.gradle`, and
  `gradlew`.
- Use only the Java `initial/` and `complete/` subprojects.

Suggested capture commands:

```bash
git clone --depth 1 https://github.com/spring-guides/gs-spring-boot.git /tmp/token-killer-java-sample-gs-spring-boot
cd /tmp/token-killer-java-sample-gs-spring-boot/complete
mvn test > /tmp/token-killer-maven-test-pass.raw.txt 2>&1
./gradlew test > /tmp/token-killer-gradle-test-pass.raw.txt 2>&1
```

For failure fixtures, prefer controlled one-line edits in the `/tmp` clone, then
capture the failing command output. The committed fixture should include a short
header comment in the matching test that states how it was produced, but the
fixture file itself should stay raw command output.

Fixture naming:

- RTK-derived: `maven_rtk_<case>_raw.txt`, `gradle_rtk_<case>_raw.txt`
- External sample: `maven_sample_<case>_raw.txt`,
  `gradle_sample_<case>_raw.txt`
- Synthetic: `java_<surface>_<case>_raw.txt`

## Migration Principles

1. Keep `ctx` retention-first behavior. RTK behavior is a source of fixtures and
   parser ideas, not an override of ADR 0001.
2. Route by command phase/task before filtering. Maven lifecycle phases and
   Gradle tasks have different output shapes.
3. Passthrough is correct for unknown/plugin output. `dependency:tree`,
   `help:*`, `site`, `--help`, `--version`, and unknown Maven goals must not be
   compressed. Known high-value JVM plugins are different: Checkstyle, PMD,
   SpotBugs, JaCoCo, Spring Boot failure output, and dependency-resolution
   failures are in scope and need dedicated retention tests plus parser support.
4. Verbose/debug requests bypass filtering. `mvn -X`, `mvn -e`, `gradle
   --stacktrace`, `--info`, and `--debug` mean the user asked for detail.
5. Prefer fixture-first migration. Each behavior should start with a real or
   RTK fixture, then implementation.
6. Keep Maven and `javac` separate. Maven compiler output is `[ERROR]`-wrapped
   lifecycle output; raw `javac` remains a direct compiler diagnostic handler.
7. RTK assets come first because they already provide source, tests, and
   fixtures. Non-RTK JVM surfaces are still implementation scope; they are not
   optional notes.

## RTK Assets To Port

### Maven

RTK now has `mvn_cmd.rs`; it is no longer just a TOML/line filter.

High-value behavior to port:

| RTK behavior | Why it matters for `ctx` |
|---|---|
| Phase detection: `test` / `integration-test` / `compile` / `test-compile` / `package` / `install` / `verify` / `deploy` / passthrough | Prevents build parser from eating plugin output and lets tests, compile, and package use different retention rules. |
| Verbose bypass: `-X`, `--debug`, `-e`, `--errors` | User explicitly requested full detail. |
| Quiet mode: `mvn -q` failure output | Quiet Maven suppresses `[INFO]` footers, so normal footer guards cannot fire. |
| English footer guard | If `BUILD SUCCESS` / `BUILD FAILURE` is absent, return raw to avoid locale/truncated-output misclassification. |
| Surefire/Failsafe block collapse | Passing test classes are high-volume noise; failing classes, exception messages, and user frames are signal. |
| Multi-failure class trail re-arm | Surefire 3.x can emit multiple failure/error blocks for one class; every failure message must survive. |
| Framework stack-frame stripping | Drop JUnit/Maven/JDK reflection frames while retaining user frames. |
| Failure summary cap | Large failure sets need a declared omission, not silent slice. |
| Reactor Summary preservation | Multi-module builds need module-level success/failure and `-rf :module` resume hint. |
| Compile warning dedupe | Repeated compiler warnings can dominate output, but file/line/message signal must remain. |

Fixtures to copy/adapt from RTK:

- `mvn_test_pass_slice_raw.txt`
- `mvn_test_fail_slice_raw.txt`
- `mvn_test_multifail_slice_raw.txt`
- `mvn_quiet_fail_raw.txt`
- `mvn_compile_error_slice_raw.txt`
- `mvn_test_compile_fail_slice_raw.txt`
- `mvn_install_slice_raw.txt`
- `mvn_reactor_pass_slice_raw.txt`
- `mvn_reactor_fail_slice_raw.txt`
- `mvn_locale_fr_raw.txt`
- `mvn_no_pom_raw.txt`
- `mvn_clean_raw.txt`

Do not port RTK's gzipped full fixtures as a first step unless needed for
token-savings gates. Start with slice fixtures; add synthetic large fixtures
only where compression invariants need real scale.

### Gradle

RTK `gradlew_cmd.rs` already maps closely to `ctx`'s Gradle scope, but `ctx`
has not ported most behavior.

High-value behavior to port:

| RTK behavior | Why it matters for `ctx` |
|---|---|
| Task detection: build/test/connected/lint/dependencies/other | Current regex keep-list treats all Gradle output as one family. |
| Wrapper preference | Existing `ctx` executes the user's command, but tests should cover `./gradlew`, `gradlew`, `gradlew.bat`, and `gradle`. |
| Verbose passthrough: `--stacktrace`, `--info`, `--debug`, `--full-stacktrace` | Requested diagnostic detail must not be compressed. |
| Build streaming keep-list | Keep `BUILD FAILED/SUCCESSFUL`, actionable tasks, warnings, errors, build scan URLs; strip task/progress/daemon noise. |
| Test filter | Keep failed test names, exception messages, user frames, summary/report lines; drop passed/skipped tests and framework frames. |
| Connected Android test filter | Preserve no-device failure and failed instrumented test signal; strip instrumentation noise. |
| Android lint handling | Java/Android linting is a large JVM ecosystem surface. |
| Dependencies compressor | Gradle `dependencies` output is a tree across configurations; keep top-level dependencies and configuration names. |

Fixtures already present locally:

- `gradlew_build_raw.txt`
- `gradlew_build_failed_raw.txt`
- `gradlew_test_raw.txt`
- `gradlew_test_failed_raw.txt`
- `gradlew_connected_raw.txt`
- `gradlew_lint_raw.txt`

Add missing behavior tests for all RTK task-detection cases before changing the
filter. That keeps command routing honest.

### Javac

No RTK JVM `javac` module exists. Keep this as `ctx`-owned behavior.

Next improvements should be small:

- Keep direct `javac` as standard diagnostic parser.
- Add fixtures for multi-file warning/error mixes.
- Do not route Maven compiler output through the raw `javac` parser.

## Java Ecosystem Coverage Map

Priority is based on agent value and output frequency.

| Surface | Current `ctx` | Target |
|---|---|---|
| Maven test / integration-test | Weak generic Maven filter | Port RTK Surefire/Failsafe block filter. |
| Maven compile / test-compile | Weak generic Maven filter | Port RTK compile filter with continuation and warning dedupe. |
| Maven package/install/verify/deploy | Weak generic Maven filter | Port RTK package mode toggle: compile + Surefire + reactor summary. |
| Maven plugin goals (`dependency:*`, `help:*`, `versions:*`) | Passthrough | Keep passthrough except for explicit in-scope plugin families below. |
| Gradle build/assemble/bundle/install | Generic Gradle filter | Port task-specific build filter and savings tests. |
| Gradle test/check | Generic Gradle filter | Port RTK test filter plus report-link retention. |
| Gradle connectedAndroidTest | Generic Gradle filter | Port no-device and instrumentation-noise handling. |
| Gradle lint / Android lint | Generic Gradle filter | Port Java/Android lint family filter. |
| Gradle dependencies | Generic Gradle filter | Add dependencies top-level summary. |
| Raw `javac` | Direct parser | Keep and add targeted diagnostics fixtures. |
| Maven / Gradle dependency resolution | Generic Maven/Gradle filter | Preserve unresolved artifact, requested version, configuration/scope, repository, and root cause. |
| Spring Boot startup / test context failure | Generic Maven/Gradle filter | Preserve `APPLICATION FAILED TO START`, `Failed to load ApplicationContext`, failed bean, exception chain, and first user frame. |
| Checkstyle | No dedicated parser | Implement Maven and Gradle output parsing; preserve file, line, column when present, rule/message, violation count, and report path. |
| PMD | No dedicated parser | Implement Maven and Gradle output parsing; preserve file, line, rule, priority/category when present, violation count, and report path. |
| SpotBugs | No dedicated parser | Implement Maven and Gradle output parsing; preserve bug type/category/rank, class/method, source line, count, and report path. |
| JaCoCo | No dedicated parser | Implement Maven and Gradle coverage-verification parsing; preserve counter, actual/missed ratio, threshold, class/package when present, and report path. |

## Non-RTK JVM Surfaces To Implement

These are not RTK parity work, but they are part of the JVM ecosystem coverage
goal.

| Surface | Commands that expose it | Fixture set | Parser target |
|---|---|---|---|
| Dependency resolution | `mvn test/package/verify`, `gradle build/test/check` | Maven `Could not resolve dependencies`; Gradle `Could not resolve all files for configuration` / `Could not find` / repository failures. | Maven/Gradle shared dependency-error extractor. |
| Spring Boot startup / test context | `mvn test`, `mvn spring-boot:run`, `gradle bootRun`, `gradle test` | `APPLICATION FAILED TO START`, `Failed to load ApplicationContext`, `BeanCreationException`, port conflict, datasource failure. | Exception-chain extractor shared by Maven and Gradle filters. |
| Checkstyle | `mvn checkstyle:check`, `mvn verify`, `gradle checkstyleMain`, `gradle check` | Maven plugin violation output; Gradle task failure with report path and violation lines. | Static-analysis parser preserving file/line/rule/message/count/report path. |
| PMD | `mvn pmd:check`, `mvn verify`, `gradle pmdMain`, `gradle check` | PMD violation output and XML/report path lines. | Static-analysis parser preserving file/line/rule/priority/message/count/report path. |
| SpotBugs | `mvn spotbugs:check`, `mvn verify`, `gradle spotbugsMain`, `gradle check` | Bug summary, class/method/source-line records, report path. | Static-analysis parser preserving bug type/category/rank/location/count/report path. |
| JaCoCo | `mvn jacoco:check`, `mvn verify`, `gradle jacocoTestCoverageVerification`, `gradle check` | Coverage rule violation output. | Coverage parser preserving counter, actual/missed value, threshold, class/package, report path. |

Implementation rule: add fixture and failing test first for every row above,
then implement a parser branch. Do not rely on the generic Maven/Gradle
keep-list as the final implementation for these surfaces.

## Implementation Plan

### Phase 0: Inventory And Test Matrix

Deliverables:

- Add a JVM migration matrix comment or test helper list mapping every RTK
  `mvn_cmd.rs` and `gradlew_cmd.rs` test to a `ctx` test name.
- Copy RTK Maven slice fixtures into `tests/fixtures/java/` with `maven_` names.
- Confirm existing Gradle RTK fixtures are wired to tests, not just present.
- Record fixture provenance in test names or test comments:
  `rtk`, `existing-ctx`, `external-sample`, or `synthetic`.
- Add a fixture manifest section in the test file or helper that lists raw
  fixture path, expected output path/inline expectation, handler, and source.

Verification:

- `pnpm test -- tests/unit/handlers/rtkGradleBehavior.test.ts`
- New Maven tests should fail before implementation.
- `pnpm test -- tests/unit/handlers/fixtureContent.test.ts`

### Phase 0.5: External Sample Smoke Capture

Condition:

- Run this phase only when network access is available and a temporary clone is
  acceptable. If not, keep RTK and existing fixtures as the implementation
  source of truth.

Implement:

- Shallow-clone `spring-guides/gs-spring-boot` into `/tmp`.
- Use only the Java `initial/` or `complete/` subproject.
- Capture at least one passing Maven test output and one passing Gradle test
  output.
- Optionally make a temporary source edit in `/tmp` to capture one failing
  Spring Boot test-context or compile fixture.
- Copy only the raw command output fixture into `tests/fixtures/java/`.

Tests:

- Add one fixture-backed smoke test per captured command family.
- Assert that the handler keeps lifecycle/task result and report path while
  removing high-volume framework/build noise.

Verification:

- The repo must not contain the cloned sample project.
- `git status --short` should show only fixture/test/source files intended for
  the JVM migration.

### Phase 1: Maven Phase Router

Implement:

- `detectMavenPhase(args)` with `test`, `integration-test`, `compile`,
  `test-compile`, `package`, `install`, `verify`, `deploy`, `passthrough`.
- `isMavenQuiet(args)` for `-q` / `--quiet`.
- Verbose bypass for `-X`, `--debug`, `-e`, `--errors`.
- Preserve current passthrough for plugin goals containing `:`.

Tests:

- Port RTK phase-detection tests.
- Add passthrough tests for `dependency:tree`, `help:describe`, `clean`, `site`,
  `--version`, `-v`, `-version`, empty args.

Verification:

- `pnpm test -- tests/unit/handlers/rtkJavaDotnetBugfixBehavior.test.ts`

### Phase 2: Maven Surefire/Failsafe Filter

Implement:

- ANSI stripping before parsing.
- English footer guard.
- Surefire/Failsafe block state machine.
- Framework frame deny-list.
- Multi-failure trail re-arm.
- Failure summary cap through `overBudgetLadder` or an explicit declared
  omission compatible with ADR 0001.

Tests:

- Passing test fixture drops passing class blocks and preserves aggregate.
- Failing fixture keeps `Failures`, exception type, and user frame.
- Multi-failure fixture keeps every failure/error message.
- Quiet failure fixture keeps residual failure signal.
- Locale/no-footer fixture returns stripped raw.

Verification:

- Add `minTokenSavingsRatio` only for fixtures large enough to make it
  meaningful.
- Do not use a max-output cap larger than the raw fixture.

### Phase 3: Maven Compile And Package Filters

Implement:

- Compile filter with `[ERROR]` continuation retention (`symbol`, `location`,
  caret, `required`, `found`, etc.).
- Warning dedupe by normalized message.
- Package/install/verify/deploy filter that combines compile and Surefire
  behavior.
- Reactor summary block preservation and resume hint retention.

Tests:

- `maven_compile_error_slice_raw.txt`
- `maven_test_compile_fail_slice_raw.txt`
- `maven_install_slice_raw.txt`
- `maven_reactor_pass_slice_raw.txt`
- `maven_reactor_fail_slice_raw.txt`

Verification:

- Critical assertions must include module name, `BUILD FAILURE/SUCCESS`,
  failed goal, user frame or compile coordinate, and resume hint where present.

### Phase 4: Gradle Task Router

Implement:

- `detectGradleTask(args)` with RTK-compatible behavior:
  `connected` wins over `test`; module-prefixed tasks work; `-Pflavor=test`
  does not trigger test; last non-clean task wins; unknown tasks passthrough.
- Verbose passthrough for `--stacktrace`, `--info`, `--debug`,
  `--full-stacktrace`.

Tests:

- Port RTK task detection cases into TS.
- Assert unknown `signingReport` passthrough.

Verification:

- Existing Gradle tests must keep passing before changing output filters.

### Phase 5: Gradle Output Families

Implement:

- Build filter: task/progress/daemon noise removal; keep errors, warnings,
  build status, actionable tasks, build scan URLs.
- Test filter: keep failed test names, exception, user frame, summary/report
  lines; strip passed/skipped/framework frames.
- Connected test filter: preserve no-device and failed test signal.
- Lint filter: Android lint, summary lines, bounded context.
- Dependencies filter: configuration names and top-level deps.

Tests:

- Wire all six RTK Gradle fixtures into tests.
- Add `dependencies` inline fixture if no RTK fixture exists.
- Add savings gates only on realistic fixtures.

### Phase 6: Dependency Resolution And Spring Boot Failures

Implement:

- Shared dependency-resolution extractor for Maven and Gradle output.
- Shared exception-chain extractor for Spring Boot and test-context failures.
- Maven integration in test/package/verify paths.
- Gradle integration in build/test/check paths.

Tests:

- Maven unresolved dependency keeps group/artifact/version, scope when present,
  repository URL/id, and `Could not resolve dependencies`.
- Gradle unresolved configuration keeps configuration name, dependency
  coordinate, repository/variant reason when present, and root cause.
- Spring Boot startup failure keeps `APPLICATION FAILED TO START`, failed bean
  or condition, exception message, and first user-code frame.
- Spring test context failure keeps `Failed to load ApplicationContext`, test
  class/method when present, exception chain, and user frame.

Verification:

- These outputs must not collapse to a generic `Maven failed` or `Gradle
  failed` line.

### Phase 7: Java Static Analysis And Coverage Plugins

Implement:

- `staticAnalysis.ts` parser helpers:
  - `parseCheckstyleOutput`
  - `parsePmdOutput`
  - `parseSpotbugsOutput`
  - `parseJacocoOutput`
- Maven integration for explicit plugin goals and `verify`.
- Gradle integration for `check`, `checkstyle*`, `pmd*`, `spotbugs*`, and
  `jacocoTestCoverageVerification` tasks.

Tests:

- Checkstyle fixture preserves file, line, column when present, rule/message,
  violation count, and report path.
- PMD fixture preserves file, line, rule, priority/category when present,
  violation count, and report path.
- SpotBugs fixture preserves bug type/category/rank, class/method, source line,
  bug count, and report path.
- JaCoCo fixture preserves counter, actual/missed value, threshold, class or
  package, and report path.
- Each parser has a no-match passthrough test so unknown plugin text is not
  fabricated.

Verification:

- `pnpm test -- tests/unit/handlers/rtkJavaDotnetBugfixBehavior.test.ts`
- New `tests/unit/handlers/javaStaticAnalysisBehavior.test.ts`
- `pnpm test -- tests/unit/handlers/fixtureContent.test.ts`

## Acceptance Criteria

For each migrated JVM output family:

- Boundary:
  - explicit in-scope command/task/plugin family
  - documented passthrough behavior for unknown or unsupported output
  - fixture source recorded
- P0 retention:
  - failed test class/method
  - exception message
  - first user-code stack frame
  - compile file/line/message
  - module name in multi-module builds
  - lifecycle/task result
  - actionable resume/report path when present
- Noise removal:
  - progress/task lines
  - passing test-class blocks
  - framework stack frames
  - Maven help boilerplate after the failed goal
  - Gradle daemon/configuration/progress noise
  - static-analysis report boilerplate that does not carry a finding
- Safety:
  - unknown phases/tasks passthrough
  - verbose/debug passthrough
  - no silent cap or slice
  - no locale-dependent false parse
  - no generic success/failure heading that hides a plugin-specific failure
- Tests:
  - RTK fixture parity tests for Maven and Gradle
  - non-RTK JVM fixtures for dependency resolution, Spring Boot, Checkstyle,
    PMD, SpotBugs, and JaCoCo
  - at least one real external Java sample fixture when network access permits
  - direct regression tests for prior Java bugfixes
  - fixture cases for product-level smoke coverage
  - targeted savings assertions only where raw fixture size makes savings real

## Non-Goals

- No declarative filter engine in this slice.
- No new proxy/gateway surface.
- No Rust or Go runtime dependency.
- No compression of arbitrary Maven/Gradle plugin goals. The in-scope non-RTK
  plugin families are listed above and must be implemented with fixtures and
  parser tests.

## Suggested First PR

Start with Maven, not Gradle:

1. Copy RTK Maven slice fixtures into `tests/fixtures/java/`.
2. Add failing tests for phase detection, passthrough, verbose bypass, and
   Surefire fail/pass fixture behavior.
3. Implement the Maven phase router and Surefire filter.
4. Run:

```bash
pnpm test -- tests/unit/handlers/rtkJavaDotnetBugfixBehavior.test.ts
pnpm test -- tests/unit/handlers/fixtureContent.test.ts
```

Then follow with Gradle task routing as a separate PR. After the RTK-backed
Maven and Gradle foundations are in place, implement the non-RTK JVM surfaces
as first-class parser work, not as documentation-only notes.
