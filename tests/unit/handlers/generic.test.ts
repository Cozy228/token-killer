import { describe, expect, test } from "vitest";

import { genericHandler } from "../../../src/handlers/generic.js";
import type { RawResult, TgOptions } from "../../../src/types.js";
import { expectCriticalContent, expectLargeSavings } from "../../helpers/assertions.js";

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
      { program: "custom-tool", args: [], original: ["custom-tool"], displayCommand: "custom-tool" },
      options,
    );

    expect(result.handler).toBe("generic");
    expectCriticalContent(result.output, ["ERROR src/order/submit.ts:42", "submitOrder"]);
    expect(result.output).not.toContain("progress line 999");
    expectLargeSavings(result);
  });
});
