import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

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
});
