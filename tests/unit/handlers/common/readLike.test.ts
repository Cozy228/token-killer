import { describe, expect, test } from "vitest";

import { readLikeHandler } from "../../../../src/handlers/common/readLike.js";
import type { RawResult, TgOptions } from "../../../../src/types.js";
import { expectCriticalContent, expectLargeSavings } from "../../../helpers/assertions.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

describe("read-like handler", () => {
  test("summarizes large source files while preserving imports and symbols", async () => {
    const raw: RawResult = {
      command: "cat src/order/submit.ts",
      stdout: [
        "import { api } from './api';",
        "export type OrderPayload = { id: string };",
        "export async function submitOrder(payload: OrderPayload) {",
        ...Array.from({ length: 900 }, (_, index) => `  const noise${index} = ${index};`),
        "  return api.submit(payload);",
        "}",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await readLikeHandler.filter(
      raw,
      { program: "cat", args: ["src/order/submit.ts"], original: ["cat", "src/order/submit.ts"], displayCommand: "cat src/order/submit.ts" },
      options,
    );

    expect(result.handler).toBe("read-like");
    expectCriticalContent(result.output, [
      "File: src/order/submit.ts",
      "import { api } from './api';",
      "export async function submitOrder",
    ]);
    expect(result.output).not.toContain("noise899");
    expectLargeSavings(result);
  });
});

describe("read-like handler correctness gaps", () => {
  async function filterRead(raw: RawResult, args: string[]) {
    return readLikeHandler.filter(
      raw,
      {
        program: "cat",
        args,
        original: ["cat", ...args],
        displayCommand: `cat ${args.join(" ")}`,
      },
      options,
    );
  }

  test("preserves the final tail lines for large reads", async () => {
    const raw: RawResult = {
      command: "cat src/large.ts",
      stdout: [
        "export function firstSymbol() { return 1; }",
        ...Array.from({ length: 500 }, (_, index) => `const noise${index} = ${index};`),
        "export function finalSymbol() { return 2; }",
        "final actionable line",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterRead(raw, ["src/large.ts"]);

    expect(result.output).toContain("export function firstSymbol");
    expect(result.output).toContain("export function finalSymbol");
    expect(result.output).toContain("final actionable line");
    expect(result.output).not.toContain("noise499");
  });

  test("keeps stdin output when reading from dash", async () => {
    const raw: RawResult = {
      command: "cat -",
      stdout: "alpha\nbravo\ncharlie\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterRead(raw, ["-"]);

    expect(result.output).toContain("alpha");
    expect(result.output).toContain("charlie");
    expect(result.exitCode).toBe(0);
  });

  test("preserves concatenated multi-file output boundaries", async () => {
    const raw: RawResult = {
      command: "cat first.txt second.txt",
      stdout: "alpha\nbravo\ncharlie\ndelta\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterRead(raw, ["first.txt", "second.txt"]);

    expect(result.output).toContain("alpha");
    expect(result.output).toContain("charlie");
    expect(result.output).toContain("delta");
  });

  test("preserves stderr from missing files while keeping valid stdout", async () => {
    const raw: RawResult = {
      command: "cat valid.txt missing.txt",
      stdout: "valid content\n",
      stderr: "cat: missing.txt: No such file or directory\n",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await filterRead(raw, ["valid.txt", "missing.txt"]);

    expect(result.output).toContain("valid content");
    expect(result.output).toContain("missing.txt");
    expect(result.exitCode).toBe(1);
  });

  test("preserves binary-file warning instead of trying to summarize bytes", async () => {
    const raw: RawResult = {
      command: "cat image.bin",
      stdout: "Binary file not shown: image.bin\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterRead(raw, ["image.bin"]);

    expect(result.output).toContain("Binary file not shown: image.bin");
    expect(result.output).not.toContain("Symbols:");
  });
});
