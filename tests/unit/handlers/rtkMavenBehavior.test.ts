import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { routeCommand } from "../../../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";
import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const options: TkOptions = {
  raw: false,
  stats: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: repoRoot,
};

const MAVEN_MIGRATION_MATRIX = [
  {
    rtkSource: "mvn_cmd.rs::test_surefire_pass_slice",
    testName: "surefire pass keeps aggregate result and strips passing class noise",
    fixture: "tests/fixtures/java/maven_surefire_pass_raw.txt",
    provenance: "synthetic-from-plan",
  },
  {
    rtkSource: "mvn_cmd.rs::test_surefire_fail_slice",
    testName: "surefire failure keeps failure, message, user frame, report path",
    fixture: "tests/fixtures/java/maven_surefire_fail_raw.txt",
    provenance: "synthetic-from-plan",
  },
  {
    rtkSource: "mvn_cmd.rs::test_surefire_multifail_slice",
    testName: "surefire multi-failure keeps every failure/error trail",
    fixture: "tests/fixtures/java/maven_surefire_multifail_raw.txt",
    provenance: "synthetic-from-plan",
  },
  {
    rtkSource: "mvn_cmd.rs::test_quiet_failure",
    testName: "quiet failure parses without an English footer",
    fixture: "tests/fixtures/java/maven_quiet_fail_raw.txt",
    provenance: "synthetic-from-plan",
  },
  {
    rtkSource: "mvn_cmd.rs::test_compile_error_slice",
    testName: "compile failure keeps coordinates and javac detail lines",
    fixture: "tests/fixtures/java/maven_compile_error_raw.txt",
    provenance: "synthetic-from-plan",
  },
] as const;

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

