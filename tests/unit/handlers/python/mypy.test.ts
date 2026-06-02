import { describe, expect, test } from "vitest";

import { mypyHandler } from "../../../../src/handlers/python/mypy.js";
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

describe("mypy handler", () => {
  test("groups type errors by code and file", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: [
        ...Array.from(
          { length: 260 },
          (_, index) =>
            `src/noise_${index}.py:1: error: Incompatible types [assignment]`,
        ),
        'src/order/submit.py:82: error: Argument 1 has incompatible type "str"; expected "Order"  [arg-type]',
        'src/order/api.py:31: error: Item "None" of "Order | None" has no attribute "id"  [union-attr]',
        "Found 262 errors in 90 files (checked 120 source files)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(result.output).toContain("arg-type");
    expect(result.output).toContain("union-attr");
    expect(result.output).toContain("src/order/submit.py");
    expect(result.output).toContain("82");
    expect(result.output).toContain('expected "Order"');
    expect(result.output).not.toContain("noise_259");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("mypy format variants", () => {
  test("preserves error codes in brackets", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: [
        'src/api.py:10: error: Argument 1 to "submit" has incompatible type "str"; expected "Order"  [arg-type]',
        'src/models.py:42: error: "Response" has no attribute "data"  [attr-defined]',
        'src/utils.py:15: error: Incompatible return value type (got "str", expected "int")  [return-value]',
        "Found 3 errors in 3 files (checked 50 source files)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(result.output).toContain("arg-type");
    expect(result.output).toContain("attr-defined");
    expect(result.output).toContain("return-value");
    expect(result.output).toContain("src/api.py:10");
    expect(result.output).toContain("src/models.py:42");
    expect(result.output).toContain("src/utils.py:15");
  });

  test("handles clean mypy output", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: "Success: no issues found in 50 source files",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("Mypy:");
    expect(result.output).toContain("0 errors");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(typeof result.output).toBe("string");
  });

  test("preserves column numbers in mypy output", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: [
        'src/app.py:10:7: error: Argument 1 has incompatible type "str"; expected "int"  [arg-type]',
        "Found 1 error in 1 file (checked 10 source files)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(result.output).toContain("src/app.py:10:7");
    expect(result.output).toContain("arg-type");
  });

  test("preserves note continuation lines under errors", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: [
        'src/app.py:10: error: Incompatible return value type (got "str", expected "int")  [return-value]',
        'src/app.py:10: note: "str" is inferred from config["value"]',
        "Found 1 error in 1 file (checked 10 source files)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(result.output).toContain("return-value");
    expect(result.output).toContain('"str" is inferred');
  });

  test("preserves fileless mypy errors", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: [
        "error: Cannot find implementation or library stub for module named \"missing_lib\"  [import-not-found]",
        "Found 1 error in 1 file (checked 10 source files)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(result.output).toContain("missing_lib");
    expect(result.output).toContain("import-not-found");
  });

  test("shows every mypy error without a file cap", async () => {
    const raw: RawResult = {
      command: "mypy .",
      stdout: [
        ...Array.from(
          { length: 35 },
          (_, index) => `src/module_${index}.py:${index + 1}: error: Incompatible types [assignment]`,
        ),
        "Found 35 errors in 35 files (checked 35 source files)",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await mypyHandler.filter(
      raw,
      {
        program: "mypy",
        args: ["."],
        original: ["mypy", "."],
        displayCommand: "mypy .",
      },
      options,
    );

    expect(result.handler).toBe("mypy");
    expect(result.output).toContain("src/module_0.py");
    expect(result.output).toContain("src/module_34.py");
    expect(result.output).not.toContain("more");
  });
});
