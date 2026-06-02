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
