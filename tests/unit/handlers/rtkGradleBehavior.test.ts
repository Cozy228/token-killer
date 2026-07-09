import { describe, expect, test } from "vitest";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { routeCommand } from "../../../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";
import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const options: TkOptions = {
  raw: false,
  stats: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: repoRoot,
};

function parsed(commandArgs: string[]): ParsedCommand {
  return {
    program: commandArgs[0] ?? "",
    args: commandArgs.slice(1),
    original: commandArgs,
    displayCommand: commandArgs.join(" "),
  };
}

function raw(commandArgs: string[], stdout: string, exitCode = 0, stderr = ""): RawResult {
  return {
    command: commandArgs.join(" "),
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
  };
}

async function filterDirect(commandArgs: string[], stdout: string, exitCode = 0, stderr = "") {
  const command = parsed(commandArgs);
  const handler = routeCommand(command);
  return handler.filter(raw(commandArgs, stdout, exitCode, stderr), command, options);
}

describe("RTK gradle behavior", () => {
  // RTK: rtk/src/cmds/jvm/gradlew_cmd.rs::test_build_success_strips_task_lines
  // (input ported to gradle_build_success.txt). RTK asserts >= 70% token savings
  // after stripping "> Task :" progress while preserving "BUILD SUCCESSFUL".
  test("build success strips task progress and hits RTK token savings", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "build"],
      "tests/fixtures/java/gradle_build_success.txt",
    );

    expect(result.output).toContain("BUILD SUCCESSFUL in 1m 23s");
    expect(result.output).toContain("42 actionable tasks: 42 executed");
    expect(result.output).not.toMatch(/> Task :/);

    expectRtkParity(result, {
      critical: ["BUILD SUCCESSFUL", "42 actionable tasks: 42 executed"],
      forbidden: [/> Task :/, /> Configure project/],
      // RTK gradlew_cmd.rs token-savings invariant: >= 70% (whitespace tokens).
      minTokenSavingsRatio: 0.7,
    });
  });

  // RTK: rtk/src/cmds/jvm/gradlew_cmd.rs::test_build_failure_preserves_errors_strips_try
  // (input ported to gradle_build_failure.txt). Errors + BUILD FAILED kept,
  // the "* Try:" help block stripped.
  test("build failure preserves errors and strips the Try help block", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "build"],
      "tests/fixtures/java/gradle_build_failure.txt",
      1,
    );

    expect(result.output).toContain("Unresolved reference: MyService");
    expect(result.output).toContain("BUILD FAILED in 12s");

    expectRtkParity(result, {
      critical: ["Unresolved reference: MyService", "BUILD FAILED in 12s"],
      forbidden: [/Run with --stacktrace/, /Get more help at/],
    });
  });

  // RTK: warnings are an anti-truncation retention path (WARN_LINE keep-list in
  // filter_build_line). Compression is low by design, so the cap only guards
  // against regression growth — it must stay below the raw fixture size.
  test("build keeps every compiler warning and strips task progress", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "build"],
      "tests/fixtures/java/gradle_build_warnings.txt",
    );

    expect(result.output).toContain("w: /src/Foo.kt: (42, 5)");
    expect(result.output).toContain("warning: [options]");
    expect(result.output).toContain("Warning: Gradle deprecation detected");
    expect(result.output).toContain("BUILD SUCCESSFUL");
    expect(result.output).not.toMatch(/> Task :app:compileDebugKotlin/);

    expectRtkParity(result, {
      critical: [
        "w: /src/Foo.kt: (42, 5)",
        "warning: [options]",
        "Warning: Gradle deprecation detected",
        "BUILD SUCCESSFUL",
      ],
      forbidden: [/> Task :app:compileDebugKotlin/],
      // raw fixture is 197 chars; cap must bite below it (retention, not growth).
      maxOutputChars: 185,
    });
  });

  test("RTK raw build fixture strips task, daemon, and configure noise", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "assembleDebug"],
      "tests/fixtures/java/gradlew_build_raw.txt",
    );

    expectRtkParity(result, {
      critical: ["BUILD SUCCESSFUL in 3s", "28 actionable tasks: 28 up-to-date"],
      forbidden: [/Starting a Gradle Daemon/, /> Configure project/, /> Task :app:preBuild/],
      minTokenSavingsRatio: 0.8,
    });
  });

  test("RTK raw build failure fixture keeps compiler errors and strips Gradle help", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "build"],
      "tests/fixtures/java/gradlew_build_failed_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: [
        ":app:compileDebugKotlin FAILED",
        "Unresolved reference: MyService",
        "Type mismatch: inferred type is String but Int was expected",
        "BUILD FAILED in 12s",
      ],
      forbidden: [/Run with --stacktrace/, /Get more help at/],
    });
  });

  test("RTK raw test success fixture keeps aggregate result and strips passed tests", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "testDebugUnitTest"],
      "tests/fixtures/java/gradlew_test_raw.txt",
    );

    expectRtkParity(result, {
      critical: ["6 tests completed, 0 failed", "BUILD SUCCESSFUL in 18s"],
      forbidden: [/ PASSED/, /> Task :app:testDebugUnitTest/],
      minTokenSavingsRatio: 0.55,
    });
  });

  test("RTK raw test failure fixture keeps failed test, exception, user frame, and report", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "testDebugUnitTest"],
      "tests/fixtures/java/gradlew_test_failed_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: [
        "CalculatorTest > testSubtraction FAILED",
        "java.lang.AssertionError: expected:<3> but was:<-1>",
        "CalculatorTest.kt:25",
        "MainViewModelTest > loadDataError FAILED",
        "MainViewModelTest.kt:45",
        "file:///Users/user/MyApp/app/build/reports/tests/testDebugUnitTest/index.html",
        "BUILD FAILED in 22s",
      ],
      forbidden: [/ PASSED/, /org\.junit\.Assert\.fail/],
    });
  });

  test("check task keeps test failure evidence as well as build status", async () => {
    const result = await filterRtkOutput(
      ["./gradlew", "check"],
      [
        "> Task :app:test FAILED",
        "OrderServiceTest > preventsDuplicate FAILED",
        "    java.lang.AssertionError: duplicate order should be blocked",
        "    at com.example.OrderServiceTest.preventsDuplicate(OrderServiceTest.java:82)",
        "There were failing tests. See the report at: file:///tmp/app/build/reports/tests/test/index.html",
        "BUILD FAILED in 8s",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "OrderServiceTest > preventsDuplicate FAILED",
        "java.lang.AssertionError: duplicate order should be blocked",
        "OrderServiceTest.java:82",
        "file:///tmp/app/build/reports/tests/test/index.html",
        "BUILD FAILED in 8s",
      ],
    });
  });

  test("RTK connected fixture keeps instrumentation summary and strips status spam", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "connectedDebugAndroidTest"],
      "tests/fixtures/java/gradlew_connected_raw.txt",
    );

    expectRtkParity(result, {
      critical: ["Tests run: 2,  Failures: 0", "BUILD SUCCESSFUL in 45s"],
      forbidden: [/INSTRUMENTATION_STATUS/, / PASSED/],
      minTokenSavingsRatio: 0.7,
    });
  });

  test("RTK lint fixture keeps findings, report paths, and build status", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "lintDebug"],
      "tests/fixtures/java/gradlew_lint_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Ran lint on variant debug: 3 issues found",
        "StringFormatInvalid",
        "HardcodedText",
        "ContentDescription",
        "file:///Users/user/MyApp/app/build/reports/lint-results-debug.html",
        "BUILD FAILED in 8s",
      ],
      forbidden: [/Starting a Gradle Daemon/, /> Configure project/],
    });
  });

  test("dependencies task keeps configurations and top-level dependencies", async () => {
    const result = await filterRtkOutput(
      ["./gradlew", "dependencies"],
      [
        "> Task :app:dependencies",
        "",
        "runtimeClasspath - Runtime classpath of source set 'main'.",
        "+--- org.springframework.boot:spring-boot-starter-web:3.2.0",
        "|    +--- org.springframework.boot:spring-boot-starter-json:3.2.0",
        "\\--- com.fasterxml.jackson.core:jackson-databind:2.16.0",
        "",
        "testRuntimeClasspath - Runtime classpath of source set 'test'.",
        "+--- org.junit.jupiter:junit-jupiter:5.10.0",
        "|    \\--- org.junit.jupiter:junit-jupiter-api:5.10.0",
        "",
        "BUILD SUCCESSFUL in 1s",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: [
        "runtimeClasspath - Runtime classpath of source set 'main'.",
        "org.springframework.boot:spring-boot-starter-web:3.2.0",
        "com.fasterxml.jackson.core:jackson-databind:2.16.0",
        "testRuntimeClasspath - Runtime classpath of source set 'test'.",
        "org.junit.jupiter:junit-jupiter:5.10.0",
        "BUILD SUCCESSFUL in 1s",
      ],
      forbidden: [/spring-boot-starter-json/, /junit-jupiter-api/],
    });
  });

  test("verbose Gradle flags bypass filtering", async () => {
    const stdout = [
      "> Task :app:test FAILED",
      "full stacktrace requested",
      "org.junit.Assert.fail(Assert.java:89)",
      "BUILD FAILED in 2s",
    ].join("\n");

    const result = await filterDirect(["./gradlew", "test", "--stacktrace"], stdout, 1);

    expect(result.output.trim()).toBe(stdout);
  });

  test("unknown Gradle tasks pass through raw output", async () => {
    const stdout = [
      "> Task :app:signingReport",
      "Variant: debug",
      "SHA1: 00:11:22:33",
      "BUILD SUCCESSFUL in 1s",
    ].join("\n");

    const result = await filterDirect(["./gradlew", "signingReport"], stdout, 0);

    expect(result.output.trim()).toBe(stdout);
  });
});
