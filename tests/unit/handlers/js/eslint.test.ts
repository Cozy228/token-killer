import { describe, expect, test } from "vitest";

import { eslintHandler } from "../../../../src/handlers/js/eslint.js";
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

describe("eslint handler", () => {
  test("groups messages by rule and file", async () => {
    const raw: RawResult = {
      command: "eslint .",
      stdout: [
        ...Array.from(
          { length: 300 },
          (_, index) =>
            `/repo/src/noise-${index}.ts\n  1:1  warning  unused var  no-unused-vars`,
        ),
        "/repo/src/components/UserForm.tsx",
        "  42:7  error  'name' is assigned a value but never used  no-unused-vars",
        "  55:3  warning  React Hook has missing dependency  react-hooks/exhaustive-deps",
        "✖ 302 problems (1 error, 301 warnings)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await eslintHandler.filter(
      raw,
      {
        program: "eslint",
        args: ["."],
        original: ["eslint", "."],
        displayCommand: "eslint .",
      },
      options,
    );

    expect(result.handler).toBe("eslint");
    expect(result.output).toContain("no-unused-vars");
    expect(result.output).toContain("react-hooks/exhaustive-deps");
    expect(result.output).toContain("src/components/UserForm.tsx");
    expect(result.output).toContain("42:7");
    expect(result.output).not.toContain("noise-299");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("eslint format variants", () => {
  test("preserves rule names", async () => {
    const raw: RawResult = {
      command: "eslint .",
      stdout: [
        "/repo/src/components/Form.tsx",
        "  10:5  error  'unused' is assigned a value but never used  no-unused-vars",
        "  20:3  warning  Unexpected console statement  no-console",
        "  30:1  error  Missing return type on function  @typescript-eslint/explicit-function-return-type",
        "✖ 3 problems (2 errors, 1 warning)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await eslintHandler.filter(
      raw,
      {
        program: "eslint",
        args: ["."],
        original: ["eslint", "."],
        displayCommand: "eslint .",
      },
      options,
    );

    expect(result.handler).toBe("eslint");
    expect(result.output).toContain("no-unused-vars");
    expect(result.output).toContain("no-console");
    expect(result.output).toContain(
      "@typescript-eslint/explicit-function-return-type",
    );
    expect(result.output).toContain("src/components/Form.tsx");
  });

  test("handles clean eslint output", async () => {
    const raw: RawResult = {
      command: "eslint .",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await eslintHandler.filter(
      raw,
      {
        program: "eslint",
        args: ["."],
        original: ["eslint", "."],
        displayCommand: "eslint .",
      },
      options,
    );

    expect(result.handler).toBe("eslint");
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("ESLint:");
    expect(result.output).toContain("0 problems");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "eslint .",
      stdout: "",
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await eslintHandler.filter(
      raw,
      {
        program: "eslint",
        args: ["."],
        original: ["eslint", "."],
        displayCommand: "eslint .",
      },
      options,
    );

    expect(result.handler).toBe("eslint");
    expect(typeof result.output).toBe("string");
  });
});