describe("RTK Maven behavior", () => {
  test("records the fixture migration matrix used by this slice", () => {
    expect(MAVEN_MIGRATION_MATRIX).toHaveLength(5);
    for (const entry of MAVEN_MIGRATION_MATRIX) {
      expect(entry.rtkSource).toMatch(/^mvn_cmd\.rs::/);
      expect(entry.fixture).toMatch(/^tests\/fixtures\/java\/maven_/);
      expect(entry.provenance).toBe("synthetic-from-plan");
    }
  });

  test("surefire pass keeps aggregate result and strips passing class noise", async () => {
    const result = await filterRtkFixture(
      ["mvn", "test"],
      "tests/fixtures/java/maven_surefire_pass_raw.txt",
    );

    expectRtkParity(result, {
      critical: ["Maven", "Tests run: 5, Failures: 0, Errors: 0, Skipped: 0", "BUILD SUCCESS"],
      forbidden: [/Running com\.example/, /maven-surefire-plugin/],
      minTokenSavingsRatio: 0.55,
    });
  });

  test("surefire failure keeps failure, message, user frame, report path", async () => {
    const result = await filterRtkFixture(
      ["mvn", "test"],
      "tests/fixtures/java/maven_surefire_fail_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Maven failed",
        "OrderServiceTest.preventsDuplicateSubmit",
        "expected:<1> but was:<2>",
        "OrderServiceTest.java:82",
        "/tmp/order-service/target/surefire-reports",
        "BUILD FAILURE",
      ],
      forbidden: [/org\.junit\.jupiter/, /org\.apache\.maven\.surefire/],
      minTokenSavingsRatio: 0.35,
    });
  });

  test("module selector value does not force plugin-goal passthrough", async () => {
    const result = await filterRtkFixture(
      ["mvn", "-pl", ":order-service", "test"],
      "tests/fixtures/java/maven_surefire_fail_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: ["Maven failed", "OrderServiceTest.preventsDuplicateSubmit", "BUILD FAILURE"],
      forbidden: [/maven-surefire-plugin:3\.2\.5:test \(default-test\)/],
    });
  });

  test("surefire multi-failure keeps every failure/error trail", async () => {
    const result = await filterRtkFixture(
      ["mvn", "test"],
      "tests/fixtures/java/maven_surefire_multifail_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: [
        "duplicate order should be blocked",
        "empty cart should be rejected",
        "catalog seed missing",
        "OrderService.java:44",
        "Tests run: 3, Failures: 2, Errors: 1, Skipped: 0",
      ],
      forbidden: [/org\.junit\.jupiter/, /jdk\.internal\.reflect/],
    });
  });

  test("quiet failure parses without an English footer", async () => {
    const result = await filterRtkFixture(
      ["mvn", "-q", "test"],
      "tests/fixtures/java/maven_quiet_fail_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Maven failed",
        "QuietOrderServiceTest.preventsDuplicateSubmit",
        "duplicate order should be blocked",
        "QuietOrderServiceTest.java:27",
      ],
      forbidden: [/org\.junit\.jupiter/],
    });
  });

  test("quiet success without an English footer stays raw instead of being labeled failed", async () => {
    const stdout = "Tests run: 5, Failures: 0, Errors: 0, Skipped: 0\n";
    const result = await filterDirect(["mvn", "-q", "test"], stdout, 0);

    expect(result.output.trim()).toBe(stdout.trim());
    expect(result.output).not.toContain("Maven failed");
  });

  test("failsafe failure keeps report path for integration-test recovery", async () => {
    const stdout = [
      "[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.1 s <<< FAILURE! -- in com.example.OrderIT",
      "[ERROR] com.example.OrderIT.preventsDuplicate -- Time elapsed: 0.01 s <<< FAILURE!",
      "[ERROR] java.lang.AssertionError: duplicate order should be blocked",
      "[ERROR]     at com.example.OrderIT.preventsDuplicate(OrderIT.java:82)",
      "[ERROR] There are test failures.",
      "[ERROR] Please refer to /tmp/order-service/target/failsafe-reports for the individual test results.",
      "[ERROR] Failed to execute goal org.apache.maven.plugins:maven-failsafe-plugin:3.2.5:verify (default) on project order-service: There are test failures.",
      "[INFO] BUILD FAILURE",
    ].join("\n");

    const result = await filterDirect(["mvn", "verify"], stdout, 1);

    expect(result.output).toContain("Maven failed");
    expect(result.output).toContain("OrderIT.preventsDuplicate");
    expect(result.output).toContain("OrderIT.java:82");
    expect(result.output).toContain("/tmp/order-service/target/failsafe-reports");
  });

  test("reactor failure keeps resume command for human recovery", async () => {
    const stdout = [
      "[INFO] Reactor Summary:",
      "[INFO] root ........................................ SUCCESS [  0.1 s]",
      "[INFO] order-service ............................... FAILURE [  0.2 s]",
      "[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.2.5:test (default-test) on project order-service: There are test failures.",
      "[ERROR] After correcting the problems, you can resume the build with the command",
      "[ERROR]   mvn <args> -rf :order-service",
      "[INFO] BUILD FAILURE",
    ].join("\n");

    const result = await filterDirect(["mvn", "install"], stdout, 1);

    expect(result.output).toContain("Reactor Summary");
    expect(result.output).toContain("order-service ............................... FAILURE");
    expect(result.output).toContain("After correcting the problems");
    expect(result.output).toContain("mvn <args> -rf :order-service");
  });

  test("compile failure keeps coordinates and javac detail lines", async () => {
    const result = await filterRtkFixture(
      ["mvn", "compile"],
      "tests/fixtures/java/maven_compile_error_raw.txt",
      1,
    );

    expectRtkParity(result, {
      critical: [
        "OrderService.java:[42,18] cannot find symbol",
        "symbol:",
        "location:",
        "OrderController.java:[88,24] incompatible types",
        "required:",
        "found:",
        "BUILD FAILURE",
      ],
      forbidden: [/Scanning for projects/, /Compiling 12 source files/],
    });
  });

  test("verbose flags bypass Maven filtering", async () => {
    const stdout = [
      "[DEBUG] Full Maven execution request",
      "[INFO] --- maven-surefire-plugin:3.2.5:test ---",
      "[INFO] BUILD FAILURE",
    ].join("\n");

    const result = await filterDirect(["mvn", "-X", "test"], stdout, 1);

    expect(result.output.trim()).toBe(stdout);
  });

  test("localized or footer-less non-quiet output returns stripped raw output", async () => {
    const stdout = await readFile(
      path.join(repoRoot, "tests/fixtures/java/maven_locale_fr_raw.txt"),
      "utf8",
    );

    const result = await filterDirect(["mvn", "test"], stdout, 1);

    expect(result.output.trim()).toBe(stdout.trim());
  });

  test.each([
    ["dependency:tree"],
    ["help:describe"],
    ["clean"],
    ["site"],
    ["--version"],
    ["-v"],
    ["-version"],
  ])("%s passes through raw output", async (arg) => {
    const stdout = `[INFO] raw output for ${arg}`;
    const result = await filterDirect(["mvn", arg], stdout, 0);

    expect(result.output.trim()).toBe(stdout);
  });

  test("empty Maven args pass through raw output", async () => {
    const stdout = "[ERROR] No goals have been specified for this build.";
    const result = await filterDirect(["mvn"], stdout, 1);

    expect(result.output.trim()).toBe(stdout);
  });
});
