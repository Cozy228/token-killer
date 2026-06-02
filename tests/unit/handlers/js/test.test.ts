import { describe, expect, test } from "vitest";

import { jsTestHandler } from "../../../../src/handlers/js/test.js";
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

describe("js test handler", () => {
  test("keeps failed tests and removes passing output", async () => {
    const raw: RawResult = {
      command: "npm test",
      stdout: [
        ...Array.from(
          { length: 420 },
          (_, index) => `✓ src/noise-${index}.test.ts > passes ${index}`,
        ),
        "FAIL  src/order/submit.test.ts > prevents duplicate submit",
        'AssertionError: expected "api.submit" to be called 1 time, got 2',
        " ❯ src/order/submit.test.ts:42:15",
        "Test Files  1 failed | 24 passed (25)",
        "Tests  3 failed | 215 passed (218)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "npm",
        args: ["test"],
        original: ["npm", "test"],
        displayCommand: "npm test",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("JS tests failed");
    expect(result.output).toContain(
      "src/order/submit.test.ts > prevents duplicate submit",
    );
    expect(result.output).toContain('expected "api.submit"');
    expect(result.output).toContain("src/order/submit.test.ts:42:15");
    expect(result.output).not.toContain("noise-419");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("js test format variants", () => {
  test("preserves test failure details", async () => {
    const raw: RawResult = {
      command: "npm test",
      stdout: [
        "FAIL  src/submit.test.ts > rejects duplicate submit",
        'AssertionError: expected "api.submit" to be called 1 time, got 2',
        " ❯ src/submit.test.ts:42:15",
        "Tests  1 failed | 20 passed (21)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "npm",
        args: ["test"],
        original: ["npm", "test"],
        displayCommand: "npm test",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("JS tests failed");
    expect(result.output).toContain(
      "src/submit.test.ts > rejects duplicate submit",
    );
    expect(result.output).toContain("AssertionError");
    expect(result.output).toContain("expected");
  });

  test("handles vitest output", async () => {
    const raw: RawResult = {
      command: "npx vitest run",
      stdout: [
        "FAIL  src/components/Button.test.tsx > renders disabled state",
        "AssertionError: expected true to be false",
        " ❯ src/components/Button.test.tsx:33:22",
        "Test Files  1 failed | 15 passed (16)",
        "Tests  1 failed | 45 passed (46)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "npx",
        args: ["vitest", "run"],
        original: ["npx", "vitest", "run"],
        displayCommand: "npx vitest run",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("src/components/Button.test.tsx");
    expect(result.output).toContain("AssertionError");
  });

  test("handles jest output", async () => {
    const raw: RawResult = {
      command: "npx jest",
      stdout: [
        "FAIL  src/utils/format.test.js",
        "  ● formatDate › returns formatted date",
        "    expect(received).toBe(expected)",
        '    Expected: "2026-06-02"',
        '    Received: "2026-06-03"',
        "      42 |   const result = formatDate(new Date('2026-06-02'));",
        "    > 43 |   expect(result).toBe('2026-06-02');",
        "Tests: 1 failed, 10 passed, 11 total",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "npx",
        args: ["jest"],
        original: ["npx", "jest"],
        displayCommand: "npx jest",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("src/utils/format.test.js");
    expect(result.output).toContain("fail");
  });

  test("handles all-passing tests", async () => {
    const raw: RawResult = {
      command: "npm test",
      stdout: ["Tests  0 failed | 30 passed (30)"].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "npm",
        args: ["test"],
        original: ["npm", "test"],
        displayCommand: "npm test",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("JS tests passed");
    expect(result.output).toContain("30 passed");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "npm test",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "npm",
        args: ["test"],
        original: ["npm", "test"],
        displayCommand: "npm test",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(typeof result.output).toBe("string");
  });

  test("parses Vitest JSON reporter output when available", async () => {
    const raw: RawResult = {
      command: "vitest --reporter=json",
      stdout: JSON.stringify({
        numFailedTestSuites: 1,
        numPassedTestSuites: 2,
        numFailedTests: 1,
        numPassedTests: 12,
        testResults: [
          {
            name: "src/order.test.ts",
            status: "failed",
            assertionResults: [
              {
                title: "rejects duplicate submit",
                status: "failed",
                failureMessages: ["AssertionError: expected 1 to be 2"],
              },
            ],
          },
        ],
      }),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "vitest",
        args: ["--reporter=json"],
        original: ["vitest", "--reporter=json"],
        displayCommand: "vitest --reporter=json",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("src/order.test.ts");
    expect(result.output).toContain("rejects duplicate submit");
    expect(result.output).toContain("AssertionError");
    expect(result.output).not.toContain('"testResults"');
  });

  test("parses pnpm-prefixed Vitest failures", async () => {
    const raw: RawResult = {
      command: "pnpm vitest run",
      stdout: [
        "> project@0.1.0 test /repo",
        "> vitest run",
        "",
        "FAIL  tests/order.test.ts > submit > rejects duplicate",
        "AssertionError: expected true to be false",
        " ❯ tests/order.test.ts:22:10",
        "Test Files  1 failed | 3 passed (4)",
        "Tests  1 failed | 20 passed (21)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await jsTestHandler.filter(
      raw,
      {
        program: "pnpm",
        args: ["vitest", "run"],
        original: ["pnpm", "vitest", "run"],
        displayCommand: "pnpm vitest run",
      },
      options,
    );

    expect(result.handler).toBe("js-test");
    expect(result.output).toContain("tests/order.test.ts");
    expect(result.output).toContain("rejects duplicate");
    expect(result.output).toContain("AssertionError");
    expect(result.output).not.toContain("project@0.1.0");
  });
});
