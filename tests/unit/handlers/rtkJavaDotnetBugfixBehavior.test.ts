/**
 * Regression tests for adversarial-audit-2026-06-10 findings:
 *   C2-maven  — successful builds must not be labeled "Maven failed"; non-build verbs
 *               (dependency:tree, help:*) must pass through; 80-line cap must be a
 *               declared over-budget ladder, not a silent slice.
 *   M13-dotnet — only `dotnet test` routes to the test parser; other verbs passthrough.
 *   M15-javac  — warning: diagnostics survive; required:/found: detail lines survive;
 *               no `submitOrder` literal in product code.
 *   M16-gradle — `Caused by:` exception chains survive; 80-line cap is a declared ladder.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { routeCommand } from "../../../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";
import { filterRtkFixture, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const options: TkOptions = {
  raw: false,
  stats: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: repoRoot,
};

// Call a handler's filter() directly, bypassing the assertNotUnfilteredPassthrough
// guard in filterRtkOutput. Use this for:
//   (a) cases where the correct behavior IS passthrough (non-build verbs, etc.); and
//   (b) cases where the formatted output for small synthetic fixtures may be
//       marginally larger than raw, causing makeFilteredResult to revert to raw —
//       the compression behavior is still verified correctly.
async function filterDirect(commandArgs: string[], stdout: string, exitCode = 0, stderr = "") {
  const command: ParsedCommand = {
    program: commandArgs[0] ?? "",
    args: commandArgs.slice(1),
    original: commandArgs,
    displayCommand: commandArgs.join(" "),
  };
  const raw: RawResult = {
    command: commandArgs.join(" "),
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
  };
  const handler = routeCommand(command);
  return handler.filter(raw, command, options);
}

// ---------------------------------------------------------------------------
// C2-maven
// ---------------------------------------------------------------------------
describe("C2-maven regression", () => {
  test("BUILD SUCCESS output is NOT labeled Maven failed", async () => {
    // Use filterDirect to inspect the handler's own output before makeFilteredResult
    // might revert to raw (small inputs can inflate slightly when a header is added).
    const result = await filterDirect(
      ["mvn", "install"],
      [
        "[INFO] Reactor Build Order:",
        "[INFO]   my-service",
        "[INFO] BUILD SUCCESS",
        "[INFO] Total time: 3.2 s",
        "[INFO] Finished at: 2024-01-01T12:00:00Z",
      ].join("\n"),
      0,
    );

    expect(result.output).not.toContain("Maven failed");
  });

  test("non-build verb (dependency:tree) passes through raw output", async () => {
    // Passthrough IS the correct behavior for non-build verbs.
    const stdout = [
      "[INFO] --- maven-dependency-plugin:3.1.2:tree ---",
      "[INFO] com.example:my-app:jar:1.0-SNAPSHOT",
      "[INFO] +- org.springframework.boot:spring-boot-starter:jar:2.6.3",
    ].join("\n");

    const result = await filterDirect(["mvn", "dependency:tree"], stdout, 0);

    expect(result.output).toContain("maven-dependency-plugin");
    expect(result.output).toContain("spring-boot-starter");
    expect(result.output).not.toContain("Maven failed");
  });

  test("help: verb passes through raw output", async () => {
    const stdout = ["[INFO] -------", "[INFO] Available goals:", "[INFO]   help:describe"].join(
      "\n",
    );

    const result = await filterDirect(["mvn", "help:describe"], stdout, 0);
    expect(result.output).toContain("Available goals");
    expect(result.output).not.toContain("Maven failed");
  });

  test("build failure output retains Maven failed heading", async () => {
    // filterDirect to inspect the handler's own output before makeFilteredResult.
    const result = await filterDirect(
      ["mvn", "test"],
      [
        "[INFO] order-service ..................................... FAILURE",
        "[ERROR] Tests run: 10, Failures: 2, Errors: 0, Skipped: 0",
        "[INFO] BUILD FAILURE",
        "[INFO] Total time: 5.1 s",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("Maven failed");
  });

  // Use the real RTK fixture (large enough that compression saves tokens) to ensure
  // the Maven failed heading reaches the agent rather than reverting to raw.
  test("maven test-failed fixture: Maven failed heading and error lines survive", async () => {
    const result = await filterRtkFixture(
      ["mvn", "test"],
      "tests/fixtures/java/maven_test_failed.txt",
      1,
    );

    // The fixture has FAILURE lines — heading must say "Maven failed".
    expect(result.output).toContain("Maven failed");
    expect(result.output).toContain("preventsDuplicateSubmit");
  });
});

// ---------------------------------------------------------------------------
// M13-dotnet
// ---------------------------------------------------------------------------
describe("M13-dotnet regression", () => {
  test("dotnet run output is NOT mangled by the test parser", async () => {
    // The string "Failed to connect" would be mis-parsed by the test parser as
    // a test named "to" (the word after "Failed ").
    const stdout = [
      "Failed to connect to database",
      "System.Net.Sockets.SocketException: Connection refused",
    ].join("\n");

    const result = await filterDirect(["dotnet", "run"], stdout, 1);

    expect(result.output).not.toContain("Failed Tests:");
    expect(result.output).toContain("Failed to connect to database");
  });

  test("dotnet build output is passed through without test-parser mangling", async () => {
    const stdout = [
      "Microsoft (R) Build Engine version 17.0.0",
      "Build succeeded.",
      "    0 Warning(s)",
      "    0 Error(s)",
    ].join("\n");

    const result = await filterDirect(["dotnet", "build"], stdout, 0);

    expect(result.output).not.toContain("Failed Tests:");
    expect(result.output).toContain("Build succeeded");
  });

  test("dotnet test still routes through the test parser", async () => {
    const result = await filterRtkOutput(
      ["dotnet", "test"],
      [
        "Determining projects to restore...",
        "Failed OrderTests.SomeTest [12 ms]",
        "Error Message: Expected true but was false",
        "Failed!  - Failed: 1, Passed: 4",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("Failed Tests:");
    expect(result.output).toContain("SomeTest");
  });
});

// ---------------------------------------------------------------------------
// M15-javac
// ---------------------------------------------------------------------------
describe("M15-javac regression", () => {
  test("warning: diagnostics survive compression", async () => {
    // filterDirect: the warning-only javac output is reformatted (header changes),
    // so the output differs from raw regardless of size inflation check.
    const result = await filterDirect(
      ["javac", "src/Foo.java"],
      [
        "src/Foo.java:10: warning: [deprecation] getBytes() in String has been deprecated",
        "        String s = str.getBytes();",
        "                       ^",
        "1 warning",
      ].join("\n"),
      0,
    );

    expect(result.output).toContain("warning");
    expect(result.output).toContain("src/Foo.java:10");
    expect(result.output).toContain("getBytes");
  });

  test("required:/found: type-mismatch detail lines survive compression", async () => {
    const result = await filterDirect(
      ["javac", "src/Bar.java"],
      [
        "src/Bar.java:25: error: incompatible types: String cannot be converted to int",
        "        int x = getName();",
        "                       ^",
        "  required: int",
        "  found:    String",
        "1 error",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("required:");
    expect(result.output).toContain("found:");
    expect(result.output).toContain("incompatible types");
  });

  test("submitOrder is not hardcoded as a filter rule in product code", async () => {
    // submitOrder was a fixture string hardcoded in the detail filter regex. If still
    // present, a symbol line NOT named submitOrder would be silently dropped.
    const result = await filterDirect(
      ["javac", "src/Baz.java"],
      [
        "src/Baz.java:5: error: cannot find symbol",
        "  symbol:   method doSomething(int)",
        "  location: class Baz",
        "src/Baz.java:12: error: incompatible types",
        "  required: int",
        "  found:    String",
        "2 errors",
      ].join("\n"),
      1,
    );

    expect(result.output).not.toContain("submitOrder");
    expect(result.output).toContain("symbol:");
    expect(result.output).toContain("location:");
    expect(result.output).toContain("required:");
    expect(result.output).toContain("found:");
  });
});

// ---------------------------------------------------------------------------
// M16-gradle
// ---------------------------------------------------------------------------
describe("M16-gradle regression", () => {
  test("Caused by: exception chain lines survive compression", async () => {
    const result = await filterRtkOutput(
      ["./gradlew", "test"],
      [
        "> Task :app:test FAILED",
        "OrderServiceTest > preventsDuplicate FAILED",
        "    java.lang.RuntimeException: outer message",
        "    Caused by: java.sql.SQLException: connection refused",
        "    Caused by: java.net.ConnectException: port 5432",
        "BUILD FAILED in 8s",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("Caused by:");
    expect(result.output).toContain("BUILD FAILED");
  });

  test("over-budget ladder declares omission rather than silently slicing", async () => {
    // Build a synthetic gradle output large enough to exceed the 2000-token budget.
    const failLines = Array.from({ length: 200 }, (_, i) => `> Task :module${i}:test FAILED`);
    const text = [
      ...failLines,
      "Caused by: java.lang.RuntimeException: root cause",
      "BUILD FAILED in 30s",
    ].join("\n");

    const result = await filterRtkOutput(["./gradlew", "build"], text, 1);

    expect(result.output).toContain("Gradle failed");
    // Either Caused by: fits in the budget output, OR an omission is declared.
    // Before the fix, .slice(0,80) was silent; now budget machinery is used.
    const hasCausedBy = result.output.includes("Caused by:");
    const hasOmission = result.omission !== undefined;
    expect(hasCausedBy || hasOmission).toBe(true);
  });
});
