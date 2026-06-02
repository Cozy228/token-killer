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
        ...Array.from({ length: 360 }, (_, index) => `> Task :compileNoise${index} UP-TO-DATE`),
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
      { program: "./gradlew", args: ["test"], original: ["./gradlew", "test"], displayCommand: "./gradlew test" },
      options,
    );

    expect(result.handler).toBe("gradle");
    expect(result.output).toContain(":order-service:test FAILED");
    expect(result.output).toContain("OrderServiceTest > preventsDuplicateSubmit FAILED");
    expect(result.output).toContain("expected: <1> but was: <2>");
    expect(result.output).toContain("OrderServiceTest.java:82");
    expect(result.output).not.toContain("compileNoise359");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
