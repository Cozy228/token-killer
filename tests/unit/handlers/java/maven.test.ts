import { describe, expect, test } from "vitest";

import { mavenHandler } from "../../../../src/handlers/java/maven.js";
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

describe("maven handler", () => {
  test("preserves failed module and test failure while removing lifecycle noise", async () => {
    const raw: RawResult = {
      command: "mvn test",
      stdout: [
        ...Array.from(
          { length: 360 },
          (_, index) => `[INFO] Downloading dependency-${index}.pom`,
        ),
        "[INFO] Reactor Summary for order-service 1.0.0:",
        "[INFO] order-api ......................................... SUCCESS",
        "[INFO] order-service ..................................... FAILURE",
        "[ERROR] Failures:",
        "[ERROR]   OrderServiceTest.preventsDuplicateSubmit:82 expected:<1> but was:<2>",
        "[ERROR] Tests run: 120, Failures: 1, Errors: 0, Skipped: 0",
        "[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:test on project order-service",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mavenHandler.filter(
      raw,
      {
        program: "mvn",
        args: ["test"],
        original: ["mvn", "test"],
        displayCommand: "mvn test",
      },
      options,
    );

    expect(result.handler).toBe("maven");
    expect(result.output).toContain("order-service");
    expect(result.output).toContain("OrderServiceTest.preventsDuplicateSubmit");
    expect(result.output).toContain("expected:<1> but was:<2>");
    expect(result.output).toContain("Tests run: 120");
    expect(result.output).not.toContain("dependency-359");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("maven format variants", () => {
  test("preserves error messages", async () => {
    const raw: RawResult = {
      command: "mvn test",
      stdout: [
        "[ERROR] Failures:",
        "[ERROR]   OrderServiceTest.shouldRejectDuplicate:42 expected:<1> but was:<2>",
        "[ERROR] Tests run: 10, Failures: 1, Errors: 0, Skipped: 0",
        "[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:test",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mavenHandler.filter(
      raw,
      {
        program: "mvn",
        args: ["test"],
        original: ["mvn", "test"],
        displayCommand: "mvn test",
      },
      options,
    );

    expect(result.handler).toBe("maven");
    expect(result.output).toContain("[ERROR]");
    expect(result.output).toContain("OrderServiceTest.shouldRejectDuplicate");
    expect(result.output).toContain("expected");
    expect(result.output).toContain("Tests run:");
  });

  test("handles build success", async () => {
    const raw: RawResult = {
      command: "mvn test",
      stdout: [
        "[INFO] Reactor Summary for order-service 1.0.0:",
        "[INFO] order-service ..................................... SUCCESS",
        "[INFO] BUILD SUCCESS",
        "[INFO] Total time:  12.345 s",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await mavenHandler.filter(
      raw,
      {
        program: "mvn",
        args: ["test"],
        original: ["mvn", "test"],
        displayCommand: "mvn test",
      },
      options,
    );

    expect(result.handler).toBe("maven");
    expect(typeof result.output).toBe("string");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "mvn test",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await mavenHandler.filter(
      raw,
      {
        program: "mvn",
        args: ["test"],
        original: ["mvn", "test"],
        displayCommand: "mvn test",
      },
      options,
    );

    expect(result.handler).toBe("maven");
    expect(typeof result.output).toBe("string");
  });
});
