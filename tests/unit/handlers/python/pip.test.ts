import { describe, expect, test } from "vitest";

import { pipHandler } from "../../../../src/handlers/python/pip.js";
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

describe("pip handler", () => {
  test("compresses package list while preserving dependency problems", async () => {
    const raw: RawResult = {
      command: "pip list",
      stdout: [
        "Package Version",
        "------- -------",
        ...Array.from(
          { length: 500 },
          (_, index) => `package-${index} ${index}.0.0`,
        ),
        "broken-package 1.0.0 invalid",
        "peer-tool 2.0.0 conflict",
        "missing-lib 0.0.0 missing",
      ].join("\n"),
      stderr: "WARNING: dependency conflict detected for peer-tool\n",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await pipHandler.filter(
      raw,
      {
        program: "pip",
        args: ["list"],
        original: ["pip", "list"],
        displayCommand: "pip list",
      },
      options,
    );

    expect(result.handler).toBe("pip");
    expect(result.output).toContain("Packages:");
    expect(result.output).toContain("broken-package");
    expect(result.output).toContain("conflict");
    expect(result.output).toContain("missing-lib");
    expect(result.output).not.toContain("package-499");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("pip format variants", () => {
  test("preserves package names and versions", async () => {
    const raw: RawResult = {
      command: "pip list",
      stdout: [
        "Package    Version",
        "---------- -------",
        "requests   2.31.0",
        "flask      2.3.0",
        "sqlalchemy 2.0.19",
        "celery     5.3.1",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await pipHandler.filter(
      raw,
      {
        program: "pip",
        args: ["list"],
        original: ["pip", "list"],
        displayCommand: "pip list",
      },
      options,
    );

    expect(result.handler).toBe("pip");
    expect(result.output).toContain("Packages:");
    expect(result.output).toContain("requests");
    expect(result.output).toContain("flask");
    expect(result.output).toContain("sqlalchemy");
    expect(result.output).toContain("celery");
  });

  test("handles pip freeze format", async () => {
    const raw: RawResult = {
      command: "pip freeze",
      stdout: [
        "requests==2.31.0",
        "flask==2.3.0",
        "sqlalchemy==2.0.19",
        "celery==5.3.1",
        "click==8.1.7",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await pipHandler.filter(
      raw,
      {
        program: "pip",
        args: ["freeze"],
        original: ["pip", "freeze"],
        displayCommand: "pip freeze",
      },
      options,
    );

    expect(result.handler).toBe("pip");
    expect(result.output).toContain("Packages:");
    expect(result.output).toContain("requests==2.31.0");
    expect(result.output).toContain("flask==2.3.0");
    expect(result.output).toContain("celery==5.3.1");
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "pip list",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await pipHandler.filter(
      raw,
      {
        program: "pip",
        args: ["list"],
        original: ["pip", "list"],
        displayCommand: "pip list",
      },
      options,
    );

    expect(result.handler).toBe("pip");
    expect(typeof result.output).toBe("string");
  });
});
