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
        ...Array.from({ length: 260 }, (_, index) => `src/noise-${index}.ts(1,1): error TS2322: Type 'number' is not assignable to type 'string'.`),
        "src/order/submit.ts(42,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
        "src/order/api.ts(88,12): error TS2339: Property 'id' does not exist on type 'Order | undefined'.",
      ].join("\n"),
      stderr: "",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await tscHandler.filter(
      raw,
      { program: "tsc", args: ["--noEmit"], original: ["tsc", "--noEmit"], displayCommand: "tsc --noEmit" },
      options,
    );

    expect(result.handler).toBe("tsc");
    expect(result.output).toContain("TS2322");
    expect(result.output).toContain("TS2339");
    expect(result.output).toContain("src/order/submit.ts");
    expect(result.output).toContain("42:7");
    expect(result.output).toContain("Type 'string | undefined' is not assignable");
    expect(result.output).not.toContain("noise-259");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
