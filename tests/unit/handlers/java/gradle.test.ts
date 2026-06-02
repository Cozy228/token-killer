import { describe, expect, test } from "vitest";

import { gradleHandler } from "../../../../src/handlers/java/gradle.js";
import type { RawResult, TgOptions } from "../../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

describe("gradle handler", () => {
  test("preserves failed task and test assertion", async () => {
    const raw: RawResult = {
      command: "./gradlew test",
      stdout: [
        ...Array.from(
          { length: 360 },
          (_, index) => `> Task :compileNoise${index} UP-TO-DATE`,
        ),
        "> Task :order-service:test FAILED",
        "OrderServiceTest > preventsDuplicateSubmit FAILED",
        "    org.opentest4j.AssertionFailedError: expected: <1> but was: <2>",
        "        at com.company.OrderServiceTest.preventsDuplicateSubmit(OrderServiceTest.java:82)",
        "BUILD FAILED in 12s",
        "120 tests completed, 1 failed",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await gradleHandler.filter(
      raw,
      {
        program: "./gradlew",
        args: ["test"],
        original: ["./gradlew", "test"],
        displayCommand: "./gradlew test",
      },
      options,
    );

    expect(result.handler).toBe("gradle");
    expect(result.output).toContain(":order-service:test FAILED");
    expect(result.output).toContain(
      "OrderServiceTest > preventsDuplicateSubmit FAILED",
    );
    expect(result.output).toContain("expected: <1> but was: <2>");
    expect(result.output).toContain("OrderServiceTest.java:82");
    expect(result.output).not.toContain("compileNoise359");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("gradle format variants", () => {
  test("preserves task failure info", async () => {
    const raw: RawResult = {
      command: "./gradlew test",
      stdout: [
        "> Task :order-service:test FAILED",
        "OrderServiceTest > shouldRejectDuplicate FAILED",
        "    org.opentest4j.AssertionFailedError: expected: <1> but was: <2>",
        "        at com.company.OrderServiceTest.shouldRejectDuplicate(OrderServiceTest.java:42)",
        "BUILD FAILED in 8s",
        "10 tests completed, 1 failed",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await gradleHandler.filter(
      raw,
      {
        program: "./gradlew",
        args: ["test"],
        original: ["./gradlew", "test"],
        displayCommand: "./gradlew test",
      },
      options,
    );

    expect(result.handler).toBe("gradle");
    expect(result.output).toContain("FAILED");
    expect(result.output).toContain(
      "OrderServiceTest > shouldRejectDuplicate FAILED",
    );
    expect(result.output).toContain("AssertionFailedError");
    expect(result.output).toContain("BUILD FAILED");
  });

  test("handles build success", async () => {
    const raw: RawResult = {
      command: "./gradlew test",
      stdout: [
        "> Task :order-service:test UP-TO-DATE",
        "BUILD SUCCESSFUL in 5s",
        "10 tests completed, 0 failed",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gradleHandler.filter(
      raw,
      {
        program: "./gradlew",
        args: ["test"],
        original: ["./gradlew", "test"],
        displayCommand: "./gradlew test",
      },
      options,
    );

    expect(result.handler).toBe("gradle");
    expect(typeof result.output).toBe("string");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "./gradlew test",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await gradleHandler.filter(
      raw,
      {
        program: "./gradlew",
        args: ["test"],
        original: ["./gradlew", "test"],
        displayCommand: "./gradlew test",
      },
      options,
    );

    expect(result.handler).toBe("gradle");
    expect(typeof result.output).toBe("string");
  });
});

describe("gradle handler correctness gaps", () => {
  async function filterGradle(stdout: string, args = ["test"], exitCode = 1) {
    return gradleHandler.filter(
      {
        command: `./gradlew ${args.join(" ")}`,
        stdout,
        stderr: "",
        exitCode,
        durationMs: 1,
      },
      {
        program: "./gradlew",
        args,
        original: ["./gradlew", ...args],
        displayCommand: `./gradlew ${args.join(" ")}`,
      },
      options,
    );
  }

  test("strips build task noise while preserving build success", async () => {
    const result = await filterGradle(
      [
        "> Configure project :app",
        "> Task :app:preBuild UP-TO-DATE",
        "> Task :app:generateDebugResources UP-TO-DATE",
        "> Task :app:assembleDebug UP-TO-DATE",
        "",
        "BUILD SUCCESSFUL in 1m 23s",
        "42 actionable tasks: 42 executed",
      ].join("\n"),
      ["assembleDebug"],
      0,
    );

    expect(result.output).toContain("BUILD SUCCESSFUL");
    expect(result.output).toContain("42 actionable tasks");
    expect(result.output).not.toContain("> Task :app:preBuild");
    expect(result.output).not.toContain("> Configure project");
  });

  test("preserves build failure error and strips try section", async () => {
    const result = await filterGradle(
      [
        "> Task :app:compileDebugKotlin FAILED",
        "",
        "FAILURE: Build failed with an exception.",
        "",
        "* What went wrong:",
        "e: /src/app/MainActivity.kt: (42, 5): Unresolved reference: MyService",
        "",
        "* Try:",
        "> Run with --stacktrace option to get the stack trace.",
        "> Get more help at https://help.gradle.org",
        "",
        "BUILD FAILED in 12s",
      ].join("\n"),
      ["assembleDebug"],
      1,
    );

    expect(result.output).toContain("Unresolved reference: MyService");
    expect(result.output).toContain("BUILD FAILED");
    expect(result.output).not.toContain("Run with --stacktrace");
    expect(result.output).not.toContain("Get more help");
  });

  test("strips passed unit tests and framework frames while preserving failed user frame", async () => {
    const result = await filterGradle(
      [
        "> Task :app:testDebugUnitTest",
        "com.example.FooTest > test1 PASSED",
        "com.example.FooTest > test2 PASSED",
        "com.example.FooTest > testBar FAILED",
        "    java.lang.AssertionError: expected:<3> but was:<-1>",
        "        at org.junit.Assert.fail(Assert.java:89)",
        "        at org.junit.Assert.assertEquals(Assert.java:197)",
        "        at com.example.FooTest.testBar(FooTest.kt:25)",
        "10 tests completed, 1 failed",
      ].join("\n"),
      ["testDebugUnitTest"],
      1,
    );

    expect(result.output).toContain("testBar FAILED");
    expect(result.output).toContain("AssertionError");
    expect(result.output).toContain("FooTest.testBar");
    expect(result.output).toContain("10 tests completed, 1 failed");
    expect(result.output).not.toContain("PASSED");
    expect(result.output).not.toContain("org.junit.Assert");
  });

  test("preserves failing test report path", async () => {
    const result = await filterGradle(
      [
        "There were failing tests. See the report at: file:///app/build/reports/tests/testDebugUnitTest/index.html",
        "BUILD FAILED in 20s",
      ].join("\n"),
      ["testDebugUnitTest"],
      1,
    );

    expect(result.output).toContain("See the report at");
    expect(result.output).toContain("file:///app/build/reports/tests/testDebugUnitTest/index.html");
    expect(result.output).toContain("BUILD FAILED");
  });

  test("strips connected-test instrumentation noise while preserving device failure", async () => {
    const result = await filterGradle(
      [
        "Starting 3 tests on Pixel_6_API_33(AVD) - 13",
        "INSTRUMENTATION_STATUS: numtests=3",
        "INSTRUMENTATION_STATUS_CODE: 1",
        "com.example.MainActivityTest > exampleTest[Pixel_6_API_33] FAILED",
        "    AssertionError: expected true",
        "INSTRUMENTATION_STATUS_CODE: -2",
        "Tests run: 3, Failures: 1, Errors: 0, Skipped: 0",
      ].join("\n"),
      ["connectedDebugAndroidTest"],
      1,
    );

    expect(result.output).toContain("exampleTest[Pixel_6_API_33] FAILED");
    expect(result.output).toContain("AssertionError");
    expect(result.output).toContain("Tests run: 3, Failures: 1");
    expect(result.output).not.toContain("INSTRUMENTATION_STATUS");
    expect(result.output).not.toContain("Starting 3 tests");
  });

  test("preserves Android lint violations, code context, and summary", async () => {
    const result = await filterGradle(
      [
        "Wrote HTML report to file:/path/app/build/reports/lint-results-debug.html",
        "src/main/java/com/example/MainActivity.kt:45: Error: Format string invalid [StringFormatInvalid]",
        "  String.format(getString(R.string.no_args), arg)",
        "  ^",
        "src/main/res/layout/activity_main.xml:15: Warning: Missing contentDescription attribute on image [ContentDescription]",
        "    <ImageView",
        "0 errors, 4 warnings",
        "BUILD FAILED in 8s",
      ].join("\n"),
      ["lintDebug"],
      1,
    );

    expect(result.output).toContain("StringFormatInvalid");
    expect(result.output).toContain("String.format(getString(R.string.no_args), arg)");
    expect(result.output).toContain("ContentDescription");
    expect(result.output).toContain("<ImageView");
    expect(result.output).toContain("0 errors, 4 warnings");
    expect(result.output).not.toContain("Wrote HTML report");
  });

  test("preserves compiler warnings on successful builds", async () => {
    const result = await filterGradle(
      [
        "> Task :app:compileDebugKotlin",
        "w: /src/Foo.kt: (42, 5): Parameter 'unused' is never used",
        "warning: [options] bootstrap class path not set",
        "Warning: Gradle deprecation detected",
        "",
        "BUILD SUCCESSFUL in 4s",
      ].join("\n"),
      ["assembleDebug"],
      0,
    );

    expect(result.output).toContain("w: /src/Foo.kt");
    expect(result.output).toContain("warning: [options]");
    expect(result.output).toContain("Warning: Gradle");
    expect(result.output).toContain("BUILD SUCCESSFUL");
    expect(result.output).not.toContain("> Task :app:compileDebugKotlin");
  });
});
