import { describe, expect, test } from "vitest";

import { genericHandler } from "../../../src/handlers/generic.js";
import type { RawResult, TgOptions } from "../../../src/types.js";
import {
  expectCriticalContent,
  expectLargeSavings,
} from "../../helpers/assertions.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

describe("generic handler", () => {
  test("keeps important lines from large noisy output", async () => {
    const raw: RawResult = {
      command: "custom-tool",
      stdout: [
        ...Array.from({ length: 1000 }, (_, index) => `progress line ${index}`),
        "ERROR src/order/submit.ts:42 failed to submit order",
        "stack: submitOrder -> postOrder",
        ...Array.from({ length: 1000 }, (_, index) => `tail progress ${index}`),
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await genericHandler.filter(
      raw,
      {
        program: "custom-tool",
        args: [],
        original: ["custom-tool"],
        displayCommand: "custom-tool",
      },
      options,
    );

    expect(result.handler).toBe("generic");
    expectCriticalContent(result.output, [
      "ERROR src/order/submit.ts:42",
      "submitOrder",
    ]);
    expect(result.output).not.toContain("progress line 999");
    expectLargeSavings(result);
  });
});

describe("generic handler edge cases", () => {
  test("passes through short output unchanged", async () => {
    const raw: RawResult = {
      command: "custom-tool",
      stdout: "short output line",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await genericHandler.filter(
      raw,
      {
        program: "custom-tool",
        args: [],
        original: ["custom-tool"],
        displayCommand: "custom-tool",
      },
      options,
    );

    expect(result.handler).toBe("generic");
    expect(result.output).toContain("short output line");
    expect(result.rawChars).toBeLessThan(2000);
  });

  test("compresses large output", async () => {
    const lines = Array.from(
      { length: 200 },
      (_, index) => `line ${index}: ${"x".repeat(48)}`,
    );
    const longOutput = lines.join("\n");
    const raw: RawResult = {
      command: "custom-tool",
      stdout: longOutput,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await genericHandler.filter(
      raw,
      {
        program: "custom-tool",
        args: [],
        original: ["custom-tool"],
        displayCommand: "custom-tool",
      },
      options,
    );

    expect(result.handler).toBe("generic");
    expect(result.output.length).toBeLessThan(longOutput.length);
    expect(result.output).toContain("lines hidden");
  });

  test("preserves important patterns", async () => {
    const raw: RawResult = {
      command: "custom-tool",
      stdout: [
        ...Array.from({ length: 500 }, (_, index) => `noise line ${index}`),
        "ERROR critical failure in module X",
        "WARNING deprecated API usage detected",
        "FAILED test_important_scenario",
        ...Array.from(
          { length: 500 },
          (_, index) => `noise line ${index + 500}`,
        ),
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await genericHandler.filter(
      raw,
      {
        program: "custom-tool",
        args: [],
        original: ["custom-tool"],
        displayCommand: "custom-tool",
      },
      options,
    );

    expect(result.handler).toBe("generic");
    expect(result.output).toContain("ERROR critical failure in module X");
    expect(result.output).toContain("WARNING deprecated API usage detected");
    expect(result.output).toContain("FAILED test_important_scenario");
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "custom-tool",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await genericHandler.filter(
      raw,
      {
        program: "custom-tool",
        args: [],
        original: ["custom-tool"],
        displayCommand: "custom-tool",
      },
      options,
    );

    expect(result.handler).toBe("generic");
    expect(typeof result.output).toBe("string");
  });
});
