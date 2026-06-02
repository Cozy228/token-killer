import { describe, expect, test } from "vitest";

import { genericHandler } from "../../../src/handlers/generic.js";
import type { RawResult, TgOptions } from "../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

describe("ansi handling", () => {
  test("strips ANSI escape sequences from filtered output", async () => {
    const raw: RawResult = {
      command: "colored-tool",
      stdout: "\u001b[31mERROR kept\u001b[0m\n",
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await genericHandler.filter(
      raw,
      { program: "colored-tool", args: [], original: ["colored-tool"], displayCommand: "colored-tool" },
      options,
    );

    expect(result.output).toContain("ERROR kept");
    expect(result.output).not.toContain("\u001b[31m");
  });
});
