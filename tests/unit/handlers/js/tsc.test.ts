import { describe, expect, test } from "vitest";

import { tscHandler } from "../../../../src/handlers/js/tsc.js";
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

describe("tsc handler", () => {
  test("groups errors by TypeScript code and file", async () => {
    const raw: RawResult = {
      command: "tsc --noEmit",
      stdout: [
        ...Array.from(
          { length: 260 },
          (_, index) =>
            `src/noise-${index}.ts(1,1): error TS2322: Type 'number' is not assignable to type 'string'.`,
        ),
        "src/order/submit.ts(42,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
        "src/order/api.ts(88,12): error TS2339: Property 'id' does not exist on type 'Order | undefined'.",
      ].join("\n"),
      stderr: "",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      {
        program: "tsc",
        args: ["--noEmit"],
        original: ["tsc", "--noEmit"],
        displayCommand: "tsc --noEmit",
      },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(result.output).toContain("TS2322");
    expect(result.output).toContain("TS2339");
    expect(result.output).toContain("src/order/submit.ts");
    expect(result.output).toContain("42:7");
    expect(result.output).toContain(
      "Type 'string | undefined' is not assignable",
    );
    expect(result.output).not.toContain("noise-259");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("tsc format variants", () => {
  test("preserves error codes", async () => {
    const raw: RawResult = {
      command: "tsc --noEmit",
      stdout: [
        "src/api.ts(10,7): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/models.ts(42,12): error TS2339: Property 'id' does not exist on type 'User'.",
        "src/utils.ts(15,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
      ].join("\n"),
      stderr: "",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      {
        program: "tsc",
        args: ["--noEmit"],
        original: ["tsc", "--noEmit"],
        displayCommand: "tsc --noEmit",
      },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(result.output).toContain("TS2322");
    expect(result.output).toContain("TS2339");
    expect(result.output).toContain("TS2345");
    expect(result.output).toContain("src/api.ts:10:7");
    expect(result.output).toContain("src/models.ts:42:12");
  });

  test("handles clean compilation", async () => {
    const raw: RawResult = {
      command: "tsc --noEmit",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      {
        program: "tsc",
        args: ["--noEmit"],
        original: ["tsc", "--noEmit"],
        displayCommand: "tsc --noEmit",
      },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("TypeScript:");
    expect(result.output).toContain("0 errors");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "tsc --noEmit",
      stdout: "",
      stderr: "",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      {
        program: "tsc",
        args: ["--noEmit"],
        original: ["tsc", "--noEmit"],
        displayCommand: "tsc --noEmit",
      },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(typeof result.output).toBe("string");
  });

  test("groups errors by code", async () => {
    const raw: RawResult = {
      command: "tsc --noEmit",
      stdout: [
        "src/a.ts(1,1): error TS2322: Type 'a' is not assignable to type 'b'.",
        "src/b.ts(2,2): error TS2322: Type 'x' is not assignable to type 'y'.",
        "src/c.ts(3,3): error TS2339: Property 'foo' does not exist on type 'Bar'.",
        "src/d.ts(4,4): error TS2339: Property 'baz' does not exist on type 'Qux'.",
      ].join("\n"),
      stderr: "",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      {
        program: "tsc",
        args: ["--noEmit"],
        original: ["tsc", "--noEmit"],
        displayCommand: "tsc --noEmit",
      },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(result.output).toContain("TS2322");
    expect(result.output).toContain("TS2339");
    // Verify grouping: output should show "By code" section
    expect(result.output).toContain("By code");
  });

  test("preserves continuation lines attached to TypeScript errors", async () => {
    const raw: RawResult = {
      command: "tsc --noEmit",
      stdout: [
        "src/app.ts(10,7): error TS2322: Type '{ id: string; }' is not assignable to type 'User'.",
        "  Property 'name' is missing in type '{ id: string; }' but required in type 'User'.",
        "src/app.ts(11,1): error TS1005: ';' expected.",
      ].join("\n"),
      stderr: "",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      {
        program: "tsc",
        args: ["--noEmit"],
        original: ["tsc", "--noEmit"],
        displayCommand: "tsc --noEmit",
      },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(result.output).toContain("TS2322");
    expect(result.output).toContain("Property 'name' is missing");
    expect(result.output).toContain("TS1005");
  });

  test("shows every TypeScript error without a hidden file cap", async () => {
    const raw: RawResult = {
      command: "tsc --noEmit",
      stdout: Array.from(
        { length: 35 },
        (_, index) =>
          `src/module-${index}.ts(${index + 1},1): error TS2322: Type 'number' is not assignable to type 'string'.`,
      ).join("\n"),
      stderr: "",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      {
        program: "tsc",
        args: ["--noEmit"],
        original: ["tsc", "--noEmit"],
        displayCommand: "tsc --noEmit",
      },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(result.output).toContain("src/module-0.ts");
    expect(result.output).toContain("src/module-34.ts");
    expect(result.output).not.toContain("more");
  });
});
