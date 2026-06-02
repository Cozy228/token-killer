import { describe, expect, test } from "vitest";

import { ruffHandler } from "../../../../src/handlers/python/ruff.js";
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

describe("ruff handler", () => {
  test("groups lint messages by rule and file", async () => {
    const raw: RawResult = {
      command: "ruff check .",
      stdout: [
        ...Array.from(
          { length: 300 },
          (_, index) => `src/noise_${index}.py:1:1: F401 imported but unused`,
        ),
        "src/order/submit.py:42:5: F401 `os` imported but unused",
        "src/order/submit.py:88:12: B008 Do not perform function call in argument defaults",
        "Found 302 errors.",
        "[*] 180 fixable with the `--fix` option.",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["check", "."],
        original: ["ruff", "check", "."],
        displayCommand: "ruff check .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(result.output).toContain("F401");
    expect(result.output).toContain("B008");
    expect(result.output).toContain("src/order/submit.py");
    expect(result.output).toContain("42:5");
    expect(result.output).toContain("fixable");
    expect(result.output).not.toContain("noise_299");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("ruff format variants", () => {
  test("preserves error codes and file locations", async () => {
    const raw: RawResult = {
      command: "ruff check .",
      stdout: [
        "src/api.py:10:1: F401 `os` imported but unused",
        "src/api.py:88:12: E501 Line too long (120 > 88 characters)",
        "src/models.py:42:5: B008 Do not perform function call in argument defaults",
        "Found 3 errors.",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["check", "."],
        original: ["ruff", "check", "."],
        displayCommand: "ruff check .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(result.output).toContain("F401");
    expect(result.output).toContain("E501");
    expect(result.output).toContain("B008");
    expect(result.output).toContain("src/api.py:10:1");
    expect(result.output).toContain("src/api.py:88:12");
    expect(result.output).toContain("src/models.py:42:5");
  });

  test("handles clean ruff output", async () => {
    const raw: RawResult = {
      command: "ruff check .",
      stdout: "All checks passed!",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["check", "."],
        original: ["ruff", "check", "."],
        displayCommand: "ruff check .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("Ruff:");
    expect(result.output).toContain("0 issues");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "ruff check .",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["check", "."],
        original: ["ruff", "check", "."],
        displayCommand: "ruff check .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(typeof result.output).toBe("string");
  });

  test("handles stderr-only error", async () => {
    const raw: RawResult = {
      command: "ruff check .",
      stdout: "",
      stderr: "ruff: error: unrecognized option '--bad-flag'",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["check", "."],
        original: ["ruff", "check", "."],
        displayCommand: "ruff check .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(typeof result.output).toBe("string");
    expect(result.exitCode).toBe(2);
  });

  test("preserves ruff format success output", async () => {
    const raw: RawResult = {
      command: "ruff format .",
      stdout: "3 files left unchanged\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["format", "."],
        original: ["ruff", "format", "."],
        displayCommand: "ruff format .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(result.output).toContain("3 files left unchanged");
    expect(result.exitCode).toBe(0);
  });

  test("preserves ruff format files requiring formatting", async () => {
    const raw: RawResult = {
      command: "ruff format --check .",
      stdout: [
        "Would reformat: src/app.py",
        "Would reformat: src/models.py",
        "2 files would be reformatted, 5 files already formatted",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["format", "--check", "."],
        original: ["ruff", "format", "--check", "."],
        displayCommand: "ruff format --check .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(result.output).toContain("src/app.py");
    expect(result.output).toContain("src/models.py");
    expect(result.output).toContain("2 files would be reformatted");
  });

  test("caps many ruff violations while emitting a recovery hint", async () => {
    const raw: RawResult = {
      command: "ruff check .",
      stdout: [
        ...Array.from(
          { length: 150 },
          (_, index) => `src/file_${index}.py:1:1: F401 imported but unused`,
        ),
        "Found 150 errors.",
        "[*] 150 fixable with the `--fix` option.",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      {
        program: "ruff",
        args: ["check", "."],
        original: ["ruff", "check", "."],
        displayCommand: "ruff check .",
      },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(result.output).toContain("F401: 150");
    expect(result.output).toContain("fixable");
    expect(result.output).toContain("full");
    expect(result.output).not.toContain("src/file_149.py");
  });
});
